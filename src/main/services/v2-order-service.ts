import { randomUUID } from 'node:crypto'
import { calculateProductProfit } from '@shared/calculations/product-profit'
import { validateOrderFundInput, validateOrderFundReversal } from '@main/domain/order-funds'
import { DomainValidationError } from '@main/domain/errors'
import { applyFulfillmentEvent, createFulfillmentState } from '@main/domain/fulfillment'
import { calculateOrderAmountSummary, calculateOrderItemAmounts } from '@main/domain/order-amounts'
import { calculateOrderSchedule } from '@main/domain/order-schedule'
import { validateProductMaterialAndCapacity } from '@main/domain/product-capacity'
import { validateShipmentQuantity } from '@main/domain/shipment-quantities'
import { V2FulfillmentRepository } from '@main/repositories/fulfillment-repository'
import { V2OrderRepository, type V2AuditLog } from '@main/repositories/v2-order-repository'
import type { StudioSettingsService } from '@main/services/studio-settings-service'
import type {
  V2Customer,
  V2CustomerInput,
  V2CustomerQuery,
  V2CustomerUpdateInput,
  V2Order,
  V2OrderAmountAdjustment,
  V2OrderContentChange,
  V2OrderContentChangeInput,
  V2OrderCreateInput,
  V2OrderFund,
  V2OrderFundCorrectionInput,
  V2OrderFundInput,
  V2OrderItem,
  V2OrderItemInput,
  V2OrderSummary,
  V2Product,
  V2ProductExpectedProfit,
  V2ProductInput,
  V2ProductOrderSnapshot,
  V2ProductUpdateInput,
  V2Shipment,
  V2ShipmentInput,
  V2ShipmentVoidInput
} from '@shared/contracts/index'

interface V2Clock {
  createId(): string
  now(): string
}

const defaultClock: V2Clock = {
  createId: randomUUID,
  now: () => new Date().toISOString()
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function nullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function requireText(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized) throw new DomainValidationError(`${label}不能为空`)
  return normalized
}

function requireId(value: string, label: string): string {
  return requireText(value, label)
}

function requireNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainValidationError(`${label}必须是非负整数`)
  }
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new DomainValidationError(`${label}必须是正整数`)
  }
}

function requireBusinessDate(value: string, label: string): string {
  if (!ISO_DATE.test(value)) throw new DomainValidationError(`${label}格式必须为 YYYY-MM-DD`)
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new DomainValidationError(`${label}无效`)
  }
  return value
}

function createFulfillmentEventTimestamp(
  fallback: string,
  occurredOn: string,
  existingEvents: ReadonlyArray<{ occurredOn: string; createdAt: string }>
): string {
  const latestCreatedAt = existingEvents
    .filter((event) => event.occurredOn === occurredOn)
    .map((event) => event.createdAt)
    .sort()
    .at(-1)
  if (!latestCreatedAt || fallback > latestCreatedAt) return fallback
  const latestMilliseconds = Date.parse(latestCreatedAt)
  if (Number.isNaN(latestMilliseconds)) return fallback
  return new Date(latestMilliseconds + 1).toISOString()
}

function createProductSnapshot(
  product: V2Product,
  materialPriceMicroYuanPerGram: number
): V2ProductOrderSnapshot {
  return {
    productId: product.id,
    name: product.name,
    code: product.code,
    category: product.category,
    basePriceCents: product.basePriceCents,
    packagingCostCents: product.packagingCostCents,
    accessoryCostCents: product.accessoryCostCents,
    replacementBagCostCents: product.replacementBagCostCents,
    edgeConsumableCostCents: product.edgeConsumableCostCents,
    fixedCostCents: product.fixedCostCents,
    unitWeightMilligrams: product.unitWeightMilligrams,
    materialPriceMicroYuanPerGram,
    standardMakingMinutes: product.standardMakingMinutes,
    expectedFluffingBaggingMinutes: product.expectedFluffingBaggingMinutes,
    expectedEdgeSewingMinutes: product.expectedEdgeSewingMinutes,
    expectedPackingMinutes: product.expectedPackingMinutes,
    makingCommissionCents: product.makingCommissionCents,
    fluffingBaggingCommissionCents: product.fluffingBaggingCommissionCents,
    edgeSewingCommissionCents: product.edgeSewingCommissionCents,
    imageAttachmentId: product.imageAttachmentId,
    notes: product.notes,
    moldCount: product.moldCount,
    outputPerMoldPerBatch: product.outputPerMoldPerBatch,
    maxBatchesPerDay: product.maxBatchesPerDay,
    dailyCapacity: product.dailyCapacity
  }
}

