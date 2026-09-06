import { contextBridge, ipcRenderer } from 'electron'
import type { YumiApi } from '@shared/contracts'

const yumi: YumiApi = {
  health: () => ipcRenderer.invoke('app:health'),
  dashboard: { get: () => ipcRenderer.invoke('dashboard:get') },
  demo: { load: () => ipcRenderer.invoke('demo:load') },
  reports: {
    orderProfit: (query) => ipcRenderer.invoke('reports:order-profit', query),
    workerSettlement: (query) => ipcRenderer.invoke('reports:worker-settlement', query),
    capacityRisk: (query) => ipcRenderer.invoke('reports:capacity-risk', query),
    monthlyProductionWeight: (query) =>
      ipcRenderer.invoke('reports:monthly-production-weight', query),
    export: (input) => ipcRenderer.invoke('reports:export', input)
  },
  attachments: {
    chooseAndImport: (kind) => ipcRenderer.invoke('attachments:choose-and-import', kind),
    delete: (id) => ipcRenderer.invoke('attachments:delete', id)
  },
  backup: {
    create: () => ipcRenderer.invoke('backup:create'),
    list: () => ipcRenderer.invoke('backup:list'),
    activity: () => ipcRenderer.invoke('backup:activity'),
    chooseRestoreSource: () => ipcRenderer.invoke('backup:choose-restore-source'),
    restore: (input) => ipcRenderer.invoke('backup:restore', input)
  },
  products: {
    list: () => ipcRenderer.invoke('products:list'),
    get: (id) => ipcRenderer.invoke('products:get', id),
    create: (input) => ipcRenderer.invoke('products:create', input),
    update: (input) => ipcRenderer.invoke('products:update', input),
    previewCost: (input) => ipcRenderer.invoke('products:preview-cost', input)
  },
  settings: {
    getCost: () => ipcRenderer.invoke('settings:cost:get'),
    updateCost: (input) => ipcRenderer.invoke('settings:cost:update', input),
    getOrderDefaults: () => ipcRenderer.invoke('settings:order-defaults:get'),
    updateOrderDefaults: (input) => ipcRenderer.invoke('settings:order-defaults:update', input),
    listAuditLogs: () => ipcRenderer.invoke('settings:audit-logs')
  },
  customers: {
    list: () => ipcRenderer.invoke('customers:list'),
    history: (customerId) => ipcRenderer.invoke('customers:history', customerId)
  },
  orders: {
    list: () => ipcRenderer.invoke('orders:list'),
    get: (id) => ipcRenderer.invoke('orders:get', id),
    create: (input) => ipcRenderer.invoke('orders:create', input),
    update: (input) => ipcRenderer.invoke('orders:update', input),
    recordPayment: (input) => ipcRenderer.invoke('orders:record-payment', input),
    updateProductionStatus: (input) => ipcRenderer.invoke('orders:update-production-status', input),
    shipmentSummary: (orderId) => ipcRenderer.invoke('orders:shipment-summary', orderId),
    listShipments: (orderId) => ipcRenderer.invoke('orders:shipments:list', orderId),
    createShipment: (input) => ipcRenderer.invoke('orders:shipments:create', input),
    updateShipment: (input) => ipcRenderer.invoke('orders:shipments:update', input),
    exportOrderSheet: (input) => ipcRenderer.invoke('orders:export-order-sheet', input),
    exportShipmentManifest: (input) => ipcRenderer.invoke('orders:export-shipment-manifest', input)
  },
  workers: {
    list: () => ipcRenderer.invoke('workers:list'),
    get: (id) => ipcRenderer.invoke('workers:get', id),
    create: (input) => ipcRenderer.invoke('workers:create', input),
    update: (input) => ipcRenderer.invoke('workers:update', input)
  },
  production: {
    record: (input) => ipcRenderer.invoke('production:record', input)
  },
  schedule: {
    list: (from, to) => ipcRenderer.invoke('schedule:list', from, to),
    get: (id) => ipcRenderer.invoke('schedule:get', id),
    preview: (input) => ipcRenderer.invoke('schedule:preview', input),
    save: (input) => ipcRenderer.invoke('schedule:save', input),
    update: (input) => ipcRenderer.invoke('schedule:update', input),
    updateStatus: (input) => ipcRenderer.invoke('schedule:update-status', input)
  }
}

contextBridge.exposeInMainWorld('yumi', yumi)
