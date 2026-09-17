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
import type {
  V2AdvancePayer,
  V2FinanceCategory,
  V2FinancialEntry,
  V2PendingReimbursement
} from '@shared/contracts/index'
const render = (ui: Parameters<typeof renderBase>[0]) =>
  renderBase(<YumiNotificationProvider>{ui}</YumiNotificationProvider>)
import { installDomInteractionPolyfills } from '../../test/dom'
import { today } from '../../composables/v2-utils'
import { FinancePage } from './index'

const mocks = vi.hoisted(() => ({
  loadMonthlyOverview: vi.fn(),
  reimburseBatch: vi.fn(),
  state: {
    categories: [] as V2FinanceCategory[],
    advancePayers: [] as V2AdvancePayer[],
    entries: [] as V2FinancialEntry[],
    pendingReimbursements: [] as V2PendingReimbursement[],
    monthlySummary: {
      incomeCents: 50_000,
      operatingExpenseCents: 20_000,
      operatingResultCents: 30_000
    },
    loading: false,
    loadError: null,
    createManualIncome: vi.fn(),
    createManualExpense: vi.fn()
  }
}))

vi.mock('../../composables/use-finance', () => ({
  useFinance: () => ({
    ...mocks.state,
    loadMonthlyOverview: mocks.loadMonthlyOverview,
    reimburseBatch: mocks.reimburseBatch
  })
}))

installDomInteractionPolyfills()
afterEach(() => {
  cleanup()
  mocks.loadMonthlyOverview.mockReset().mockResolvedValue(undefined)
  mocks.reimburseBatch.mockReset().mockResolvedValue({ entries: [], totalAmountCents: 30_000 })
  mocks.state.entries = []
  mocks.state.pendingReimbursements = []
  mocks.state.loading = false
  mocks.state.monthlySummary = {
    incomeCents: 50_000,
    operatingExpenseCents: 20_000,
    operatingResultCents: 30_000
  }
})

