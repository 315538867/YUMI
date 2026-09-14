import { useCallback, useEffect, useState } from 'react'
import type {
  V2WorkAssignment,
  V2WorkTimeReview,
  V2WorkTimeReviewInput,
  V2WorkTimeReviewProcessType,
  V2WorkTimeReviewQuery,
  V2WorkTimeReviewUpdateInput,
  V2WorkTimeReviewVoidInput
} from '@shared/contracts/index'
import { getErrorMessage } from './v2-utils'

export interface WorkTimeReviewCandidateTask {
  taskId: string
  orderItemId: string
  productName: string
  plannedQuantity: number | null
  expectedMinutesPerUnit: number
}

export interface WorkTimeReviewCandidate {
  assignmentId: string
  processType: V2WorkTimeReviewProcessType
  tasks: WorkTimeReviewCandidateTask[]
}

/** 待核算列表行：同员工、同日期、同工序的计时工序安排归为一组，一条核算记录即可覆盖。 */
export interface WorkTimeReviewGroup {
  key: string
  workerId: string
  assignedOn: string
  processType: V2WorkTimeReviewProcessType
  candidates: WorkTimeReviewCandidate[]
}

const timedProcessTypes: V2WorkTimeReviewProcessType[] = [
  'fluffing_bagging',
  'edge_sewing',
  'packing'
]

function expectedMinutesOf(
  snapshot: Record<string, unknown>,
  processType: V2WorkTimeReviewProcessType
): number {
  const key =
    processType === 'fluffing_bagging'
      ? 'expectedFluffingBaggingMinutes'
      : processType === 'edge_sewing'
        ? 'expectedEdgeSewingMinutes'
        : 'expectedPackingMinutes'
  const value = snapshot[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * 从工作安排中挑选仍可核算的计时工序任务：排除制作、已取消、已作废安排，
 * 以及已存在未作废核算的安排；并根据订单商品快照带出该工序的预计单件分钟。
 */
async function buildCandidates(
  assignments: V2WorkAssignment[],
  reviewedAssignmentIds: ReadonlySet<string>
): Promise<Array<WorkTimeReviewCandidate & { workerId: string; assignedOn: string }>> {
  const candidates: Array<WorkTimeReviewCandidate & { workerId: string; assignedOn: string }> = []
  const snapshotCache = new Map<string, Record<string, unknown>>()
  for (const assignment of assignments) {
    if (assignment.status === 'cancelled') continue
    if (!timedProcessTypes.includes(assignment.processType as V2WorkTimeReviewProcessType))
      continue
    if (reviewedAssignmentIds.has(assignment.id)) continue
    const processType = assignment.processType as V2WorkTimeReviewProcessType
    const tasks: WorkTimeReviewCandidateTask[] = []
    for (const task of assignment.tasks) {
      if (!task.orderItemId || task.status !== 'pending') continue
      let snapshot = snapshotCache.get(task.orderItemId)
      if (!snapshot) {
        const item = await window.yumiV2.fulfillment.getOrderItem(task.orderItemId)
        const order = item ? await window.yumiV2.orders.get(item.orderId) : null
        const orderItem = order?.items.find((entry) => entry.id === task.orderItemId)
        snapshot = (orderItem?.productSnapshot ?? {}) as unknown as Record<string, unknown>
        snapshotCache.set(task.orderItemId, snapshot)
      }
      tasks.push({
        taskId: task.id,
        orderItemId: task.orderItemId,
        productName: typeof snapshot.name === 'string' ? snapshot.name : '订单商品',
        plannedQuantity: task.plannedQuantity,
        expectedMinutesPerUnit: expectedMinutesOf(snapshot, processType)
      })
    }
    if (tasks.length) {
      candidates.push({
        assignmentId: assignment.id,
        processType,
        tasks,
        workerId: assignment.workerId,
        assignedOn: assignment.assignedOn
      })
    }
  }
  return candidates
}

/**
 * 负责人次日工时核算：草稿、确认、作废，以及加载全量待核算计时工序分组。
 */
export function useWorkTimeReviews() {
  const [reviews, setReviews] = useState<V2WorkTimeReview[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async (query: V2WorkTimeReviewQuery = {}) => {
    setLoading(true)
    setLoadError(null)
    try {
      setReviews(await window.yumiV2.workTimeReviews.list(query))
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const createDraft = useCallback(
    async (input: V2WorkTimeReviewInput) => {
      const review = await window.yumiV2.workTimeReviews.createDraft(input)
      await reload({ workerId: review.workerId, workedOn: review.workedOn })
      return review
    },
    [reload]
  )

  const updateDraft = useCallback(
    async (input: V2WorkTimeReviewUpdateInput) => {
      const review = await window.yumiV2.workTimeReviews.updateDraft(input)
      await reload({ workerId: review.workerId, workedOn: review.workedOn })
      return review
    },
    [reload]
  )

  const confirm = useCallback(
    async (id: string) => {
      const review = await window.yumiV2.workTimeReviews.confirm(id)
      await reload({ workerId: review.workerId, workedOn: review.workedOn })
      return review
    },
    [reload]
  )

  const voidReview = useCallback(
    async (id: string, input: V2WorkTimeReviewVoidInput) => {
      const review = await window.yumiV2.workTimeReviews.void(id, input)
      await reload({ workerId: review.workerId, workedOn: review.workedOn })
      return review
    },
    [reload]
  )

  /**
   * 全量待核算计时工序：按员工、工作日期与工序把仍可核算的安排归并为分组，
   * 供统一待核算列表直接展示；一条核算记录可覆盖同组的多条安排。
   */
  const loadPendingGroups = useCallback(async (): Promise<WorkTimeReviewGroup[]> => {
    const [assignments, activeReviews] = await Promise.all([
      window.yumiV2.fulfillment.listWorkAssignments(),
      window.yumiV2.workTimeReviews.list({})
    ])
    const reviewedAssignmentIds = new Set(
      activeReviews
        .filter((review) => review.status !== 'voided')
        .flatMap((review) => review.assignmentIds)
    )
    const entries = await buildCandidates(assignments, reviewedAssignmentIds)
    const groups = new Map<string, WorkTimeReviewGroup>()
    for (const entry of entries) {
      const key = `${entry.workerId} ${entry.assignedOn} ${entry.processType}`
      const group = groups.get(key) ?? {
        key,
        workerId: entry.workerId,
        assignedOn: entry.assignedOn,
        processType: entry.processType,
        candidates: []
      }
      group.candidates.push(entry)
      groups.set(key, group)
    }
    return [...groups.values()]
  }, [])

  return {
    reviews,
    loading,
    loadError,
    reload,
    createDraft,
    updateDraft,
    confirm,
    voidReview,
    loadPendingGroups
  }
}
