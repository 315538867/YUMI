/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import {
  cleanup,
  fireEvent,
  render as renderBase,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YumiNotificationProvider } from '../ui'
const render = (ui: Parameters<typeof renderBase>[0]) =>
  renderBase(<YumiNotificationProvider>{ui}</YumiNotificationProvider>)
import type { V2Product } from '@shared/contracts/index'
import { installDomInteractionPolyfills } from '../../test/dom'
import { ProductInventoryPanel } from './product-inventory-panel'

const mocks = vi.hoisted(() => ({
  getSummary: vi.fn(),
  listEvents: vi.fn(),
  recordOpening: vi.fn(),
  adjust: vi.fn(),
  allocateToOrder: vi.fn(),
  ordersList: vi.fn(),
  ordersGet: vi.fn()
}))

Object.assign(window, {
  yumiV2: {
    productInventory: {
      getSummary: mocks.getSummary,
      listEvents: mocks.listEvents,
      recordOpening: mocks.recordOpening,
      adjust: mocks.adjust,
      allocateToOrder: mocks.allocateToOrder
    },
    orders: {
      list: mocks.ordersList,
      get: mocks.ordersGet
    }
  }
})

installDomInteractionPolyfills()
afterEach(() => {
  cleanup()
  mocks.getSummary.mockReset()
  mocks.listEvents.mockReset()
  mocks.recordOpening.mockReset()
  mocks.adjust.mockReset()
  mocks.allocateToOrder.mockReset()
  mocks.ordersList.mockReset()
  mocks.ordersGet.mockReset()
})

const product = {
  id: 'product-1',
  name: '羊毛杯垫',
  code: null,
  category: null,
  basePriceCents: 10_800,
  packagingCostCents: 0,
  accessoryCostCents: 0,
  replacementBagCostCents: 0,
  edgeConsumableCostCents: 0,
  fixedCostCents: 0,
  unitWeightMilligrams: 0,
  standardMakingMinutes: 0,
  expectedFluffingBaggingMinutes: 0,
  expectedEdgeSewingMinutes: 0,
  expectedPackingMinutes: 0,
  makingCommissionCents: 0,
  fluffingBaggingCommissionCents: 0,
  edgeSewingCommissionCents: 0,
  moldCount: 0,
  outputPerMoldPerBatch: 0,
  maxBatchesPerDay: 0,
  dailyCapacity: 0,
  enabled: true,
  imageAttachmentId: null,
  notes: null,
  createdAt: '2026-09-14T00:00:00.000Z',
  updatedAt: '2026-09-14T00:00:00.000Z'
} as V2Product

