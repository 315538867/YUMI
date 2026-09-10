/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installDomInteractionPolyfills } from '../../test/dom'
import { ReportsPage } from './index'

const mocks = vi.hoisted(() => ({
  exportCurrentReport: vi.fn(),
  exportOrderTable: vi.fn(),
  exportShippingList: vi.fn(),
  load: vi.fn()
}))

vi.mock('../../composables/use-reports', () => ({
  useReports: () => ({
    confirmedSettlements: { rows: [], totalFinalPaidCents: 0 },
    deliveryRisk: {
      rows: [{ orderId: 'order-1', orderCode: 'YUMI-001', expectedShipDate: '2026-09-09', productionDeadline: '2026-09-07', remainingQuantity: 10, shippedQuantity: 2, level: 'critical', riskSources: ['制作截止日已逾期'], fulfillmentRoute: { orderId: 'order-1' } }]
    },
    exportCurrentReport: mocks.exportCurrentReport,
    exportMessage: null,
    exportOrderTable: mocks.exportOrderTable,
    exportShippingList: mocks.exportShippingList,
    exporting: false,
    fulfillmentProgress: { rows: [], totalConfirmedQuantity: 0, totalShippedQuantity: 0 },
    load: mocks.load,
    loadError: null,
    loading: false,
    monthlyOperation: { month: '2026-09', incomeCents: 0, operatingExpenseCents: 0, operatingResultCents: 0, confirmedSettlementPaidCents: 0 },
    orderBusiness: { rows: [], totalCurrentAmountCents: 0, totalNetReceivedCents: 0, totalOutstandingCents: 0, totalProductCostCents: 0, totalAfterSalesCostCents: 0, totalKnownAccountingCostCents: 0, totalKnownMarginCents: 0 },
    capacityRisk: {
      rows: [{ productId: 'product-1', productName: '羊毛杯垫', startOn: '2026-09-09', endOn: '2026-09-15', demandQuantity: 100, scheduledQuantity: 20, dailyCapacity: 10, availableCapacityQuantity: 70, gapQuantity: 30, utilizationBasisPoints: 14_286, level: 'critical', riskSources: ['需求超过可用产能'], productRoute: { productId: 'product-1' } }]
    }
  })
}))

installDomInteractionPolyfills()
afterEach(() => {
  cleanup()
  mocks.load.mockReset()
})

describe('风险报表入口', () => {
  it('展示产能和交期风险，并将记录导航到商品资料或履约处理区', () => {
    const onNavigate = vi.fn()
    render(<ReportsPage onNavigate={onNavigate} />)

    expect(screen.getByRole('heading', { name: '商品产能风险' })).toBeVisible()
    expect(screen.getByText('羊毛杯垫')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '查看商品' }))
    expect(onNavigate).toHaveBeenLastCalledWith({ view: 'products', productId: 'product-1' })

    expect(screen.getByRole('heading', { name: '交期风险' })).toBeVisible()
    expect(screen.getByText('YUMI-001')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '进入履约处理' }))
    expect(onNavigate).toHaveBeenLastCalledWith({ view: 'fulfillment', orderId: 'order-1', focus: 'queue' })
  })
})