export class V2OrderService {
  private readonly fulfillmentRepository: V2FulfillmentRepository

  constructor(
    private readonly repository: V2OrderRepository,
    private readonly clock: V2Clock = defaultClock,
    private readonly studioSettings?: Pick<StudioSettingsService, 'get'>
  ) {
    this.fulfillmentRepository = new V2FulfillmentRepository(repository.connection)
  }

  listCustomers(query?: V2CustomerQuery): V2Customer[] {
    return this.repository.listCustomers(query)
  }

  createCustomer(input: V2CustomerInput): V2Customer {
    const normalized = this.normalizeCustomer(input)
    return this.repository.transaction(() => {
      const now = this.clock.now()
      const customer = this.repository.insertCustomer(this.clock.createId(), normalized, now)
      this.recordAudit('customer.created', 'customer', customer.id, undefined, customer, now)
      return customer
    })
  }

  updateCustomer(input: V2CustomerUpdateInput): V2Customer {
    const normalized = {
      ...this.normalizeCustomer(input),
      id: requireId(input.id, '客户标识'),
      enabled: input.enabled
    }
    return this.repository.transaction(() => {
      const before = this.requireCustomer(normalized.id)
      const now = this.clock.now()
      const customer = this.repository.updateCustomer(normalized, now)
      if (!customer) throw new DomainValidationError('客户不存在')
      this.recordAudit('customer.updated', 'customer', customer.id, before, customer, now)
      return customer
    })
  }

  listProducts(includeDisabled = false): V2Product[] {
    return this.repository.listProducts(includeDisabled)
  }

  /** 主进程权威预计盈利：使用当前商品参数与工作室预计基准时薪重新计算。 */
  getProductExpectedProfit(productId: string): V2ProductExpectedProfit | null {
    const product = this.repository.getProduct(productId)
    if (!product) return null
    const settings = this.studioSettings?.get()
    return calculateProductProfit({
      basePriceCents: product.basePriceCents,
      unitWeightMilligrams: product.unitWeightMilligrams,
      materialPriceMicroYuanPerGram: settings?.materialPriceMicroYuanPerGram ?? 0,
      packagingCostCents: product.packagingCostCents,
      accessoryCostCents: product.accessoryCostCents,
      replacementBagCostCents: product.replacementBagCostCents,
      fixedCostCents: product.fixedCostCents,
      makingCommissionCents: product.makingCommissionCents,
      fluffingBaggingCommissionCents: product.fluffingBaggingCommissionCents,
      expectedFluffingBaggingMinutes: product.expectedFluffingBaggingMinutes,
      expectedEdgeSewingMinutes: product.expectedEdgeSewingMinutes,
      expectedPackingMinutes: product.expectedPackingMinutes,
      fluffingBaggingExpectedHourlyWageCents: settings?.fluffingBaggingExpectedHourlyWageCents ?? 0,
      edgeSewingExpectedHourlyWageCents: settings?.edgeSewingExpectedHourlyWageCents ?? 0,
      packingExpectedHourlyWageCents: settings?.packingExpectedHourlyWageCents ?? 0,
      edgeConsumableCostCents: product.edgeConsumableCostCents,
      edgeSewingCommissionCents: product.edgeSewingCommissionCents
    })
  }

