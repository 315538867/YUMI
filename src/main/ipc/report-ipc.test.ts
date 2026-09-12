import { describe, expect, it, vi } from 'vitest'
import { registerReportIpc } from './report-ipc'

describe('V2 报表 IPC', () => {
  it('暴露只读 V2 报表及其当前口径导出，并将导出委托给 V2 导出服务', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipc = {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
        handlers.set(channel, handler)
    }
    const exporter = {
      exportCurrentReport: vi.fn(async () => ({ savedPath: '/tmp/yumi-v2.xlsx' })),
      exportOrderTable: vi.fn(async () => ({ savedPath: '/tmp/订单表.xlsx' })),
      exportOrderDocuments: vi.fn(async () => ({ savedPath: '/tmp/订单与发货单.xlsx' })),
      exportShippingList: vi.fn(async () => ({ savedPath: '/tmp/发货清单.xlsx' }))
    }
    const reports = {
      listCustomerOrderInsights: vi.fn(() => []),
      getCustomerOrderInsights: vi.fn(() => null),
      getOrderBusiness: vi.fn(() => ({ rows: [] })),
      getOrderBusinessDetail: vi.fn(() => null),
      getShippingListPreview: vi.fn(() => ({ orderCode: 'YUMI-001', items: [] })),
      getFulfillmentProgress: vi.fn(() => ({ rows: [] })),
      getCapacityRiskReport: vi.fn(() => ({ rows: [] })),
      getDeliveryRiskReport: vi.fn(() => ({ rows: [] })),
      listConfirmedSettlements: vi.fn(() => ({ rows: [] })),
      getMonthlyOperation: vi.fn(() => ({ month: '2026-09' }))
    }

    registerReportIpc(ipc, reports as never, exporter as never)

    expect([...handlers.keys()]).toEqual([
      'v2:reports:customers:insights:list',
      'v2:reports:customers:insights:get',
      'v2:reports:orders:business',
      'v2:reports:orders:business:detail',
      'v2:reports:shipping-list:preview',
      'v2:reports:fulfillment:progress',
      'v2:reports:capacity-risk:get',
      'v2:reports:delivery-risk:get',
      'v2:reports:settlements:confirmed',
      'v2:reports:monthly-operation:get',
      'v2:reports:export',
      'v2:reports:export:order-table',
      'v2:reports:export:order-documents',
      'v2:reports:export:shipping-list'
    ])
    await handlers.get('v2:reports:orders:business:detail')!(undefined, 'order-1')
    expect(reports.getOrderBusinessDetail).toHaveBeenCalledWith('order-1')
    await handlers.get('v2:reports:customers:insights:get')!(undefined, 'customer-1')
    expect(reports.getCustomerOrderInsights).toHaveBeenCalledWith('customer-1')
    await handlers.get('v2:reports:shipping-list:preview')!(undefined, {
      orderId: 'order-1',
      shipmentId: 'shipment-1'
    })
    expect(reports.getShippingListPreview).toHaveBeenCalledWith({
      orderId: 'order-1',
      shipmentId: 'shipment-1'
    })
    await handlers.get('v2:reports:capacity-risk:get')!(undefined, {
      startOn: '2026-09-10',
      endOn: '2026-09-12'
    })
    expect(reports.getCapacityRiskReport).toHaveBeenCalledWith({
      startOn: '2026-09-10',
      endOn: '2026-09-12'
    })
    await handlers.get('v2:reports:delivery-risk:get')!(undefined, { asOf: '2026-09-09' })
    expect(reports.getDeliveryRiskReport).toHaveBeenCalledWith({ asOf: '2026-09-09' })
    await handlers.get('v2:reports:monthly-operation:get')!(undefined, '2026-09')
    expect(reports.getMonthlyOperation).toHaveBeenCalledWith('2026-09')
    await handlers.get('v2:reports:export')!(undefined, { month: '2026-09' })
    expect(exporter.exportCurrentReport).toHaveBeenCalledWith({ month: '2026-09' })
    await handlers.get('v2:reports:export:order-table')!(undefined, { orderId: 'order-1' })
    await handlers.get('v2:reports:export:order-documents')!(undefined, {
      orderId: 'order-1',
      shipmentId: 'shipment-1'
    })
    await handlers.get('v2:reports:export:shipping-list')!(undefined, {
      orderId: 'order-1',
      shipmentId: 'shipment-1'
    })
    expect(exporter.exportOrderTable).toHaveBeenCalledWith({ orderId: 'order-1' })
    expect(exporter.exportOrderDocuments).toHaveBeenCalledWith({
      orderId: 'order-1',
      shipmentId: 'shipment-1'
    })
    expect(exporter.exportShippingList).toHaveBeenCalledWith({
      orderId: 'order-1',
      shipmentId: 'shipment-1'
    })
  })
})
