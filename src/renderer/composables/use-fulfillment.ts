import { useCallback, useEffect, useState } from 'react'
import type {
  V2FulfillmentAdjustmentInput,
  V2FulfillmentProgressReportRow,
  V2FulfillmentStageBalances,
  V2OpeningWipInput,
  V2Order,
  V2OrderItemFulfillment,
  V2OrderSummary
} from '@shared/contracts/index'
import { getErrorMessage } from './v2-utils'

export type FulfillmentQueueStage = 'all' | 'making' | 'fluffing_bagging' | 'packing' | 'ready_to_ship'

export interface FulfillmentQueueItem {
  orderId: string
  orderCode: string
  customerName: string
  orderItemId: string
  productName: string
  confirmedQuantity: number
  outstandingQuantity: number
  stages: V2FulfillmentStageBalances
}

export function buildFulfillmentQueue(
  rows: V2FulfillmentProgressReportRow[],
  orders: V2OrderSummary[]
): FulfillmentQueueItem[] {
  const customerNames = new Map(orders.map((order) => [order.id, order.customerName]))
  return rows
    .map((row) => ({
      orderId: row.orderId,
      orderCode: row.orderCode,
      customerName: customerNames.get(row.orderId) ?? '未命名客户',
      orderItemId: row.orderItemId,
      productName: row.productName,
      confirmedQuantity: row.confirmedQuantity,
      outstandingQuantity: row.stages.making + row.stages.fluffingBagging + row.stages.packing + row.stages.readyToShip,
      stages: row.stages
    }))
    .filter((item) => item.outstandingQuantity > 0)
}

export function getFulfillmentQueueStageQuantity(item: FulfillmentQueueItem, stage: Exclude<FulfillmentQueueStage, 'all'>): number {
  if (stage === 'making') return item.stages.making
  if (stage === 'fluffing_bagging') return item.stages.fluffingBagging
  if (stage === 'packing') return item.stages.packing
  return item.stages.readyToShip
}

export function filterFulfillmentQueue(
  queue: FulfillmentQueueItem[],
  stage: FulfillmentQueueStage
): FulfillmentQueueItem[] {
  if (stage === 'all') return queue
  return queue.filter((item) => getFulfillmentQueueStageQuantity(item, stage) > 0)
}

export function useFulfillment() {
  const [orders, setOrders] = useState<V2OrderSummary[]>([])
  const [queueItems, setQueueItems] = useState<FulfillmentQueueItem[]>([])
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
    const fulfillmentItems = await Promise.all(order.items.map((item) => window.yumiV2.fulfillment.getOrderItem(item.id)))
    setSelectedOrder(order)
    setItems(fulfillmentItems)
    return order
  }, [])

  const reload = useCallback(async (orderId?: string) => {
    setLoading(true)
    setLoadError(null)
    try {
      const [nextOrders, progress] = await Promise.all([
        window.yumiV2.orders.list(),
        window.yumiV2.reports.getFulfillmentProgress()
      ])
      setOrders(nextOrders)
      setQueueItems(buildFulfillmentQueue(progress.rows, nextOrders))

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
  }, [loadOrder, selectedOrder?.id])

  useEffect(() => { void reload() }, [reload])

  const selectOrder = useCallback(async (orderId: string) => {
    if (!orderId) {
      setSelectedOrder(null)
      setItems([])
      return
    }
    setLoadError(null)
    try { await loadOrder(orderId) } catch (error) { setLoadError(getErrorMessage(error)) }
  }, [loadOrder])

  const recordOpeningWip = useCallback(async (input: V2OpeningWipInput) => {
    const result = await window.yumiV2.fulfillment.recordOpeningWip(input)
    await reload(result.orderId)
    return result
  }, [reload])

  const adjustStageQuantity = useCallback(async (input: V2FulfillmentAdjustmentInput) => {
    const result = await window.yumiV2.fulfillment.adjustStageQuantity(input)
    await reload(result.orderId)
    return result
  }, [reload])

  return { orders, queueItems, selectedOrder, items, loading, loadError, reload, selectOrder, recordOpeningWip, adjustStageQuantity }
}
