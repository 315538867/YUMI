import { randomUUID } from 'node:crypto'
import { validateOrderFundInput, validateOrderFundReversal } from '@main/domain/order-funds'
import { DomainValidationError } from '@main/domain/errors'
import { applyFulfillmentEvent, createFulfillmentState } from '@main/domain/fulfillment'
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
  V2ProductInput,
  V2ProductOrderSnapshot,
  V2ProductUpdateInput,
  V2Shipment,
  V2ShipmentInput
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
  gluePriceMicroYuanPerGram: number
): V2ProductOrderSnapshot {
  return {
    productId: product.id,
    name: product.name,
    code: product.code,
    category: product.category,
    basePriceCents: product.basePriceCents,
    materialCostCents: product.materialCostCents,
    packagingCostCents: product.packagingCostCents,
    accessoryCostCents: product.accessoryCostCents,
    replacementBagCostCents: product.replacementBagCostCents,
    edgeCostCents: product.edgeCostCents,
    standardMakingMinutes: product.standardMakingMinutes,
    makingCommissionCents: product.makingCommissionCents,
    makingGlueCostCents: product.makingGlueCostCents,
    glueWeightMilligrams: product.glueWeightMilligrams,
    gluePriceMicroYuanPerGram
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
    const normalized = { ...this.normalizeCustomer(input), id: requireId(input.id, '客户标识'), enabled: input.enabled }
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
    const normalized = { ...this.normalizeProduct(input), id: requireId(input.id, '商品标识'), enabled: input.enabled }
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
    this.assertOrderCreateInput(input)
    return this.repository.transaction(() => {
      const now = this.clock.now()
      const orderId = this.clock.createId()
      const customer = input.customerId
        ? this.requireCustomer(input.customerId)
        : this.repository.insertCustomer(this.clock.createId(), this.normalizeCustomer(input.customer), now)
      const customerSnapshot: V2CustomerInput = {
        name: customer.name,
        contact: customer.contact,
        defaultAddress: customer.defaultAddress,
        notes: customer.notes
      }
      const items = this.buildOrderItems(orderId, input.items, now)
      const code = input.code?.trim() || `YUMI-${now.slice(0, 10).replaceAll('-', '')}-${orderId.slice(0, 8).toUpperCase()}`
      this.repository.insertOrder({
        id: orderId,
        code: requireText(code, '订单编号'),
        customerId: customer.id,
        customerSnapshot,
        initialConfirmedAmountCents: input.initialConfirmedAmountCents,
        expectedShipDate: input.expectedShipDate ? requireBusinessDate(input.expectedShipDate, '预计发货日期') : null,
        notes: nullableText(input.notes),
        now
      })
      this.repository.insertOrderItems(orderId, items)
      const order = this.repository.getOrder(orderId)!
      this.recordAudit('order.created', 'order', orderId, undefined, order, now, { customerCreated: !input.customerId })
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
        throw new DomainValidationError('已有发货记录的订单不能直接替换订单内容，请通过售后或负责人处理')
      }
      const now = this.clock.now()
      const afterItems = this.buildOrderItems(orderId, input.items, now)
      this.repository.replaceOrderItems(orderId, afterItems)
      if (input.amountAdjustment) {
        this.repository.createAmountAdjustment({
          id: this.clock.createId(), orderId, amountCents: input.amountAdjustment.amountCents,
          occurredOn: input.amountAdjustment.occurredOn, reason: requireText(input.amountAdjustment.reason, '金额调整原因'),
          note: nullableText(input.amountAdjustment.note), createdAt: now
        })
      }
      const change: V2OrderContentChange = {
        id: this.clock.createId(), orderId, occurredOn: input.occurredOn,
        description: input.description.trim(), beforeItems: beforeOrder.items,
        afterItems: this.repository.listOrderItems(orderId), createdAt: now
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

  addOrderAmountAdjustment(orderId: string, input: V2OrderContentChangeInput['amountAdjustment']): V2Order {
    if (!input) throw new DomainValidationError('金额调整不能为空')
    this.assertAmountAdjustment(input)
    return this.repository.transaction(() => {
      const before = this.requireOrder(orderId)
      const now = this.clock.now()
      const adjustment: V2OrderAmountAdjustment = {
        id: this.clock.createId(), orderId, amountCents: input.amountCents, occurredOn: input.occurredOn,
        reason: requireText(input.reason, '金额调整原因'), note: nullableText(input.note), createdAt: now
      }
      this.repository.createAmountAdjustment(adjustment)
      const after = this.repository.getOrder(orderId)!
      this.recordAudit('order.amount_adjusted', 'order', orderId, before, after, now, { adjustmentId: adjustment.id })
      return after
    })
  }

  recordOrderFund(orderId: string, input: V2OrderFundInput): V2OrderFund {
    const normalized = this.normalizeFund(input)
    return this.repository.transaction(() => {
      this.requireOrder(orderId)
      const now = this.clock.now()
      const fund: V2OrderFund = {
        id: this.clock.createId(), orderId,
        direction: normalized.businessType === 'refund' ? 'expense' : 'income',
        ...normalized, reversalOfEntryId: null, attachment: null, createdAt: now
      }
      this.repository.insertFund(fund)
      this.recordAudit('order.fund_recorded', 'financial_entry', fund.id, undefined, fund, now, { orderId })
      return fund
    })
  }

  correctOrderFund(orderId: string, input: V2OrderFundCorrectionInput): { reversal: V2OrderFund; replacement: V2OrderFund } {
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
      const original = this.repository.getFund(requireId(input.originalEntryId, '原资金记录标识'))
      if (!original || original.orderId !== orderId) throw new DomainValidationError('原资金记录不存在或不属于当前订单')
      if (original.reversalOfEntryId) throw new DomainValidationError('冲正记录不能再次冲正')
      if (this.repository.hasReversalForFund(original.id)) throw new DomainValidationError('原资金记录已被冲正')
      const now = this.clock.now()
      const reversal: V2OrderFund = {
        id: this.clock.createId(), orderId,
        direction: original.direction === 'income' ? 'expense' : 'income',
        businessType: original.businessType,
        amountCents: original.amountCents, occurredOn: input.reversalOccurredOn,
        paymentMethod: original.paymentMethod, attachmentId: original.attachmentId,
        note: `冲正：${original.note ?? original.id}`, reversalOfEntryId: original.id,
        attachment: null, createdAt: now
      }
      const replacementFund: V2OrderFund = {
        id: this.clock.createId(), orderId,
        direction: replacement.businessType === 'refund' ? 'expense' : 'income',
        ...replacement, reversalOfEntryId: null, attachment: null, createdAt: now
      }
      this.repository.insertFund(reversal)
      this.repository.insertFund(replacementFund)
      this.recordAudit('order.fund_corrected', 'financial_entry', original.id, original, {
        reversal,
        replacement: replacementFund
      }, now, { orderId })
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
        if (!itemById.has(item.orderItemId)) throw new DomainValidationError('发货订单行不属于当前订单')
        quantities.set(item.orderItemId, (quantities.get(item.orderItemId) ?? 0) + item.quantity)
      }
      const states = new Map<string, ReturnType<typeof createFulfillmentState>>()
      const existingEventsByOrderItem = new Map<string, ReturnType<V2FulfillmentRepository['listFulfillmentEvents']>>()
      for (const [orderItemId, addingQuantity] of quantities) {
        const item = itemById.get(orderItemId)!
        const existingEvents = this.fulfillmentRepository.listFulfillmentEvents(orderItemId)
        const state = existingEvents
          .reduce((current, event) => applyFulfillmentEvent(current, event), createFulfillmentState(item.quantity))
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
        id: this.clock.createId(), orderId, shippedOn: input.shippedOn,
        items: input.items.map((item) => ({ id: this.clock.createId(), ...item })),
        carrier: nullableText(input.carrier), trackingNumber: nullableText(input.trackingNumber),
        note: nullableText(input.note), createdAt: now, updatedAt: now
      }
      const shipmentEvents = shipment.items.map((item) => ({
        id: this.clock.createId(), orderItemId: item.orderItemId, eventType: 'shipment' as const,
        quantity: item.quantity, sourceStage: 'ready_to_ship' as const, targetStage: 'shipped' as const,
        sourceRecordType: 'shipment_item', sourceRecordId: item.id, occurredOn: shipment.shippedOn,
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
      this.repository.insertShipment(shipment)
      shipmentEvents.forEach((event) => this.fulfillmentRepository.insertFulfillmentEvent(event))
      this.recordAudit('shipment.created', 'order', orderId, undefined, shipment, now, { shipmentId: shipment.id })
      return shipment
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
    for (const [label, value] of [
      ['商品基础售价', input.basePriceCents],
      ['包装成本', input.packagingCostCents], ['配饰成本', input.accessoryCostCents],
      ['替换袋成本', input.replacementBagCostCents], ['封边成本', input.edgeCostCents],
      ['标准制作分钟', input.standardMakingMinutes], ['制作提成', input.makingCommissionCents],
      ['胶水用量（毫克）', input.glueWeightMilligrams ?? 0],
      ['旧版原材料成本', input.materialCostCents ?? 0],
      ['旧版制作胶水成本', input.makingGlueCostCents ?? 0]
    ] as const) requireNonNegativeInteger(value, label)
    return {
      ...input,
      materialCostCents: input.materialCostCents ?? 0,
      makingGlueCostCents: input.makingGlueCostCents ?? 0,
      glueWeightMilligrams: input.glueWeightMilligrams ?? 0,
      name: input.name.trim(), code: nullableText(input.code), category: nullableText(input.category),
      imageAttachmentId: nullableText(input.imageAttachmentId), notes: nullableText(input.notes)
    }
  }

  private assertOrderCreateInput(input: V2OrderCreateInput): void {
    this.normalizeCustomer(input.customer)
    this.assertOrderItems(input.items)
    requireNonNegativeInteger(input.initialConfirmedAmountCents, '初始确认金额')
    if (input.expectedShipDate) requireBusinessDate(input.expectedShipDate, '预计发货日期')
  }

  private assertOrderItems(items: V2OrderItemInput[]): void {
    if (!items.length) throw new DomainValidationError('订单至少需要一条商品明细')
    for (const item of items) {
      requireId(item.productId, '商品标识')
      requirePositiveInteger(item.quantity, '订单数量')
      requireNonNegativeInteger(item.unitPriceCents, '订单单价')
    }
  }

  private assertAmountAdjustment(input: NonNullable<V2OrderContentChangeInput['amountAdjustment']>): void {
    if (!Number.isInteger(input.amountCents) || input.amountCents === 0) {
      throw new DomainValidationError('金额调整必须是非零整数分')
    }
    requireBusinessDate(input.occurredOn, '金额调整日期')
    requireText(input.reason, '金额调整原因')
  }

  private normalizeFund(input: V2OrderFundInput): V2OrderFundInput {
    const normalized: V2OrderFundInput = {
      businessType: input.businessType, amountCents: input.amountCents,
      occurredOn: input.occurredOn, paymentMethod: nullableText(input.paymentMethod),
      attachmentId: nullableText(input.attachmentId), note: nullableText(input.note)
    }
    validateOrderFundInput({
      direction: normalized.businessType === 'refund' ? 'expense' : 'income',
      businessType: normalized.businessType, amountCents: normalized.amountCents, occurredOn: normalized.occurredOn
    })
    return normalized
  }

  private buildOrderItems(orderId: string, inputs: V2OrderItemInput[], now: string): Array<Omit<V2OrderItem, 'orderId'>> {
    return inputs.map((item) => {
      const product = this.requireProduct(item.productId)
      if (!product.enabled) throw new DomainValidationError(`商品「${product.name}」已停用，不能用于新订单内容`)
      return {
        id: this.clock.createId(), productId: product.id, productSnapshot: createProductSnapshot(product, this.studioSettings?.get().gluePriceMicroYuanPerGram ?? 0),
        quantity: item.quantity, unitPriceCents: item.unitPriceCents, createdAt: now, updatedAt: now
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
      id: this.clock.createId(), action, entityType, entityId, before, after, metadata, createdAt
    })
  }
}
