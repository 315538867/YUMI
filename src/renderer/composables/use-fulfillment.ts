import { useCallback, useEffect, useState } from 'react'
import type {
  V2FulfillmentAdjustmentInput,
  V2FulfillmentProgressReportRow,
  V2FulfillmentStageBalances,
  V2OrderSummary,
  V2ProcessTask,
  V2ProcessTaskStatus,
  V2Worker,
  V2WorkAssignment,
  V2WorkAssignmentStatusUpdateInput
} from '@shared/contracts/index'
import { getErrorMessage } from './v2-utils'

export type FulfillmentQueueStage =
  'all' | 'making' | 'fluffing_bagging' | 'edge_sewing' | 'packing'
export type ActionableFulfillmentQueueStage = Exclude<FulfillmentQueueStage, 'all'>

type FulfillmentTaskStage = ActionableFulfillmentQueueStage

export interface FulfillmentScheduledTask {
  assignmentId: string
  taskId: string
  workerId: string
  workerName: string
  assignedOn: string
  processType: 'making' | 'fluffing_bagging' | 'edge_sewing' | 'packing'
  stage: FulfillmentTaskStage
  plannedQuantity: number
  /** 任务创建时已冻结的计件提成；不能回读当前商品费率。 */
  pieceRateCents: number | null
  status: Extract<V2ProcessTaskStatus, 'pending' | 'pending_inspection'>
}

export interface FulfillmentStageSchedule {
  wipQuantity: number
  reservedQuantity: number
  unassignedQuantity: number
  overassignedQuantity: number
  tasks: FulfillmentScheduledTask[]
}

export interface FulfillmentQueueItem {
  orderId: string
  orderCode: string
  customerName: string
  orderItemId: string
  productName: string
  confirmedQuantity: number
  outstandingQuantity: number
  stages: V2FulfillmentStageBalances
  stageSchedules: Record<ActionableFulfillmentQueueStage, FulfillmentStageSchedule>
}

export interface WorkerWeekTask extends FulfillmentScheduledTask {
  orderItemId: string
  orderId: string
  orderCode: string
  productName: string
}

const actionableStages: ActionableFulfillmentQueueStage[] = [
  'making',
  'fluffing_bagging',
  'edge_sewing',
  'packing'
]
const activeTaskStatuses = new Set<V2ProcessTaskStatus>(['pending', 'pending_inspection'])

const stageBalanceKeys: Record<ActionableFulfillmentQueueStage, keyof V2FulfillmentStageBalances> =
  {
    making: 'making',
    fluffing_bagging: 'fluffingBagging',
    edge_sewing: 'edgeSewing',
    packing: 'packing'
  }

function getStageWip(
  stages: V2FulfillmentStageBalances,
  stage: ActionableFulfillmentQueueStage
): number {
  return stages[stageBalanceKeys[stage]]
}

function mapProcessTypeToStage(processType: string): ActionableFulfillmentQueueStage | null {
  return actionableStages.includes(processType as ActionableFulfillmentQueueStage)
    ? (processType as ActionableFulfillmentQueueStage)
    : null
}

function createStageSchedules(
  stages: V2FulfillmentStageBalances
): Record<ActionableFulfillmentQueueStage, FulfillmentStageSchedule> {
  return Object.fromEntries(
    actionableStages.map((stage) => [
      stage,
      {
        wipQuantity: getStageWip(stages, stage),
        reservedQuantity: 0,
        unassignedQuantity: getStageWip(stages, stage),
        overassignedQuantity: 0,
        tasks: []
      }
    ])
  ) as Record<ActionableFulfillmentQueueStage, FulfillmentStageSchedule>
}

function finalizeStageSchedules(
  stageSchedules: Record<ActionableFulfillmentQueueStage, FulfillmentStageSchedule>
) {
  actionableStages.forEach((stage) => {
    const schedule = stageSchedules[stage]
    schedule.unassignedQuantity = Math.max(schedule.wipQuantity - schedule.reservedQuantity, 0)
    schedule.overassignedQuantity = Math.max(schedule.reservedQuantity - schedule.wipQuantity, 0)
  })
}

/**
 * 队列与已派/待派口径只依据制作任务：计时班次不携带任务，
 * 历史计时任务也不再参与订单级已派、未派与超派推导。
 */
