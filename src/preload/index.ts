import { contextBridge, ipcRenderer } from 'electron'
import type { V2YumiApi } from '@shared/contracts/index'

const yumiV2: V2YumiApi = {
  health: () => ipcRenderer.invoke('v2:health'),
  workbench: {
    getSnapshot: () => ipcRenderer.invoke('v2:workbench:get')
  },
  customers: {
    list: (query) => ipcRenderer.invoke('v2:customers:list', query),
    create: (input) => ipcRenderer.invoke('v2:customers:create', input),
    update: (input) => ipcRenderer.invoke('v2:customers:update', input)
  },
  studioSettings: {
    get: () => ipcRenderer.invoke('v2:studio-settings:get'),
    update: (input) => ipcRenderer.invoke('v2:studio-settings:update', input)
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
  orderFundProofs: {
    pick: () => ipcRenderer.invoke('v2:order-fund-proofs:pick'),
    discardPrepared: (attachmentId) => ipcRenderer.invoke('v2:order-fund-proofs:discard-prepared', attachmentId),
    get: (fundId) => ipcRenderer.invoke('v2:order-fund-proofs:get', fundId),
    attach: (fundId, attachmentId) => ipcRenderer.invoke('v2:order-fund-proofs:attach', fundId, attachmentId),
    open: (fundId) => ipcRenderer.invoke('v2:order-fund-proofs:open', fundId)
  },
  fulfillment: {
    createWorkAssignment: (input) => ipcRenderer.invoke('v2:fulfillment:assignments:create', input),
    getWorkAssignment: (id) => ipcRenderer.invoke('v2:fulfillment:assignments:get', id),
    listWorkAssignments: (query) => ipcRenderer.invoke('v2:fulfillment:assignments:list', query),
    getProcessResultForTask: (taskId) => ipcRenderer.invoke('v2:fulfillment:tasks:result:get', taskId),
    submitProcessResult: (taskId, input) => ipcRenderer.invoke('v2:fulfillment:results:submit', taskId, input),
    confirmQualityInspection: (resultId, input) => ipcRenderer.invoke('v2:fulfillment:inspections:confirm', resultId, input),
    recordOpeningWip: (input) => ipcRenderer.invoke('v2:fulfillment:opening-wip:record', input),
    adjustStageQuantity: (input) => ipcRenderer.invoke('v2:fulfillment:adjustments:create', input),
    getOrderItem: (orderItemId) => ipcRenderer.invoke('v2:fulfillment:order-item:get', orderItemId)
  },
  workers: {
    list: () => ipcRenderer.invoke('v2:workers:list'),
    create: (input) => ipcRenderer.invoke('v2:workers:create', input),
    listWageHistory: (workerId) => ipcRenderer.invoke('v2:workers:wages:list', workerId),
    recordWageHistory: (input) => ipcRenderer.invoke('v2:workers:wages:record', input)
  },
  settlements: {
    list: (query) => ipcRenderer.invoke('v2:settlements:list', query),
    createDraft: (input) => ipcRenderer.invoke('v2:settlements:drafts:create', input),
    get: (id) => ipcRenderer.invoke('v2:settlements:get', id),
    updateDraft: (id, input) => ipcRenderer.invoke('v2:settlements:drafts:update', id, input),
    confirm: (id) => ipcRenderer.invoke('v2:settlements:confirm', id),
    listRefunds: (query) => ipcRenderer.invoke('v2:settlements:refunds:list', query),
    resolveRefund: (id, input) => ipcRenderer.invoke('v2:settlements:refunds:resolve', id, input)
  },
  finance: {
    listCategories: (direction, includeDisabled) => ipcRenderer.invoke('v2:finance:categories:list', direction, includeDisabled),
    createCategory: (input) => ipcRenderer.invoke('v2:finance:categories:create', input),
    updateCategory: (id, input) => ipcRenderer.invoke('v2:finance:categories:update', id, input),
    deleteCategory: (id) => ipcRenderer.invoke('v2:finance:categories:delete', id),
    listAdvancePayers: (includeDisabled) => ipcRenderer.invoke('v2:finance:advance-payers:list', includeDisabled),
    createAdvancePayer: (input) => ipcRenderer.invoke('v2:finance:advance-payers:create', input),
    updateAdvancePayer: (id, input) => ipcRenderer.invoke('v2:finance:advance-payers:update', id, input),
    deleteAdvancePayer: (id) => ipcRenderer.invoke('v2:finance:advance-payers:delete', id),
    listEntries: (query) => ipcRenderer.invoke('v2:finance:entries:list', query),
    createManualIncome: (input) => ipcRenderer.invoke('v2:finance:manual-income:create', input),
    createManualExpense: (input) => ipcRenderer.invoke('v2:finance:manual-expense:create', input),
    listPendingReimbursements: (asOf) => ipcRenderer.invoke('v2:finance:reimbursements:pending:list', asOf),
    reimburse: (input) => ipcRenderer.invoke('v2:finance:reimbursements:create', input),
    reimburseBatch: (input) => ipcRenderer.invoke('v2:finance:reimbursements:batch-create', input),
    getMonthlySummary: (month) => ipcRenderer.invoke('v2:finance:summary:get', month)
  },
  afterSales: {
    listCases: (query) => ipcRenderer.invoke('v2:after-sales:cases:list', query),
    getCase: (id) => ipcRenderer.invoke('v2:after-sales:cases:get', id),
    createCase: (input) => ipcRenderer.invoke('v2:after-sales:cases:create', input),
    updateCase: (id, input) => ipcRenderer.invoke('v2:after-sales:cases:update', id, input),
    linkCharge: (afterSalesCaseId, financialEntryId) => ipcRenderer.invoke('v2:after-sales:charges:link', afterSalesCaseId, financialEntryId)
  },
  reports: {
    listCustomerOrderInsights: () => ipcRenderer.invoke('v2:reports:customers:insights:list'),
    getCustomerOrderInsights: (customerId) => ipcRenderer.invoke('v2:reports:customers:insights:get', customerId),
    getOrderBusiness: () => ipcRenderer.invoke('v2:reports:orders:business'),
    getFulfillmentProgress: () => ipcRenderer.invoke('v2:reports:fulfillment:progress'),
    getCapacityRiskReport: (input) => ipcRenderer.invoke('v2:reports:capacity-risk:get', input),
    getDeliveryRiskReport: (input) => ipcRenderer.invoke('v2:reports:delivery-risk:get', input),
    listConfirmedSettlements: () => ipcRenderer.invoke('v2:reports:settlements:confirmed'),
    getMonthlyOperation: (month) => ipcRenderer.invoke('v2:reports:monthly-operation:get', month),
    exportCurrentReport: (input) => ipcRenderer.invoke('v2:reports:export', input),
    exportOrderTable: (input) => ipcRenderer.invoke('v2:reports:export:order-table', input),
    exportOrderDocuments: (input) => ipcRenderer.invoke('v2:reports:export:order-documents', input),
    exportShippingList: (input) => ipcRenderer.invoke('v2:reports:export:shipping-list', input)
  },
  backup: {
    create: () => ipcRenderer.invoke('v2:backup:create'),
    list: () => ipcRenderer.invoke('v2:backup:list'),
    restore: (input) => ipcRenderer.invoke('v2:backup:restore', input)
  }
}

contextBridge.exposeInMainWorld('yumiV2', yumiV2)
