import { DomainValidationError } from './errors'

export const workTimeReviewProcessTypes = ['fluffing_bagging', 'edge_sewing', 'packing'] as const
export type WorkTimeReviewProcessType = (typeof workTimeReviewProcessTypes)[number]

export const workTimeReviewStatuses = ['draft', 'confirmed', 'voided'] as const
export type WorkTimeReviewStatus = (typeof workTimeReviewStatuses)[number]

export interface WorkTimeReviewItemDraft {
  processTaskId: string
  completedQuantity: number
}

export interface WorkTimeReviewInputDraft {
  processType: WorkTimeReviewProcessType
  approvedMinutes: number
  assignmentIds: string[]
  items: WorkTimeReviewItemDraft[]
}

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DomainValidationError(`${label}必须是正整数`)
  }
  return value
}

/** 只有三道计时工序可以创建工时核算；制作走结果与质量确认。 */
export function requireWorkTimeProcessType(value: string): WorkTimeReviewProcessType {
  if (!workTimeReviewProcessTypes.includes(value as WorkTimeReviewProcessType)) {
    throw new DomainValidationError('工时核算只适用于捏毛装袋、缝边和打包发货工序')
  }
  return value as WorkTimeReviewProcessType
}

export function assertWorkTimeReviewInput(input: WorkTimeReviewInputDraft): void {
  requireWorkTimeProcessType(input.processType)
  requirePositiveInteger(input.approvedMinutes, '负责人核算分钟')
  if (!input.assignmentIds.length) throw new DomainValidationError('工时核算至少需要一条工作安排')
  if (new Set(input.assignmentIds).size !== input.assignmentIds.length) {
    throw new DomainValidationError('同一条工作安排不能重复关联')
  }
  if (!input.items.length) throw new DomainValidationError('工时核算至少需要一条商品完成明细')
  const taskIds = new Set<string>()
  for (const item of input.items) {
    if (!item.processTaskId.trim()) throw new DomainValidationError('完成明细必须关联工序任务')
    if (taskIds.has(item.processTaskId)) {
      throw new DomainValidationError('同一工序任务不能重复登记完成数量')
    }
    taskIds.add(item.processTaskId)
    requirePositiveInteger(item.completedQuantity, '商品完成数量')
  }
}

export function assertReviewIsDraft(status: WorkTimeReviewStatus): void {
  if (status !== 'draft') throw new DomainValidationError('只有草稿工时核算可以修改')
}

export function assertReviewCanConfirm(status: WorkTimeReviewStatus): void {
  if (status === 'confirmed') return
  if (status === 'voided') throw new DomainValidationError('已作废工时核算不能确认')
}

export function assertReviewCanVoid(status: WorkTimeReviewStatus): void {
  if (status !== 'confirmed') throw new DomainValidationError('只有已确认工时核算可以作废')
}
