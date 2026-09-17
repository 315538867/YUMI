import { app, BrowserWindow, dialog, shell } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { V2ApplicationRuntime } from '@main/application/v2-runtime'
import { registerV2Ipc } from '@main/ipc/register-v2-ipc'
import type { V2BackupRestoreInput, V2BackupRestoreResult } from '@shared/contracts/index'

let mainWindow: BrowserWindow | null = null
let runtime: V2ApplicationRuntime | null = null

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    titleBarStyle: 'hiddenInset',
    // 必须与 renderer `--yumi-canvas`（基础色板 xuan-paper）保持一致，由 electron-canvas-sync.test.ts 咬合
    backgroundColor: '#f4f2ec',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  runtime = new V2ApplicationRuntime(app.getPath('userData'), app.getVersion())
  runtime.start()
  const currentRuntime = runtime
  const restore = async (input: V2BackupRestoreInput): Promise<V2BackupRestoreResult> => {
    const result = await currentRuntime.restore(input)
    app.relaunch()
    setImmediate(() => app.exit(0))
    return result
  }
  registerV2Ipc(
    currentRuntime.orderService,
    currentRuntime.studioSettingsService,
    currentRuntime.workbenchService,
    currentRuntime.fulfillmentService,
    currentRuntime.productInventoryService,
    currentRuntime.workTimeReviewService,
    currentRuntime.settlementService,
    currentRuntime.financeService,
    currentRuntime.afterSalesService,
    currentRuntime.reportService,
    {
      exporter: {
        async exportCurrentReport(input) {
          const workbook = currentRuntime.reportExportService.exportWorkbook(input)
          const result = await dialog.showSaveDialog({
            title: '导出 V2 经营报表',
            defaultPath: `yumi-v2-经营报表-${input.month}.xlsx`,
            filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
          })
          if (result.canceled || !result.filePath) return { savedPath: null }
          writeFileSync(result.filePath, workbook)
          return { savedPath: result.filePath }
        },
        async exportOrderTable(input) {
          const workbook = await currentRuntime.reportExportService.exportOrderTableWorkbook(input)
          const result = await dialog.showSaveDialog({
            title: '导出订单表',
            defaultPath: `yumi-${input?.orderId ?? '全部'}-订单表.xlsx`,
            filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
          })
          if (result.canceled || !result.filePath) return { savedPath: null }
          writeFileSync(result.filePath, workbook)
          return { savedPath: result.filePath }
        },
        async exportOrderDocuments(input) {
          const workbook =
            await currentRuntime.reportExportService.exportOrderDocumentsWorkbook(input)
          const result = await dialog.showSaveDialog({
            title: '合并导出订单表与发货清单',
            defaultPath: `yumi-${input.orderId ?? '全部'}-订单与发货单.xlsx`,
            filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
          })
          if (result.canceled || !result.filePath) return { savedPath: null }
          writeFileSync(result.filePath, workbook)
          return { savedPath: result.filePath }
        },
        async exportShippingList(input) {
          const workbook =
            await currentRuntime.reportExportService.exportShippingListWorkbook(input)
          const result = await dialog.showSaveDialog({
            title: input?.shipmentId ? '导出本批发货清单' : '导出发货汇总',
            defaultPath: input?.shipmentId ? 'yumi-本批发货清单.xlsx' : 'yumi-发货汇总.xlsx',
            filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
          })
          if (result.canceled || !result.filePath) return { savedPath: null }
          writeFileSync(result.filePath, workbook)
          return { savedPath: result.filePath }
        }
      }
    },
    {
      service: currentRuntime.backupService,
      restore
    },
    {
      service: currentRuntime.orderFundAttachmentService,
      async pickFile() {
        const result = await dialog.showOpenDialog({
          title: '选择收款凭证',
          properties: ['openFile'],
          filters: [
            { name: '常用凭证', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp'] },
            { name: '所有文件', extensions: ['*'] }
          ]
        })
        return result.canceled || !result.filePaths[0] ? null : result.filePaths[0]
      },
      openFile: (filePath) => shell.openPath(filePath)
    }
  )
  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => runtime?.close())