  createProduct(input: V2ProductInput): V2Product {
    const normalized = this.normalizeProduct(input)
    return this.repository.transaction(() => {
      const now = this.clock.now()
      const product = this.repository.insertProduct(this.clock.createId(), normalized, now)
      this.recordAudit('product.created', 'product', product.id, undefined, product, now)
      return product
    })
  }

  updateProduct(input: V2ProductUpdateInput): V2Product {
    const normalized = {
      ...this.normalizeProduct(input),
      id: requireId(input.id, '商品标识'),
      enabled: input.enabled
    }
    return this.repository.transaction(() => {
      const before = this.requireProduct(normalized.id)
      const now = this.clock.now()
      const product = this.repository.updateProduct(normalized, now)
      if (!product) throw new DomainValidationError('商品不存在')
      this.recordAudit('product.updated', 'product', product.id, before, product, now)
      return product
    })
  }

  listOrders(): V2OrderSummary[] {
    return this.repository.listOrders()
  }

  getOrder(orderId: string): V2Order | null {
    return this.repository.getOrder(orderId)
  }

  createOrder(input: V2OrderCreateInput): V2Order {
    const schedule = this.assertOrderCreateInput(input)
    return this.repository.transaction(() => {
      const now = this.clock.now()
      const orderId = this.clock.createId()
      const customer = input.customerId
        ? this.requireCustomer(input.customerId)
        : this.repository.insertCustomer(
            this.clock.createId(),
            this.normalizeCustomer(input.customer),
            now
          )
      const customerSnapshot: V2CustomerInput = {
        name: customer.name,
        contact: customer.contact,
        defaultAddress: customer.defaultAddress,
        notes: customer.notes
      }
      const items = this.buildOrderItems(orderId, input.items, now)
      const code =
        input.code?.trim() ||
        `YUMI-${now.slice(0, 10).replaceAll('-', '')}-${orderId.slice(0, 8).toUpperCase()}`
      this.repository.insertOrder({
        id: orderId,
        code: requireText(code, '订单编号'),
        customerId: customer.id,
        customerSnapshot,
        orderDiscountCents: input.orderDiscountCents ?? 0,
        expectedShipDate: input.expectedShipDate
          ? requireBusinessDate(input.expectedShipDate, '预计发货日期')
          : null,
        reservedDays: schedule.reservedDays,
        notes: nullableText(input.notes),
        now
      })
      this.repository.insertOrderItems(orderId, items)
      const order = this.repository.getOrder(orderId)!
      this.recordAudit('order.created', 'order', orderId, undefined, order, now, {
        customerCreated: !input.customerId
      })
      return order
    })
  }

  changeOrderContent(orderId: string, input: V2OrderContentChangeInput): V2Order {
    requireId(orderId, '订单标识')
    requireBusinessDate(input.occurredOn, '内容变更日期')
    requireText(input.description, '内容变更说明')
    this.assertOrderItems(input.items)
    if (input.amountAdjustment) this.assertAmountAdjustment(input.amountAdjustment)
    return this.repository.transaction(() => {
      const beforeOrder = this.requireOrder(orderId)
      if (this.repository.countShipments(orderId) > 0) {
        throw new DomainValidationError(
          '已有发货记录的订单不能直接替换订单内容，请通过售后或负责人处理'
        )
      }
      const now = this.clock.now()
      const afterItems = this.buildOrderItems(orderId, input.items, now)
      this.repository.replaceOrderItems(
        orderId,
        afterItems,
        input.orderDiscountCents ?? beforeOrder.amount.orderDiscountCents
      )
      if (input.amountAdjustment) {
        this.repository.createAmountAdjustment({
          id: this.clock.createId(),
          orderId,
          amountCents: input.amountAdjustment.amountCents,
          occurredOn: input.amountAdjustment.occurredOn,
          reason: requireText(input.amountAdjustment.reason, '金额调整原因'),
          note: nullableText(input.amountAdjustment.note),
          createdAt: now
        })
      }
      const change: V2OrderContentChange = {
        id: this.clock.createId(),
        orderId,
        occurredOn: input.occurredOn,
        description: input.description.trim(),
        beforeItems: beforeOrder.items,
        afterItems: this.repository.listOrderItems(orderId),
        createdAt: now
      }
      this.repository.createContentChange(change)
      const afterOrder = this.repository.getOrder(orderId)!
      this.recordAudit('order.content_changed', 'order', orderId, beforeOrder, afterOrder, now, {
        contentChangeId: change.id,
        amountAdjustmentCents: input.amountAdjustment?.amountCents ?? null
      })
      return afterOrder
    })
  }