export function buildFulfillmentQueue(
  rows: V2FulfillmentProgressReportRow[],
  orders: V2OrderSummary[],
  assignments: V2WorkAssignment[] = [],
  workers: V2Worker[] = []
): FulfillmentQueueItem[] {
  const customerNames = new Map(orders.map((order) => [order.id, order.customerName]))
  const queue = rows
    .map((row) => ({
      orderId: row.orderId,
      orderCode: row.orderCode,
      customerName: customerNames.get(row.orderId) ?? '未命名客户',
      orderItemId: row.orderItemId,
      productName: row.productName,
      confirmedQuantity: row.confirmedQuantity,
      outstandingQuantity:
        row.stages.making + row.stages.fluffingBagging + row.stages.edgeSewing + row.stages.packing,
      stages: row.stages,
      stageSchedules: createStageSchedules(row.stages)
    }))
    .filter((item) => item.outstandingQuantity > 0)
  const itemById = new Map(queue.map((item) => [item.orderItemId, item]))
  const workerNames = new Map(workers.map((worker) => [worker.id, worker.name]))

  assignments.forEach((assignment) => {
    if (assignment.status === 'cancelled' || assignment.status === 'absent') return
    assignment.tasks.forEach((task) => {
      if (task.processType !== 'making') return
      const stage = mapProcessTypeToStage(task.processType)
      const item = task.orderItemId ? itemById.get(task.orderItemId) : null
      if (
        !item ||
        !stage ||
        !activeTaskStatuses.has(task.status) ||
        !task.plannedQuantity ||
        task.plannedQuantity <= 0
      )
        return
      const scheduledTask: FulfillmentScheduledTask = {
        assignmentId: assignment.id,
        taskId: task.id,
        workerId: assignment.workerId,
        workerName: workerNames.get(assignment.workerId) ?? '已删除人员',
        assignedOn: assignment.assignedOn,
        processType: task.processType,
        stage,
        plannedQuantity: task.plannedQuantity,
        pieceRateCents: task.pieceRateCents,
        status: task.status
      }
      const schedule = item.stageSchedules[stage]
      schedule.reservedQuantity += scheduledTask.plannedQuantity
      schedule.tasks.push(scheduledTask)
    })
  })

  queue.forEach((item) => finalizeStageSchedules(item.stageSchedules))
  return queue
}

export function getFulfillmentQueueStageQuantity(
  item: FulfillmentQueueItem,
  stage: ActionableFulfillmentQueueStage
): number {
  return getStageWip(item.stages, stage)
}

export function getFulfillmentQueueStageSchedule(
  item: FulfillmentQueueItem,
  stage: ActionableFulfillmentQueueStage
): FulfillmentStageSchedule {
  return (
    item.stageSchedules?.[stage] ?? {
      wipQuantity: getFulfillmentQueueStageQuantity(item, stage),
      reservedQuantity: 0,
      unassignedQuantity: getFulfillmentQueueStageQuantity(item, stage),
      overassignedQuantity: 0,
      tasks: []
    }
  )
}

export function getFulfillmentQueueStageUnassignedQuantity(
  item: FulfillmentQueueItem,
  stage: ActionableFulfillmentQueueStage
): number {
  return getFulfillmentQueueStageSchedule(item, stage).unassignedQuantity
}

function hasVisibleStageWork(
  item: FulfillmentQueueItem,
  stage: ActionableFulfillmentQueueStage
): boolean {
  const schedule = getFulfillmentQueueStageSchedule(item, stage)
  return (
    schedule.unassignedQuantity > 0 ||
    schedule.overassignedQuantity > 0 ||
    schedule.tasks.length > 0
  )
}

export function filterFulfillmentQueue(
  queue: FulfillmentQueueItem[],
  stage: FulfillmentQueueStage
): FulfillmentQueueItem[] {
  if (stage === 'all') return queue
  return queue.filter((item) => hasVisibleStageWork(item, stage))
}

export function getFulfillmentQueueFilterCount(
  queue: FulfillmentQueueItem[],
  stage: FulfillmentQueueStage
): number {
  if (stage === 'all')
    return actionableStages.reduce(
      (sum, actionableStage) => sum + getFulfillmentQueueFilterCount(queue, actionableStage),
      0
    )
  return queue.reduce(
    (sum, item) => sum + getFulfillmentQueueStageUnassignedQuantity(item, stage),
    0
  )
}

function formatLocalBusinessDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addBusinessDays(date: string, count: number): string {
  const next = new Date(`${date}T00:00:00`)
  next.setDate(next.getDate() + count)
  return formatLocalBusinessDate(next)
}

