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
import { installDomInteractionPolyfills } from '../../test/dom'
import { WorkTimeReviewPanel } from './work-time-review-panel'

const mocks = vi.hoisted(() => ({
  listReviews: vi.fn(),
  createDraft: vi.fn(),
  updateDraft: vi.fn(),
  confirm: vi.fn(),
  void: vi.fn(),
  listWorkAssignments: vi.fn(),
  getOrderItem: vi.fn(),
  ordersGet: vi.fn()
}))

Object.assign(window, {
  yumiV2: {
    workTimeReviews: {
      list: mocks.listReviews,
      get: vi.fn(),
      createDraft: mocks.createDraft,
      updateDraft: mocks.updateDraft,
      confirm: mocks.confirm,
      void: mocks.void
    },
    fulfillment: {
      listWorkAssignments: mocks.listWorkAssignments,
      getOrderItem: mocks.getOrderItem
    },
    orders: { get: mocks.ordersGet }
  }
})

installDomInteractionPolyfills()
afterEach(() => {
  cleanup()
  mocks.listReviews.mockReset()
  mocks.createDraft.mockReset()
  mocks.updateDraft.mockReset()
  mocks.confirm.mockReset()
  mocks.void.mockReset()
  mocks.listWorkAssignments.mockReset()
  mocks.getOrderItem.mockReset()
  mocks.ordersGet.mockReset()
})

const workers = [
  { id: 'worker-1', name: '小林', enabled: true },
  { id: 'worker-2', name: '小王', enabled: true }
] as never

function mockCandidates() {
  mocks.listWorkAssignments.mockResolvedValue([
    {
      id: 'assignment-1',
      workerId: 'worker-1',
      assignedOn: '2026-09-14',
      processType: 'fluffing_bagging',
      status: 'scheduled',
      tasks: [
        {
          id: 'task-a',
          orderItemId: 'item-a',
          processType: 'fluffing_bagging',
          plannedQuantity: 40,
          status: 'pending'
        },
        {
          id: 'task-b',
          orderItemId: 'item-b',
          processType: 'fluffing_bagging',
          plannedQuantity: 30,
          status: 'pending'
        }
      ]
    },
    {
      id: 'assignment-edge',
      workerId: 'worker-1',
      assignedOn: '2026-09-14',
      processType: 'edge_sewing',
      status: 'scheduled',
      tasks: [
        {
          id: 'task-edge',
          orderItemId: 'item-a',
          processType: 'edge_sewing',
          plannedQuantity: 10,
          status: 'pending'
        }
      ]
    }
  ])
  mocks.getOrderItem.mockImplementation(async (orderItemId: string) => ({
    orderId: 'order-1',
    orderItemId
  }))
  mocks.ordersGet.mockResolvedValue({
    id: 'order-1',
    items: [
      {
        id: 'item-a',
        productSnapshot: {
          name: '商品 A',
          expectedFluffingBaggingMinutes: 3,
          expectedEdgeSewingMinutes: 5,
          expectedPackingMinutes: 2
        }
      },
      {
        id: 'item-b',
        productSnapshot: {
          name: '商品 B',
          expectedFluffingBaggingMinutes: 2,
          expectedEdgeSewingMinutes: 0,
          expectedPackingMinutes: 2
        }
      }
    ]
  })
}