  addOrderAmountAdjustment(
    orderId: string,
    input: V2OrderContentChangeInput['amountAdjustment']
  ): V2Order {
    if (!input) throw new DomainValidationError('金额调整不能为空')
    this.assertAmountAdjustment(input)
    return this.repository.transaction(() => {
      const before = this.requireOrder(orderId)
      const now = this.clock.now()
      const adjustment: V2OrderAmountAdjustment = {
        id: this.clock.createId(),
        orderId,
        amountCents: input.amountCents,
        occurredOn: input.occurredOn,
        reason: requireText(input.reason, '金额调整原因'),
        note: nullableText(input.note),
        createdAt: now
      }
      this.repository.createAmountAdjustment(adjustment)
      const after = this.repository.getOrder(orderId)!
      this.recordAudit('order.amount_adjusted', 'order', orderId, before, after, now, {
        adjustmentId: adjustment.id
      })
      return after
    })
  }

  recordOrderFund(orderId: string, input: V2OrderFundInput): V2OrderFund {
    const normalized = this.normalizeFund(input)
    return this.repository.transaction(() => {
      this.requireOrder(orderId)
      this.assertFundAttachment(normalized)
      const now = this.clock.now()
      const fund: V2OrderFund = {
        id: this.clock.createId(),
        orderId,
        direction: normalized.businessType === 'refund' ? 'expense' : 'income',
        ...normalized,
        reversalOfEntryId: null,
        attachment: null,
        createdAt: now
      }
      this.repository.insertFund(fund)
      this.recordAudit('order.fund_recorded', 'financial_entry', fund.id, undefined, fund, now, {
        orderId
      })
      return fund
    })
  }

  private assertFundAttachment(input: V2OrderFundInput): void {
    if (!input.attachmentId) return
    if (input.businessType === 'refund') {
      throw new DomainValidationError('退款流水不能关联收款凭证')
    }
    const attachment = this.repository.connection
      .prepare(
        `
      SELECT 1 FROM attachments WHERE id = ? AND kind = 'order_fund_proof'
    `
      )
      .get(input.attachmentId)
    if (!attachment) throw new DomainValidationError('收款凭证不存在或类型不正确')
  }

