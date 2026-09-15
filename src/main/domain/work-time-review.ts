import { DomainValidationError } from './errors'
import {
  parseMinutePrecisionDateTime,
  type MinutePrecisionDateTime
} from '@shared/calculations/work-time'

export const workTimeReviewProcessTypes = ['fluffing_bagging', 'edge_sewing', 'packing'] as const
export type WorkTimeReviewProcessType = (typeof workTimeReviewProcessTypes)[number]

export const workTimeReviewStatuses = ['draft', 'confirmed', 'voided'] as const
export type WorkTimeReviewStatus = (typeof workTimeReviewStatuses)[number]

export interface WorkTimeReviewItemDraft {
  orderItemId: string
  completedQuantity: number
}

export interface WorkTimeReviewInputDraft {
  processType: string
  workAssignmentId: string
  items: WorkTimeReviewItemDraft[]
}

export interface ReviewTimeRangeDraft {
  startedAt: string
  endedAt: string
  minutes: number
  workedOn: string
}

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DomainValidationError(`${label}必须是正整数`)
  }
  return value
}

function requireMinutePrecision(value: string, label: string): MinutePrecisionDateTime {
  const parsed = parseMinutePrecisionDateTime(value)
  if (!parsed) throw new DomainValidationError(`${label}必须精确到分钟`)
  return parsed
}

/** 只有三道计时工序可以创建工时核算；制作走一次结果与质量核算。 */
export function requireWorkTimeProcessType(value: string): WorkTimeReviewProcessType {
  if (!workTimeReviewProcessTypes.includes(value as WorkTimeReviewProcessType)) {
    throw new DomainValidationError('工时核算只适用于捏毛装袋、缝边和打包发货工序')
  }
  return value as WorkTimeReviewProcessType
}

/**
 * 实际时间范围校验：分钟精度、结束严格晚于开始、开始日期等于排班日期、
 * 当前时间不得早于结束时间；分钟由主进程按绝对时间差计算并归属开始日期。
 */
export function assertReviewTimeRange(input: {
  startedAt: string
  endedAt: string
  assignedOn: string
  now: string
}): ReviewTimeRangeDraft {
  const started = requireMinutePrecision(input.startedAt, '实际开始时间')
  const ended = requireMinutePrecision(input.endedAt, '实际结束时间')
  if (ended.date.getTime() <= started.date.getTime()) {
    throw new DomainValidationError('实际结束时间必须晚于实际开始时间')
  }
  if (new Date(input.now).getTime() < ended.date.getTime()) {
    throw new DomainValidationError('实际结束时间尚未到达，不能确认核算')
  }
  if (started.localDate !== input.assignedOn) {
    throw new DomainValidationError('实际开始时间的日期必须与排班日期一致')
  }
  const minutes = (ended.date.getTime() - started.date.getTime()) / 60_000
  requirePositiveInteger(minutes, '核算分钟')
  return {
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    minutes,
    workedOn: started.localDate
  }
}

/** 一条计时核算只关联一项安排，明细以订单商品计且同一商品不得重复。 */
export function assertWorkTimeReviewInput(input: WorkTimeReviewInputDraft): void {
  requireWorkTimeProcessType(input.processType)
  if (!input.workAssignmentId.trim()) {
    throw new DomainValidationError('工时核算必须关联一条计时工作安排')
  }
  if (!input.items.length) throw new DomainValidationError('工时核算至少需要一条商品完成明细')
  const orderItemIds = new Set<string>()
  for (const item of input.items) {
    if (!item.orderItemId.trim()) {
      throw new DomainValidationError('完成明细必须关联订单商品')
    }
    if (orderItemIds.has(item.orderItemId)) {
      throw new DomainValidationError('同一订单商品不能重复登记完成数量')
    }
    orderItemIds.add(item.orderItemId)
    requirePositiveInteger(item.completedQuantity, '商品完成数量')
  }
}

/** 只有当前有效的已核算记录可以更正。 */
export function assertReviewCanCorrect(status: WorkTimeReviewStatus): void {
  if (status !== 'confirmed') throw new DomainValidationError('只有已核算记录可以更正')
}

/** 只有当前有效的已核算记录可以作废。 */
export function assertReviewCanVoid(status: WorkTimeReviewStatus): void {
  if (status !== 'confirmed') throw new DomainValidationError('只有已核算记录可以作废')
}
