import { useCallback, useEffect, useState } from 'react'
import type { V2FulfillmentAdjustmentInput, V2OpeningWipInput, V2Order, V2OrderItemFulfillment, V2OrderSummary } from '@shared/contracts/index'
import { getErrorMessage } from './v2-utils'

export function useFulfillment() {
  const [orders, setOrders] = useState<V2OrderSummary[]>([])
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
      const nextOrders = await window.yumiV2.orders.list()
      setOrders(nextOrders)
      const targetId = orderId ?? selectedOrder?.id ?? nextOrders[0]?.id
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

  return { orders, selectedOrder, items, loading, loadError, reload, selectOrder, recordOpeningWip, adjustStageQuantity }
}
