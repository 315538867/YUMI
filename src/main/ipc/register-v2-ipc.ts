import { ipcMain as electronIpcMain } from 'electron'
import type { V2BackupService } from '@main/services/v2-backup-service'
import type { V2BackupRestoreInput, V2BackupRestoreResult } from '@shared/contracts/index'
import type { V2OrderService } from '@main/services/v2-order-service'
import type { StudioSettingsService } from '@main/services/studio-settings-service'
import type { WorkbenchService } from '@main/services/workbench-service'
import type { FulfillmentService } from '@main/services/fulfillment-service'
import type { SettlementService } from '@main/services/settlement-service'
import type { FinanceService } from '@main/services/finance-service'
import type { AfterSalesService } from '@main/services/after-sales-service'
import type { ReportService } from '@main/services/report-service'
import { registerSettlementIpc } from './settlement-ipc'
import { registerFinanceIpc } from './finance-ipc'
import { registerAfterSalesIpc } from './after-sales-ipc'
import { registerReportIpc, type V2ReportFileExporter } from './report-ipc'

export interface V2IpcMain {
  handle(channel: string, handler: (...args: unknown[]) => unknown): void
}

export interface V2ReportIpcOptions {
  exporter: V2ReportFileExporter
}

export interface V2BackupIpcOptions {
  service: V2BackupService
  restore(input: V2BackupRestoreInput): Promise<V2BackupRestoreResult>
}

/**
 * V2 IPC 使用独立 `v2:` 命名空间，禁止覆盖或复用 V1 的处理器。
 * 该函数允许注入轻量 IPC 实例，便于在不启动 Electron 的情况下验证能力边界。
 */
export function registerV2Ipc(
  service: V2OrderService,
  studioSettings: StudioSettingsService,
  workbench: WorkbenchService,
  fulfillment: FulfillmentService,
  settlement: SettlementService,
  finance: FinanceService,
  afterSales: AfterSalesService,
  reports: ReportService,
  reportOptions: V2ReportIpcOptions,
  backup: V2BackupIpcOptions,
  ipc: V2IpcMain = electronIpcMain
): void {
  ipc.handle('v2:health', () => ({ version: '2.0.0', databaseReady: true }))
  ipc.handle('v2:workbench:get', () => workbench.getSnapshot())

  ipc.handle('v2:customers:list', (_event, query) => service.listCustomers(query as never))
  ipc.handle('v2:customers:create', (_event, input) => service.createCustomer(input as never))
  ipc.handle('v2:customers:update', (_event, input) => service.updateCustomer(input as never))

  ipc.handle('v2:studio-settings:get', () => studioSettings.get())
  ipc.handle('v2:studio-settings:update', (_event, input) => studioSettings.update(input as never))

  ipc.handle('v2:products:list', (_event, includeDisabled) => service.listProducts(Boolean(includeDisabled)))
  ipc.handle('v2:products:create', (_event, input) => service.createProduct(input as never))
  ipc.handle('v2:products:update', (_event, input) => service.updateProduct(input as never))

  ipc.handle('v2:orders:list', () => service.listOrders())
  ipc.handle('v2:orders:get', (_event, orderId) => service.getOrder(orderId as string))
  ipc.handle('v2:orders:create', (_event, input) => service.createOrder(input as never))
  ipc.handle('v2:orders:change-content', (_event, orderId, input) =>
    service.changeOrderContent(orderId as string, input as never)
  )
  ipc.handle('v2:orders:content-changes:list', (_event, orderId) =>
    service.listContentChanges(orderId as string)
  )
  ipc.handle('v2:orders:funds:list', (_event, orderId) => service.listOrderFunds(orderId as string))
  ipc.handle('v2:orders:record-fund', (_event, orderId, input) =>
    service.recordOrderFund(orderId as string, input as never)
  )
  ipc.handle('v2:orders:correct-fund', (_event, orderId, input) =>
    service.correctOrderFund(orderId as string, input as never)
  )
  ipc.handle('v2:orders:shipments:list', (_event, orderId) => service.listShipments(orderId as string))
  ipc.handle('v2:orders:shipments:create', (_event, orderId, input) =>
    service.createShipment(orderId as string, input as never)
  )

  ipc.handle('v2:fulfillment:assignments:create', (_event, input) => fulfillment.createWorkAssignment(input as never))
  ipc.handle('v2:fulfillment:assignments:get', (_event, assignmentId) => fulfillment.getWorkAssignment(assignmentId as string))
  ipc.handle('v2:fulfillment:assignments:list', (_event, query) => fulfillment.listWorkAssignments(query as never))
  ipc.handle('v2:fulfillment:tasks:result:get', (_event, taskId) => fulfillment.getProcessResultForTask(taskId as string))
  ipc.handle('v2:fulfillment:results:submit', (_event, taskId, input) =>
    fulfillment.submitProcessResult(taskId as string, input as never)
  )
  ipc.handle('v2:fulfillment:inspections:confirm', (_event, resultId, input) =>
    fulfillment.confirmQualityInspection(resultId as string, input as never)
  )
  ipc.handle('v2:fulfillment:opening-wip:record', (_event, input) => fulfillment.recordOpeningWip(input as never))
  ipc.handle('v2:fulfillment:adjustments:create', (_event, input) => fulfillment.adjustStageQuantity(input as never))
  ipc.handle('v2:fulfillment:order-item:get', (_event, orderItemId) => fulfillment.getOrderItemFulfillment(orderItemId as string))

  registerSettlementIpc(ipc, settlement)
  registerFinanceIpc(ipc, finance)
  registerAfterSalesIpc(ipc, afterSales)
  registerReportIpc(ipc, reports, reportOptions.exporter)

  ipc.handle('v2:backup:create', () => backup.service.createBackup())
  ipc.handle('v2:backup:list', () => backup.service.listBackups())
  ipc.handle('v2:backup:restore', (_event, input) => backup.restore(input as V2BackupRestoreInput))
}
