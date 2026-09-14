import { randomUUID } from 'node:crypto'
import type { V2Database } from '@main/database/v2-connection'
import { DomainValidationError } from '@main/domain/errors'
import {
  applyFulfillmentEvent,
  createFulfillmentState,
  createInventoryAllocationEvent,
  type FulfillmentEventDraft,
  type FulfillmentState
} from '@main/domain/fulfillment'
import {
  createAdjustmentEventDraft,
  createAllocationEventDraft,
  createOpeningEventDraft,
  requireBusinessDate,
  requirePositiveInteger,
  requireProductStage,
  type ProductStage
} from '@main/domain/product-inventory'
import { V2FulfillmentRepository } from '@main/repositories/fulfillment-repository'
import { ProductInventoryRepository } from '@main/repositories/product-inventory-repository'
import type {
  V2FulfillmentEvent,
  V2ProductInventoryAdjustInput,
  V2ProductInventoryAllocationResult,
  V2ProductInventoryAllocateInput,
  V2ProductInventorySummary,
  V2ProductOpeningInput,
  V2ProductStageInventoryEvent
} from '@shared/contracts/index'

interface Clock {
  createId(): string
  now(): string
}

const defaultClock: Clock = {
  createId: randomUUID,
  now: () => new Date().toISOString()
}

const downstreamStages: Record<string, ReadonlyArray<keyof FulfillmentState>> = {
  fluffing_bagging: ['fluffingBagging', 'edgeSewing', 'packing', 'readyToShip', 'shipped'],
  packing: ['packing', 'readyToShip', 'shipped'],
  ready_to_ship: ['readyToShip', 'shipped']
}

/**
 * 商品阶段存量服务：所有修改都以流水记账，投入订单与订单履约在同一事务中双边更新。
 */
export class ProductInventoryService {
  private readonly inventory: ProductInventoryRepository
  private readonly fulfillment: V2FulfillmentRepository

  constructor(
    database: V2Database,
    private readonly clock: Clock = defaultClock
  ) {
    this.inventory = new ProductInventoryRepository(database)
    this.fulfillment = new V2FulfillmentRepository(database)
  }

  getSummary(productId: string): V2ProductInventorySummary {
    if (!this.inventory.productExists(productId)) throw new DomainValidationError('商品不存在')
    return { productId, stages: this.inventory.getBalances(productId) }
  }

  listEvents(productId: string): V2ProductStageInventoryEvent[] {
    if (!this.inventory.productExists(productId)) throw new DomainValidationError('商品不存在')
    return this.inventory.listEvents(productId)
  }

  recordOpening(input: V2ProductOpeningInput): V2ProductInventorySummary {
    const draft = createOpeningEventDraft({
      stage: requireProductStage(input.stage),
      quantity: requirePositiveInteger(input.quantity, '期初录入数量'),
      occurredOn: requireBusinessDate(input.occurredOn, '发生日期'),
      note: input.note ?? null
    })
    return this.inventory.transaction(() => {
      this.requireProduct(input.productId)
      const now = this.clock.now()
      this.inventory.insertEvent(this.clock.createId(), input.productId, draft, now)
      return { productId: input.productId, stages: this.inventory.getBalances(input.productId) }
    })
  }

  adjust(input: V2ProductInventoryAdjustInput): V2ProductInventorySummary {
    const draft = createAdjustmentEventDraft({
      stage: requireProductStage(input.stage),
      quantityDelta: input.quantityDelta,
      occurredOn: requireBusinessDate(input.occurredOn, '发生日期'),
      note: input.note
    })
    return this.inventory.transaction(() => {
      this.requireProduct(input.productId)
      const balances = this.inventory.getBalances(input.productId)
      // 领域规则先校验余额，避免在数据库事务内产生不可追溯的负数余额。
      this.assertBalanceAllows(balances, draft.stage, draft.quantityDelta)
      const now = this.clock.now()
      this.inventory.insertEvent(this.clock.createId(), input.productId, draft, now)
      return { productId: input.productId, stages: this.inventory.getBalances(input.productId) }
    })
  }

