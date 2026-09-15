import { useCallback, useEffect, useState } from 'react'
import type {
  V2FulfillmentProgressReport,
  V2MakingReviewCorrectionInput,
  V2MakingReviewInput,
  V2MakingReviewSummary,
  V2MakingReviewVoidInput,
  V2ProcessTask,
  V2TimedProcessType,
  V2Worker,
  V2WorkAssignment,
  V2WorkTimeReview,
  V2WorkTimeReviewCandidate,
  V2WorkTimeReviewCandidateQuery,
  V2WorkTimeReviewCorrectionInput,
  V2WorkTimeReviewInput,
  V2WorkTimeReviewVoidInput
} from '@shared/contracts/index'
import { getErrorMessage, today } from './v2-utils'

export const timedProcessTypes: readonly V2TimedProcessType[] = [
  'fluffing_bagging',
  'edge_sewing',
  'packing'
]

const timedProcessTypeSet = new Set<string>(timedProcessTypes)

export function isTimedProcessType(value: string): value is V2TimedProcessType {
  return timedProcessTypeSet.has(value)
}

/** 订单商品展示资料：待核算与已核算记录都按 orderItemId 回填商品名与订单号。 */
export interface WorkTimeReviewItemLabel {
  productName: string
  orderCode: string
}

/** 待核算制作任务行：人员、日期、订单商品、计划数量与工序。 */
export interface PendingMakingRow {
  kind: 'making'
  key: string
  assignmentId: string
  taskId: string
  workerId: string
  workerName: string
  assignedOn: string
  orderItemId: string
  productName: string
  plannedQuantity: number
  taskStatus: V2ProcessTask['status']
}

/** 待核算计时班次行：核算前只展示人员、日期与工序，不展示商品。 */
export interface PendingTimedRow {
  kind: 'timed'
  key: string
  assignmentId: string
  workerId: string
  workerName: string
  assignedOn: string
  processType: V2TimedProcessType
}

export type PendingReviewRow = PendingMakingRow | PendingTimedRow

export interface MakingReviewRecordRow {
  kind: 'making'
  key: string
  assignmentId: string
  taskId: string
  workerId: string
  workerName: string
  assignedOn: string
  orderItemId: string
  productName: string
  plannedQuantity: number
  summary: V2MakingReviewSummary
}

export interface TimedReviewRecordRow {
  kind: 'timed'
  key: string
  workerId: string
  workerName: string
  review: V2WorkTimeReview
}

export type WorkTimeReviewRecordRow = MakingReviewRecordRow | TimedReviewRecordRow

function workerNameOf(workerNames: ReadonlyMap<string, string>, workerId: string): string {
  return workerNames.get(workerId) ?? '已删除人员'
}

function labelOf(
  itemLabels: ReadonlyMap<string, WorkTimeReviewItemLabel>,
  orderItemId: string | null
): WorkTimeReviewItemLabel {
  if (orderItemId) {
    const label = itemLabels.get(orderItemId)
    if (label) return label
  }
  return { productName: '订单商品', orderCode: '—' }
}

/**
 * 待核算事项：排班日期不晚于本地今天的制作任务与计时班次，
 * 且尚未存在当前有效核算。作废后安排会重新回到这里。
 */
export function buildPendingRows(
  assignments: readonly V2WorkAssignment[],
  workerNames: ReadonlyMap<string, string>,
  itemLabels: ReadonlyMap<string, WorkTimeReviewItemLabel>,
  businessDate: string
): PendingReviewRow[] {
  const rows: PendingReviewRow[] = []
  for (const assignment of assignments) {
    if (assignment.status === 'cancelled' || assignment.status === 'absent') continue
    if (assignment.assignedOn > businessDate) continue
    if (assignment.processType === 'making') {
      for (const task of assignment.tasks) {
        if (task.processType !== 'making' || task.reviewSummary) continue
        if (task.status === 'cancelled' || !task.orderItemId) continue
        if (!task.plannedQuantity || task.plannedQuantity <= 0) continue
        rows.push({
          kind: 'making',
          key: `making-${task.id}`,
          assignmentId: assignment.id,
          taskId: task.id,
          workerId: assignment.workerId,
          workerName: workerNameOf(workerNames, assignment.workerId),
          assignedOn: assignment.assignedOn,
          orderItemId: task.orderItemId,
          productName: labelOf(itemLabels, task.orderItemId).productName,
          plannedQuantity: task.plannedQuantity,
          taskStatus: task.status
        })
      }
      continue
    }
    if (!isTimedProcessType(assignment.processType)) continue
    if (assignment.timedReview) continue
    rows.push({
      kind: 'timed',
      key: `timed-${assignment.id}`,
      assignmentId: assignment.id,
      workerId: assignment.workerId,
      workerName: workerNameOf(workerNames, assignment.workerId),
      assignedOn: assignment.assignedOn,
      processType: assignment.processType
    })
  }
  return rows.sort(
    (left, right) =>
      right.assignedOn.localeCompare(left.assignedOn) ||
      left.workerName.localeCompare(right.workerName) ||
      left.key.localeCompare(right.key)
  )
}

/**
 * 已核算记录：制作任务取当前有效核算摘要，计时工序取未作废核算。
 * 历史草稿（status === 'draft'）保留只读展示，不提供更正或作废。
 */
