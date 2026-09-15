import { DomainValidationError } from './errors'

export const processTypes = ['making', 'fluffing_bagging', 'edge_sewing', 'packing'] as const
export type ProcessType = (typeof processTypes)[number]

export const processTaskSources = [
  'normal_production',
  'rework',
  'after_sales_replacement',
  'manager_arrangement'
] as const
export type ProcessTaskSource = (typeof processTaskSources)[number]

export const fulfillmentStages = [
  'making',
  'fluffing_bagging',
  'edge_sewing',
  'packing',
  'ready_to_ship',
  'shipped'
] as const
export type FulfillmentStage = (typeof fulfillmentStages)[number]

export type FulfillmentEventType =
  | 'inventory_allocation'
  | 'making_qualified'
  | 'fluffing_bagging_completed'
  | 'edge_sewing_completed'
  | 'packing_completed'
  | 'shipment'
  | 'manager_adjustment'
  | 'after_sales_return'
  | 'after_sales_replacement'

export interface TaskMinutesInput {
  processType: ProcessType
  plannedQuantity?: number | null
  standardMakingMinutes?: number | null
  plannedMinutes?: number | null
  extraMinutes?: number | null
}

export interface ProcessResultInput {
  completedQuantity: number
  actualMinutes?: number | null
}

export interface QualityInspectionInput {
  completedQuantity: number
  qualifiedQuantity: number
  unqualifiedQuantity: number
  alreadyInspected: boolean
}

export interface FulfillmentEventDraft {
  eventType: FulfillmentEventType
  quantity: number
  sourceStage?: FulfillmentStage | null
  targetStage?: FulfillmentStage | null
}

/**
 * 事件级幂等键：同一来源记录允许生成多条不同事件（例如捏毛装袋分流），
 * 键对相同命令稳定复现，配合唯一索引阻止重试重复写入。
 */
export function createFulfillmentEventKey(input: {
  sourceRecordType: string
  sourceRecordId: string
  eventType: FulfillmentEventType
  targetStage: FulfillmentStage | null
}): string {
  if (!input.sourceRecordType.trim()) throw new DomainValidationError('事件来源类型不能为空')
  if (!input.sourceRecordId.trim()) throw new DomainValidationError('事件来源记录不能为空')
  return [
    input.sourceRecordType,
    input.sourceRecordId,
    input.eventType,
    input.targetStage ? `to_${input.targetStage}` : 'none'
  ].join(':')
}

export interface FulfillmentState {
  making: number
  fluffingBagging: number
  edgeSewing: number
  packing: number
  readyToShip: number
  shipped: number
  /** 累计进入过待缝边的数量，用于计算订单商品剩余缝边需求。 */
  edgeSewingRouted: number
}

const stageProperty: Record<FulfillmentStage, keyof FulfillmentState> = {
  making: 'making',
  fluffing_bagging: 'fluffingBagging',
  edge_sewing: 'edgeSewing',
  packing: 'packing',
  ready_to_ship: 'readyToShip',
  shipped: 'shipped'
}

function requirePositiveInteger(value: number | null | undefined, label: string): number {
  if (!Number.isInteger(value) || !value || value < 0) {
    throw new DomainValidationError(`${label}必须是正整数`)
  }
  return value
}

function requireNonNegativeInteger(value: number | null | undefined, label: string): number {
  if (!Number.isInteger(value) || value === null || value === undefined || value < 0) {
    throw new DomainValidationError(`${label}必须是非负整数`)
  }
  return value
}

function requireOptionalNonNegativeInteger(
  value: number | null | undefined,
  label: string
): number | null {
  if (value === null || value === undefined) return null
  return requireNonNegativeInteger(value, label)
}

function requireProcessType(value: ProcessType): ProcessType {
  if (!processTypes.includes(value)) throw new DomainValidationError('工序类型不合法')
  return value
}

