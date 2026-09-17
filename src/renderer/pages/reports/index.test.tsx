/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render as renderBase, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YumiNotificationProvider } from '../../components/ui'
const render = (ui: Parameters<typeof renderBase>[0]) =>
  renderBase(<YumiNotificationProvider>{ui}</YumiNotificationProvider>)
import { installDomInteractionPolyfills } from '../../test/dom'
import { ReportsPage } from './index'

const mocks = vi.hoisted(() => ({
  exportCurrentReport: vi.fn(),
  exportOrderTable: vi.fn(),
  exportShippingList: vi.fn(),
  load: vi.fn(),
  state: {
    loading: false,
    loadError: null as string | null,
    exportMessage: null as string | null
  }
}))

vi.mock('../../composables/use-reports', () => ({
  useReports: () => ({
    confirmedSettlements: { rows: [], totalFinalPaidCents: 0 },
    deliveryRisk: {
      rows: [
        {
          orderId: 'order-1',
          orderCode: 'YUMI-001',
          expectedShipDate: '2026-09-09',
          productionDeadline: '2026-09-07',
          remainingQuantity: 10,
          shippedQuantity: 2,
          level: 'critical',
          riskSources: ['制作截止日已逾期'],
          fulfillmentRoute: { orderId: 'order-1' }
        }
      ]
    },
    exportCurrentReport: mocks.exportCurrentReport,
    exportMessage: mocks.state.exportMessage,
    exportOrderTable: mocks.exportOrderTable,
    exportShippingList: mocks.exportShippingList,
    exporting: false,
    fulfillmentProgress: { rows: [], totalConfirmedQuantity: 0, totalShippedQuantity: 0 },
    load: mocks.load,
    loadError: mocks.state.loadError,
    loading: mocks.state.loading,
    monthlyOperation: {
      month: '2026-09',
      incomeCents: 0,
      operatingExpenseCents: 0,
      operatingResultCents: 0,
      confirmedSettlementPaidCents: 0
    },
    orderBusiness: {
      rows: [],
      totalCurrentAmountCents: 0,
      totalNetReceivedCents: 0,
      totalOutstandingCents: 0,
      totalProductCostCents: 0,
      totalAfterSalesCostCents: 0,
      totalKnownAccountingCostCents: 0,
      totalKnownMarginCents: 0
    },
    capacityRisk: {
      rows: [
        {
          productId: 'product-1',
          productName: '羊毛杯垫',
          startOn: '2026-09-09',
          endOn: '2026-09-15',
          demandQuantity: 100,
          scheduledQuantity: 20,
          dailyCapacity: 10,
          availableCapacityQuantity: 70,
          gapQuantity: 30,
          utilizationBasisPoints: 14_286,
          level: 'critical',
          riskSources: ['需求超过可用产能'],
          productRoute: { productId: 'product-1' }
        }
      ]
    }
  })
}))

installDomInteractionPolyfills()
afterEach(() => {
  cleanup()
  mocks.load.mockReset()
  mocks.state.loading = false
  mocks.state.loadError = null
  mocks.state.exportMessage = null
})

