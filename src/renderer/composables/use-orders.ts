import { useCallback, useEffect, useState } from 'react'
import type {
  V2Customer,
  V2Order,
  V2OrderContentChange,
  V2OrderContentChangeInput,
  V2OrderCreateInput,
  V2OrderFund,
  V2OrderFundCorrectionInput,
  V2OrderFundInput,
  V2OrderSummary,
  V2Product,
  V2Shipment,
  V2ShipmentInput
} from '@shared/contracts'
import { getErrorMessage } from './v2-utils'

export function useOrders() {
  const [orders, setOrders] = useState<V2OrderSummary[]>([])
  const [customers, setCustomers] = useState<V2Customer[]>([])
  const [products, setProducts] = useState<V2Product[]>([])
  const [selectedOrder, setSelectedOrder] = useState<V2Order | null>(null)
  const [funds, setFunds] = useState<V2OrderFund[]>([])
  const [shipments, setShipments] = useState<V2Shipment[]>([])
  const [contentChanges, setContentChanges] = useState<V2OrderContentChange[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadOrderDetail = useCallback(async (orderId: string) => {
    const [order, nextFunds, nextShipments, nextChanges] = await Promise.all([
      window.yumiV2.orders.get(orderId),
      window.yumiV2.orders.listFunds(orderId),
      window.yumiV2.orders.listShipments(orderId),
      window.yumiV2.orders.listContentChanges(orderId)
    ])
    setSelectedOrder(order)
    setFunds(nextFunds)
    setShipments(nextShipments)
    setContentChanges(nextChanges)
    return order
  }, [])

  const reload = useCallback(async (selectedOrderId?: string) => {
    setLoading(true)
    setLoadError(null)
    try {
      const [nextOrders, nextCustomers, nextProducts] = await Promise.all([
        window.yumiV2.orders.list(),
        window.yumiV2.customers.list(),
        window.yumiV2.products.list()
      ])
      setOrders(nextOrders)
      setCustomers(nextCustomers)
      setProducts(nextProducts)
      if (selectedOrderId) await loadOrderDetail(selectedOrderId)
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [loadOrderDetail])

  useEffect(() => {
    void reload()
  }, [reload])

  const selectOrder = useCallback(async (orderId: string) => {
    setLoadError(null)
    try {
      await loadOrderDetail(orderId)
    } catch (error) {
      setLoadError(getErrorMessage(error))
    }
  }, [loadOrderDetail])

  const createOrder = useCallback(async (input: V2OrderCreateInput) => {
    const order = await window.yumiV2.orders.create(input)
    await reload(order.id)
    return order
  }, [reload])

  const changeContent = useCallback(async (orderId: string, input: V2OrderContentChangeInput) => {
    const order = await window.yumiV2.orders.changeContent(orderId, input)
    await reload(orderId)
    return order
  }, [reload])

  const recordFund = useCallback(async (orderId: string, input: V2OrderFundInput) => {
    const fund = await window.yumiV2.orders.recordFund(orderId, input)
    await reload(orderId)
    return fund
  }, [reload])

  const correctFund = useCallback(async (orderId: string, input: V2OrderFundCorrectionInput) => {
    const result = await window.yumiV2.orders.correctFund(orderId, input)
    await reload(orderId)
    return result
  }, [reload])

  const createShipment = useCallback(async (orderId: string, input: V2ShipmentInput) => {
    const shipment = await window.yumiV2.orders.createShipment(orderId, input)
    await reload(orderId)
    return shipment
  }, [reload])

  return {
    orders, customers, products, selectedOrder, funds, shipments, contentChanges,
    loading, loadError, reload, selectOrder, createOrder, changeContent, recordFund,
    correctFund, createShipment
  }
}
