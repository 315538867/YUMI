import { BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFileSync } from 'node:fs'
import { DomainValidationError } from '@main/domain/errors'
import type { AttachmentService } from '@main/services/attachment-service'
import type { BackupService } from '@main/services/backup-service'
import { DemoDataService } from '@main/services/demo-data-service'
import type { StudioService } from '@main/services/studio-service'
import type { BackupRestoreInput, BackupRestoreResult } from '@shared/contracts'

interface BackupIpcOptions {
  service: BackupService
  restore(input: BackupRestoreInput): Promise<BackupRestoreResult>
}

export function registerIpc(
  service: StudioService,
  attachments: AttachmentService,
  backup: BackupIpcOptions
): void {
  const repository = service.repositoryApi
  ipcMain.handle('app:health', () => ({ version: '0.1.0', databaseReady: true }))
  ipcMain.handle('dashboard:get', () => repository.getDashboard())
  ipcMain.handle('demo:load', () => new DemoDataService(service, repository).load())
  ipcMain.handle('attachments:choose-and-import', async (event, kind) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(window ?? undefined, {
      title: kind === 'product_image' ? '选择商品图片' : '选择收款凭证',
      properties: ['openFile'],
      filters:
        kind === 'product_image'
          ? [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
          : [{ name: '凭证', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    return attachments.importFile(result.filePaths[0], kind)
  })
  ipcMain.handle('attachments:delete', (_event, id) => attachments.delete(id))
  ipcMain.handle('backup:create', () => backup.service.createBackup())
  ipcMain.handle('backup:list', () => backup.service.listBackups())
  ipcMain.handle('backup:activity', () => backup.service.getActivity())
  ipcMain.handle('backup:choose-restore-source', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(window ?? undefined, {
      title: '选择要恢复的 YUMI 备份文件夹',
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    return backup.service.inspectBackup(result.filePaths[0])
  })
  ipcMain.handle('backup:restore', async (event, input: BackupRestoreInput) => {
    if (!input.confirmed) throw new DomainValidationError('请先完成恢复操作的二次确认')
    const window = BrowserWindow.fromWebContents(event.sender)
    const confirmation = await dialog.showMessageBox(window ?? undefined, {
      type: 'warning',
      title: '确认覆盖当前数据',
      message: '恢复将覆盖当前的业务数据和附件',
      detail: '系统会先创建一份恢复前保护备份。恢复完成后应用将自动重启。',
      buttons: ['取消', '确认覆盖并恢复'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    if (confirmation.response !== 1) throw new DomainValidationError('已取消恢复操作')
    return backup.restore(input)
  })
  ipcMain.handle('products:list', () => repository.listProducts())
  ipcMain.handle('products:get', (_event, id) => repository.getProduct(id))
  ipcMain.handle('products:create', (_event, input) => service.createProduct(input))
  ipcMain.handle('products:update', (_event, input) => service.updateProduct(input))
  ipcMain.handle('products:preview-cost', (_event, input) => service.previewProductCost(input))
  ipcMain.handle('settings:cost:get', () => repository.getCostSettings())
  ipcMain.handle('settings:cost:update', (_event, input) => service.updateCostSettings(input))
  ipcMain.handle('settings:order-defaults:get', () => repository.getOrderDefaults())
  ipcMain.handle('settings:order-defaults:update', (_event, input) =>
    service.updateOrderDefaults(input)
  )
  ipcMain.handle('settings:audit-logs', () => repository.listAuditLogs())
  ipcMain.handle('customers:list', () => repository.listCustomers())
  ipcMain.handle('customers:history', (_event, customerId) =>
    service.listCustomerOrderHistory(customerId)
  )
  ipcMain.handle('orders:list', () => repository.listOrders())
  ipcMain.handle('reports:order-profit', (_event, input) => service.queryOrderProfitReport(input))
  ipcMain.handle('reports:worker-settlement', (_event, input) =>
    service.queryWorkerSettlementReport(input)
  )
  ipcMain.handle('reports:capacity-risk', (_event, input) => service.queryCapacityRiskReport(input))
  ipcMain.handle('reports:monthly-production-weight', (_event, input) =>
    service.queryMonthlyProductionWeight(input)
  )
  ipcMain.handle('reports:export', async (_event, input) => {
    const result = await dialog.showSaveDialog({
      title: '导出业务报表',
      defaultPath: `yumi-${input.kind}-${input.fromDate}-${input.toDate}.xlsx`,
      filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
    })
    if (result.canceled || !result.filePath) return { savedPath: null }
    writeFileSync(result.filePath, service.exportReport(input))
    await backup.service.recordExport({ kind: input.kind, savedPath: result.filePath })
    return { savedPath: result.filePath }
  })
  ipcMain.handle('orders:get', (_event, id) => service.getOrderDetail(id))
  ipcMain.handle('orders:create', (_event, input) => service.createOrder(input))
  ipcMain.handle('orders:update', (_event, input) => service.updateOrder(input))
  ipcMain.handle('orders:record-payment', (_event, input) => service.recordPayment(input))
  ipcMain.handle('orders:update-production-status', (_event, input) =>
    service.updateOrderProductionStatus(input)
  )
  ipcMain.handle('orders:shipment-summary', (_event, orderId) =>
    service.getOrderShipmentSummary(orderId)
  )
  ipcMain.handle('orders:shipments:list', (_event, orderId) => service.listShipments(orderId))
  ipcMain.handle('orders:shipments:create', (_event, input) => service.createShipment(input))
  ipcMain.handle('orders:shipments:update', (_event, input) => service.updateShipment(input))
  ipcMain.handle('orders:export-workbook', async (_event, input) => {
    const result = await dialog.showSaveDialog({
      title: '导出订单表和发货清单',
      defaultPath: `yumi-order-${String(input.orderId).slice(0, 8)}.xlsx`,
      filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
    })
    if (result.canceled || !result.filePath) return { savedPath: null }
    writeFileSync(result.filePath, service.exportOrderWorkbook(input))
    return { savedPath: result.filePath }
  })
  ipcMain.handle('workers:list', () => repository.listWorkers())
  ipcMain.handle('workers:get', (_event, id) => service.getWorkerDetail(id))
  ipcMain.handle('workers:create', (_event, input) => service.createWorker(input))
  ipcMain.handle('workers:update', (_event, input) => service.updateWorker(input))
  ipcMain.handle('production:record', (_event, input) => service.recordProduction(input))
  ipcMain.handle('schedule:list', (_event, from, to) => repository.listShifts(from, to))
  ipcMain.handle('schedule:get', (_event, id) => service.getShiftDetail(id))
  ipcMain.handle('schedule:preview', (_event, input) => service.previewShift(input))
  ipcMain.handle('schedule:save', (_event, input) => service.saveShift(input))
  ipcMain.handle('schedule:update', (_event, input) => service.updateShift(input))
  ipcMain.handle('schedule:update-status', (_event, input) => service.updateShiftStatus(input))
}
