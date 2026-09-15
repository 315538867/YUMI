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
import { YumiNotificationProvider } from '../../components/ui'
import { installDomInteractionPolyfills } from '../../test/dom'
import { today } from '../../composables/v2-utils'
import { WorkAssignmentsPage } from './index'

const render = (ui: Parameters<typeof renderBase>[0]) =>
  renderBase(<YumiNotificationProvider>{ui}</YumiNotificationProvider>)

const mocks = vi.hoisted(() => ({
  reassignProcessTask: vi.fn(),
  setWorkAssignmentStatus: vi.fn()
}))

const makingAssignment = {
  id: 'assignment-1',
  workerId: 'worker-wang',
  assignedOn: '2026-09-10',
  processType: 'making',
  scheduleMode: 'making_task',
  status: 'scheduled',
  note: null,
  tasks: [
    {
      id: 'task-1',
      workAssignmentId: 'assignment-1',
      orderItemId: 'item-1',
      processType: 'making',
      sourceType: 'normal_production',
      plannedQuantity: 8,
      plannedMinutes: 0,
      extraMinutes: 0,
      scheduledMinutes: 0,
      status: 'pending',
      hourlyWageCents: null,
      pieceRateCents: 1_250,
      glueCostCents: null,
      materialPriceMicroYuanPerGram: null,
      glueWeightMilligrams: null,
      rateSnapshot: null,
      note: null,
      reviewSummary: null,
      createdAt: '2026-09-10T09:00:00.000Z',
      updatedAt: '2026-09-10T09:00:00.000Z'
    }
  ],
  timedReview: null,
  createdAt: '2026-09-10T09:00:00.000Z',
  updatedAt: '2026-09-10T09:00:00.000Z'
}

const reviewedMakingAssignment = {
  ...makingAssignment,
  id: 'assignment-reviewed',
  tasks: [
    {
      ...makingAssignment.tasks[0],
      id: 'task-reviewed',
      workAssignmentId: 'assignment-reviewed',
      status: 'pending_inspection',
      reviewSummary: {
        resultId: 'result-1',
        completedQuantity: 8,
        qualifiedQuantity: 7,
        unqualifiedQuantity: 1,
        unfinishedQuantity: 0,
        reviewedOn: '2026-09-11',
        note: null,
        supersedesResultId: null,
        lock: { locked: false, reason: null, message: null },
        createdAt: '2026-09-11T09:00:00.000Z'
      }
    }
  ]
}

const timedAssignment = {
  id: 'assignment-timed',
  workerId: 'worker-li',
  assignedOn: '2026-09-12',
  processType: 'fluffing_bagging',
  scheduleMode: 'timed_shift',
  status: 'scheduled',
  note: null,
  tasks: [],
  timedReview: {
    reviewId: 'review-1',
    approvedMinutes: 510,
    reviewedOn: '2026-09-12',
    lock: { locked: false, reason: null, message: null }
  },
  createdAt: '2026-09-12T09:00:00.000Z',
  updatedAt: '2026-09-12T09:00:00.000Z'
}

const timedReview = {
  id: 'review-1',
  workerId: 'worker-li',
  workedOn: '2026-09-12',
  processType: 'fluffing_bagging',
  approvedMinutes: 510,
  hourlyWageCentsSnapshot: 3_000,
  sourceType: 'manual_review',
  externalRecordId: null,
  rawStartedAt: '2026-09-12T09:00',
  rawEndedAt: '2026-09-12T17:30',
  status: 'confirmed',
  workAssignmentId: 'assignment-timed',
  assignmentIds: ['assignment-timed'],
  supersedesReviewId: null,
  voidReason: null,
  voidedAt: null,
  reviewNote: null,
  lock: { locked: false, reason: null, message: null },
  items: [
    {
      id: 'review-item-1',
      orderItemId: 'item-1',
      processTaskId: null,
      completedQuantity: 20,
      pieceRateCentsSnapshot: 85,
      expectedUnitMinutesSnapshot: 3
    }
  ],
  createdAt: '2026-09-12T09:00:00.000Z',
  updatedAt: '2026-09-12T09:00:00.000Z'
}

const itemLabels = new Map([['item-1', { productName: '草莓捏捏', orderCode: 'YD-001' }]])

