/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render as renderBase, screen, within } from '@testing-library/react'
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
            gluePriceMicroYuanPerGram: null,
            glueWeightMilligrams: null,
            hourlyWageCents: null,
            id: 'task-1',
            note: null,
            orderItemId: 'item-1',
            pieceRateCents: null,
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
    submitProcessResult: mocks.submitProcessResult
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
    expect(within(assignmentDetail).getByRole('textbox', { name: '完成数量' })).toBeVisible()
  })
})
