/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render as renderBase, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YumiNotificationProvider } from '../../components/ui'
const render = (ui: Parameters<typeof renderBase>[0]) =>
  renderBase(<YumiNotificationProvider>{ui}</YumiNotificationProvider>)
import { installDomInteractionPolyfills } from '../../test/dom'
import type { V2WorkbenchFirstUseGuide } from '@shared/contracts/index'
import { WorkbenchPage } from '.'

const mocks = vi.hoisted(() => ({
  reload: vi.fn(),
  state: {
    loading: false,
    loadError: null as string | null,
    snapshot: {
      generatedOn: '2026-09-08',
      firstUseGuide: null as V2WorkbenchFirstUseGuide | null,
      decisionItems: [
        {
          id: 'making-review:task-1',
          kind: 'work_time_review' as const,
          bucket: 'decision' as const,
          priority: 'high' as const,
          subject: { title: '核算制作产出', description: '制作 · 排班 2026-09-08' },
          quantityOrAmount: { kind: 'quantity' as const, value: 8, unit: '件' },
          dueHint: '排班日期 2026-09-08',
          navigationTarget: {
            view: 'fulfillment' as const,
            processTaskId: 'task-1',
            workAssignmentId: 'assignment-1',
            focus: 'reviews' as const
          }
        }
      ],
      advanceItems: [
        {
          id: 'shipment:item-1',
          kind: 'shipment' as const,
          bucket: 'advance' as const,
          priority: 'urgent' as const,
          subject: { title: '登记发货', description: 'YD-001 · 草莓团子' },
          quantityOrAmount: { kind: 'quantity' as const, value: 3, unit: '件' },
          dueHint: '预计发货 2026-09-10',
          navigationTarget: {
            view: 'fulfillment' as const,
            orderItemId: 'item-1',
            focus: 'shipment' as const
          }
        }
      ]
    }
  }
}))

vi.mock('../../composables/use-workbench', () => ({
  useWorkbench: () => ({ ...mocks.state, reload: mocks.reload })
}))

installDomInteractionPolyfills()
afterEach(() => {
  cleanup()
  mocks.reload.mockReset()
  mocks.state.snapshot.firstUseGuide = null
})

describe('P3 · 工作台 Pattern 根契约（任务 10.1）', () => {
  it('工作台由唯一 dashboard-overview 标准根承接，指标带之后是事项详情区', () => {
    render(<WorkbenchPage onNavigate={vi.fn()} />)

    expect(screen.getByRole('region', { name: '工作台概览' })).toBeVisible()
    const roots = document.querySelectorAll('[data-page-pattern]')
    expect(roots).toHaveLength(1)
    const root = roots[0] as HTMLElement
    expect(root).toHaveAttribute('data-page-pattern', 'dashboard-overview')
    expect(root).toHaveAttribute('data-density', 'standard')
    expect(root).toHaveClass('yumi-page')

    const metrics = within(root).getByRole('region', { name: '工作台概览' })
    const details = root.querySelector('.yumi-dashboard-overview__details')
    expect(details).not.toBeNull()
    expect(
      metrics.compareDocumentPosition(details!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      within(details as HTMLElement).getByRole('navigation', { name: '工作台事项视图' })
    ).toBeVisible()
    expect(
      within(details as HTMLElement).getByRole('region', { name: '订单履约阶段分布' })
    ).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: /可以推进/ }))
    expect(screen.getByRole('table', { name: '工作台事项列表' })).toBeVisible()
    expect(document.querySelectorAll('[data-page-pattern]')).toHaveLength(1)
    expect(
      (document.querySelector('[data-page-pattern]') as HTMLElement).getAttribute(
        'data-page-pattern'
      )
    ).toBe('dashboard-overview')
  })

  it('首用引导与读取中不渲染指标带，模式根始终保持唯一', () => {
    mocks.state.snapshot.firstUseGuide = {
      title: '先建立客户',
      description: '订单需要关联客户资料，先建立首个客户后再继续。',
      actionLabel: '建立客户',
      navigationTarget: { view: 'customers' }
    }
    render(<WorkbenchPage onNavigate={vi.fn()} />)

    expect(screen.getByText('先建立客户')).toBeVisible()
    expect(screen.queryByRole('region', { name: '工作台概览' })).not.toBeInTheDocument()
    expect(document.querySelectorAll('[data-page-pattern]')).toHaveLength(1)
  })
})

describe('负责人工作台页面', () => {
  it('在两个互斥视图中只呈现一个主任务列表，并将事项交给真实处理区', () => {
    const onNavigate = vi.fn()
    render(<WorkbenchPage onNavigate={onNavigate} />)

    expect(screen.getByRole('region', { name: '工作台概览' })).toBeVisible()
    expect(screen.getByRole('button', { name: '总览' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('region', { name: '订单履约阶段分布' })).toBeVisible()
    expect(screen.getByRole('region', { name: '当前事项结构' })).toBeVisible()
    expect(screen.getByRole('region', { name: '现在优先处理' })).toBeVisible()
    expect(screen.getByRole('region', { name: '事项分布' })).toBeVisible()
    expect(screen.getByText('核算制作产出')).toBeVisible()
    expect(screen.getByText('登记发货')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: /可以推进/ }))
    expect(screen.getByRole('heading', { name: '可以推进' })).toBeVisible()
    expect(screen.getByRole('toolbar', { name: '工作台事项列表工具' })).toBeVisible()
    expect(screen.getByRole('table', { name: '工作台事项列表' })).toBeVisible()
    expect(screen.getByText('共 1 项待处理事项')).toBeVisible()
    expect(screen.getByText('登记发货')).toBeVisible()
    expect(screen.queryByText('核算制作产出')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '处理事项：登记发货' }))
    expect(onNavigate).toHaveBeenCalledWith({
      view: 'fulfillment',
      orderItemId: 'item-1',
      focus: 'shipment'
    })

    fireEvent.click(screen.getByRole('button', { name: /需要我决定/ }))
    fireEvent.click(screen.getByRole('button', { name: '处理事项：核算制作产出' }))
    expect(onNavigate).toHaveBeenCalledWith({
      view: 'fulfillment',
      processTaskId: 'task-1',
      workAssignmentId: 'assignment-1',
      focus: 'reviews'
    })
  })

  it('首用时只突出当前最先缺失的一个前置操作', () => {
    mocks.state.snapshot.firstUseGuide = {
      title: '先建立客户',
      description: '订单需要关联客户资料，先建立首个客户后再继续。',
      actionLabel: '建立客户',
      navigationTarget: { view: 'customers' }
    }
    const onNavigate = vi.fn()
    render(<WorkbenchPage onNavigate={onNavigate} />)

    expect(screen.getByText('先建立客户')).toBeVisible()
    expect(screen.queryByRole('button', { name: /需要我决定/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '建立客户' }))
    expect(onNavigate).toHaveBeenCalledWith({ view: 'customers' })
  })
})
