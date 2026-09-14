import { useCallback, useEffect, useState } from 'react'
import type {
  V2ProductInventoryAdjustInput,
  V2ProductInventoryAllocationResult,
  V2ProductInventoryAllocateInput,
  V2ProductInventorySummary,
  V2ProductOpeningInput,
  V2ProductStageInventoryEvent
} from '@shared/contracts/index'
import { getErrorMessage } from './v2-utils'

export interface AllocatableOrderItem {
  orderId: string
  orderCode: string
  customerName: string
  orderItemId: string
  quantity: number
  edgeEnabled: boolean
  edgeQuantity: number
}

/**
 * 商品阶段存量：余额来自流水汇总，所有修改都通过服务写入可追溯流水。
 */
export function useProductInventory(productId: string | null) {
  const [summary, setSummary] = useState<V2ProductInventorySummary | null>(null)
  const [events, setEvents] = useState<V2ProductStageInventoryEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!productId) {
      setSummary(null)
      setEvents([])
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const [nextSummary, nextEvents] = await Promise.all([
        window.yumiV2.productInventory.getSummary(productId),
        window.yumiV2.productInventory.listEvents(productId)
      ])
      setSummary(nextSummary)
      setEvents(nextEvents)
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => {
    void reload()
  }, [reload])

  const recordOpening = useCallback(
    async (input: V2ProductOpeningInput) => {
      const result = await window.yumiV2.productInventory.recordOpening(input)
      await reload()
      return result
    },
    [reload]
  )

  const adjust = useCallback(
    async (input: V2ProductInventoryAdjustInput) => {
      const result = await window.yumiV2.productInventory.adjust(input)
      await reload()
      return result
    },
    [reload]
  )

  const allocateToOrder = useCallback(
    async (input: V2ProductInventoryAllocateInput): Promise<V2ProductInventoryAllocationResult> => {
      const result = await window.yumiV2.productInventory.allocateToOrder(input)
      await reload()
      return result
    },
    [reload]
  )

  /** 列出可投入的同商品订单商品；只在打开投入对话框时按需读取。 */
  const loadAllocatableOrderItems = useCallback(
    async (targetProductId: string): Promise<AllocatableOrderItem[]> => {
      const orders = await window.yumiV2.orders.list()
      const options: AllocatableOrderItem[] = []
      for (const orderSummary of orders) {
        const order = await window.yumiV2.orders.get(orderSummary.id)
        if (!order) continue
        for (const item of order.items) {
          if (item.productId !== targetProductId) continue
          options.push({
            orderId: order.id,
            orderCode: order.code,
            customerName: order.customer?.name ?? '未填客户',
            orderItemId: item.id,
            quantity: item.quantity,
            edgeEnabled: item.edgeEnabled,
            edgeQuantity: item.edgeQuantity
          })
        }
      }
      return options
    },
    []
  )

  return {
    summary,
    events,
    loading,
    loadError,
    reload,
    recordOpening,
    adjust,
    allocateToOrder,
    loadAllocatableOrderItems
  }
}
