import { useCallback, useEffect, useState } from 'react'
import type { V2ProcessResult, V2ProcessResultInput, V2QualityInspectionInput, V2WorkAssignment, V2WorkAssignmentCreateInput } from '@shared/contracts/index'
import { getErrorMessage } from './v2-utils'

export function useWorkAssignments() {
  const [assignments, setAssignments] = useState<V2WorkAssignment[]>([])
  const [resultByTaskId, setResultByTaskId] = useState<Record<string, V2ProcessResult>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const nextAssignments = await window.yumiV2.fulfillment.listWorkAssignments()
      setAssignments(nextAssignments)
      const pendingTasks = nextAssignments.flatMap((assignment) => assignment.tasks.filter((task) => task.status === 'pending_inspection'))
      const results = await Promise.all(pendingTasks.map(async (task) => [task.id, await window.yumiV2.fulfillment.getProcessResultForTask(task.id)] as const))
      setResultByTaskId(Object.fromEntries(results.filter((entry): entry is [string, V2ProcessResult] => entry[1] !== null)))
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  const createWorkAssignment = useCallback(async (input: V2WorkAssignmentCreateInput) => {
    const assignment = await window.yumiV2.fulfillment.createWorkAssignment(input)
    await reload()
    return assignment
  }, [reload])
  const submitProcessResult = useCallback(async (taskId: string, input: V2ProcessResultInput) => {
    const result = await window.yumiV2.fulfillment.submitProcessResult(taskId, input)
    await reload()
    return result
  }, [reload])
  const confirmQualityInspection = useCallback(async (resultId: string, input: V2QualityInspectionInput) => {
    const inspection = await window.yumiV2.fulfillment.confirmQualityInspection(resultId, input)
    await reload()
    return inspection
  }, [reload])

  return { assignments, resultByTaskId, loading, loadError, reload, createWorkAssignment, submitProcessResult, confirmQualityInspection }
}
