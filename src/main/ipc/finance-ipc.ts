import type { FinanceService } from '@main/services/finance-service'

export interface FinanceIpcMain {
  handle(channel: string, handler: (...args: unknown[]) => unknown): void
}

/** 财务 IPC 只暴露负责人录入与查询动作，不推断收支或代替负责人确认。 */
export function registerFinanceIpc(ipc: FinanceIpcMain, service: FinanceService): void {
  ipc.handle('v2:finance:categories:list', (_event, direction, includeDisabled) =>
    service.listCategories(direction as never, Boolean(includeDisabled))
  )
  ipc.handle('v2:finance:categories:create', (_event, input) => service.createCategory(input as never))
  ipc.handle('v2:finance:categories:update', (_event, id, input) => service.updateCategory(id as string, input as never))
  ipc.handle('v2:finance:categories:delete', (_event, id) => service.deleteCategory(id as string))

  ipc.handle('v2:finance:advance-payers:list', (_event, includeDisabled) => service.listAdvancePayers(Boolean(includeDisabled)))
  ipc.handle('v2:finance:advance-payers:create', (_event, input) => service.createAdvancePayer(input as never))
  ipc.handle('v2:finance:advance-payers:update', (_event, id, input) => service.updateAdvancePayer(id as string, input as never))
  ipc.handle('v2:finance:advance-payers:delete', (_event, id) => service.deleteAdvancePayer(id as string))

  ipc.handle('v2:finance:entries:list', (_event, query) => service.listEntries(query as never))
  ipc.handle('v2:finance:manual-income:create', (_event, input) => service.createManualIncome(input as never))
  ipc.handle('v2:finance:manual-expense:create', (_event, input) => service.createManualExpense(input as never))
  ipc.handle('v2:finance:reimbursements:pending:list', (_event, asOf) => service.listPendingReimbursements(asOf as string))
  ipc.handle('v2:finance:reimbursements:create', (_event, input) => service.reimburse(input as never))
  ipc.handle('v2:finance:summary:get', (_event, month) => service.getMonthlySummary(month as string))
}