/** 周历卡片：制作安排按任务展开，计时班次只有一张卡片且不关联商品。 */
export interface WorkerWeekCard {
  key: string
  workerId: string
  assignedOn: string
  kind: 'making' | 'timed'
  assignment: V2WorkAssignment
  /** 仅制作卡片携带；计时班次为 null。 */
  task: V2ProcessTask | null
  /** 制作取任务当前有效核算，计时取班次当前有效核算。 */
  reviewed: boolean
}

/**
 * 人员周历的排班来源：按排班日期过滤工作安排。
 * 缺勤与取消安排不再占用周历位置；制作按任务展开，计时班次单卡展示。
 */
export function buildWorkerWeekCards(
  assignments: readonly V2WorkAssignment[],
  weekStart: string
): WorkerWeekCard[] {
  const weekEnd = addBusinessDays(weekStart, 6)
  const cards: WorkerWeekCard[] = []
  assignments
    .filter(
      (assignment) =>
        assignment.status !== 'cancelled' &&
        assignment.status !== 'absent' &&
        assignment.assignedOn >= weekStart &&
        assignment.assignedOn <= weekEnd
    )
    .forEach((assignment) => {
      if (assignment.processType === 'making') {
        assignment.tasks.forEach((task) => {
          if (task.processType !== 'making' || task.status === 'cancelled') return
          cards.push({
            key: `making-${task.id}`,
            workerId: assignment.workerId,
            assignedOn: assignment.assignedOn,
            kind: 'making',
            assignment,
            task,
            reviewed: task.reviewSummary !== null
          })
        })
        return
      }
      cards.push({
        key: `timed-${assignment.id}`,
        workerId: assignment.workerId,
        assignedOn: assignment.assignedOn,
        kind: 'timed',
        assignment,
        task: null,
        reviewed: assignment.timedReview !== null
      })
    })
  return cards.sort(
    (left, right) =>
      left.assignedOn.localeCompare(right.assignedOn) ||
      left.workerId.localeCompare(right.workerId) ||
      left.key.localeCompare(right.key)
  )
}

export function getWorkerWeekTasks(
  queue: FulfillmentQueueItem[],
  weekStart: string
): WorkerWeekTask[] {
  const weekEnd = new Date(`${weekStart}T00:00:00`)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const endDate = formatLocalBusinessDate(weekEnd)
  return queue
    .flatMap((item) =>
      actionableStages.flatMap((stage) =>
        getFulfillmentQueueStageSchedule(item, stage).tasks.map((task) => ({
          ...task,
          orderItemId: item.orderItemId,
          orderId: item.orderId,
          orderCode: item.orderCode,
          productName: item.productName
        }))
      )
    )
    .filter((task) => task.assignedOn >= weekStart && task.assignedOn <= endDate)
    .sort(
      (left, right) =>
        left.assignedOn.localeCompare(right.assignedOn) ||
        left.workerName.localeCompare(right.workerName) ||
        left.taskId.localeCompare(right.taskId)
    )
}

export function useFulfillment() {
  const [orders, setOrders] = useState<V2OrderSummary[]>([])
  const [queueItems, setQueueItems] = useState<FulfillmentQueueItem[]>([])
  const [assignments, setAssignments] = useState<V2WorkAssignment[]>([])
  const [itemLabels, setItemLabels] = useState<ReadonlyMap<string, string>>(new Map())
  const [workers, setWorkers] = useState<V2Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [nextOrders, progress, nextAssignments, nextWorkers] = await Promise.all([
        window.yumiV2.orders.list(),
        window.yumiV2.reports.getFulfillmentProgress(),
        window.yumiV2.fulfillment.listWorkAssignments(),
        window.yumiV2.workers.list()
      ])
      setOrders(nextOrders)
      setWorkers(nextWorkers)
      setAssignments(nextAssignments)
      setItemLabels(new Map(progress.rows.map((row) => [row.orderItemId, row.productName])))
      setQueueItems(buildFulfillmentQueue(progress.rows, nextOrders, nextAssignments, nextWorkers))
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const createWorkAssignment = useCallback(
    async (input: Parameters<typeof window.yumiV2.fulfillment.createWorkAssignment>[0]) => {
      const assignment = await window.yumiV2.fulfillment.createWorkAssignment(input)
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

  const adjustStageQuantity = useCallback(
    async (input: V2FulfillmentAdjustmentInput) => {
      const result = await window.yumiV2.fulfillment.adjustStageQuantity(input)
      await reload()
      return result
    },
    [reload]
  )

  return {
    orders,
    queueItems,
    assignments,
    itemLabels,
    workers,
    loading,
    loadError,
    reload,
    createWorkAssignment,
    setWorkAssignmentStatus,
    reassignProcessTask,
    adjustStageQuantity
  }
}