describe('P3 · 财务 Pattern 根契约（任务 10.1）', () => {
  it('经营结果视图由唯一 dashboard-overview 标准根承接，指标带先于详情区', async () => {
    render(<FinancePage />)

    await screen.findByRole('navigation', { name: '财务工作视图' })
    const roots = document.querySelectorAll('[data-page-pattern]')
    expect(roots).toHaveLength(1)
    const root = roots[0] as HTMLElement
    expect(root).toHaveAttribute('data-page-pattern', 'dashboard-overview')
    expect(root).toHaveAttribute('data-density', 'standard')
    expect(root).toHaveClass('yumi-page')

    const metrics = within(root).getByRole('region', { name: '本月经营结果指标' })
    const details = root.querySelector('.yumi-dashboard-overview__details')
    expect(details).not.toBeNull()
    expect(
      metrics.compareDocumentPosition(details!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(within(root).getByRole('button', { name: '登记收支' })).toBeVisible()
  })

  it('现金流水视图切换为唯一 list-page 紧凑根，列表表面承接具名记录表', async () => {
    render(<FinancePage />)

    await screen.findByRole('navigation', { name: '财务工作视图' })
    fireEvent.click(screen.getByRole('button', { name: '现金流水' }))
    await screen.findByRole('table', { name: '现金流水列表' })

    expect(document.querySelectorAll('[data-page-pattern]')).toHaveLength(1)
    const root = document.querySelector('[data-page-pattern]') as HTMLElement
    expect(root).toHaveAttribute('data-page-pattern', 'list-page')
    expect(root).toHaveAttribute('data-density', 'compact')
    expect(root).toHaveClass('yumi-page')
    expect(root.querySelector('.yumi-list-surface')).not.toBeNull()
    expect(within(root).getByRole('toolbar', { name: '现金流水列表工具' })).toBeVisible()
    expect(within(root).getByRole('table', { name: '现金流水列表' })).toBeVisible()
    expect(within(root).getByRole('heading', { name: '财务' })).toBeVisible()
  })

  it('待报销视图切换为唯一 review-workspace 紧凑根，统一队列承载选择与批量报销', async () => {
    mocks.state.pendingReimbursements = [
      {
        financialEntryId: 'advance-1',
        amountCents: 10_000,
        occurredOn: '2026-09-02',
        categoryId: 'expense-1',
        categoryName: '包装材料',
        advancePayerId: 'payer-1',
        advancePayerName: '小林',
        note: '第一笔'
      }
    ]
    render(<FinancePage />)

    await screen.findByRole('navigation', { name: '财务工作视图' })
    fireEvent.click(screen.getByRole('button', { name: '待报销' }))
    await screen.findByRole('table', { name: '待报销列表' })

    expect(document.querySelectorAll('[data-page-pattern]')).toHaveLength(1)
    const root = document.querySelector('[data-page-pattern]') as HTMLElement
    expect(root).toHaveAttribute('data-page-pattern', 'review-workspace')
    expect(root).toHaveAttribute('data-density', 'compact')
    expect(root).toHaveClass('yumi-page')
    const queue = root.querySelector('.yumi-review-workspace__queue')
    expect(queue).not.toBeNull()
    expect(
      within(queue as HTMLElement).getByRole('toolbar', { name: '待报销列表工具' })
    ).toBeVisible()
    expect(within(queue as HTMLElement).getByRole('table', { name: '待报销列表' })).toBeVisible()
  })
})

describe('财务负责人工作区', () => {
  it('每个 Pattern 根都自载页面头与动作区，工作视图 Tab 随内容区渲染', async () => {
    render(<FinancePage />)

    const overview = screen.getByRole('region', { name: '本月经营结果指标' })
    const root = document.querySelector('[data-page-pattern]') as HTMLElement
    const header = within(root).getByRole('heading', { level: 1, name: '财务' }).closest('header')
    const tabs = within(root).getByRole('navigation', { name: '财务工作视图' })

    expect(header).not.toBeNull()
    expect(header!.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(tabs.compareDocumentPosition(overview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(header!).getByRole('group', { name: '财务页面动作' })).toBeVisible()
  })

  it('切换工作视图后重挂载唯一 Pattern 根，财务页头动作组随各根重建', async () => {
    render(<FinancePage />)

    await screen.findByRole('navigation', { name: '财务工作视图' })
    fireEvent.click(screen.getByRole('button', { name: '现金流水' }))
    await screen.findByRole('table', { name: '现金流水列表' })

    expect(document.querySelectorAll('[data-page-pattern]')).toHaveLength(1)
    const root = document.querySelector('[data-page-pattern]') as HTMLElement
    expect(root).toHaveAttribute('data-page-pattern', 'list-page')
    const header = within(root).getByRole('heading', { level: 1, name: '财务' }).closest('header')
    expect(within(header!).getByRole('group', { name: '财务页面动作' })).toBeVisible()
    expect(
      header!.compareDocumentPosition(root.querySelector('.yumi-list-surface')!) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(within(root).getByRole('button', { name: '现金流水' })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('经营结果只呈现经营收入和支出，报销付款不重复计入经营支出', async () => {
    render(<FinancePage />)

    expect(await screen.findByText('实际收入')).toBeVisible()
    expect(screen.getByText('实际收入').parentElement).toHaveTextContent('¥500.00')
    expect(screen.getByText('经营支出').parentElement).toHaveTextContent('¥200.00')
    expect(screen.getByText('经营结果').parentElement).toHaveTextContent('¥300.00')
    expect(screen.getByText(/报销付款只进入现金流水，不重复计入经营费用/)).toBeVisible()
  })

  it('现金流水以统一工具条和具名记录表展示，不将登记表单作为列表首屏', async () => {
    mocks.state.entries = [
      {
        id: 'entry-1',
        sourceType: 'manual_expense',
        direction: 'expense',
        businessType: '日常支出',
        amountCents: 12_340,
        occurredOn: '2026-09-08',
        paymentMethod: '微信',
        paymentSource: 'business_account',
        categoryId: 'category-1',
        categoryName: '包装材料',
        advancePayerId: null,
        advancePayerName: null,
        orderId: null,
        attachmentId: null,
        reversalOfEntryId: null,
        note: '补充材料',
        createdAt: '2026-09-08T10:00:00.000Z'
      }
    ]
    render(<FinancePage />)

    fireEvent.click(screen.getByRole('button', { name: '现金流水' }))
    const cashflowToolbar = await screen.findByRole('toolbar', { name: '现金流水列表工具' })
    expect(cashflowToolbar).toBeVisible()
    expect(within(cashflowToolbar).queryByRole('button', { name: '刷新' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '刷新' })).toBeVisible()
    expect(screen.getByText('共 1 笔流水')).toBeVisible()
    expect(screen.getByRole('table', { name: '现金流水列表' })).toBeVisible()
    expect(screen.getByText('包装材料')).toBeVisible()
    expect(screen.queryByRole('dialog', { name: '登记日常收支' })).not.toBeInTheDocument()
  })

  it('无分类的订单收款流水显示中文业务类型标签，不暴露原始代码', async () => {
    mocks.state.entries = [
      {
        id: 'entry-fund-1',
        sourceType: 'order_fund',
        direction: 'income',
        businessType: 'payment',
        amountCents: 240_000,
        occurredOn: '2026-09-14',
        paymentMethod: '微信',
        paymentSource: null,
        categoryId: null,
        categoryName: null,
        advancePayerId: null,
        advancePayerName: null,
        orderId: 'order-1',
        attachmentId: null,
        reversalOfEntryId: null,
        note: '首款',
        createdAt: '2026-09-14T02:00:00.000Z'
      }
    ]
    render(<FinancePage />)

    fireEvent.click(screen.getByRole('button', { name: '现金流水' }))
    const table = await screen.findByRole('table', { name: '现金流水列表' })

    expect(within(table).getByText('收款')).toBeVisible()
    expect(within(table).queryByText('payment')).not.toBeInTheDocument()
    expect(within(table).getByText('收入 · 首款')).toBeVisible()
  })

  it('负责人可在同一待报销列表选择多笔后，以单次确认原子提交', async () => {
    mocks.state.pendingReimbursements = [
      {
        financialEntryId: 'advance-1',
        amountCents: 10_000,
        occurredOn: '2026-09-02',
        categoryId: 'expense-1',
        categoryName: '包装材料',
        advancePayerId: 'payer-1',
        advancePayerName: '小林',
        note: '第一笔'
      },
      {
        financialEntryId: 'advance-2',
        amountCents: 20_000,
        occurredOn: '2026-09-03',
        categoryId: 'expense-1',
        categoryName: '包装材料',
        advancePayerId: 'payer-1',
        advancePayerName: '小林',
        note: '第二笔'
      }
    ]
    render(<FinancePage />)

    fireEvent.click(screen.getByRole('button', { name: '待报销' }))
    const reimbursementToolbar = await screen.findByRole('toolbar', { name: '待报销列表工具' })
    expect(reimbursementToolbar).toBeVisible()
    expect(
      within(reimbursementToolbar).queryByRole('button', { name: '刷新' })
    ).not.toBeInTheDocument()
    expect(
      within(reimbursementToolbar).queryByRole('button', { name: /批量报销/ })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '刷新' })).toBeVisible()
    expect(screen.getByRole('button', { name: /批量报销/ })).toBeVisible()
    expect(screen.getByRole('table', { name: '待报销列表' })).toBeVisible()
    expect(screen.getByText('共 2 笔待报销')).toBeVisible()
    expect(screen.getByText(/第一笔/)).toBeVisible()
    for (const button of screen.getAllByRole('button', { name: '选择' })) fireEvent.click(button)
    fireEvent.click(screen.getByRole('button', { name: '批量报销（已选择 2 笔）' }))

    const sheet = screen.getByRole('dialog', { name: '确认批量报销' })
    expect(sheet).toHaveTextContent(
      '本次将报销 2 笔私人垫付，合计 ¥300.00。任一记录已被报销或无效时，本次不会产生部分报销。'
    )
    fireEvent.change(screen.getByRole('textbox', { name: '报销支付方式' }), {
      target: { value: '公账转账' }
    })
    fireEvent.click(screen.getByRole('button', { name: '确认批量报销' }))

    await waitFor(() =>
      expect(mocks.reimburseBatch).toHaveBeenCalledWith({
        advanceFinancialEntryIds: ['advance-1', 'advance-2'],
        reimbursedOn: today(),
        paymentMethod: '公账转账',
        note: null
      })
    )
  })
})

describe('P2 · 财务总览信息层级（任务 2）', () => {
  it('财务总览不重复当前 Tab 标题，并在无业务数据时使用内容区空态', async () => {
    mocks.state.monthlySummary = null
    const { container } = render(<FinancePage />)
    expect(await screen.findByRole('navigation', { name: '财务工作视图' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: '本月经营结果' })).not.toBeInTheDocument()
    expect(container.querySelector('[data-scenario="empty"]')).not.toBeNull()
  })

  it('财务总览读取中呈现内容区加载状态，不提前展示指标占位', () => {
    mocks.state.loading = true
    const { container } = render(<FinancePage />)

    expect(screen.getByRole('status', { name: '正在加载' })).toBeVisible()
    expect(screen.getByText(/请稍候/)).toBeVisible()
    expect(screen.queryByRole('region', { name: '本月经营结果指标' })).not.toBeInTheDocument()
    expect(container.querySelector('.yumi-metric-strip')).toBeNull()
  })

  it('财务页头、工作区 Tab 与内容区标题互不重复，筛选只位于列表工具条', () => {
    render(<FinancePage />)

    const headingTexts = [...document.querySelectorAll('h1, h2')]
      .map((node) => node.textContent?.trim())
      .filter(Boolean)
    const tabLabels = within(screen.getByRole('navigation', { name: '财务工作视图' }))
      .getAllByRole('button')
      .map((node) => node.textContent?.trim())
    expect(headingTexts.filter((text) => tabLabels.includes(text!))).toHaveLength(0)
    expect(new Set(headingTexts).size).toBe(headingTexts.length)
    expect(screen.getByRole('toolbar', { name: '经营结果筛选工具' })).toContainElement(
      screen.getByLabelText('统计月份')
    )
  })
})
