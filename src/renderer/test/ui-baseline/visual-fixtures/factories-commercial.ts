/**
 * 商业域夹具工厂：客户、商品、订单、订单资金、发货批次（任务 1.6）。
 */
import type {
  V2Customer,
  V2Order,
  V2OrderFund,
  V2OrderItem,
  V2OrderSummary,
  V2Product,
  V2ProductOrderSnapshot,
  V2Shipment
} from '@shared/contracts/index'
import { EXTREME_AMOUNTS, LONG_TEXT, NULL_TEXT_SAMPLES } from './edge-values'
import { atFixedHour, shiftDate } from './determinism'
import type { FactoryContext } from './context'

const CUSTOMER_NAMES = ['王女士', '李先生', '陈小姐', '张同学'] as const
const PRODUCT_MATERIALS = ['奶油胶', '滴胶', '超轻黏土'] as const
const CARRIERS = ['顺丰速运', '中通快递', '圆通速递'] as const

export const makeCustomer = (
  context: FactoryContext,
  index: number,
  overrides: Partial<V2Customer> = {}
): V2Customer => {
  const { random, nextId, today } = context
  const createdAt = atFixedHour(shiftDate(today, -(index + 3)), 9, 30)
  return {
    id: nextId('customer'),
    name: `客户${String(index + 1).padStart(2, '0')}·${random.pick(CUSTOMER_NAMES)}`,
    contact: random.pick([LONG_TEXT.contact, '13800001234', null]),
    defaultAddress: random.pick([LONG_TEXT.address, '杭州市西湖区文三路 100 号', null]),
    notes: random.chance(0.4) ? LONG_TEXT.orderNotes : null,
    enabled: index % 5 !== 4,
    createdAt,
    updatedAt: createdAt,
    ...overrides
  }
}

/** 前三个索引刻意做成极端样本：极贵商品、一分钱商品、产能参数未维护。 */
export const makeProductRow = (
  context: FactoryContext,
  index: number,
  overrides: Partial<V2Product> = {}
): V2Product => {
  const { random, nextId, today } = context
  const createdAt = atFixedHour(shiftDate(today, -(index + 2)), 11)
  const moldCount = random.int(2, 12)
  const outputPerMoldPerBatch = random.int(1, 6)
  const maxBatchesPerDay = random.int(2, 8)
  return {
    id: nextId('product'),
    name: `捏捏商品${String(index + 1).padStart(2, '0')}·${random.pick(PRODUCT_MATERIALS)}款`,
    code: `SP${String(index + 1).padStart(4, '0')}`,
    basePriceCents: random.int(1800, 9800),
    packagingCostCents: random.int(80, 400),
    accessoryCostCents: random.int(50, 300),
    replacementBagCostCents: random.int(30, 200),
    edgeConsumableCostCents: random.int(20, 150),
    fixedCostCents: random.int(100, 600),
    unitWeightMilligrams: random.int(5000, 60000),
    standardMakingMinutes: random.int(20, 90),
    expectedFluffingBaggingMinutes: random.int(6, 20),
    expectedEdgeSewingMinutes: random.int(4, 15),
    expectedPackingMinutes: random.int(3, 10),
    makingCommissionCents: random.int(200, 900),
    fluffingBaggingCommissionCents: random.int(80, 300),
    edgeSewingCommissionCents: random.int(60, 260),
    moldCount,
    outputPerMoldPerBatch,
    maxBatchesPerDay,
    dailyCapacity: moldCount * outputPerMoldPerBatch * maxBatchesPerDay,
    enabled: index % 7 !== 6,
    imageAttachmentId: null,
    notes: random.chance(0.3) ? LONG_TEXT.productName : null,
    createdAt,
    updatedAt: createdAt,
    ...overrides
  }
}

export const buildProductFixtures = (context: FactoryContext, total: number): V2Product[] =>
  Array.from({ length: total }, (_, index) => {
    if (index === 0) {
      return makeProductRow(context, index, {
        basePriceCents: EXTREME_AMOUNTS.huge,
        name: LONG_TEXT.productName
      })
    }
    if (index === 1) {
      return makeProductRow(context, index, { basePriceCents: EXTREME_AMOUNTS.oneCent })
    }
    if (index === 2) {
      return makeProductRow(context, index, {
        moldCount: 0,
        outputPerMoldPerBatch: 0,
        maxBatchesPerDay: 0,
        dailyCapacity: 0
      })
    }
    return makeProductRow(context, index)
  })