describe('经营报表页面级骨架', () => {
  it('以唯一 dashboard-overview 模式根呈现，页头/工具条/指标/洞察/明细按固定顺序', () => {
    const { container } = render(<ReportsPage />)

    const root = container.querySelector('[data-page-pattern]')
    expect(root).toHaveAttribute('data-page-pattern', 'dashboard-overview')
    expect(root).toHaveAttribute('data-density', 'standard')
    expect(container.querySelectorAll('[data-page-pattern]').length).toBe(1)

    const header = screen.getByRole('heading', { level: 1, name: '经营报表' }).closest('header')
    expect(header).not.toBeNull()
    expect(screen.getByText(/\d{4}-\d{2} 统计/)).toBeVisible()
    expect(
      screen.getByText(
        '只读取已确认的订单、排班、收付款和工资事实；风险记录只提供进入实际处理区的入口。'
      )
    ).toBeVisible()
    expect(within(header!).getByRole('group', { name: '经营报表页面动作' })).toBeVisible()

    const toolbarEl = container.querySelector<HTMLElement>('.yumi-dashboard-overview__toolbar')
    const metricsEl = container.querySelector('.yumi-metric-strip')
    const insightsEl = container.querySelector<HTMLElement>('.yumi-dashboard-overview__insights')
    const detailsEl = container.querySelector<HTMLElement>('.yumi-dashboard-overview__details')
    expect(toolbarEl).not.toBeNull()
    expect(metricsEl).not.toBeNull()
    expect(insightsEl).toBeNull()
    expect(detailsEl).not.toBeNull()

    const order = [header, toolbarEl, metricsEl, detailsEl]
    for (let index = 1; index < order.length; index += 1) {
      const relation = order[index - 1]!.compareDocumentPosition(order[index]!)
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('期间工具条承载统计月份选择与整页刷新，指标带呈现四项月度经营结果', () => {
    const { container } = render(<ReportsPage />)

    const toolbarEl = container.querySelector<HTMLElement>('.yumi-dashboard-overview__toolbar')
    expect(toolbarEl).not.toBeNull()
    expect(within(toolbarEl!).getByLabelText('统计月份')).toBeVisible()
    expect(within(toolbarEl!).getByRole('button', { name: '刷新' })).toBeVisible()

    const values = container.querySelectorAll('.yumi-metric-strip dd')
    expect(values).toHaveLength(4)
    const labels = [...container.querySelectorAll('.yumi-metric-strip dt')].map((node) =>
      node.textContent?.trim()
    )
    expect(labels).toEqual(['实际收入', '经营支出', '经营结果', '已确认工资'])
  })

  it('洞察区不再重复月度经营说明，明细区按固定顺序落五个区块', () => {
    const { container } = render(<ReportsPage />)

    expect(container.querySelector('.yumi-dashboard-overview__insights')).toBeNull()
    expect(screen.queryByRole('heading', { name: '月度经营' })).not.toBeInTheDocument()

    const detailsEl = container.querySelector<HTMLElement>('.yumi-dashboard-overview__details')
    const headings = [...detailsEl!.querySelectorAll('h2')].map((node) => node.textContent?.trim())
    expect(headings).toEqual(['商品产能风险', '交期风险', '订单核算', '排班进度', '已确认工资'])
  })
})

describe('经营报表加载反馈', () => {
  it('首次加载时显示统一的具名加载状态，且不提前呈现指标带与空报表', () => {
    mocks.state.loading = true
    const { container } = render(<ReportsPage />)

    expect(screen.getByRole('heading', { name: '经营报表' })).toBeVisible()
    expect(screen.getByText('经营报表加载中')).toBeVisible()
    expect(container.querySelector('.yumi-metric-strip')).toBeNull()
    expect(container.querySelector('.yumi-dashboard-overview__toolbar')).toBeNull()
    expect(screen.queryByRole('table', { name: '订单经营列表' })).not.toBeInTheDocument()
  })
})

describe('经营报表记录骨架', () => {
  it('将每类经营记录置于具名工具条和表格中，保留报表查看优先的边界', () => {
    render(<ReportsPage />)

    expect(screen.getByRole('toolbar', { name: '商品产能风险列表工具' })).toBeVisible()
    expect(screen.getByText('共 1 个商品')).toBeVisible()
    expect(screen.getByRole('table', { name: '商品产能风险列表' })).toBeVisible()

    expect(screen.getByRole('toolbar', { name: '订单经营列表工具' })).toBeVisible()
    expect(screen.getByText('共 0 笔订单')).toBeVisible()
    expect(screen.getByRole('table', { name: '订单经营列表' })).toBeVisible()

    expect(screen.getByRole('toolbar', { name: '排班进度列表工具' })).toBeVisible()
    expect(screen.getByText('共 0 条产品进度')).toBeVisible()
    expect(screen.getByRole('table', { name: '排班进度列表' })).toBeVisible()

    expect(screen.getByRole('toolbar', { name: '已确认工资列表工具' })).toBeVisible()
    expect(screen.getByText('共 0 笔结算')).toBeVisible()
    expect(screen.getByRole('table', { name: '已确认工资列表' })).toBeVisible()
  })
})

describe('风险报表入口', () => {
  it('展示产能和交期风险，并将记录导航到商品资料或履约处理区', async () => {
    const onNavigate = vi.fn()
    render(<ReportsPage onNavigate={onNavigate} />)

    const pageHeader = screen.getByRole('heading', { name: '经营报表' }).closest('header')
    expect(pageHeader).not.toBeNull()
    expect(within(pageHeader!).getByRole('button', { name: '导出当前报表' })).toBeVisible()
    expect(within(pageHeader!).getByRole('button', { name: '更多操作' })).toBeVisible()
    expect(
      within(pageHeader!).queryByRole('button', { name: '导出订单表' })
    ).not.toBeInTheDocument()
    expect(
      within(pageHeader!).queryByRole('button', { name: '导出发货汇总' })
    ).not.toBeInTheDocument()

    fireEvent.click(within(pageHeader!).getByRole('button', { name: '更多操作' }))
    const moreActions = await screen.findByRole('menu', { name: '经营报表更多操作' })
    expect(within(moreActions).getByRole('menuitem', { name: '导出订单表' })).toBeVisible()
    expect(within(moreActions).getByRole('menuitem', { name: '导出发货汇总' })).toBeVisible()

    expect(screen.getByRole('heading', { name: '商品产能风险' })).toBeVisible()
    expect(screen.getByRole('table', { name: '商品产能风险列表' })).toBeVisible()
    expect(screen.getByText('羊毛杯垫')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '查看商品' }))
    expect(onNavigate).toHaveBeenLastCalledWith({ view: 'products', productId: 'product-1' })

    fireEvent.click(within(moreActions).getByRole('menuitem', { name: '导出发货汇总' }))
    expect(mocks.exportShippingList).toHaveBeenCalledWith()

    expect(screen.getByRole('heading', { name: '交期风险' })).toBeVisible()
    expect(screen.getByRole('toolbar', { name: '交期风险列表工具' })).toBeVisible()
    expect(screen.getByText('共 1 条风险')).toBeVisible()
    expect(screen.getByRole('table', { name: '交期风险列表' })).toBeVisible()
    expect(screen.getByText('YUMI-001')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '进入排班处理' }))
    expect(onNavigate).toHaveBeenLastCalledWith({
      view: 'fulfillment',
      orderId: 'order-1',
      focus: 'queue'
    })
  })
})

