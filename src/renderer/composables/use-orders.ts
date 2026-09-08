import { useCallback, useEffect, useState } from 'react'
import type {
  V2Customer,
  V2Order,
  V2OrderContentChange,
  V2OrderContentChangeInput,
  V2OrderCreateInput,
  V2OrderFund,
  V2OrderItemFulfillment,
  V2OrderFundCorrectionInput,
  V2OrderFundInput,
  V2OrderSummary,
  V2Product,
  V2Shipment,
  V2ShipmentInput
} from '@shared/contracts/index'
import { getErrorMessage } from './v2-utils'

export interface ShipmentItemAvailability {
  orderItemId: string
  confirmedQuantity: number
  shippedQuantity: number
  remainingQuantity: number
  availableQuantity: number
}

/**
 * 发货的本批上限必须同时满足：订单尚未发完，且产品已进入“待发货”阶段。
 * 后端仍会在事务中作最终校验；此处只为负责人提供可理解的输入边界。
 */
export function buildShipmentItemAvailability(
  order: V2Order,
  shipments: V2Shipment[],
  fulfillmentItems: V2OrderItemFulfillment[]
): ShipmentItemAvailability[] {
  const shippedByOrderItem = new Map<string, number>()
  for (const shipment of shipments) {
    for (const item of shipment.items) {
      shippedByOrderItem.set(
        item.orderItemId,
        (shippedByOrderItem.get(item.orderItemId) ?? 0) + item.quantity
      )
    }
  }
  const fulfillmentByOrderItem = new Map(fulfillmentItems.map((item) => [item.orderItemId, item]))

  return order.items.map((item) => {
    const shippedQuantity = shippedByOrderItem.get(item.id) ?? 0
    const remainingQuantity = Math.max(0, item.quantity - shippedQuantity)
    const readyToShipQuantity = fulfillmentByOrderItem.get(item.id)?.stages.readyToShip ?? 0
    return {
      orderItemId: item.id,
      confirmedQuantity: item.quantity,
      shippedQuantity,
      remainingQuantity,
      availableQuantity: Math.min(remainingQuantity, readyToShipQuantity)
    }
  })
}

export function useOrders() {
  const [orders, setOrders] = useState<V2OrderSummary[]>([])
  const [customers, setCustomers] = useState<V2Customer[]>([])
  const [products, setProducts] = useState<V2Product[]>([])
  const [selectedOrder, setSelectedOrder] = useState<V2Order | null>(null)
  const [funds, setFunds] = useState<V2OrderFund[]>([])
  const [shipments, setShipments] = useState<V2Shipment[]>([])
  const [fulfillmentItems, setFulfillmentItems] = useState<V2OrderItemFulfillment[]>([])
  const [contentChanges, setContentChanges] = useState<V2OrderContentChange[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadOrderDetail = useCallback(async (orderId: string) => {
    const order = await window.yumiV2.orders.get(orderId)
    if (!order) {
      setSelectedOrder(null)
      setFunds([])
      setShipments([])
      setFulfillmentItems([])
      setContentChanges([])
      return null
    }
    const [nextFunds, nextShipments, nextChanges, nextFulfillmentItems] = await Promise.all([
      window.yumiV2.orders.listFunds(orderId),
      window.yumiV2.orders.listShipments(orderId),
      window.yumiV2.orders.listContentChanges(orderId),
      Promise.all(order.items.map((item) => window.yumiV2.fulfillment.getOrderItem(item.id)))
    ])
    setSelectedOrder(order)
    setFunds(nextFunds)
    setShipments(nextShipments)
    setFulfillmentItems(nextFulfillmentItems)
    setContentChanges(nextChanges)
    return order
  }, [])

  const reload = useCallback(
    async (selectedOrderId?: string) => {
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
    },
    [loadOrderDetail]
  )

  useEffect(() => {
    void reload()
  }, [reload])

  const selectOrder = useCallback(
    async (orderId: string) => {
      setLoadError(null)
      try {
        await loadOrderDetail(orderId)
      } catch (error) {
        setLoadError(getErrorMessage(error))
      }
    },
    [loadOrderDetail]
  )

  const createOrder = useCallback(
    async (input: V2OrderCreateInput) => {
      const order = await window.yumiV2.orders.create(input)
      await reload(order.id)
      return order
    },
    [reload]
  )

  const changeContent = useCallback(
    async (orderId: string, input: V2OrderContentChangeInput) => {
      const order = await window.yumiV2.orders.changeContent(orderId, input)
      await reload(orderId)
      return order
    },
    [reload]
  )

  const recordFund = useCallback(
    async (orderId: string, input: V2OrderFundInput) => {
      const fund = await window.yumiV2.orders.recordFund(orderId, input)
      await reload(orderId)
      return fund
    },
    [reload]
  )

  const correctFund = useCallback(
    async (orderId: string, input: V2OrderFundCorrectionInput) => {
      const result = await window.yumiV2.orders.correctFund(orderId, input)
      await reload(orderId)
      return result
    },
    [reload]
  )

  const createShipment = useCallback(
    async (orderId: string, input: V2ShipmentInput) => {
      const shipment = await window.yumiV2.orders.createShipment(orderId, input)
      await reload(orderId)
      return shipment
    },
    [reload]
  )

  return {
    orders,
    customers,
    products,
    selectedOrder,
    funds,
    shipments,
    fulfillmentItems,
    contentChanges,
    loading,
    loadError,
    reload,
    selectOrder,
    createOrder,
    changeContent,
    recordFund,
    correctFund,
    createShipment
  }
}
