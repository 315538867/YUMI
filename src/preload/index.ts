import { contextBridge, ipcRenderer } from 'electron'
import type { V2YumiApi } from '@shared/contracts'

const yumiV2: V2YumiApi = {
  health: () => ipcRenderer.invoke('v2:health'),
  customers: {
    list: (query) => ipcRenderer.invoke('v2:customers:list', query),
    create: (input) => ipcRenderer.invoke('v2:customers:create', input),
    update: (input) => ipcRenderer.invoke('v2:customers:update', input)
  },
  products: {
    list: (includeDisabled) => ipcRenderer.invoke('v2:products:list', includeDisabled),
    create: (input) => ipcRenderer.invoke('v2:products:create', input),
    update: (input) => ipcRenderer.invoke('v2:products:update', input)
  },
  orders: {
    list: () => ipcRenderer.invoke('v2:orders:list'),
    get: (orderId) => ipcRenderer.invoke('v2:orders:get', orderId),
    create: (input) => ipcRenderer.invoke('v2:orders:create', input),
    changeContent: (orderId, input) => ipcRenderer.invoke('v2:orders:change-content', orderId, input),
    listContentChanges: (orderId) => ipcRenderer.invoke('v2:orders:content-changes:list', orderId),
    listFunds: (orderId) => ipcRenderer.invoke('v2:orders:funds:list', orderId),
    recordFund: (orderId, input) => ipcRenderer.invoke('v2:orders:record-fund', orderId, input),
    correctFund: (orderId, input) => ipcRenderer.invoke('v2:orders:correct-fund', orderId, input),
    listShipments: (orderId) => ipcRenderer.invoke('v2:orders:shipments:list', orderId),
    createShipment: (orderId, input) => ipcRenderer.invoke('v2:orders:shipments:create', orderId, input)
  },
  fulfillment: {
    createWorkAssignment: (input) => ipcRenderer.invoke('v2:fulfillment:assignments:create', input),
    getWorkAssignment: (id) => ipcRenderer.invoke('v2:fulfillment:assignments:get', id),
    listWorkAssignments: (query) => ipcRenderer.invoke('v2:fulfillment:assignments:list', query),
    submitProcessResult: (taskId, input) => ipcRenderer.invoke('v2:fulfillment:results:submit', taskId, input),
    confirmQualityInspection: (resultId, input) => ipcRenderer.invoke('v2:fulfillment:inspections:confirm', resultId, input),
    recordOpeningWip: (input) => ipcRenderer.invoke('v2:fulfillment:opening-wip:record', input),
    adjustStageQuantity: (input) => ipcRenderer.invoke('v2:fulfillment:adjustments:create', input),
    getOrderItem: (orderItemId) => ipcRenderer.invoke('v2:fulfillment:order-item:get', orderItemId)
  },
  backup: {
    create: () => ipcRenderer.invoke('v2:backup:create'),
    list: () => ipcRenderer.invoke('v2:backup:list'),
    restore: (input) => ipcRenderer.invoke('v2:backup:restore', input)
  }
}

contextBridge.exposeInMainWorld('yumiV2', yumiV2)
