/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render as renderBase, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YumiNotificationProvider } from '../../components/ui'
const render = (ui: Parameters<typeof renderBase>[0]) =>
  renderBase(<YumiNotificationProvider>{ui}</YumiNotificationProvider>)
import type { V2Customer, V2CustomerOrderInsights } from '@shared/contracts/index'
import { installDomInteractionPolyfills } from '../../test/dom'
import { CustomersPage } from './index'

const customerFixture: V2Customer = {
  id: 'customer-1',
  name: '木木工作室',
  contact: '王女士',
  defaultAddress: '上海市静安区',
  notes: null,
  enabled: true,
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z'
}

const insightsFixture: V2CustomerOrderInsights = {
  customerId: 'customer-1',
  customerName: '木木工作室',
  orderCount: 1,
  totalCurrentAmountCents: 12_800,
  totalNetReceivedCents: 8_000,
  totalOutstandingCents: 4_800,
  latestOrderDate: '2026-09-08',
  orders: [
    {
      orderId: 'order-1',
      orderCode: 'YUMI-001',
      createdAt: '2026-09-08T08:00:00.000Z',
      currentAmountCents: 12_800,
      netReceivedCents: 8_000,
      outstandingCents: 4_800,
      shipmentStatus: '未发货',
      orderStatus: '排班中'
    }
  ]
}

const mocks = vi.hoisted(() => ({
  customers: [] as V2Customer[],
  loading: false,
  loadError: null as string | null,
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  getCustomerOrderInsights: vi.fn()
}))

vi.mock('../../composables/use-customers', () => ({
  useCustomers: () => mocks
}))

installDomInteractionPolyfills()
afterEach(() => {
  cleanup()
  mocks.customers = []
  mocks.getCustomerOrderInsights.mockReset()
  mocks.getCustomerOrderInsights.mockResolvedValue(null)
})

describe('P3 · 客户 Pattern 根契约（任务 11.1）', () => {
  it('列表态只渲染一个 List Page 根，页头、工具条与记录区按模式层级呈现', () => {
    mocks.customers = [customerFixture]
    render(<CustomersPage />)

    const roots = document.querySelectorAll('[data-page-pattern]')
    expect(roots).toHaveLength(1)
    const root = roots[0] as HTMLElement
    expect(root).toHaveAttribute('data-page-pattern', 'list-page')
    expect(root).toHaveAttribute('data-density', 'compact')
    expect(within(root).getByRole('heading', { name: '客户' })).toBeVisible()
    expect(within(root).getByRole('toolbar', { name: '客户列表工具' })).toBeVisible()
    expect(within(root).getByRole('table', { name: '客户列表' })).toBeVisible()
    expect(document.querySelector('.yumi-page-header__actions')).not.toBeNull()
  })

  it('详情态独占 Detail Page 根，返回导航在页头、统计指标带先于详情区块', async () => {
    mocks.customers = [customerFixture]
    mocks.getCustomerOrderInsights.mockResolvedValue(insightsFixture)
    render(<CustomersPage />)

    fireEvent.click(screen.getByRole('button', { name: '查看客户资料：木木工作室' }))
    await screen.findByRole('table', { name: '客户历史订单' })

    const roots = document.querySelectorAll('[data-page-pattern]')
    expect(roots).toHaveLength(1)
    const root = roots[0] as HTMLElement
    expect(root).toHaveAttribute('data-page-pattern', 'detail-page')
    expect(root).toHaveAttribute('data-density', 'standard')
    expect(within(root).getByRole('navigation', { name: '客户详情导航' })).toBeVisible()
    expect(within(root).getByRole('button', { name: '返回客户列表' })).toBeVisible()

    const header = within(root).getByRole('heading', { name: '木木工作室' }).closest('header')
    const metrics = within(root).getByRole('region', { name: '客户订单统计指标' })
    const body = root.querySelector('.yumi-detail-page__body') as HTMLElement
    expect(metrics).toBeVisible()
    expect(within(metrics).getByText('订单数')).toBeVisible()
    expect(within(metrics).getByText('¥128.00')).toBeVisible()
    expect(header!.compareDocumentPosition(metrics) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(metrics.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(body).getByRole('table', { name: '客户历史订单' })).toBeVisible()
    expect(within(body).getByText('排班中 · 未发货')).toBeVisible()
  })

  it('列表/详情切换始终只有一个页面模式根，编辑与新建客户抽屉经 Portal 落在根外', async () => {
    mocks.customers = [customerFixture]
    mocks.getCustomerOrderInsights.mockResolvedValue(insightsFixture)
    render(<CustomersPage />)

    fireEvent.click(screen.getByRole('button', { name: '查看客户资料：木木工作室' }))
    await screen.findByRole('table', { name: '客户历史订单' })

    expect(document.querySelectorAll('[data-page-pattern]')).toHaveLength(1)
    const detailRoot = document.querySelector('[data-page-pattern]') as HTMLElement
    expect(detailRoot).toHaveAttribute('data-page-pattern', 'detail-page')

    fireEvent.click(screen.getByRole('button', { name: '编辑客户' }))
    const editDialog = await screen.findByRole('dialog', { name: '编辑客户：木木工作室' })
    expect(document.querySelectorAll('[data-page-pattern]')).toHaveLength(1)
    expect(detailRoot.contains(editDialog)).toBe(false)
    fireEvent.change(screen.getByLabelText('默认收货地址'), {
      target: { value: '上海市徐汇区' }
    })
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    const confirm = screen.getByRole('alertdialog', { name: '放弃未保存的修改？' })
    expect(detailRoot.contains(confirm)).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '放弃修改' }))
    expect(document.querySelectorAll('[data-page-pattern]')).toHaveLength(1)

    fireEvent.click(
      within(screen.getByRole('navigation', { name: '客户详情导航' })).getByRole('button', {
        name: '返回客户列表'
      })
    )
    expect(document.querySelectorAll('[data-page-pattern]')).toHaveLength(1)
    expect(document.querySelector('[data-page-pattern]')).toHaveAttribute(
      'data-page-pattern',
      'list-page'
    )

    fireEvent.click(screen.getByRole('button', { name: '新建客户' }))
    const createDialog = screen.getByRole('dialog', { name: '新建客户' })
    expect(document.querySelectorAll('[data-page-pattern]')).toHaveLength(1)
    expect(document.querySelector('[data-page-pattern]')!.contains(createDialog)).toBe(false)
  })
})