  correctOrderFund(
    orderId: string,
    input: V2OrderFundCorrectionInput
  ): { reversal: V2OrderFund; replacement: V2OrderFund } {
    const replacement = this.normalizeFund(input.replacement)
    validateOrderFundReversal({
      originalEntryId: input.originalEntryId,
      replacement: {
        direction: replacement.businessType === 'refund' ? 'expense' : 'income',
        businessType: replacement.businessType,
        amountCents: replacement.amountCents,
        occurredOn: replacement.occurredOn
      }
    })
    requireBusinessDate(input.reversalOccurredOn, '冲正日期')
    return this.repository.transaction(() => {
      this.requireOrder(orderId)
      this.assertFundAttachment(replacement)
      const original = this.repository.getFund(requireId(input.originalEntryId, '原资金记录标识'))
      if (!original || original.orderId !== orderId)
        throw new DomainValidationError('原资金记录不存在或不属于当前订单')
      if (original.reversalOfEntryId) throw new DomainValidationError('冲正记录不能再次冲正')
      if (this.repository.hasReversalForFund(original.id))
        throw new DomainValidationError('原资金记录已被冲正')
      const now = this.clock.now()
      const reversal: V2OrderFund = {
        id: this.clock.createId(),
        orderId,
        direction: original.direction === 'income' ? 'expense' : 'income',
        businessType: original.businessType,
        amountCents: original.amountCents,
        occurredOn: input.reversalOccurredOn,
        paymentMethod: original.paymentMethod,
        attachmentId: original.attachmentId,
        note: `冲正：${original.note ?? original.id}`,
        reversalOfEntryId: original.id,
        attachment: null,
        createdAt: now
      }
      const replacementFund: V2OrderFund = {
        id: this.clock.createId(),
        orderId,
        direction: replacement.businessType === 'refund' ? 'expense' : 'income',
        ...replacement,
        reversalOfEntryId: null,
        attachment: null,
        createdAt: now
      }
      this.repository.insertFund(reversal)
      this.repository.insertFund(replacementFund)
      this.recordAudit(
        'order.fund_corrected',
        'financial_entry',
        original.id,
        original,
        {
          reversal,
          replacement: replacementFund
        },
        now,
        { orderId }
      )
      return { reversal, replacement: replacementFund }
    })
  }

  createShipment(orderId: string, input: V2ShipmentInput): V2Shipment {
    requireBusinessDate(input.shippedOn, '发货日期')
    if (!input.items.length) throw new DomainValidationError('发货明细不能为空')
    return this.repository.transaction(() => {
      const order = this.requireOrder(orderId)
      const itemById = new Map(order.items.map((item) => [item.id, item]))
      const quantities = new Map<string, number>()
      for (const item of input.items) {
        requireId(item.orderItemId, '订单行标识')
        requirePositiveInteger(item.quantity, '本次发货数量')
        if (!itemById.has(item.orderItemId))
          throw new DomainValidationError('发货订单行不属于当前订单')
        quantities.set(item.orderItemId, (quantities.get(item.orderItemId) ?? 0) + item.quantity)
      }
      const states = new Map<string, ReturnType<typeof createFulfillmentState>>()
      const existingEventsByOrderItem = new Map<
        string,
        ReturnType<V2FulfillmentRepository['listFulfillmentEvents']>
      >()
      for (const [orderItemId, addingQuantity] of quantities) {
        const item = itemById.get(orderItemId)!
        const existingEvents = this.fulfillmentRepository.listFulfillmentEvents(orderItemId)
        const state = existingEvents.reduce(
          (current, event) => applyFulfillmentEvent(current, event),
          createFulfillmentState(item.quantity)
        )
        existingEventsByOrderItem.set(orderItemId, existingEvents)
        states.set(orderItemId, state)
        validateShipmentQuantity({
          confirmedQuantity: item.quantity,
          shippedQuantity: state.shipped,
          addingQuantity,
          availableQuantity: state.readyToShip
        })
      }
      const now = this.clock.now()
      const shipment: V2Shipment = {
        id: this.clock.createId(),
        orderId,
        shippedOn: input.shippedOn,
        items: input.items.map((item) => ({ id: this.clock.createId(), ...item })),
        carrier: nullableText(input.carrier),
        trackingNumber: nullableText(input.trackingNumber),
        note: nullableText(input.note),
        status: 'active',
        voidedOn: null,
        voidReason: null,
        voidedAt: null,
        createdAt: now,
        updatedAt: now
      }
      const shipmentEvents = shipment.items.map((item) => ({
        id: this.clock.createId(),
        orderItemId: item.orderItemId,
        eventType: 'shipment' as const,
        quantity: item.quantity,
        sourceStage: 'ready_to_ship' as const,
        targetStage: 'shipped' as const,
        sourceRecordType: 'shipment_item',
        sourceRecordId: item.id,
        occurredOn: shipment.shippedOn,
        note: shipment.note,
        createdAt: createFulfillmentEventTimestamp(
          now,
          shipment.shippedOn,
          existingEventsByOrderItem.get(item.orderItemId) ?? []
        )
      }))
      for (const [orderItemId, state] of states) {
        shipmentEvents
          .filter((event) => event.orderItemId === orderItemId)
          .sort((left, right) => left.id.localeCompare(right.id))
          .reduce((current, event) => applyFulfillmentEvent(current, event), state)
      }
      const shippedBeforeByItem = this.repository.listShippedQuantities(orderId)
      const shipmentDocumentSnapshot = {
        version: 1,
        shipment: {
          id: shipment.id,
          shippedOn: shipment.shippedOn,
          carrier: shipment.carrier,
          trackingNumber: shipment.trackingNumber,
          note: shipment.note,
          createdAt: shipment.createdAt
        },
        order: {
          id: order.id,
          code: order.code,
          customerSnapshot: order.customerSnapshot,
          expectedShipDate: order.expectedShipDate,
          notes: order.notes
        },
        items: order.items.map((item) => {
          const thisShipmentQuantity = quantities.get(item.id) ?? 0
          const shippedQuantity = Math.min(
            (shippedBeforeByItem.get(item.id) ?? 0) + thisShipmentQuantity,
            item.quantity
          )
          return {
            orderItemId: item.id,
            productSnapshot: item.productSnapshot,
            orderedQuantity: item.quantity,
            thisShipmentQuantity,
            shippedQuantity,
            remainingQuantity: Math.max(item.quantity - shippedQuantity, 0),
            unitPriceCents: item.unitPriceCents,
            edgeEnabled: item.edgeEnabled,
            edgeQuantity: item.edgeQuantity,
            edgeUnitPriceCents: item.edgeUnitPriceCents,
            itemDiscountCents: item.itemDiscountCents,
            lineAmountCents: item.lineAmountCents
          }
        })
      }
      this.repository.insertShipment(shipment, shipmentDocumentSnapshot)
      shipmentEvents.forEach((event) => this.fulfillmentRepository.insertFulfillmentEvent(event))
      this.recordAudit('shipment.created', 'order', orderId, undefined, shipment, now, {
        shipmentId: shipment.id
      })
      return shipment
    })
  }

