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
import { WorkAssignmentsPage } from './index'

const render = (ui: Parameters<typeof renderBase>[0]) =>
  renderBase(<YumiNotificationProvider>{ui}</YumiNotificationProvider>)

const mocks = vi.hoisted(() => ({
  confirmQualityInspection: vi.fn(),
  createWorkAssignment: vi.fn(),
  submitProcessResult: vi.fn()
}))

vi.mock('../../composables/use-work-assignments', () => ({
  useWorkAssignments: () => ({
    assignments: [
      {
        assignedOn: '2026-09-10',
        createdAt: '2026-09-10T09:00:00.000Z',
        id: 'assignment-1',
        note: null,
        processType: 'making',
        status: 'scheduled',
        tasks: [
          {
            createdAt: '2026-09-10T09:00:00.000Z',
            extraMinutes: 0,
            glueCostCents: null,
            materialPriceMicroYuanPerGram: null,
            hourlyWageCents: null,
            id: 'task-1',
            note: null,
            orderItemId: 'item-1',
            pieceRateCents: 1_250,
            plannedMinutes: 120,
            plannedQuantity: 8,
            processType: 'making',
            rateSnapshot: null,
            scheduledMinutes: 120,
            sourceType: 'normal_production',
            status: 'pending',
            updatedAt: '2026-09-10T09:00:00.000Z',
            workAssignmentId: 'assignment-1'
          }
        ],
        updatedAt: '2026-09-10T09:00:00.000Z',
        workerId: 'worker-wang'
      }
    ],
    confirmQualityInspection: mocks.confirmQualityInspection,
    createWorkAssignment: mocks.createWorkAssignment,
    loadError: null,
    loading: false,
    resultByTaskId: {},
    submitProcessResult: mocks.submitProcessResult,
    workers: [
      {
        createdAt: '2026-09-01T00:00:00.000Z',
        enabled: true,
        id: 'worker-wang',
        name: '小王',
        note: null,
        updatedAt: '2026-09-01T00:00:00.000Z'
      },
      {
        createdAt: '2026-09-01T00:00:00.000Z',
        enabled: true,
        id: 'worker-li',
        name: '小李',
        note: null,
        updatedAt: '2026-09-01T00:00:00.000Z'
      },
      {
        createdAt: '2026-09-01T00:00:00.000Z',
        enabled: false,
        id: 'worker-old',
        name: '已停用人员',
        note: null,
        updatedAt: '2026-09-01T00:00:00.000Z'
      }
    ]
  })
}))

installDomInteractionPolyfills()
afterEach(() => {
  cleanup()
  mocks.confirmQualityInspection.mockReset()
  mocks.createWorkAssignment.mockReset()
  mocks.submitProcessResult.mockReset()
})

describe('工作安排记录骨架', () => {
  it('默认只展示具名记录列表，点击记录后才在详情上下文显示任务提交入口', () => {
    render(
      <WorkAssignmentsPage
        onChanged={vi.fn()}
        order={
          {
            items: [{ id: 'item-1', productSnapshot: { name: '草莓捏捏' } }]
          } as never
        }
      />
    )

    expect(screen.getByRole('toolbar', { name: '工作安排列表工具' })).toBeVisible()
    expect(screen.getByText('共 1 项安排')).toBeVisible()
    expect(screen.getByRole('table', { name: '工作安排列表' })).toBeVisible()
    expect(screen.getByText(/草莓捏捏 · 计划 120 分钟/)).toBeVisible()
    expect(screen.queryByRole('dialog', { name: '工作安排详情' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '完成数量' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }))

    const assignmentDetail = screen.getByRole('dialog', { name: '工作安排详情' })
    expect(assignmentDetail).toBeVisible()
    expect(within(assignmentDetail).getByText(/计划 120 分钟/)).toBeVisible()
    expect(
      within(assignmentDetail).getByRole('note', { name: '制作任务冻结计件提成' })
    ).toHaveTextContent('¥12.50')
    expect(
      within(assignmentDetail).getByRole('note', { name: '制作任务冻结计件提成' })
    ).toHaveTextContent('后续商品改价不影响本任务结算')
    expect(within(assignmentDetail).getByRole('textbox', { name: '完成数量' })).toBeVisible()
  })

  it('新增工作安排按启用人员提供下拉并提交所选人员标识', async () => {
    mocks.createWorkAssignment.mockResolvedValue(undefined)
    render(
      <WorkAssignmentsPage
        onChanged={vi.fn()}
        order={
          {
            items: [{ id: 'item-1', productSnapshot: { name: '草莓捏捏' } }]
          } as never
        }
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '打开新建工作安排' }))
    const trigger = screen.getByRole('combobox', { name: '兼职人员' })
    expect(trigger).toBeVisible()

    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.queryByRole('option', { name: '已停用人员' })).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('option', { name: '小王' }), { key: 'Enter' })

    fireEvent.click(screen.getByRole('button', { name: '保存工作安排' }))
    await waitFor(() =>
      expect(mocks.createWorkAssignment).toHaveBeenCalledWith(
        expect.objectContaining({ workerId: 'worker-wang' })
      )
    )
  })

  it('未选择兼职人员时提交提示先选人员并保留草稿', async () => {
    render(
      <WorkAssignmentsPage
        onChanged={vi.fn()}
        order={
          {
            items: [{ id: 'item-1', productSnapshot: { name: '草莓捏捏' } }]
          } as never
        }
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '打开新建工作安排' }))
    fireEvent.click(screen.getByRole('button', { name: '保存工作安排' }))

    await waitFor(() =>
      expect(screen.getByRole('alert', { hidden: true })).toHaveTextContent('请选择兼职人员')
    )
    expect(mocks.createWorkAssignment).not.toHaveBeenCalled()
  })
})
