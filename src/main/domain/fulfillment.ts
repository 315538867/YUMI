import { DomainValidationError } from './errors'

export const processTypes = ['making', 'fluffing_bagging', 'packing', 'shipping'] as const
export type ProcessType = (typeof processTypes)[number]

export const processTaskSources = [
  'normal_production',
  'rework',
  'after_sales_replacement',
  'manager_arrangement'
] as const
export type ProcessTaskSource = (typeof processTaskSources)[number]

export const fulfillmentStages = ['making', 'fluffing_bagging', 'packing', 'ready_to_ship', 'shipped'] as const
export type FulfillmentStage = (typeof fulfillmentStages)[number]

export type FulfillmentEventType =
  | 'opening_wip'
  | 'making_qualified'
  | 'fluffing_bagging_qualified'
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

export interface FulfillmentState {
  making: number
  fluffingBagging: number
  packing: number
  readyToShip: number
  shipped: number
}

const stageProperty: Record<FulfillmentStage, keyof FulfillmentState> = {
  making: 'making',
  fluffing_bagging: 'fluffingBagging',
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

function requireOptionalNonNegativeInteger(value: number | null | undefined, label: string): number | null {
  if (value === null || value === undefined) return null
  return requireNonNegativeInteger(value, label)
}

function requireProcessType(value: ProcessType): ProcessType {
  if (!processTypes.includes(value)) throw new DomainValidationError('工序类型不合法')
  return value
}

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

  if (processType === 'shipping') {
    if (input.plannedQuantity !== null && input.plannedQuantity !== undefined) {
      requireNonNegativeInteger(input.plannedQuantity, '计划数量')
    }
  } else {
    requirePositiveInteger(input.plannedQuantity, '计划数量')
  }

  const plannedMinutes = requireNonNegativeInteger(input.plannedMinutes, '计划分钟')
  return plannedMinutes + extraMinutes
}

export function validateProcessResult(input: ProcessResultInput): void {
  requirePositiveInteger(input.completedQuantity, '完成数量')
  requireOptionalNonNegativeInteger(input.actualMinutes, '实际分钟')
}

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
    packing: 0,
    readyToShip: 0,
    shipped: 0
  }
}

export function createOpeningWipEvent(targetStage: Exclude<FulfillmentStage, 'making' | 'shipped'>, quantity: number): FulfillmentEventDraft {
  if (!['fluffing_bagging', 'packing', 'ready_to_ship'].includes(targetStage)) {
    throw new DomainValidationError('期初在制品只能进入待捏毛装袋、待打包或待发货阶段')
  }
  return { eventType: 'opening_wip', quantity: requirePositiveInteger(quantity, '期初在制品数量'), sourceStage: 'making', targetStage }
}

export function createQualityQualifiedEvent(processType: Extract<ProcessType, 'making' | 'fluffing_bagging'>, quantity: number): FulfillmentEventDraft {
  requirePositiveInteger(quantity, '合格数量')
  if (processType === 'making') {
    return { eventType: 'making_qualified', quantity, sourceStage: 'making', targetStage: 'fluffing_bagging' }
  }
  return { eventType: 'fluffing_bagging_qualified', quantity, sourceStage: 'fluffing_bagging', targetStage: 'packing' }
}

export function createPackingCompletedEvent(quantity: number): FulfillmentEventDraft {
  return { eventType: 'packing_completed', quantity: requirePositiveInteger(quantity, '打包完成数量'), sourceStage: 'packing', targetStage: 'ready_to_ship' }
}

export function applyFulfillmentEvent(state: FulfillmentState, event: FulfillmentEventDraft): FulfillmentState {
  const quantity = requirePositiveInteger(event.quantity, '履约事件数量')
  const next = { ...state }
  if (event.sourceStage) {
    const sourceProperty = stageProperty[event.sourceStage]
    if (next[sourceProperty] < quantity) throw new DomainValidationError('来源阶段可用数量不足')
    next[sourceProperty] -= quantity
  }
  if (event.targetStage) next[stageProperty[event.targetStage]] += quantity
  return next
}

export function getShippableQuantity(state: FulfillmentState): number {
  return state.readyToShip
}