export const buildCustomerFixtures = (context: FactoryContext, total: number): V2Customer[] =>
  Array.from({ length: total }, (_, index) => {
    if (index === 0) {
      return makeCustomer(context, index, {
        name: LONG_TEXT.customerName,
        contact: LONG_TEXT.contact,
        defaultAddress: LONG_TEXT.address,
        notes: LONG_TEXT.orderNotes
      })
    }
    if (index === 1) {
      return makeCustomer(context, index, {
        contact: NULL_TEXT_SAMPLES.contact,
        defaultAddress: NULL_TEXT_SAMPLES.defaultAddress,
        notes: NULL_TEXT_SAMPLES.notes
      })
    }
    return makeCustomer(context, index)
  })

const makeSnapshot = (product: V2Product, context: FactoryContext): V2ProductOrderSnapshot => ({
  productId: product.id,
  name: product.name,
  code: product.code,
  basePriceCents: product.basePriceCents,
  packagingCostCents: product.packagingCostCents,
  accessoryCostCents: product.accessoryCostCents,
  replacementBagCostCents: product.replacementBagCostCents,
  edgeConsumableCostCents: product.edgeConsumableCostCents,
  fixedCostCents: product.fixedCostCents,
  unitWeightMilligrams: product.unitWeightMilligrams,
  materialPriceMicroYuanPerGram: context.settings.materialPriceMicroYuanPerGram,
  standardMakingMinutes: product.standardMakingMinutes,
  expectedFluffingBaggingMinutes: product.expectedFluffingBaggingMinutes,
  expectedEdgeSewingMinutes: product.expectedEdgeSewingMinutes,
  expectedPackingMinutes: product.expectedPackingMinutes,
  makingCommissionCents: product.makingCommissionCents,
  fluffingBaggingCommissionCents: product.fluffingBaggingCommissionCents,
  edgeSewingCommissionCents: product.edgeSewingCommissionCents,
  moldCount: product.moldCount,
  outputPerMoldPerBatch: product.outputPerMoldPerBatch,
  maxBatchesPerDay: product.maxBatchesPerDay,
  dailyCapacity: product.dailyCapacity,
  imageAttachmentId: product.imageAttachmentId,
  notes: product.notes
})

const makeOrderItem = (
  context: FactoryContext,
  orderId: string,
  product: V2Product,
  index: number
): V2OrderItem => {
  const { random, nextId, today } = context
  const quantity = random.int(1, 12)
  const unitPriceCents = product.basePriceCents
  const edgeEnabled = random.chance(0.35)
  const edgeQuantity = edgeEnabled ? random.int(1, quantity) : 0
  const edgeUnitPriceCents = edgeEnabled ? random.int(150, 600) : 0
  const itemDiscountCents = random.chance(0.25) ? random.int(100, 1500) : 0
  const itemAmountCents = quantity * unitPriceCents
  const edgeAmountCents = edgeQuantity * edgeUnitPriceCents
  const createdAt = atFixedHour(shiftDate(today, -index), 14)
  return {
    id: nextId('order-item'),
    orderId,
    productId: product.id,
    productSnapshot: makeSnapshot(product, context),
    quantity,
    unitPriceCents,
    edgeEnabled,
    edgeQuantity,
    edgeUnitPriceCents,
    itemAmountCents,
    edgeAmountCents,
    itemDiscountCents,
    lineAmountCents: itemAmountCents + edgeAmountCents - itemDiscountCents,
    createdAt,
    updatedAt: createdAt
  }
}

