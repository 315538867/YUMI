import type { ReportService } from '@main/services/report-service'

export interface ReportIpcMain {
  handle(channel: string, handler: (...args: unknown[]) => unknown): void
}

/** 报表 IPC 只读 V2 已确认事实，页面不具备修改底层经营数据的能力。 */
export function registerReportIpc(ipc: ReportIpcMain, service: ReportService): void {
  ipc.handle('v2:reports:orders:business', () => service.getOrderBusiness())
  ipc.handle('v2:reports:fulfillment:progress', () => service.getFulfillmentProgress())
  ipc.handle('v2:reports:settlements:confirmed', () => service.listConfirmedSettlements())
  ipc.handle('v2:reports:monthly-operation:get', (_event, month) => service.getMonthlyOperation(month as string))
}
