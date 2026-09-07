import type { SettlementService } from '@main/services/settlement-service'

export interface SettlementIpcMain {
  handle(channel: string, handler: (...args: unknown[]) => unknown): void
}

/** 注册兼职人员和工资结算专用 IPC，保持 V2 预加载能力与服务边界一致。 */
export function registerSettlementIpc(ipc: SettlementIpcMain, service: SettlementService): void {
  ipc.handle('v2:workers:list', () => service.listWorkers())
  ipc.handle('v2:workers:create', (_event, input) => service.createWorker(input as never))
  ipc.handle('v2:workers:wages:list', (_event, workerId) => service.listWageHistory(workerId as string))
  ipc.handle('v2:workers:wages:record', (_event, input) => service.recordWageHistory(input as never))

  ipc.handle('v2:settlements:list', (_event, query) => service.listSettlements(query as never))
  ipc.handle('v2:settlements:drafts:create', (_event, input) => service.createDraft(input as never))
  ipc.handle('v2:settlements:get', (_event, settlementId) => service.getSettlement(settlementId as string))
  ipc.handle('v2:settlements:drafts:update', (_event, settlementId, input) =>
    service.updateDraft(settlementId as string, input as never)
  )
  ipc.handle('v2:settlements:confirm', (_event, settlementId) => service.confirm(settlementId as string))
}
