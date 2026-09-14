import { DomainValidationError } from './errors'

export const productStages = [
  'made',
  'fluffing_bagging_done',
  'edge_sewing_done',
  'packed'
] as const
export type ProductStage = (typeof productStages)[number]

export const productInventorySourceTypes = [
  'opening',
  'order_allocation',
  'manager_adjustment'
] as const
export type ProductInventorySourceType = (typeof productInventorySourceTypes)[number]

export interface ProductInventoryEventDraft {
  stage: ProductStage
  quantityDelta: number
  sourceType: ProductInventorySourceType
  orderItemId?: string | null
  occurredOn: string
  note?: string | null
}

export type ProductStageBalances = Record<ProductStage, number>

function requireNonZeroInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value === 0) {
    throw new DomainValidationError(`${label}必须是非零整数`)
  }
  return value
}

export function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DomainValidationError(`${label}必须是正整数`)
  }
  return value
}

export function requireProductStage(value: string): ProductStage {
  if (!productStages.includes(value as ProductStage)) {
    throw new DomainValidationError('商品存量阶段不合法')
  }
  return value as ProductStage
}

export function requireBusinessDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DomainValidationError(`${label}格式必须为 YYYY-MM-DD`)
  }
  return value
}

export function createEmptyProductStageBalances(): ProductStageBalances {
  return { made: 0, fluffing_bagging_done: 0, edge_sewing_done: 0, packed: 0 }
}

/** 商品阶段存量只由流水汇总；任一阶段余额不得为负。 */
export function applyProductInventoryEvent(
  balances: ProductStageBalances,
  event: ProductInventoryEventDraft
): ProductStageBalances {
  const stage = requireProductStage(event.stage)
  const quantityDelta = requireNonZeroInteger(event.quantityDelta, '存量增减数量')
  const next = { ...balances }
  const nextValue = next[stage] + quantityDelta
  if (nextValue < 0) throw new DomainValidationError('商品存量余额不能为负')
  next[stage] = nextValue
  return next
}

export function createOpeningEventDraft(input: {
  stage: ProductStage
  quantity: number
  occurredOn: string
  note?: string | null
}): ProductInventoryEventDraft {
  return {
    stage: requireProductStage(input.stage),
    quantityDelta: requirePositiveInteger(input.quantity, '期初录入数量'),
    sourceType: 'opening',
    orderItemId: null,
    occurredOn: requireBusinessDate(input.occurredOn, '发生日期'),
    note: input.note ?? null
  }
}

export function createAdjustmentEventDraft(input: {
  stage: ProductStage
  quantityDelta: number
  occurredOn: string
  note: string
}): ProductInventoryEventDraft {
  if (!input.note.trim()) throw new DomainValidationError('调整原因不能为空')
  return {
    stage: requireProductStage(input.stage),
    quantityDelta: requireNonZeroInteger(input.quantityDelta, '调整数量'),
    sourceType: 'manager_adjustment',
    orderItemId: null,
    occurredOn: requireBusinessDate(input.occurredOn, '发生日期'),
    note: input.note.trim()
  }
}

export function createAllocationEventDraft(input: {
  stage: ProductStage
  quantity: number
  orderItemId: string
  occurredOn: string
  note?: string | null
}): ProductInventoryEventDraft {
  return {
    stage: requireProductStage(input.stage),
    quantityDelta: -requirePositiveInteger(input.quantity, '投入数量'),
    sourceType: 'order_allocation',
    orderItemId: input.orderItemId,
    occurredOn: requireBusinessDate(input.occurredOn, '发生日期'),
    note: input.note ?? null
  }
}
