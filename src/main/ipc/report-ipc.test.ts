import { describe, expect, it, vi } from 'vitest'
import { registerReportIpc } from './report-ipc'

describe('V2 报表 IPC', () => {
  it('仅暴露订单经营、履约进度、已确认工资和月度经营报表', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipc = { handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler) }
    const reports = {
      getOrderBusiness: vi.fn(() => ({ rows: [] })),
      getFulfillmentProgress: vi.fn(() => ({ rows: [] })),
      listConfirmedSettlements: vi.fn(() => ({ rows: [] })),
      getMonthlyOperation: vi.fn(() => ({ month: '2026-09' }))
    }

    registerReportIpc(ipc, reports as never)

    expect([...handlers.keys()]).toEqual([
      'v2:reports:orders:business',
      'v2:reports:fulfillment:progress',
      'v2:reports:settlements:confirmed',
      'v2:reports:monthly-operation:get'
    ])
    await handlers.get('v2:reports:monthly-operation:get')!(undefined, '2026-09')
    expect(reports.getMonthlyOperation).toHaveBeenCalledWith('2026-09')
  })
})