  voidShipment(orderId: string, shipmentId: string, input: V2ShipmentVoidInput): V2Shipment {
    const voidedOn = requireBusinessDate(input.voidedOn, '作废日期')
    const voidReason = requireText(input.reason, '作废原因')
    return this.repository.transaction(() => {
      this.requireOrder(orderId)
      const shipment = this.repository
        .listShipments(orderId)
        .find((item) => item.id === requireId(shipmentId, '发货批次标识'))
      if (!shipment) throw new DomainValidationError('发货批次不存在')
      if (shipment.status === 'voided') throw new DomainValidationError('发货批次已作废')
      if (voidedOn < shipment.shippedOn) throw new DomainValidationError('作废日期不能早于发货日期')

      const now = this.clock.now()
      const reversalEvents = shipment.items.map((item) => {
        const existingEvents = this.fulfillmentRepository.listFulfillmentEvents(item.orderItemId)
        return {
          id: this.clock.createId(),
          orderItemId: item.orderItemId,
          eventType: 'manager_adjustment' as const,
          quantity: item.quantity,
          sourceStage: 'shipped' as const,
          targetStage: 'ready_to_ship' as const,
          sourceRecordType: 'shipment_void',
          sourceRecordId: shipment.id,
          occurredOn: voidedOn,
          note: `作废发货批次：${voidReason}`,
          createdAt: createFulfillmentEventTimestamp(now, voidedOn, existingEvents)
        }
      })
      for (const event of reversalEvents) {
        const item = this.requireOrder(orderId).items.find(
          (candidate) => candidate.id === event.orderItemId
        )!
        const events = this.fulfillmentRepository.listFulfillmentEvents(event.orderItemId)
        const nextEvents = [...events, event].sort((left, right) =>
          left.occurredOn === right.occurredOn
            ? left.createdAt.localeCompare(right.createdAt)
            : left.occurredOn.localeCompare(right.occurredOn)
        )
        nextEvents.reduce(
          (state, current) => applyFulfillmentEvent(state, current),
          createFulfillmentState(item.quantity)
        )
      }
      this.repository.voidShipment(orderId, shipment.id, voidedOn, voidReason, now)
      reversalEvents.forEach((event) => this.fulfillmentRepository.insertFulfillmentEvent(event))
      const voided: V2Shipment = {
        ...shipment,
        status: 'voided',
        voidedOn,
        voidReason,
        voidedAt: now,
        updatedAt: now
      }
      this.recordAudit('shipment.voided', 'order', orderId, shipment, voided, now, {
        shipmentId: shipment.id
      })
      return voided
    })
  }