/** 制作按标准制作分钟乘计划数量加额外预留；其他工序不要求排班时填写最终分钟。 */
export function calculateTaskPlannedMinutes(input: TaskMinutesInput): number {
  const processType = requireProcessType(input.processType)
  const extraMinutes = input.extraMinutes ?? 0
  requireNonNegativeInteger(extraMinutes, '额外预留分钟')

  if (processType === 'making') {
    const quantity = requirePositiveInteger(input.plannedQuantity, '计划数量')
    const standardMinutes = requireNonNegativeInteger(input.standardMakingMinutes, '标准制作分钟')
    return quantity * standardMinutes + extraMinutes
  }

  if (extraMinutes !== 0) {
    throw new DomainValidationError('额外预留分钟仅适用于制作任务')
  }
  if (input.plannedQuantity !== null && input.plannedQuantity !== undefined) {
    requireNonNegativeInteger(input.plannedQuantity, '计划数量')
  }
  const plannedMinutes = requireNonNegativeInteger(input.plannedMinutes ?? 0, '计划分钟')
  return plannedMinutes
}

export function validateProcessResult(input: ProcessResultInput): void {
  requirePositiveInteger(input.completedQuantity, '完成数量')
  requireOptionalNonNegativeInteger(input.actualMinutes, '实际分钟')
}

export interface MakingReviewQuantities {
  completedQuantity: number
  qualifiedQuantity: number
  unqualifiedQuantity: number
  unfinishedQuantity: number
}

/**
 * 制作一次核算数量守恒：实际产出允许为零但不得超过本次计划；
 * 不合格由实际产出减合格计算，未完成由计划减实际产出计算。
 */
export function calculateMakingReviewQuantities(input: {
  plannedQuantity: number
  completedQuantity: number
  qualifiedQuantity: number
}): MakingReviewQuantities {
  const plannedQuantity = requirePositiveInteger(input.plannedQuantity, '计划数量')
  const completedQuantity = requireNonNegativeInteger(input.completedQuantity, '实际产出')
  const qualifiedQuantity = requireNonNegativeInteger(input.qualifiedQuantity, '合格数量')
  if (completedQuantity > plannedQuantity) {
    throw new DomainValidationError('实际产出不能超过本次制作计划')
  }
  if (qualifiedQuantity > completedQuantity) {
    throw new DomainValidationError('合格数量不能超过实际产出')
  }
  return {
    completedQuantity,
    qualifiedQuantity,
    unqualifiedQuantity: completedQuantity - qualifiedQuantity,
    unfinishedQuantity: plannedQuantity - completedQuantity
  }
}

/** 只有制作需要质量确认，且合格数量加不合格数量必须等于完成数量。 */
export function validateQualityInspection(input: QualityInspectionInput): void {
  if (input.alreadyInspected) throw new DomainValidationError('该完成申报已质检，不能重复确认')
  requirePositiveInteger(input.completedQuantity, '完成数量')
  const qualifiedQuantity = requireNonNegativeInteger(input.qualifiedQuantity, '合格数量')
  const unqualifiedQuantity = requireNonNegativeInteger(input.unqualifiedQuantity, '不合格数量')
  if (qualifiedQuantity + unqualifiedQuantity !== input.completedQuantity) {
    throw new DomainValidationError('合格数量加不合格数量必须等于完成数量')
  }
}

export function createFulfillmentState(orderQuantity: number): FulfillmentState {
  return {
    making: requirePositiveInteger(orderQuantity, '订单数量'),
    fluffingBagging: 0,
    edgeSewing: 0,
    packing: 0,
    readyToShip: 0,
    shipped: 0,
    edgeSewingRouted: 0
  }
}

export function createMakingQualifiedEvent(quantity: number): FulfillmentEventDraft {
  return {
    eventType: 'making_qualified',
    quantity: requirePositiveInteger(quantity, '合格数量'),
    sourceStage: 'making',
    targetStage: 'fluffing_bagging'
  }
}

