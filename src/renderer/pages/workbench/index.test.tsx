/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render as renderBase, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YumiNotificationProvider } from '../../components/ui'
const render = (ui: Parameters<typeof renderBase>[0]) =>
  renderBase(<YumiNotificationProvider>{ui}</YumiNotificationProvider>)
import { installDomInteractionPolyfills } from '../../test/dom'
import { WorkbenchPage } from '.'

const mocks = vi.hoisted(() => ({
  reload: vi.fn(),
  state: {
    loading: false,
    loadError: null as string | null,
    snapshot: {
      generatedOn: '2026-09-08',
      firstUseGuide: null,
      decisionItems: [
        {
          id: 'quality-inspection:task-1',
          kind: 'quality_inspection' as const,
          bucket: 'decision' as const,
          priority: 'urgent' as const,
          subject: { title: '确认质检结果', description: '制作 · 排班 2026-09-08' },
          quantityOrAmount: { kind: 'quantity' as const, value: 8, unit: '件' },
          dueHint: '完成后待质检 · 2026-09-08',
          navigationTarget: {
            view: 'fulfillment' as const,
            processTaskId: 'task-1',
            focus: 'inspection' as const
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

describe('负责人工作台页面', () => {
  it('在两个互斥视图中只呈现一个主任务列表，并将事项交给真实处理区', () => {
    const onNavigate = vi.fn()
    render(<WorkbenchPage onNavigate={onNavigate} />)

    expect(screen.getByRole('region', { name: '工作台事项' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '需要我决定' })).toBeVisible()
    expect(screen.getByRole('toolbar', { name: '工作台事项列表工具' })).toBeVisible()
    expect(screen.getByRole('table', { name: '工作台事项列表' })).toBeVisible()
    expect(screen.getByText('共 1 项待处理事项')).toBeVisible()
    expect(screen.getByText('确认质检结果')).toBeVisible()
    expect(screen.queryByText('登记发货')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /可以推进/ }))
    expect(screen.getByText('登记发货')).toBeVisible()
    expect(screen.queryByText('确认质检结果')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '处理事项：登记发货' }))
    expect(onNavigate).toHaveBeenCalledWith({
      view: 'fulfillment',
      orderItemId: 'item-1',
      focus: 'shipment'
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