export function buildRecordRows(
  assignments: readonly V2WorkAssignment[],
  reviews: readonly V2WorkTimeReview[],
  workerNames: ReadonlyMap<string, string>,
  itemLabels: ReadonlyMap<string, WorkTimeReviewItemLabel>
): WorkTimeReviewRecordRow[] {
  const rows: WorkTimeReviewRecordRow[] = []
  for (const assignment of assignments) {
    for (const task of assignment.tasks) {
      if (!task.reviewSummary || !task.orderItemId) continue
      rows.push({
        kind: 'making',
        key: `making-${task.id}`,
        assignmentId: assignment.id,
        taskId: task.id,
        workerId: assignment.workerId,
        workerName: workerNameOf(workerNames, assignment.workerId),
        assignedOn: assignment.assignedOn,
        orderItemId: task.orderItemId,
        productName: labelOf(itemLabels, task.orderItemId).productName,
        plannedQuantity: task.plannedQuantity ?? 0,
        summary: task.reviewSummary
      })
    }
  }
  for (const review of reviews) {
    if (review.status === 'voided') continue
    rows.push({
      kind: 'timed',
      key: `timed-${review.id}`,
      workerId: review.workerId,
      workerName: workerNameOf(workerNames, review.workerId),
      review
    })
  }
  return rows.sort(
    (left, right) =>
      recordDateOf(right).localeCompare(recordDateOf(left)) ||
      left.workerName.localeCompare(right.workerName) ||
      left.key.localeCompare(right.key)
  )
}

export function recordDateOf(row: WorkTimeReviewRecordRow): string {
  return row.kind === 'making' ? row.summary.reviewedOn : row.review.workedOn
}

export function recordLockOf(row: WorkTimeReviewRecordRow): {
  locked: boolean
  message: string | null
} {
  const lock = row.kind === 'making' ? row.summary.lock : row.review.lock
  return { locked: lock.locked, message: lock.message }
}

export interface UseWorkTimeReviewsResult {
  assignments: V2WorkAssignment[]
  reviews: V2WorkTimeReview[]
  itemLabels: Map<string, WorkTimeReviewItemLabel>
  loading: boolean
  loadError: string | null
  reload(): Promise<void>
  listCandidates(
    assignmentId: string,
    query?: V2WorkTimeReviewCandidateQuery
  ): Promise<V2WorkTimeReviewCandidate[]>
  reviewMaking(input: V2MakingReviewInput): Promise<void>
  correctMakingReview(input: V2MakingReviewCorrectionInput): Promise<void>
  voidMakingReview(input: V2MakingReviewVoidInput): Promise<void>
  reviewTimed(input: V2WorkTimeReviewInput): Promise<void>
  correctTimed(input: V2WorkTimeReviewCorrectionInput): Promise<void>
  voidTimed(id: string, input: V2WorkTimeReviewVoidInput): Promise<void>
}

/**
 * 单次核算工作区的数据源：一次加载工作安排、已核算记录与订单商品展示资料，
 * 并提供制作/计时一次核算与更正、作废命令。所有校验仍由主进程重复执行。
 */
export function useWorkTimeReviews(): UseWorkTimeReviewsResult {
  const [assignments, setAssignments] = useState<V2WorkAssignment[]>([])
  const [reviews, setReviews] = useState<V2WorkTimeReview[]>([])
  const [itemLabels, setItemLabels] = useState<Map<string, WorkTimeReviewItemLabel>>(new Map())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const progressPromise: Promise<V2FulfillmentProgressReport | null> =
        typeof window.yumiV2.reports?.getFulfillmentProgress === 'function'
          ? window.yumiV2.reports.getFulfillmentProgress().catch(() => null)
          : Promise.resolve(null)
      const [nextAssignments, nextReviews, progress] = await Promise.all([
        window.yumiV2.fulfillment.listWorkAssignments(),
        window.yumiV2.workTimeReviews.list({}),
        progressPromise
      ])
      setAssignments(nextAssignments)
      setReviews(nextReviews)
      setItemLabels(
        new Map(
          (progress?.rows ?? []).map((row) => [
            row.orderItemId,
            { productName: row.productName, orderCode: row.orderCode }
          ])
        )
      )
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const listCandidates = useCallback(
    (assignmentId: string, query: V2WorkTimeReviewCandidateQuery = {}) =>
      window.yumiV2.workTimeReviews.listCandidates(assignmentId, query),
    []
  )

  const reviewMaking = useCallback(
    async (input: V2MakingReviewInput) => {
      await window.yumiV2.fulfillment.reviewMaking(input)
      await reload()
    },
    [reload]
  )

  const correctMakingReview = useCallback(
    async (input: V2MakingReviewCorrectionInput) => {
      await window.yumiV2.fulfillment.correctMakingReview(input)
      await reload()
    },
    [reload]
  )

  const voidMakingReview = useCallback(
    async (input: V2MakingReviewVoidInput) => {
      await window.yumiV2.fulfillment.voidMakingReview(input)
      await reload()
    },
    [reload]
  )

  const reviewTimed = useCallback(
    async (input: V2WorkTimeReviewInput) => {
      await window.yumiV2.workTimeReviews.review(input)
      await reload()
    },
    [reload]
  )

  const correctTimed = useCallback(
    async (input: V2WorkTimeReviewCorrectionInput) => {
      await window.yumiV2.workTimeReviews.correct(input)
      await reload()
    },
    [reload]
  )

  const voidTimed = useCallback(
    async (id: string, input: V2WorkTimeReviewVoidInput) => {
      await window.yumiV2.workTimeReviews.void(id, input)
      await reload()
    },
    [reload]
  )

  return {
    assignments,
    reviews,
    itemLabels,
    loading,
    loadError,
    reload,
    listCandidates,
    reviewMaking,
    correctMakingReview,
    voidMakingReview,
    reviewTimed,
    correctTimed,
    voidTimed
  }
}

export function buildWorkerNames(workers: readonly V2Worker[]): Map<string, string> {
  return new Map(workers.map((worker) => [worker.id, worker.name]))
}

export function currentBusinessDate(): string {
  return today()
}
