import type { Cents, V2OrderEdgeInput } from '@shared/contracts/index'
import { DomainValidationError } from './errors'

export interface OrderItemAmountInput {
  quantity: number
  unitPriceCents: Cents
  edge?: V2OrderEdgeInput
  itemDiscountCents?: Cents
}

export interface NormalizedOrderEdge {
  enabled: boolean
  quantity: number
  unitPriceCents: Cents
}

export interface OrderItemAmountSummary {
  itemAmountCents: Cents
  edgeAmountCents: Cents
  itemDiscountCents: Cents
  lineAmountCents: Cents
  edge: NormalizedOrderEdge
}

export interface OrderAmountSummaryInput {
  items: OrderItemAmountInput[]
  orderDiscountCents?: Cents
  adjustmentsCents?: Cents[]
}

export interface OrderAmountSummary {
  itemAmountCents: Cents
  edgeAmountCents: Cents
  itemDiscountCents: Cents
  orderDiscountCents: Cents
  orderAmountCents: Cents
  adjustmentsCents: Cents
  currentAmountCents: Cents
}

function assertIntegerCents(value: number, label: string): void {
  if (!Number.isInteger(value)) throw new DomainValidationError(`${label}必须使用整数分`)
}

function assertNonNegativeCents(value: number, label: string): void {
  assertIntegerCents(value, label)
  if (value < 0) throw new DomainValidationError(`${label}不能为负数`)
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new DomainValidationError(`${label}必须是正整数`)
  }
}

export function normalizeOrderEdge(
  edge: V2OrderEdgeInput | undefined,
  quantity: number
): NormalizedOrderEdge {
  if (!edge?.enabled) return { enabled: false, quantity: 0, unitPriceCents: 0 }
  const edgeQuantity = edge.quantity ?? quantity
  assertPositiveInteger(edgeQuantity, '缝边数量')
  if (edgeQuantity > quantity) throw new DomainValidationError('缝边数量不能超过商品数量')
  const unitPriceCents = edge.unitPriceCents ?? 0
  assertNonNegativeCents(unitPriceCents, '缝边单价')
  return { enabled: true, quantity: edgeQuantity, unitPriceCents }
}

export function calculateOrderItemAmounts(input: OrderItemAmountInput): OrderItemAmountSummary {
  assertPositiveInteger(input.quantity, '订单数量')
  assertNonNegativeCents(input.unitPriceCents, '成交单价')
  const itemAmountCents = input.quantity * input.unitPriceCents
  const edge = normalizeOrderEdge(input.edge, input.quantity)
  const edgeAmountCents = edge.quantity * edge.unitPriceCents
  const itemDiscountCents = input.itemDiscountCents ?? 0
  assertNonNegativeCents(itemDiscountCents, '明细优惠')
  const grossAmountCents = itemAmountCents + edgeAmountCents
  if (itemDiscountCents > grossAmountCents) {
    throw new DomainValidationError('明细优惠不能超过明细金额')
  }
  return {
    itemAmountCents,
    edgeAmountCents,
    itemDiscountCents,
    lineAmountCents: grossAmountCents - itemDiscountCents,
    edge
  }
}

export function calculateOrderAmountSummary(input: OrderAmountSummaryInput): OrderAmountSummary {
  if (!input.items.length) throw new DomainValidationError('订单至少需要一条商品明细')
  const itemSummaries = input.items.map(calculateOrderItemAmounts)
  const itemAmountCents = itemSummaries.reduce((total, item) => total + item.itemAmountCents, 0)
  const edgeAmountCents = itemSummaries.reduce((total, item) => total + item.edgeAmountCents, 0)
  const itemDiscountCents = itemSummaries.reduce((total, item) => total + item.itemDiscountCents, 0)
  const orderDiscountCents = input.orderDiscountCents ?? 0
  assertNonNegativeCents(orderDiscountCents, '订单优惠')
  const lineTotalCents = itemSummaries.reduce((total, item) => total + item.lineAmountCents, 0)
  if (orderDiscountCents > lineTotalCents) {
    throw new DomainValidationError('订单优惠不能超过订单金额')
  }
  const adjustmentsCents = (input.adjustmentsCents ?? []).reduce((total, amount, index) => {
    assertIntegerCents(amount, `第 ${index + 1} 笔金额调整`)
    if (amount === 0) throw new DomainValidationError('金额调整不能为零')
    return total + amount
  }, 0)
  const orderAmountCents = lineTotalCents - orderDiscountCents
  return {
    itemAmountCents,
    edgeAmountCents,
    itemDiscountCents,
    orderDiscountCents,
    orderAmountCents,
    adjustmentsCents,
    currentAmountCents: orderAmountCents + adjustmentsCents
  }
}
