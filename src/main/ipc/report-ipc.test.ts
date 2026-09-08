import { describe, expect, it, vi } from 'vitest'
import { registerReportIpc } from './report-ipc'

describe('V2 报表 IPC', () => {
  it('暴露只读 V2 报表及其当前口径导出，并将导出委托给 V2 导出服务', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipc = { handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler) }
    const exporter = { exportCurrentReport: vi.fn(async () => ({ savedPath: '/tmp/yumi-v2.xlsx' })) }
    const reports = {
      getOrderBusiness: vi.fn(() => ({ rows: [] })),
      getFulfillmentProgress: vi.fn(() => ({ rows: [] })),
      listConfirmedSettlements: vi.fn(() => ({ rows: [] })),
      getMonthlyOperation: vi.fn(() => ({ month: '2026-09' }))
    }

    registerReportIpc(ipc, reports as never, exporter as never)

    expect([...handlers.keys()]).toEqual([
      'v2:reports:orders:business',
      'v2:reports:fulfillment:progress',
      'v2:reports:settlements:confirmed',
      'v2:reports:monthly-operation:get',
      'v2:reports:export'
    ])
    await handlers.get('v2:reports:monthly-operation:get')!(undefined, '2026-09')
    expect(reports.getMonthlyOperation).toHaveBeenCalledWith('2026-09')
    await handlers.get('v2:reports:export')!(undefined, { month: '2026-09' })
    expect(exporter.exportCurrentReport).toHaveBeenCalledWith({ month: '2026-09' })
  })
})
