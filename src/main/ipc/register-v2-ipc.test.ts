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
      changeOrderContent: vi.fn(), listContentChanges: vi.fn(), recordOrderFund: vi.fn(),
      correctOrderFund: vi.fn(), listShipments: vi.fn(), createShipment: vi.fn()
    }
    const backup = { service: { createBackup: vi.fn(), listBackups: vi.fn(), getActivity: vi.fn(), inspectBackup: vi.fn() }, restore: vi.fn() }

    registerV2Ipc(service as never, backup as never, ipcMain)

    expect([...handlers.keys()]).toEqual(expect.arrayContaining([
      'v2:customers:list', 'v2:products:create', 'v2:orders:create',
      'v2:orders:change-content', 'v2:orders:record-fund',
      'v2:orders:correct-fund', 'v2:orders:shipments:create', 'v2:backup:restore'
    ]))
    await handlers.get('v2:orders:change-content')!(undefined, 'order-1', { description: '加封边' })
    await handlers.get('v2:orders:record-fund')!(undefined, 'order-1', { amountCents: 100 })
    await handlers.get('v2:orders:shipments:create')!(undefined, 'order-1', { items: [] })
    expect(service.changeOrderContent).toHaveBeenCalledWith('order-1', { description: '加封边' })
    expect(service.recordOrderFund).toHaveBeenCalledWith('order-1', { amountCents: 100 })
    expect(service.createShipment).toHaveBeenCalledWith('order-1', { items: [] })
  })
})