describe('WorkTimeReviewPanel', () => {
  it('装载待核算安排，展示预计总分钟、时间差与预计效率，并保存确认', async () => {
    mocks.listReviews.mockResolvedValue([])
    mockCandidates()
    const created = {
      id: 'review-1',
      workerId: 'worker-1',
      workedOn: '2026-09-14',
      processType: 'fluffing_bagging',
      status: 'draft'
    }
    mocks.createDraft.mockResolvedValue(created)
    mocks.confirm.mockResolvedValue({ ...created, status: 'confirmed' })

    render(<WorkTimeReviewPanel workers={workers} />)
    await waitFor(() => expect(mocks.listReviews).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('combobox', { name: '兼职人员' }))
    fireEvent.click(await screen.findByRole('option', { name: '小林' }))
    fireEvent.change(screen.getByRole('textbox', { name: '工作日期' }), {
      target: { value: '2026-09-14' }
    })
    fireEvent.click(screen.getByRole('button', { name: '查找待核算安排' }))

    const list = await screen.findByRole('list', { name: '待核算工作安排' })
    expect(within(list).getByText('捏毛装袋 · 2 个商品')).toBeVisible()
    expect(within(list).getByText('缝边 · 1 个商品')).toBeVisible()

    const checkboxes = within(list).getAllByRole('checkbox')
    fireEvent.click(checkboxes[0]!)

    // 跨工序的工作安排不能被同一条核算记录包含
    fireEvent.click(checkboxes[1]!)
    expect(await screen.findByText('一条工时核算只能包含同一道工序的工作安排。')).toBeVisible()

    fireEvent.change(screen.getByRole('textbox', { name: '负责人核算时长（分钟）' }), {
      target: { value: '240' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: '商品 A 完成数量（件）' }), {
      target: { value: '40' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: '商品 B 完成数量（件）' }), {
      target: { value: '30' }
    })

    // 40 × 3 + 30 × 2 = 180 分钟；核算 240 分钟 → 时间差 60，预计效率 75%
    const comparison = screen.getByRole('region', { name: '工时核对' })
    expect(within(comparison).getByText('预计总分钟')).toBeVisible()
    expect(within(comparison).getByText('180 分钟')).toBeVisible()
    expect(within(comparison).getByText('60 分钟')).toBeVisible()
    expect(await screen.findByText('实际用时高于预计，请核对')).toBeVisible()
    expect(screen.getByRole('group', { name: /预计效率/ })).toHaveTextContent('75.00%')

    fireEvent.click(screen.getByRole('button', { name: '保存并确认' }))
    await waitFor(() =>
      expect(mocks.createDraft).toHaveBeenCalledWith({
        workerId: 'worker-1',
        workedOn: '2026-09-14',
        processType: 'fluffing_bagging',
        approvedMinutes: 240,
        assignmentIds: ['assignment-1'],
        items: [
          { processTaskId: 'task-a', completedQuantity: 40 },
          { processTaskId: 'task-b', completedQuantity: 30 }
        ],
        reviewNote: null
      })
    )
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledWith('review-1'))
  })

  it('已存在未作废核算的工作安排不再出现在候选中', async () => {
    mocks.listReviews.mockResolvedValue([
      {
        id: 'review-1',
        workerId: 'worker-1',
        workedOn: '2026-09-14',
        processType: 'fluffing_bagging',
        approvedMinutes: 180,
        hourlyWageCentsSnapshot: 3_000,
        sourceType: 'manual_review',
        status: 'confirmed',
        assignmentIds: ['assignment-1'],
        items: [
          {
            id: 'item-1',
            processTaskId: 'task-a',
            orderItemId: 'item-a',
            completedQuantity: 40
          }
        ],
        reviewNote: null,
        externalRecordId: null,
        rawStartedAt: null,
        rawEndedAt: null,
        createdAt: '2026-09-15T00:00:00.000Z',
        updatedAt: '2026-09-15T00:00:00.000Z'
      }
    ])
    mockCandidates()

    render(<WorkTimeReviewPanel workers={workers} />)
    fireEvent.click(screen.getByRole('combobox', { name: '兼职人员' }))
    fireEvent.click(await screen.findByRole('option', { name: '小林' }))
    fireEvent.click(screen.getByRole('button', { name: '查找待核算安排' }))

    const list = await screen.findByRole('list', { name: '待核算工作安排' })
    expect(within(list).queryByText('捏毛装袋 · 2 个商品')).not.toBeInTheDocument()
    expect(within(list).getByText('缝边 · 1 个商品')).toBeVisible()

    // 已确认记录可作废重录
    const table = screen.getByRole('table', { name: '工时核算记录' })
    expect(within(table).getByText('已确认')).toBeVisible()
    expect(within(table).getByText('¥30.00 / 小时')).toBeVisible()
    fireEvent.click(within(table).getByRole('button', { name: '作废重录' }))
    const dialog = await screen.findByRole('dialog', { name: '作废工时核算？' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '作废原因' }), {
      target: { value: '时长录错' }
    })
    mocks.void.mockResolvedValue({ id: 'review-1', status: 'voided' })
    fireEvent.click(within(dialog).getByRole('button', { name: '确认作废' }))
    await waitFor(() => expect(mocks.void).toHaveBeenCalledWith('review-1', { reason: '时长录错' }))
  })
})