describe('ProductInventoryPanel', () => {
  it('按阶段展示余额与可追溯流水，并允许录入历史存量', async () => {
    mocks.getSummary.mockResolvedValue({
      productId: 'product-1',
      stages: {
        made: 100,
        fluffing_bagging_done: 30,
        edge_sewing_done: 0,
        packed: 10
      }
    })
    mocks.listEvents.mockResolvedValue([
      {
        id: 'event-1',
        productId: 'product-1',
        stage: 'made',
        quantityDelta: 100,
        sourceType: 'opening',
        orderItemId: null,
        occurredOn: '2026-09-14',
        note: '现场盘点',
        createdAt: '2026-09-14T00:00:00.000Z'
      },
      {
        id: 'event-2',
        productId: 'product-1',
        stage: 'made',
        quantityDelta: -20,
        sourceType: 'order_allocation',
        orderItemId: 'item-1',
        occurredOn: '2026-09-14',
        note: null,
        createdAt: '2026-09-14T01:00:00.000Z'
      }
    ])
    mocks.recordOpening.mockResolvedValue({ productId: 'product-1', stages: {} })

    render(<ProductInventoryPanel product={product} />)

    expect(await screen.findByText('100 件')).toBeVisible()
    expect(screen.getByText('已捏毛装袋，未缝边')).toBeVisible()
    expect(screen.getByText('30 件')).toBeVisible()
    const eventsTable = screen.getByRole('table', { name: '商品存量流水' })
    expect(within(eventsTable).getByText('历史存量')).toBeVisible()
    expect(within(eventsTable).getByText('投入订单')).toBeVisible()
    expect(within(eventsTable).getByText('+100')).toBeVisible()
    expect(within(eventsTable).getByText('-20')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '录入历史存量' }))
    const dialog = await screen.findByRole('dialog', { name: '录入历史存量：羊毛杯垫' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '数量（件）' }), {
      target: { value: '12' }
    })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '备注' }), {
      target: { value: '上线盘点' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存历史存量' }))

    await waitFor(() =>
      expect(mocks.recordOpening).toHaveBeenCalledWith({
        productId: 'product-1',
        stage: 'made',
        quantity: 12,
        occurredOn: expect.any(String),
        note: '上线盘点'
      })
    )
  })

  it('减少超过余额时保留服务端错误提示，不伪造本地新余额', async () => {
    mocks.getSummary.mockResolvedValue({
      productId: 'product-1',
      stages: {
        made: 20,
        fluffing_bagging_done: 0,
        edge_sewing_done: 0,
        packed: 0
      }
    })
    mocks.listEvents.mockResolvedValue([])
    mocks.adjust.mockRejectedValue(new Error('商品存量余额不能为负'))

    render(<ProductInventoryPanel product={product} />)
    expect(await screen.findByText('20 件')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '负责人调整' }))
    const dialog = await screen.findByRole('dialog', { name: '负责人调整：羊毛杯垫' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '调整数量（件）' }), {
      target: { value: '-21' }
    })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '调整原因' }), {
      target: { value: '超量减少' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存调整' }))

    expect(await screen.findByText('商品存量余额不能为负')).toBeVisible()
    expect(screen.getByText('20 件')).toBeVisible()
  })

  it('投入订单只能选择同商品订单商品，并把结果写回服务端', async () => {
    mocks.getSummary.mockResolvedValue({
      productId: 'product-1',
      stages: {
        made: 50,
        fluffing_bagging_done: 0,
        edge_sewing_done: 0,
        packed: 0
      }
    })
    mocks.listEvents.mockResolvedValue([])
    mocks.ordersList.mockResolvedValue([{ id: 'order-1' }])
    mocks.ordersGet.mockResolvedValue({
      id: 'order-1',
      code: 'YUMI-001',
      customer: { name: '小雨' },
      items: [
        {
          id: 'item-1',
          productId: 'product-1',
          quantity: 20,
          edgeEnabled: true,
          edgeQuantity: 8
        },
        { id: 'item-2', productId: 'product-2', quantity: 5, edgeEnabled: false, edgeQuantity: 0 }
      ]
    })
    mocks.allocateToOrder.mockResolvedValue({
      summary: { productId: 'product-1', stages: {} },
      orderItemId: 'item-1',
      targetStage: 'edge_sewing'
    })

    render(<ProductInventoryPanel product={product} />)
    fireEvent.click(await screen.findByRole('button', { name: '投入订单' }))
    const dialog = await screen.findByRole('dialog', { name: '投入订单：羊毛杯垫' })
    await waitFor(() =>
      expect(within(dialog).getByRole('combobox', { name: '订单商品' })).toHaveTextContent(
        'YUMI-001 · 小雨 · 20 件 · 缝边 8 件'
      )
    )
    fireEvent.change(within(dialog).getByRole('textbox', { name: '投入数量（件）' }), {
      target: { value: '8' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '确认投入' }))

    await waitFor(() =>
      expect(mocks.allocateToOrder).toHaveBeenCalledWith({
        productId: 'product-1',
        stage: 'made',
        orderItemId: 'item-1',
        quantity: 8,
        occurredOn: expect.any(String)
      })
    )
  })
})