/**
 * 捏毛装袋完成后按订单商品剩余缝边需求分流：需求内进入待缝边，其余直接进入待打包发货。
 */
export function routeFluffingBaggingCompletion(input: {
  completedQuantity: number
  edgeQuantity: number
  edgeSewingRouted: number
}): { toEdgeSewing: number; toPacking: number } {
  const completedQuantity = requirePositiveInteger(input.completedQuantity, '捏毛装袋完成数量')
  const edgeQuantity = requireNonNegativeInteger(input.edgeQuantity, '订单缝边数量')
  const edgeSewingRouted = requireNonNegativeInteger(input.edgeSewingRouted, '已分流缝边数量')
  const remainingEdgeDemand = Math.max(edgeQuantity - edgeSewingRouted, 0)
  const toEdgeSewing = Math.min(completedQuantity, remainingEdgeDemand)
  return { toEdgeSewing, toPacking: completedQuantity - toEdgeSewing }
}

export function createFluffingBaggingCompletedEvents(input: {
  completedQuantity: number
  edgeQuantity: number
  edgeSewingRouted: number
}): FulfillmentEventDraft[] {
  const { toEdgeSewing, toPacking } = routeFluffingBaggingCompletion(input)
  const events: FulfillmentEventDraft[] = []
  if (toEdgeSewing > 0) {
    events.push({
      eventType: 'fluffing_bagging_completed',
      quantity: toEdgeSewing,
      sourceStage: 'fluffing_bagging',
      targetStage: 'edge_sewing'
    })
  }
  if (toPacking > 0) {
    events.push({
      eventType: 'fluffing_bagging_completed',
      quantity: toPacking,
      sourceStage: 'fluffing_bagging',
      targetStage: 'packing'
    })
  }
  return events
}

export function createEdgeSewingCompletedEvent(quantity: number): FulfillmentEventDraft {
  return {
    eventType: 'edge_sewing_completed',
    quantity: requirePositiveInteger(quantity, '缝边完成数量'),
    sourceStage: 'edge_sewing',
    targetStage: 'packing'
  }
}

export function createPackingCompletedEvent(quantity: number): FulfillmentEventDraft {
  return {
    eventType: 'packing_completed',
    quantity: requirePositiveInteger(quantity, '打包完成数量'),
    sourceStage: 'packing',
    targetStage: 'ready_to_ship'
  }
}

/**
 * 商品存量投入订单：商品已经制作完成，因此从订单待制作数量中扣减并进入目标阶段。
 * 目标阶段由存量阶段和订单缝边需求决定，不能直接投入制作或已发货阶段。
 */
export function createInventoryAllocationEvent(
  targetStage: FulfillmentStage,
  quantity: number
): FulfillmentEventDraft {
  if (!['fluffing_bagging', 'edge_sewing', 'packing', 'ready_to_ship'].includes(targetStage)) {
    throw new DomainValidationError('商品存量不能直接投入制作或已发货阶段')
  }
  return {
    eventType: 'inventory_allocation',
    quantity: requirePositiveInteger(quantity, '投入数量'),
    sourceStage: 'making',
    targetStage
  }
}

export function applyFulfillmentEvent(
  state: FulfillmentState,
  event: FulfillmentEventDraft
): FulfillmentState {
  const quantity = requirePositiveInteger(event.quantity, '履约事件数量')
  const next = { ...state }
  if (event.sourceStage) {
    const sourceProperty = stageProperty[event.sourceStage]
    if (next[sourceProperty] < quantity) throw new DomainValidationError('来源阶段可用数量不足')
    next[sourceProperty] -= quantity
  }
  if (event.targetStage) {
    next[stageProperty[event.targetStage]] += quantity
    if (event.targetStage === 'edge_sewing') next.edgeSewingRouted += quantity
  }
  return next
}

export function getShippableQuantity(state: FulfillmentState): number {
  return state.readyToShip
}
