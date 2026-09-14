import { useCallback, useEffect, useState } from 'react'
import type {
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
 * 负责人次日工时核算：草稿、确认、作废，以及按员工与日期装载待核算工作安排候选。
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
   * 该员工该日期仍可核算的计时工序工作安排：排除制作、已作废安排和已存在未作废核算的安排，
   * 并根据订单商品快照带出该工序的预计单件分钟。
   */
  const loadCandidates = useCallback(
    async (workerId: string, workedOn: string): Promise<WorkTimeReviewCandidate[]> => {
      const [assignments, activeReviews] = await Promise.all([
        window.yumiV2.fulfillment.listWorkAssignments({ workerId, assignedOn: workedOn }),
        window.yumiV2.workTimeReviews.list({ workerId, workedOn })
      ])
      const reviewedAssignmentIds = new Set(
        activeReviews
          .filter((review) => review.status !== 'voided')
          .flatMap((review) => review.assignmentIds)
      )
      const candidates: WorkTimeReviewCandidate[] = []
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
        if (tasks.length) candidates.push({ assignmentId: assignment.id, processType, tasks })
      }
      return candidates
    },
    []
  )

  return {
    reviews,
    loading,
    loadError,
    reload,
    createDraft,
    updateDraft,
    confirm,
    voidReview,
    loadCandidates
  }
}