  listShipments(orderId: string): V2Shipment[] {
    this.requireOrder(orderId)
    return this.repository.listShipments(orderId)
  }

  listContentChanges(orderId: string): V2OrderContentChange[] {
    this.requireOrder(orderId)
    return this.repository.listContentChanges(orderId)
  }

  listOrderFunds(orderId: string): V2OrderFund[] {
    this.requireOrder(orderId)
    return this.repository.listOrderFunds(orderId)
  }

  listAuditLogs(entityId?: string): V2AuditLog[] {
    return this.repository.listAuditLogs(entityId)
  }

  private normalizeCustomer(input: V2CustomerInput): V2CustomerInput {
    return {
      name: requireText(input.name, '客户名称'),
      contact: nullableText(input.contact),
      defaultAddress: nullableText(input.defaultAddress),
      notes: nullableText(input.notes)
    }
  }

  private normalizeProduct(input: V2ProductInput): V2ProductInput {
    requireText(input.name, '商品名称')
    const normalizedMaterialAndCapacity = {
      unitWeightMilligrams: input.unitWeightMilligrams ?? 0,
      moldCount: input.moldCount ?? 0,
      outputPerMoldPerBatch: input.outputPerMoldPerBatch ?? 0,
      maxBatchesPerDay: input.maxBatchesPerDay ?? 0
    }
    for (const [label, value] of [
      ['商品基础售价', input.basePriceCents],
      ['包装成本', input.packagingCostCents],
      ['配饰成本', input.accessoryCostCents],
      ['替换袋成本', input.replacementBagCostCents],
      ['缝边耗材成本', input.edgeConsumableCostCents],
      ['单件固定成本', input.fixedCostCents ?? 0],
      ['预计单件制作时长', input.standardMakingMinutes],
      ['预计单件捏毛装袋时长', input.expectedFluffingBaggingMinutes ?? 0],
      ['预计单件缝边时长', input.expectedEdgeSewingMinutes ?? 0],
      ['预计单件打包发货时长', input.expectedPackingMinutes ?? 0],
      ['制作提成', input.makingCommissionCents],
      ['捏毛装袋提成', input.fluffingBaggingCommissionCents ?? 0],
      ['缝边提成', input.edgeSewingCommissionCents ?? 0]
    ] as const)
      requireNonNegativeInteger(value, label)
    validateProductMaterialAndCapacity(normalizedMaterialAndCapacity)
    return {
      ...input,
      ...normalizedMaterialAndCapacity,
      name: input.name.trim(),
      code: nullableText(input.code),
      category: nullableText(input.category),
      imageAttachmentId: nullableText(input.imageAttachmentId),
      notes: nullableText(input.notes)
    }
  }