vi.mock('../../composables/use-work-assignments', () => ({
  useWorkAssignments: () => ({
    assignments: [makingAssignment, reviewedMakingAssignment, timedAssignment],
    workers: [
      { id: 'worker-wang', name: '小王', enabled: true },
      { id: 'worker-li', name: '小李', enabled: true },
      { id: 'worker-old', name: '已停用人员', enabled: false }
    ],
    reviews: [timedReview],
    itemLabels,
    loading: false,
    loadError: null,
    reload: vi.fn(),
    setWorkAssignmentStatus: mocks.setWorkAssignmentStatus,
    reassignProcessTask: mocks.reassignProcessTask
  })
}))

installDomInteractionPolyfills()
afterEach(() => {
  cleanup()
  mocks.reassignProcessTask.mockReset()
  mocks.setWorkAssignmentStatus.mockReset()
})

describe('工作安排记录只读骨架', () => {
  it('列表显示人员姓名与核算摘要，页面不存在新建工作安排入口', () => {
    render(<WorkAssignmentsPage />)

    const table = screen.getByRole('table', { name: '工作安排列表' })
    expect(within(table).getAllByText('小王').length).toBeGreaterThan(0)
    expect(within(table).getByText('小李')).toBeVisible()
    expect(within(table).queryByText('worker-wang')).not.toBeInTheDocument()
    expect(within(table).getAllByText('待核算').length).toBeGreaterThan(0)
    expect(within(table).getByText('510 分钟 · 核算日期 2026-09-12')).toBeVisible()

    for (const forbidden of [
      '打开新建工作安排',
      '新建工作安排',
      '保存工作安排',
      '提交完成',
      '确认质量结果',
      '确认工时',
      '保存草稿',
      '保存并确认'
    ]) {
      expect(screen.queryByRole('button', { name: forbidden })).not.toBeInTheDocument()
    }
    for (const forbiddenField of ['完成数量', '实际分钟', '合格数量', '不合格数量']) {
      expect(screen.queryByRole('textbox', { name: forbiddenField })).not.toBeInTheDocument()
    }
  })

  it('按人员与工序筛选既有安排，并支持定位单一排班任务', () => {
    const { unmount } = render(<WorkAssignmentsPage />)

    fireEvent.keyDown(screen.getByRole('combobox', { name: '筛选兼职人员' }), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('option', { name: '小李' }), { key: 'Enter' })

    const table = screen.getByRole('table', { name: '工作安排列表' })
    expect(within(table).queryByText('小王')).not.toBeInTheDocument()
    expect(within(table).getByText('小李')).toBeVisible()
    expect(screen.getByText('共 1 项安排')).toBeVisible()

    unmount()
    render(<WorkAssignmentsPage focusedTaskId="task-1" />)
    expect(screen.getByText('共 1 项安排')).toBeVisible()
    expect(
      screen.getByText(
        '已定位到当前排班任务，仅展示这项任务所在的工作安排；新增排班请回到人员周历日期格。'
      )
    ).toBeVisible()
  })

  it('详情只读展示安排字段与核算摘要，不提供实际完成或质检录入', () => {
    render(<WorkAssignmentsPage />)

    const table = screen.getByRole('table', { name: '工作安排列表' })
    const timedRow = within(table)
      .getByText('510 分钟 · 核算日期 2026-09-12')
      .closest('tr') as HTMLElement
    fireEvent.click(within(timedRow).getByRole('button', { name: '查看详情' }))

    expect(screen.getByText('工作安排详情')).toBeVisible()
    const details = screen.getByRole('region', { name: '工作安排详情' })
    expect(within(details).getByText('计时班次')).toBeVisible()
    expect(within(details).getByText('已核算（510 分钟）')).toBeVisible()

    // 计时核算明细只读可查，商品与数量来自核算而非排班任务
    const items = screen.getByRole('table', { name: '核算商品明细' })
    expect(within(items).getByText('草莓捏捏')).toBeVisible()
    expect(within(items).getByText('20 件')).toBeVisible()

    for (const forbiddenField of ['完成数量', '实际分钟', '合格数量', '不合格数量']) {
      expect(screen.queryByRole('textbox', { name: forbiddenField })).not.toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('button', { name: '返回工作安排列表' }))
    expect(screen.getByRole('table', { name: '工作安排列表' })).toBeVisible()
  })

  it('制作详情显示当前有效核算摘要，并保留待处理制作任务的转派入口', () => {
    render(<WorkAssignmentsPage />)

    const table = screen.getByRole('table', { name: '工作安排列表' })
    const reviewedRow = within(table)
      .getByText('1 项制作任务 · 1 项已核算')
      .closest('tr') as HTMLElement
    fireEvent.click(within(reviewedRow).getByRole('button', { name: '查看详情' }))

    const taskTable = screen.getByRole('table', { name: '制作任务与核算摘要' })
    expect(within(taskTable).getByText('草莓捏捏')).toBeVisible()
    expect(within(taskTable).getByText('合格 7 件 · 不合格 1 件')).toBeVisible()
    expect(within(taskTable).getByText('实际产出 8 件 · 核算日期 2026-09-11')).toBeVisible()
    expect(within(taskTable).queryByRole('button', { name: /转派/ })).not.toBeInTheDocument()
  })

  it('待处理制作任务可转派，提交转派原因与生效日期', async () => {
    mocks.reassignProcessTask.mockResolvedValue(undefined)
    render(<WorkAssignmentsPage />)

    const table = screen.getByRole('table', { name: '工作安排列表' })
    const pendingRow = within(table).getByText('待核算').closest('tr') as HTMLElement
    fireEvent.click(within(pendingRow).getByRole('button', { name: '查看详情' }))

    fireEvent.click(screen.getByRole('button', { name: '转派草莓捏捏' }))
    const dialog = screen.getByRole('dialog', { name: '转派制作任务' })
    expect(within(dialog).getByText('原负责人')).toBeVisible()

    fireEvent.click(within(dialog).getByRole('button', { name: '确认转派' }))
    expect(await within(dialog).findByText('请选择新的负责人')).toBeVisible()
    expect(mocks.reassignProcessTask).not.toHaveBeenCalled()

    fireEvent.keyDown(within(dialog).getByRole('combobox', { name: '新负责人' }), {
      key: 'ArrowDown'
    })
    fireEvent.keyDown(screen.getByRole('option', { name: '小李' }), { key: 'Enter' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '调整原因' }), {
      target: { value: '原负责人临时请假' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '确认转派' }))

    await waitFor(() =>
      expect(mocks.reassignProcessTask).toHaveBeenCalledWith('task-1', {
        workerId: 'worker-li',
        effectiveOn: today(),
        reason: '原负责人临时请假'
      })
    )
  })

  it('缺勤与取消通过状态更新完成，已有有效核算时展示主进程拒绝原因', async () => {
    mocks.setWorkAssignmentStatus.mockRejectedValue(
      new Error('该排班已有有效核算，不能通过状态更新撤销；请先在待核算中作废核算')
    )
    render(<WorkAssignmentsPage />)

    const table = screen.getByRole('table', { name: '工作安排列表' })
    const pendingRow = within(table).getByText('待核算').closest('tr') as HTMLElement
    fireEvent.click(within(pendingRow).getByRole('button', { name: '查看详情' }))

    fireEvent.click(screen.getByRole('button', { name: '取消安排' }))
    const dialog = screen.getByRole('dialog', { name: '取消这项安排？' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '原因（可选）' }), {
      target: { value: '订单取消' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '确认取消安排' }))

    const notification = await screen.findByRole('alert', { hidden: true })
    expect(notification).toHaveTextContent(
      '该排班已有有效核算，不能通过状态更新撤销；请先在待核算中作废核算'
    )
    expect(mocks.setWorkAssignmentStatus).toHaveBeenCalledWith('assignment-1', {
      status: 'cancelled',
      reason: '订单取消'
    })

    mocks.setWorkAssignmentStatus.mockResolvedValue(undefined)
    fireEvent.click(within(dialog).getByRole('button', { name: '确认取消安排' }))
    await waitFor(() =>
      expect(mocks.setWorkAssignmentStatus).toHaveBeenLastCalledWith('assignment-1', {
        status: 'cancelled',
        reason: '订单取消'
      })
    )
  })
})
