import { useCallback, useEffect, useState } from 'react'
import type {
  V2FulfillmentAdjustmentInput,
  V2FulfillmentProgressReportRow,
  V2FulfillmentStageBalances,
  V2Order,
  V2OrderItemFulfillment,
  V2OrderSummary,
  V2ProcessTaskStatus,
  V2Worker,
  V2WorkAssignment
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
    assignment.tasks.forEach((task) => {
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
  const [workers, setWorkers] = useState<V2Worker[]>([])
  const [selectedOrder, setSelectedOrder] = useState<V2Order | null>(null)
  const [items, setItems] = useState<V2OrderItemFulfillment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadOrder = useCallback(async (orderId: string) => {
    const order = await window.yumiV2.orders.get(orderId)
    if (!order) {
      setSelectedOrder(null)
      setItems([])
      return null
    }
    const fulfillmentItems = await Promise.all(
      order.items.map((item) => window.yumiV2.fulfillment.getOrderItem(item.id))
    )
    setSelectedOrder(order)
    setItems(fulfillmentItems)
    return order
  }, [])

  const reload = useCallback(
    async (orderId?: string) => {
      setLoading(true)
      setLoadError(null)
      try {
        const [nextOrders, progress, assignments, nextWorkers] = await Promise.all([
          window.yumiV2.orders.list(),
          window.yumiV2.reports.getFulfillmentProgress(),
          window.yumiV2.fulfillment.listWorkAssignments(),
          window.yumiV2.workers.list()
        ])
        setOrders(nextOrders)
        setWorkers(nextWorkers)
        setQueueItems(buildFulfillmentQueue(progress.rows, nextOrders, assignments, nextWorkers))

        const targetId = orderId ?? selectedOrder?.id
        if (targetId) await loadOrder(targetId)
        else {
          setSelectedOrder(null)
          setItems([])
        }
      } catch (error) {
        setLoadError(getErrorMessage(error))
      } finally {
        setLoading(false)
      }
    },
    [loadOrder, selectedOrder?.id]
  )

  useEffect(() => {
    void reload()
  }, [reload])

  const selectOrder = useCallback(
    async (orderId: string) => {
      if (!orderId) {
        setSelectedOrder(null)
        setItems([])
        return
      }
      setLoadError(null)
      try {
        await loadOrder(orderId)
      } catch (error) {
        setLoadError(getErrorMessage(error))
      }
    },
    [loadOrder]
  )

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

  const adjustStageQuantity = useCallback(
    async (input: V2FulfillmentAdjustmentInput) => {
      const result = await window.yumiV2.fulfillment.adjustStageQuantity(input)
      await reload(result.orderId)
      return result
    },
    [reload]
  )

  return {
    orders,
    queueItems,
    workers,
    selectedOrder,
    items,
    loading,
    loadError,
    reload,
    selectOrder,
    createWorkAssignment,
    reassignProcessTask,
    adjustStageQuantity
  }
}