export const buildOrderFixtures = (
  context: FactoryContext,
  total: number,
  customers: V2Customer[],
  products: V2Product[]
): V2Order[] =>
  Array.from({ length: total }, (_, index) => {
    const { random, nextId, today } = context
    const customer = customers[index % customers.length] ?? null
    const orderId = nextId('order')
    const itemCount = random.int(1, 3)
    const items = Array.from({ length: itemCount }, (_, itemIndex) =>
      makeOrderItem(context, orderId, random.pick(products), itemIndex)
    )

    const itemAmountCents = items.reduce((sum, item) => sum + item.itemAmountCents, 0)
    const edgeAmountCents = items.reduce((sum, item) => sum + item.edgeAmountCents, 0)
    const itemDiscountCents = items.reduce((sum, item) => sum + item.itemDiscountCents, 0)
    const orderDiscountCents = random.chance(0.2) ? random.int(200, 3000) : 0
    const orderAmountCents =
      itemAmountCents + edgeAmountCents - itemDiscountCents - orderDiscountCents
    const adjustmentsCents = random.chance(0.2) ? random.int(-2000, 2000) : 0
    const currentAmountCents = orderAmountCents + adjustmentsCents
    const receivedCents =
      index % 3 === 0 ? EXTREME_AMOUNTS.zero : random.int(1000, currentAmountCents)
    const refundedCents = index % 5 === 0 ? random.int(100, 800) : 0
    const netReceivedCents = receivedCents - refundedCents
    const createdAt = atFixedHour(shiftDate(today, -(index + 1)), 13, 15)

    return {
      id: orderId,
      code: `YM${String(20260000 + index + 1)}`,
      customer,
      customerSnapshot: {
        name: customer?.name ?? LONG_TEXT.customerName,
        contact: customer?.contact ?? null,
        defaultAddress: customer?.defaultAddress ?? null,
        notes: customer?.notes ?? null
      },
      items,
      amount: {
        itemAmountCents,
        edgeAmountCents,
        itemDiscountCents,
        orderDiscountCents,
        orderAmountCents,
        adjustmentsCents,
        currentAmountCents
      },
      funds: {
        receivedCents,
        refundedCents,
        netReceivedCents,
        outstandingCents: currentAmountCents - netReceivedCents
      },
      expectedShipDate: index % 4 === 0 ? null : shiftDate(today, random.int(3, 20)),
      reservedDays: 2,
      productionDeadline: index % 4 === 0 ? null : shiftDate(today, random.int(1, 10)),
      notes: random.chance(0.3) ? LONG_TEXT.orderNotes : null,
      createdAt,
      updatedAt: createdAt
    }
  })

export const toOrderSummary = (order: V2Order, shippedQuantity: number): V2OrderSummary => ({
  id: order.id,
  code: order.code,
  customerName: order.customer?.name ?? LONG_TEXT.customerName,
  itemCount: order.items.length,
  totalQuantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
  shippedQuantity,
  createdAt: order.createdAt,
  currentAmountCents: order.amount.currentAmountCents,
  netReceivedCents: order.funds.netReceivedCents,
  outstandingCents: order.funds.outstandingCents,
  expectedShipDate: order.expectedShipDate,
  reservedDays: order.reservedDays,
  productionDeadline: order.productionDeadline,
  updatedAt: order.updatedAt
})

export const buildOrderFundFixtures = (
  context: FactoryContext,
  total: number,
  orders: V2Order[]
): V2OrderFund[] =>
  Array.from({ length: total }, (_, index) => {
    const { nextId, today } = context
    const order = orders[index % orders.length]
    const reversed = index % 6 === 5
    const occurredOn = shiftDate(today, -(index % 12))
    return {
      id: nextId('order-fund'),
      orderId: order?.id ?? 'order-missing',
      direction: reversed ? 'expense' : 'income',
      businessType: reversed ? 'refund' : 'payment',
      amountCents:
        index === 1 ? EXTREME_AMOUNTS.wide : reversed ? 600 + index * 20 : 2000 + index * 100,
      occurredOn,
      paymentMethod: index % 2 === 0 ? '微信' : '支付宝',
      attachmentId: null,
      attachment: null,
      note: index % 4 === 0 ? LONG_TEXT.orderNotes : null,
      reversalOfEntryId: index % 9 === 8 ? 'order-fund-0001' : null,
      createdAt: atFixedHour(occurredOn, 15, 20)
    }
  })

/** 前四个批次发给前四张订单，最后一个批次刻意做成已作废。 */
export const buildShipmentFixtures = (
  context: FactoryContext,
  total: number,
  orders: V2Order[]
): V2Shipment[] =>
  Array.from({ length: total }, (_, index) => {
    const { nextId, today } = context
    const order = orders[index % orders.length]
    const voided = index === total - 1
    const shippedOn = shiftDate(today, -(index + 1))
    return {
      id: nextId('shipment'),
      orderId: order?.id ?? 'order-missing',
      shippedOn,
      items: (order?.items ?? []).map((item, itemIndex) => ({
        id: nextId('shipment-item'),
        orderItemId: item.id,
        quantity: itemIndex === 0 ? item.quantity : 1
      })),
      carrier: CARRIERS[index % CARRIERS.length] ?? null,
      trackingNumber: `SF${100000000000 + index * 137}`,
      note: voided ? '客户临时改址，批次作废后重发' : null,
      status: voided ? 'voided' : 'active',
      voidedOn: voided ? shiftDate(shippedOn, 1) : null,
      voidReason: voided ? '客户改址，重新登记批次' : null,
      voidedAt: voided ? atFixedHour(shiftDate(shippedOn, 1), 10) : null,
      createdAt: atFixedHour(shippedOn, 18),
      updatedAt: atFixedHour(shippedOn, 18)
    }
  })