  private assertOrderCreateInput(input: V2OrderCreateInput) {
    this.normalizeCustomer(input.customer)
    this.assertOrderItems(input.items)
    calculateOrderAmountSummary({
      items: input.items,
      orderDiscountCents: input.orderDiscountCents
    })
    return calculateOrderSchedule({
      expectedShipDate: input.expectedShipDate,
      reservedDays: input.reservedDays,
      defaultReservedDays: this.studioSettings?.get().orderReservedDays
    })
  }

  private assertOrderItems(items: V2OrderItemInput[]): void {
    if (!items.length) throw new DomainValidationError('订单至少需要一条商品明细')
    for (const item of items) {
      requireId(item.productId, '商品标识')
      requirePositiveInteger(item.quantity, '订单数量')
      requireNonNegativeInteger(item.unitPriceCents, '订单单价')
      calculateOrderItemAmounts(item)
    }
  }

  private assertAmountAdjustment(
    input: NonNullable<V2OrderContentChangeInput['amountAdjustment']>
  ): void {
    if (!Number.isInteger(input.amountCents) || input.amountCents === 0) {
      throw new DomainValidationError('金额调整必须是非零整数分')
    }
    requireBusinessDate(input.occurredOn, '金额调整日期')
    requireText(input.reason, '金额调整原因')
  }

  private normalizeFund(input: V2OrderFundInput): V2OrderFundInput {
    const normalized: V2OrderFundInput = {
      businessType: input.businessType,
      amountCents: input.amountCents,
      occurredOn: input.occurredOn,
      paymentMethod: nullableText(input.paymentMethod),
      attachmentId: nullableText(input.attachmentId),
      note: nullableText(input.note)
    }
    validateOrderFundInput({
      direction: normalized.businessType === 'refund' ? 'expense' : 'income',
      businessType: normalized.businessType,
      amountCents: normalized.amountCents,
      occurredOn: normalized.occurredOn
    })
    return normalized
  }

  private buildOrderItems(
    orderId: string,
    inputs: V2OrderItemInput[],
    now: string
  ): Array<Omit<V2OrderItem, 'orderId'>> {
    return inputs.map((item) => {
      const product = this.requireProduct(item.productId)
      if (!product.enabled)
        throw new DomainValidationError(`商品「${product.name}」已停用，不能用于新订单内容`)
      const amounts = calculateOrderItemAmounts(item)
      return {
        id: this.clock.createId(),
        productId: product.id,
        productSnapshot: createProductSnapshot(
          product,
          this.studioSettings?.get().materialPriceMicroYuanPerGram ?? 0
        ),
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        edgeEnabled: amounts.edge.enabled,
        edgeQuantity: amounts.edge.quantity,
        edgeUnitPriceCents: amounts.edge.unitPriceCents,
        itemAmountCents: amounts.itemAmountCents,
        edgeAmountCents: amounts.edgeAmountCents,
        itemDiscountCents: amounts.itemDiscountCents,
        lineAmountCents: amounts.lineAmountCents,
        createdAt: now,
        updatedAt: now
      }
    })
  }

  private requireCustomer(id: string): V2Customer {
    const customer = this.repository.getCustomer(id)
    if (!customer) throw new DomainValidationError('客户不存在')
    return customer
  }

  private requireProduct(id: string): V2Product {
    const product = this.repository.getProduct(id)
    if (!product) throw new DomainValidationError('商品不存在')
    return product
  }

  private requireOrder(id: string): V2Order {
    const order = this.repository.getOrder(id)
    if (!order) throw new DomainValidationError('订单不存在')
    return order
  }

  private recordAudit(
    action: string,
    entityType: string,
    entityId: string,
    before: unknown | undefined,
    after: unknown | undefined,
    createdAt: string,
    metadata?: unknown
  ): V2AuditLog {
    return this.repository.insertAudit({
      id: this.clock.createId(),
      action,
      entityType,
      entityId,
      before,
      after,
      metadata,
      createdAt
    })
  }
}