describe('经营报表期间筛选与错误反馈', () => {
  it('切换统计月份后以新月份重新加载报表', async () => {
    render(<ReportsPage />)
    mocks.load.mockClear()

    fireEvent.click(screen.getByRole('button', { name: '统计月份' }))
    fireEvent.click(await screen.findByRole('button', { name: '六月' }))

    expect(mocks.load).toHaveBeenLastCalledWith(
      '2026-06',
      expect.objectContaining({
        capacity: expect.anything(),
        delivery: expect.anything()
      })
    )
  })

  it('加载失败经危险通知呈现，导出成功经成功通知呈现', () => {
    mocks.state.loadError = '报表加载失败，请稍后重试'
    const { unmount } = render(<ReportsPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('报表加载失败，请稍后重试')
    unmount()

    mocks.state.loadError = null
    mocks.state.exportMessage = '已导出当前报表'
    render(<ReportsPage />)
    const host = screen.getByLabelText('全局通知')
    expect(within(host).getByRole('status')).toHaveTextContent('已导出当前报表')
  })
})

describe('P2 · 经营报表信息层级与动作归属（任务 2）', () => {
  it('报表页面刷新紧邻统计月份，风险刷新只位于风险区工具栏', () => {
    render(<ReportsPage />)
    const period = screen.getByRole('toolbar', { name: '月度经营筛选工具' })
    expect(within(period).getByLabelText('统计月份')).toBeVisible()
    expect(within(period).getByRole('button', { name: '刷新' })).toBeVisible()
    expect(screen.getByRole('toolbar', { name: '商品产能风险列表工具' })).toContainElement(
      screen.getByRole('button', { name: '刷新风险' })
    )
  })

  it('经营报表页头与区块标题互不重复，区块风险刷新不在页面周期工具条内', () => {
    const { container } = render(<ReportsPage />)

    const headingTexts = [...container.querySelectorAll('h1, h2')]
      .map((node) => node.textContent?.trim())
      .filter(Boolean)
    expect(new Set(headingTexts).size).toBe(headingTexts.length)
    expect(screen.getByRole('heading', { level: 1, name: '经营报表' })).toBeVisible()
    expect(
      screen.getByRole('toolbar', { name: '月度经营筛选工具' })
    ).not.toContainElement(screen.getByRole('button', { name: '刷新风险' }))
  })
})
