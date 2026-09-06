import { describe, expect, it } from 'vitest'
import { getAvailableShiftTaskItems } from './shift-task-options'

describe('排班任务可选项', () => {
  const items = [
    { id: 'item-1', orderId: 'order-1', productId: 'product-1', label: '订单 1 · 产品 1' },
    {
      id: 'item-2',
      orderId: 'order-1',
      productId: 'product-1',
      label: '订单 1 · 产品 1（重复明细）'
    },
    { id: 'item-3', orderId: 'order-2', productId: 'product-1', label: '订单 2 · 产品 1' }
  ]

  it('为当前任务保留自身选项，并排除其他任务已选的同订单同产品组合', () => {
    const tasks = [
      { id: 'task-1', orderItemId: 'item-1' },
      { id: 'task-2', orderItemId: 'item-3' }
    ]

    expect(getAvailableShiftTaskItems(items, tasks, 'task-2').map((item) => item.id)).toEqual([
      'item-3'
    ])
    expect(getAvailableShiftTaskItems(items, tasks).map((item) => item.id)).toEqual([])
  })
})