  allocateToOrder(input: V2ProductInventoryAllocateInput): V2ProductInventoryAllocationResult {
    const quantity = requirePositiveInteger(input.quantity, '投入数量')
    const occurredOn = requireBusinessDate(input.occurredOn, '发生日期')
    const stage = requireProductStage(input.stage)
    return this.inventory.transaction(() => {
      this.requireProduct(input.productId)
      const source = this.fulfillment.getOrderItemSource(input.orderItemId)
      if (!source) throw new DomainValidationError('订单商品不存在')
      if (source.productSnapshot.productId !== input.productId) {
        throw new DomainValidationError('商品存量只能投入相同商品的订单商品')
      }
      const balances = this.inventory.getBalances(input.productId)
      this.assertBalanceAllows(balances, stage, -quantity)

      const state = this.fulfillmentStateOf(input.orderItemId, source.quantity)
      const orderEdgeQuantity = source.edgeEnabled ? source.edgeQuantity : 0
      const remainingEdgeDemand = Math.max(orderEdgeQuantity - state.edgeSewingRouted, 0)
      const { targetStage, drafts } = resolveFulfillmentDrafts({
        stage,
        quantity,
        remainingEdgeDemand
      })

      // 先在内存中应用全部履约事件，任一步越界都会在写入前失败。
      let nextState = state
      for (const draft of drafts) nextState = applyFulfillmentEvent(nextState, draft)
      this.assertDemandWithinOrder(state, source.quantity, drafts)

      const now = this.clock.now()
      const inventoryEventId = this.clock.createId()
      this.inventory.insertEvent(
        inventoryEventId,
        input.productId,
        createAllocationEventDraft({
          stage,
          quantity,
          orderItemId: input.orderItemId,
          occurredOn,
          note: input.note ?? null
        }),
        now
      )
      for (const draft of drafts) {
        const event: V2FulfillmentEvent = {
          id: this.clock.createId(),
          orderItemId: input.orderItemId,
          eventType: draft.eventType,
          quantity: draft.quantity,
          sourceStage: draft.sourceStage ?? null,
          targetStage: draft.targetStage ?? null,
          sourceRecordType: 'product_stage_inventory_event',
          sourceRecordId: inventoryEventId,
          occurredOn,
          note: input.note ?? null,
          createdAt: now
        }
        this.fulfillment.insertFulfillmentEvent(event)
      }

      return {
        summary: {
          productId: input.productId,
          stages: this.inventory.getBalances(input.productId)
        },
        orderItemId: input.orderItemId,
        targetStage
      }
    })
  }

  private requireProduct(productId: string): void {
    if (!this.inventory.productExists(productId)) throw new DomainValidationError('商品不存在')
  }

  private assertBalanceAllows(
    balances: V2ProductInventorySummary['stages'],
    stage: ProductStage,
    quantityDelta: number
  ): void {
    if (balances[stage] + quantityDelta < 0) {
      throw new DomainValidationError('商品存量余额不能为负')
    }
  }

  private fulfillmentStateOf(orderItemId: string, orderQuantity: number): FulfillmentState {
    let state = createFulfillmentState(orderQuantity)
    for (const event of this.fulfillment.listFulfillmentEvents(orderItemId)) {
      state = applyFulfillmentEvent(state, {
        eventType: event.eventType,
        quantity: event.quantity,
        sourceStage: event.sourceStage,
        targetStage: event.targetStage
      })
    }
    return state
  }

  private assertDemandWithinOrder(
    state: FulfillmentState,
    orderQuantity: number,
    drafts: readonly FulfillmentEventDraft[]
  ): void {
    let next = state
    for (const draft of drafts) {
      const downstream = draft.targetStage ? downstreamStages[draft.targetStage] : undefined
      if (downstream) {
        const used = downstream.reduce((total, property) => total + next[property], 0)
        const remaining = orderQuantity - used
        if (draft.quantity > remaining) {
          throw new DomainValidationError('投入数量不能超过订单商品对应阶段的剩余需求')
        }
      }
      next = applyFulfillmentEvent(next, draft)
    }
  }
}

/**
 * 按存量阶段和订单剩余缝边需求决定投入后的目标阶段与履约事件：
 * - 已制造成品投入待捏毛装袋；
 * - 已捏毛未缝边按剩余缝边需求拆分到待缝边与待打包发货；
 * - 已缝边只满足仍有缝边需求的订单，并直接形成待打包发货数量；
 * - 已打包待发货直接进入待发货。
 */
function resolveFulfillmentDrafts(input: {
  stage: ProductStage
  quantity: number
  remainingEdgeDemand: number
}): {
  targetStage: 'fluffing_bagging' | 'edge_sewing' | 'packing' | 'ready_to_ship'
  drafts: FulfillmentEventDraft[]
} {
  const { stage, quantity, remainingEdgeDemand } = input
  if (stage === 'made') {
    return {
      targetStage: 'fluffing_bagging',
      drafts: [createInventoryAllocationEvent('fluffing_bagging', quantity)]
    }
  }
  if (stage === 'fluffing_bagging_done') {
    const toEdgeSewing = Math.min(quantity, remainingEdgeDemand)
    const toPacking = quantity - toEdgeSewing
    const drafts: FulfillmentEventDraft[] = []
    if (toEdgeSewing > 0) drafts.push(createInventoryAllocationEvent('edge_sewing', toEdgeSewing))
    if (toPacking > 0) drafts.push(createInventoryAllocationEvent('packing', toPacking))
    return { targetStage: toEdgeSewing > 0 ? 'edge_sewing' : 'packing', drafts }
  }
  if (stage === 'edge_sewing_done') {
    if (remainingEdgeDemand < quantity) {
      throw new DomainValidationError('已缝边存量只可满足订单的缝边需求')
    }
    return {
      targetStage: 'packing',
      drafts: [
        createInventoryAllocationEvent('edge_sewing', quantity),
        {
          eventType: 'edge_sewing_completed',
          quantity,
          sourceStage: 'edge_sewing',
          targetStage: 'packing'
        }
      ]
    }
  }
  return {
    targetStage: 'ready_to_ship',
    drafts: [createInventoryAllocationEvent('ready_to_ship', quantity)]
  }
}
