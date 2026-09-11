/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import {
  cleanup,
  fireEvent,
  render as renderBase,
  screen,
  within
} from '@testing-library/react'
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
  state: { loading: false }
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
    exportMessage: null,
    exportOrderTable: mocks.exportOrderTable,
    exportShippingList: mocks.exportShippingList,
    exporting: false,
    fulfillmentProgress: { rows: [], totalConfirmedQuantity: 0, totalShippedQuantity: 0 },
    load: mocks.load,
    loadError: null,
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
})

describe('经营报表加载反馈', () => {
  it('首次加载时显示统一的具名加载状态，而不是提前呈现空报表', () => {
    mocks.state.loading = true

    render(<ReportsPage />)

    expect(screen.getByRole('heading', { name: '经营报表' })).toBeVisible()
    expect(screen.getByText('经营报表加载中')).toBeVisible()
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
    expect(within(pageHeader!).queryByRole('button', { name: '导出订单表' })).not.toBeInTheDocument()
    expect(within(pageHeader!).queryByRole('button', { name: '导出发货汇总' })).not.toBeInTheDocument()

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
