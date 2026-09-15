import { useCallback, useEffect, useState } from 'react'
import type {
  V2WorkAssignment,
  V2WorkAssignmentStatusUpdateInput,
  V2WorkTimeReview,
  V2Worker
} from '@shared/contracts/index'
import { getErrorMessage } from './v2-utils'

/** 订单商品展示资料：工作安排明细按 orderItemId 回填商品名与订单号。 */
export interface WorkAssignmentItemLabel {
  productName: string
  orderCode: string
}

/**
 * 工作安排记录的数据源：只读取工作安排、兼职人员、计时核算与订单商品展示资料。
 * 写入只保留缺勤/取消状态更新与未完成制作任务的转派；实际产出与核算统一在待核算完成。
 */
export function useWorkAssignments() {
  const [assignments, setAssignments] = useState<V2WorkAssignment[]>([])
  const [workers, setWorkers] = useState<V2Worker[]>([])
  const [reviews, setReviews] = useState<V2WorkTimeReview[]>([])
  const [itemLabels, setItemLabels] = useState<ReadonlyMap<string, WorkAssignmentItemLabel>>(
    new Map()
  )
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const progressPromise = window.yumiV2.reports?.getFulfillmentProgress
        ? window.yumiV2.reports.getFulfillmentProgress().catch(() => null)
        : Promise.resolve(null)
      const [nextAssignments, nextWorkers, nextReviews, progress] = await Promise.all([
        window.yumiV2.fulfillment.listWorkAssignments(),
        window.yumiV2.workers.list(),
        window.yumiV2.workTimeReviews.list({}),
        progressPromise
      ])
      setAssignments(nextAssignments)
      setWorkers(nextWorkers)
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

  const setWorkAssignmentStatus = useCallback(
    async (assignmentId: string, input: V2WorkAssignmentStatusUpdateInput) => {
      const assignment = await window.yumiV2.fulfillment.setWorkAssignmentStatus(
        assignmentId,
        input
      )
      await reload()
      return assignment
    },
    [reload]
  )

  const reassignProcessTask = useCallback(
    async (...args: Parameters<typeof window.yumiV2.fulfillment.reassignProcessTask>) => {
      const assignment = await window.yumiV2.fulfillment.reassignProcessTask(...args)
      await reload()
      return assignment
    },
    [reload]
  )

  return {
    assignments,
    workers,
    reviews,
    itemLabels,
    loading,
    loadError,
    reload,
    setWorkAssignmentStatus,
    reassignProcessTask
  }
}
