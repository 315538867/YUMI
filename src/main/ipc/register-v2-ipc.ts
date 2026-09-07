import { ipcMain as electronIpcMain } from 'electron'
import type { V2BackupService } from '@main/services/v2-backup-service'
import type { V2BackupRestoreInput, V2BackupRestoreResult } from '@shared/contracts'
import type { V2OrderService } from '@main/services/v2-order-service'

export interface V2IpcMain {
  handle(channel: string, handler: (...args: unknown[]) => unknown): void
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
  backup: V2BackupIpcOptions,
  ipc: V2IpcMain = electronIpcMain
): void {
  ipc.handle('v2:health', () => ({ version: '2.0.0', databaseReady: true }))

  ipc.handle('v2:customers:list', (_event, query) => service.listCustomers(query as never))
  ipc.handle('v2:customers:create', (_event, input) => service.createCustomer(input as never))
  ipc.handle('v2:customers:update', (_event, input) => service.updateCustomer(input as never))

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

  ipc.handle('v2:backup:create', () => backup.service.createBackup())
  ipc.handle('v2:backup:list', () => backup.service.listBackups())
  ipc.handle('v2:backup:activity', () => backup.service.getActivity())
  ipc.handle('v2:backup:inspect', (_event, backupPath) => backup.service.inspectBackup(backupPath as string))
  ipc.handle('v2:backup:restore', (_event, input) => backup.restore(input as V2BackupRestoreInput))
}
