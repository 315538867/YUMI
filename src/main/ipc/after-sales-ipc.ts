import type { AfterSalesService } from '@main/services/after-sales-service'

export interface AfterSalesIpcMain {
  handle(channel: string, handler: (...args: unknown[]) => unknown): void
}

/** 售后 IPC 保持负责人手工决策：建档、更新和显式关联收费均是独立动作。 */
export function registerAfterSalesIpc(ipc: AfterSalesIpcMain, service: AfterSalesService): void {
  ipc.handle('v2:after-sales:cases:list', (_event, query) => service.listCases(query as never))
  ipc.handle('v2:after-sales:cases:get', (_event, id) => service.getCase(id as string))
  ipc.handle('v2:after-sales:cases:create', (_event, input) => service.createCase(input as never))
  ipc.handle('v2:after-sales:cases:update', (_event, id, input) =>
    service.updateCase(id as string, input as never)
  )
  ipc.handle('v2:after-sales:charges:link', (_event, afterSalesCaseId, financialEntryId) =>
    service.linkCharge(afterSalesCaseId as string, financialEntryId as string)
  )
}
