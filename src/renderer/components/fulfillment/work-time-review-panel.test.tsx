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

const onOpenMakingTask = vi.fn()
const onChanged = vi.fn()

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
  onOpenMakingTask.mockClear()
  onChanged.mockClear()
})

const workers = [
  { id: 'worker-1', name: '小林', enabled: true },
  { id: 'worker-2', name: '小王', enabled: true }
] as never

const makingItem = { orderId: 'order-1', orderItemId: 'item-making' }
const makingTask = { taskId: 'task-making' }

const makingEntries = [
  {
    item: makingItem,
    task: makingTask,
    workerName: '小王',
    assignedOn: '2026-09-14',
    productName: '草莓捏捏',
    plannedQuantity: 12
  }
] as never

function renderPanel() {
  return render(
    <WorkTimeReviewPanel
      makingEntries={makingEntries}
      onChanged={onChanged}
      onOpenMakingTask={onOpenMakingTask}
      workers={workers}
    />
  )
}

function mockPendingAssignments() {
  mocks.listWorkAssignments.mockResolvedValue([
    {
      id: 'assignment-fluffing',
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
      id: 'assignment-fluffing-2',
      workerId: 'worker-1',
      assignedOn: '2026-09-14',
      processType: 'fluffing_bagging',
      status: 'scheduled',
      tasks: [
        {
          id: 'task-d',
          orderItemId: 'item-c',
          processType: 'fluffing_bagging',
          plannedQuantity: 50,
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
    },
    {
      id: 'assignment-packing',
      workerId: 'worker-2',
      assignedOn: '2026-09-13',
      processType: 'packing',
      status: 'scheduled',
      tasks: [
        {
          id: 'task-pack',
          orderItemId: 'item-c',
          processType: 'packing',
          plannedQuantity: 80,
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
      },
      {
        id: 'item-c',
        productSnapshot: {
          name: '商品 C',
          expectedFluffingBaggingMinutes: 0,
          expectedEdgeSewingMinutes: 0,
          expectedPackingMinutes: 2
        }
      }
    ]
  })
}

describe('WorkTimeReviewPanel', () => {
  it('待核算列表统一展示制作与计时工序事项，按类型区分并提供各自入口', async () => {
    mocks.listReviews.mockResolvedValue([])
    mockPendingAssignments()
    renderPanel()

    const table = await screen.findByRole('table', { name: '待核算事项' })
    expect(within(table).getByText('制作')).toBeVisible()
    expect(within(table).getByText('草莓捏捏 · 计划 12 件')).toBeVisible()
    expect(within(table).getByText('捏毛装袋')).toBeVisible()
    expect(
      within(table).getByText('2 个安排 · 商品 A 40 件 + 商品 B 30 件 + 商品 C 50 件')
    ).toBeVisible()
    expect(within(table).getByText('缝边')).toBeVisible()
    expect(within(table).getByText('1 个安排 · 商品 A 10 件')).toBeVisible()
    expect(within(table).getByText('打包发货')).toBeVisible()
    expect(within(table).getByText('1 个安排 · 商品 C 80 件')).toBeVisible()
    expect(screen.getByText(/共 4 项待处理/)).toBeVisible()

    expect(within(table).getByRole('button', { name: '确认结果' })).toBeVisible()
    expect(within(table).getAllByRole('button', { name: '登记核算' })).toHaveLength(3)
    expect(screen.getByRole('heading', { name: '已登记工时核算' })).toBeVisible()

    // 旧的分步查找界面已移除
    expect(screen.queryByText('1 选择员工与日期')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '查找待核算安排' })).not.toBeInTheDocument()

    fireEvent.click(within(table).getByRole('button', { name: '确认结果' }))
    expect(onOpenMakingTask).toHaveBeenCalledTimes(1)
    expect(onOpenMakingTask).toHaveBeenCalledWith(makingItem, makingTask)
  })

  it('登记核算弹窗展示该组安排与工时核对，保存并确认提交整组安排', async () => {
    mocks.listReviews.mockResolvedValue([])
    mockPendingAssignments()
    const created = {
      id: 'review-1',
      workerId: 'worker-1',
      workedOn: '2026-09-14',
      processType: 'fluffing_bagging',
      status: 'draft'
    }
    mocks.createDraft.mockResolvedValue(created)
    mocks.confirm.mockResolvedValue({ ...created, status: 'confirmed' })

    renderPanel()
    const table = await screen.findByRole('table', { name: '待核算事项' })
    const fluffingRow = within(table)
      .getByText('2 个安排 · 商品 A 40 件 + 商品 B 30 件 + 商品 C 50 件')
      .closest('tr') as HTMLElement
    fireEvent.click(within(fluffingRow).getByRole('button', { name: '登记核算' }))

    const dialog = await screen.findByRole('dialog', { name: '登记工时核算' })
    expect(within(dialog).getByText('小林 · 2026-09-14 · 捏毛装袋 · 含 2 个安排')).toBeVisible()

    fireEvent.change(within(dialog).getByRole('textbox', { name: '负责人核算时长（分钟）' }), {
      target: { value: '240' }
    })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '商品 A 完成数量（件）' }), {
      target: { value: '40' }
    })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '商品 B 完成数量（件）' }), {
      target: { value: '30' }
    })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '商品 C 完成数量（件）' }), {
      target: { value: '50' }
    })

    // 40 × 3 + 30 × 2 + 50 × 0 = 180 分钟；核算 240 分钟 → 时间差 60，预计效率 75%
    const comparison = within(dialog).getByRole('region', { name: '工时核对' })
    expect(within(comparison).getByText('预计总分钟')).toBeVisible()
    expect(within(comparison).getByText('180 分钟')).toBeVisible()
    expect(within(comparison).getByText('60 分钟')).toBeVisible()
    expect(within(dialog).getByText('实际用时高于预计，请核对')).toBeVisible()
    expect(within(dialog).getByRole('group', { name: /预计效率/ })).toHaveTextContent('75.00%')

    fireEvent.click(within(dialog).getByRole('button', { name: '保存并确认' }))
    await waitFor(() =>
      expect(mocks.createDraft).toHaveBeenCalledWith({
        workerId: 'worker-1',
        workedOn: '2026-09-14',
        processType: 'fluffing_bagging',
        approvedMinutes: 240,
        assignmentIds: ['assignment-fluffing', 'assignment-fluffing-2'],
        items: [
          { processTaskId: 'task-a', completedQuantity: 40 },
          { processTaskId: 'task-b', completedQuantity: 30 },
          { processTaskId: 'task-d', completedQuantity: 50 }
        ],
        reviewNote: null
      })
    )
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledWith('review-1'))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '登记工时核算' })).not.toBeInTheDocument()
    )
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('登记核算支持先保存草稿，不调用确认', async () => {
    mocks.listReviews.mockResolvedValue([])
    mockPendingAssignments()
    mocks.createDraft.mockResolvedValue({
      id: 'review-2',
      workerId: 'worker-1',
      workedOn: '2026-09-14',
      processType: 'edge_sewing',
      status: 'draft'
    })

    renderPanel()
    const table = await screen.findByRole('table', { name: '待核算事项' })
    const edgeRow = within(table).getByText('1 个安排 · 商品 A 10 件').closest('tr') as HTMLElement
    fireEvent.click(within(edgeRow).getByRole('button', { name: '登记核算' }))

    const dialog = await screen.findByRole('dialog', { name: '登记工时核算' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '负责人核算时长（分钟）' }), {
      target: { value: '30' }
    })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '商品 A 完成数量（件）' }), {
      target: { value: '10' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存草稿' }))

    await waitFor(() =>
      expect(mocks.createDraft).toHaveBeenCalledWith({
        workerId: 'worker-1',
        workedOn: '2026-09-14',
        processType: 'edge_sewing',
        approvedMinutes: 30,
        assignmentIds: ['assignment-edge'],
        items: [{ processTaskId: 'task-edge', completedQuantity: 10 }],
        reviewNote: null
      })
    )
    expect(mocks.confirm).not.toHaveBeenCalled()
  })

  it('已存在未作废核算的计时安排不再出现在待核算列表，已确认记录可作废重录', async () => {
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
        assignmentIds: ['assignment-fluffing', 'assignment-fluffing-2'],
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
    mockPendingAssignments()

    renderPanel()
    const table = await screen.findByRole('table', { name: '待核算事项' })
    expect(within(table).queryByText('捏毛装袋')).not.toBeInTheDocument()
    expect(within(table).getByText('缝边')).toBeVisible()
    expect(within(table).getByText('打包发货')).toBeVisible()

    // 已确认记录可作废重录
    const records = screen.getByRole('table', { name: '工时核算记录' })
    expect(within(records).getByText('已确认')).toBeVisible()
    expect(within(records).getByText('¥30.00 / 小时')).toBeVisible()
    fireEvent.click(within(records).getByRole('button', { name: '作废重录' }))
    const dialog = await screen.findByRole('dialog', { name: '作废工时核算？' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '作废原因' }), {
      target: { value: '时长录错' }
    })
    mocks.void.mockResolvedValue({ id: 'review-1', status: 'voided' })
    fireEvent.click(within(dialog).getByRole('button', { name: '确认作废' }))
    await waitFor(() => expect(mocks.void).toHaveBeenCalledWith('review-1', { reason: '时长录错' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })
})
