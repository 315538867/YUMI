import { describe, expect, it, vi } from 'vitest'
import { registerV2Ipc, type V2IpcMain } from './register-v2-ipc'

function createIpcMain(): { ipcMain: V2IpcMain; handlers: Map<string, (...args: unknown[]) => unknown> } {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler)
      }
    }
  }
}

describe('registerV2Ipc', () => {
  it('仅注册 V2 命名空间，并将订单变更、资金和发货委托给 V2 服务', async () => {
    const { ipcMain, handlers } = createIpcMain()
    const service = {
      listCustomers: vi.fn(() => []), createCustomer: vi.fn(), updateCustomer: vi.fn(),
      listProducts: vi.fn(() => []), createProduct: vi.fn(), updateProduct: vi.fn(),
      listOrders: vi.fn(() => []), getOrder: vi.fn(), createOrder: vi.fn(),
      changeOrderContent: vi.fn(), listContentChanges: vi.fn(), listOrderFunds: vi.fn(), recordOrderFund: vi.fn(),
      correctOrderFund: vi.fn(), listShipments: vi.fn(), createShipment: vi.fn()
    }
    const fulfillment = {
      createWorkAssignment: vi.fn(), getWorkAssignment: vi.fn(), listWorkAssignments: vi.fn(), getProcessResultForTask: vi.fn(),
      submitProcessResult: vi.fn(), confirmQualityInspection: vi.fn(), recordOpeningWip: vi.fn(),
      adjustStageQuantity: vi.fn(), getOrderItemFulfillment: vi.fn()
    }
    const settlement = {
      listWorkers: vi.fn(() => []), createWorker: vi.fn(), listWageHistory: vi.fn(() => []), recordWageHistory: vi.fn(),
      listSettlements: vi.fn(() => []), createDraft: vi.fn(), getSettlement: vi.fn(), updateDraft: vi.fn(), confirm: vi.fn()
    }
    const backup = { service: { createBackup: vi.fn(), listBackups: vi.fn(), getActivity: vi.fn(), inspectBackup: vi.fn() }, restore: vi.fn() }

    registerV2Ipc(service as never, fulfillment as never, settlement as never, backup as never, ipcMain)

    expect([...handlers.keys()]).toEqual(expect.arrayContaining([
      'v2:customers:list', 'v2:products:create', 'v2:orders:create',
      'v2:orders:change-content', 'v2:orders:funds:list', 'v2:orders:record-fund',
      'v2:orders:correct-fund', 'v2:orders:shipments:create',
      'v2:fulfillment:assignments:create', 'v2:fulfillment:tasks:result:get', 'v2:fulfillment:results:submit',
      'v2:fulfillment:inspections:confirm', 'v2:fulfillment:order-item:get',
      'v2:workers:list', 'v2:workers:create', 'v2:workers:wages:list', 'v2:workers:wages:record',
      'v2:settlements:list', 'v2:settlements:drafts:create', 'v2:settlements:get',
      'v2:settlements:drafts:update', 'v2:settlements:confirm', 'v2:backup:restore'
    ]))
    await handlers.get('v2:orders:change-content')!(undefined, 'order-1', { description: '加封边' })
    await handlers.get('v2:orders:funds:list')!(undefined, 'order-1')
    await handlers.get('v2:orders:record-fund')!(undefined, 'order-1', { amountCents: 100 })
    await handlers.get('v2:orders:shipments:create')!(undefined, 'order-1', { items: [] })
    await handlers.get('v2:fulfillment:assignments:create')!(undefined, { workerId: 'worker-1' })
    await handlers.get('v2:fulfillment:tasks:result:get')!(undefined, 'task-1')
    await handlers.get('v2:fulfillment:results:submit')!(undefined, 'task-1', { completedQuantity: 3 })
    await handlers.get('v2:fulfillment:inspections:confirm')!(undefined, 'result-1', { qualifiedQuantity: 3 })
    await handlers.get('v2:fulfillment:order-item:get')!(undefined, 'item-1')
    await handlers.get('v2:workers:create')!(undefined, { name: '小林' })
    await handlers.get('v2:workers:wages:record')!(undefined, { workerId: 'worker-1', hourlyWageCents: 2_000 })
    await handlers.get('v2:settlements:drafts:create')!(undefined, { workerId: 'worker-1' })
    await handlers.get('v2:settlements:drafts:update')!(undefined, 'settlement-1', { attendanceMinutes: 60 })
    await handlers.get('v2:settlements:confirm')!(undefined, 'settlement-1')
    expect(service.changeOrderContent).toHaveBeenCalledWith('order-1', { description: '加封边' })
    expect(service.listOrderFunds).toHaveBeenCalledWith('order-1')
    expect(service.recordOrderFund).toHaveBeenCalledWith('order-1', { amountCents: 100 })
    expect(service.createShipment).toHaveBeenCalledWith('order-1', { items: [] })
    expect(fulfillment.createWorkAssignment).toHaveBeenCalledWith({ workerId: 'worker-1' })
    expect(fulfillment.getProcessResultForTask).toHaveBeenCalledWith('task-1')
    expect(fulfillment.submitProcessResult).toHaveBeenCalledWith('task-1', { completedQuantity: 3 })
    expect(fulfillment.confirmQualityInspection).toHaveBeenCalledWith('result-1', { qualifiedQuantity: 3 })
    expect(fulfillment.getOrderItemFulfillment).toHaveBeenCalledWith('item-1')
    expect(settlement.createWorker).toHaveBeenCalledWith({ name: '小林' })
    expect(settlement.recordWageHistory).toHaveBeenCalledWith({ workerId: 'worker-1', hourlyWageCents: 2_000 })
    expect(settlement.createDraft).toHaveBeenCalledWith({ workerId: 'worker-1' })
    expect(settlement.updateDraft).toHaveBeenCalledWith('settlement-1', { attendanceMinutes: 60 })
    expect(settlement.confirm).toHaveBeenCalledWith('settlement-1')
  })
})
