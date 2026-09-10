import type { ReportService } from '@main/services/report-service'
import type {
  V2CapacityRiskReportInput,
  V2DeliveryRiskReportInput,
  V2OrderDocumentsExportInput,
  V2OrderTableExportInput,
  V2ReportExportInput,
  V2ReportExportResult,
  V2ShippingListExportInput
} from '@shared/contracts/reports'

export interface ReportIpcMain {
  handle(channel: string, handler: (...args: unknown[]) => unknown): void
}

/** 由组合根注入的文件保存边界，报表 IPC 不直接依赖 Electron 对话框或文件系统。 */
export interface V2ReportFileExporter {
  exportCurrentReport(input: V2ReportExportInput): Promise<V2ReportExportResult>
  exportOrderTable(input?: V2OrderTableExportInput): Promise<V2ReportExportResult>
  exportOrderDocuments(input: V2OrderDocumentsExportInput): Promise<V2ReportExportResult>
  exportShippingList(input?: V2ShippingListExportInput): Promise<V2ReportExportResult>
}

/** 报表 IPC 只读取或导出 V2 已确认事实，页面不具备修改底层经营数据的能力。 */
export function registerReportIpc(
  ipc: ReportIpcMain,
  service: ReportService,
  exporter: V2ReportFileExporter
): void {
  ipc.handle('v2:reports:customers:insights:list', () => service.listCustomerOrderInsights())
  ipc.handle('v2:reports:customers:insights:get', (_event, customerId) =>
    service.getCustomerOrderInsights(customerId as string)
  )
  ipc.handle('v2:reports:orders:business', () => service.getOrderBusiness())
  ipc.handle('v2:reports:fulfillment:progress', () => service.getFulfillmentProgress())
  ipc.handle('v2:reports:capacity-risk:get', (_event, input) =>
    service.getCapacityRiskReport(input as V2CapacityRiskReportInput)
  )
  ipc.handle('v2:reports:delivery-risk:get', (_event, input) =>
    service.getDeliveryRiskReport(input as V2DeliveryRiskReportInput)
  )
  ipc.handle('v2:reports:settlements:confirmed', () => service.listConfirmedSettlements())
  ipc.handle('v2:reports:monthly-operation:get', (_event, month) => service.getMonthlyOperation(month as string))
  ipc.handle('v2:reports:export', (_event, input) => exporter.exportCurrentReport(input as V2ReportExportInput))
  ipc.handle('v2:reports:export:order-table', (_event, input) => exporter.exportOrderTable(input as V2OrderTableExportInput | undefined))
  ipc.handle('v2:reports:export:order-documents', (_event, input) => exporter.exportOrderDocuments(input as V2OrderDocumentsExportInput))
  ipc.handle('v2:reports:export:shipping-list', (_event, input) => exporter.exportShippingList(input as V2ShippingListExportInput | undefined))
}
