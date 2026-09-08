/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installDomInteractionPolyfills } from '../../test/dom'
import { FulfillmentPage } from './index'

const mocks = vi.hoisted(() => ({
  selectOrder: vi.fn().mockResolvedValue(undefined),
  queueItems: [
    {
      orderId: 'order-1',
      orderCode: 'YD-001',
      customerName: '小满',
      orderItemId: 'item-making',
      productName: '草莓捏捏',
      confirmedQuantity: 20,
      outstandingQuantity: 20,
      stages: { making: 20, fluffingBagging: 0, packing: 0, readyToShip: 0, shipped: 0 }
    },
    {
      orderId: 'order-1',
      orderCode: 'YD-001',
      customerName: '小满',
      orderItemId: 'item-ready',
      productName: '奶油捏捏',
      confirmedQuantity: 12,
      outstandingQuantity: 4,
      stages: { making: 0, fluffingBagging: 0, packing: 0, readyToShip: 4, shipped: 8 }
    }
  ]
}))

vi.mock('../../composables/use-fulfillment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../composables/use-fulfillment')>()
  return {
    ...actual,
    useFulfillment: () => ({
      queueItems: mocks.queueItems,
      selectedOrder: null,
      items: [],
      loading: false,
      loadError: null,
      selectOrder: mocks.selectOrder,
      recordOpeningWip: vi.fn(),
      adjustStageQuantity: vi.fn()
    })
  }
})

installDomInteractionPolyfills()
afterEach(() => {
  cleanup()
  mocks.selectOrder.mockClear()
})

describe('履约队列交互', () => {
  it('把并行商品保留在同一队列中，并通过互斥阶段筛选给出不同的下一步和阶段空状态', () => {
    const onNavigate = vi.fn()
    render(<FulfillmentPage onNavigate={onNavigate} />)

    expect(screen.getByRole('button', { name: /草莓捏捏/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /奶油捏捏/ })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '制作 1' }))
    expect(screen.getByRole('button', { name: /草莓捏捏/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /奶油捏捏/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '待发货 1' }))
    expect(screen.getByRole('button', { name: /奶油捏捏/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /草莓捏捏/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /奶油捏捏/ }))
    expect(onNavigate).toHaveBeenCalledWith({
      view: 'orders',
      orderId: 'order-1',
      orderView: 'fulfillment'
    })

    fireEvent.click(screen.getByRole('button', { name: '打包 0' }))
    expect(screen.getByRole('status', { name: '筛选无结果' })).toBeVisible()
    expect(screen.getByText('此阶段暂无待办')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '查看全部待办' }))
    expect(screen.getByRole('button', { name: /草莓捏捏/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /奶油捏捏/ })).toBeVisible()
  })
})
