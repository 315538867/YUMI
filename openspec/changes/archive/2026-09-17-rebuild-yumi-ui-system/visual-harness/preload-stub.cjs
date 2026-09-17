/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 视觉验收用的 stub preload（任务 1.9）。
 *
 * 它把 1.6 的确定性数据集伪装成真实的 `window.yumiV2`，让生产 renderer 在没有
 * 主进程、没有 SQLite、没有真实用户库的情况下也能渲染出有内容的页面。
 * 这样截图不受本机数据、better-sqlite3 ABI 与真实日期影响。
 *
 * 只做读；写方法一律抛出明确错误，避免截图过程中悄悄改数据。
 * 未被实现的方法会被记录到 window.__yumiHarness.misses，便于补齐。
 */
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { contextBridge } = require('electron')

const dataset = JSON.parse(readFileSync(join(__dirname, 'fixtures.json'), 'utf8'))

// 截图状态来自 capture.mjs 通过 webPreferences.additionalArguments 注入：
//   default | loading | empty | error | overflow
const stateArg = (process.argv || []).find((arg) => arg.startsWith('--yumi-harness-state='))
const harnessState = stateArg ? stateArg.slice('--yumi-harness-state='.length) : 'default'

const calls = []
const misses = []
const stagedWrites = []

const notWritable = (name) => async () => {
  stagedWrites.push(name)
  throw new Error(`视觉验收 stub 不支持写操作：${name}`)
}

const write = (name) => notWritable(name)

/** loading 态：所有读方法返回永不 resolve 的 Promise，页面停留在加载状态。 */
const hang = () => new Promise(() => {})
/** error 态：所有读方法拒绝，驱动页面级或区块级错误呈现。 */
const fail = () => Promise.reject(new Error('visual-harness 注入错误'))

const EMPTY_VALUES = {
  'customers.list': [],
  'products.list': [],
  'orders.list': [],
  'orders.listFunds': [],
  'orders.listShipments': [],
  'orders.listContentChanges': [],
  'workers.list': [],
  'workers.listWageHistory': [],
  'settlements.list': [],
  'settlements.listRefunds': [],
  'finance.listCategories': [],
  'finance.listAdvancePayers': [],
  'finance.listEntries': [],
  'finance.listPendingReimbursements': [],
  'finance.getMonthlySummary': {
    incomeCents: 0,
    operatingExpenseCents: 0,
    operatingResultCents: 0
  },
  'workbench.getSnapshot': {
    advanceItems: [],
    decisionItems: [],
    firstUseGuide: null,
    generatedOn: dataset.today
  },
  'workTimeReviews.list': [],
  'workTimeReviews.listCandidates': [],
  'fulfillment.listWorkAssignments': [],
  'reports.listCustomerOrderInsights': [],
  'reports.getCustomerOrderInsights': null,
  'reports.getOrderBusiness': null,
  'reports.getFulfillmentProgress': {
    rows: [],
    totalConfirmedQuantity: 0,
    totalShippedQuantity: 0
  },
  'reports.listConfirmedSettlements': { rows: [], totalFinalPaidCents: 0 },
  'reports.getMonthlyOperation': null,
  'afterSales.listCases': []
}

/** overflow 态：给主要列表注入超长文案并追加克隆行，验证表格/表单的溢出表现。 */
function applyOverflow() {
  const LONG =
    '这是一个用于视觉基线验收的超长中文文案样本，用来验证表格、表单与工具栏在极端长文案下是否出现非预期换行、截断、溢出与横向滚动表现；本段文本会同时出现在客户名称、订单编号等关键展示位上。'
  const cloneRows = (list, suffix, mutate, count = 6) => {
    const samples = list.slice(0, count)
    for (let i = 0; i < samples.length; i += 1) {
      const clone = JSON.parse(JSON.stringify(samples[i]))
      if (clone.id) clone.id = `${clone.id}${suffix}${i}`
      mutate(clone, i)
      list.push(clone)
    }
  }
  cloneRows(dataset.customers, '-ov', (row) => {
    if (row.name) row.name = row.name.slice(0, 20) + '；' + LONG
    if (row.notes) row.notes = row.notes + LONG
  })
  cloneRows(dataset.orderSummaries, '-ov', (row) => {
    if (row.code) row.code = row.code + '-' + LongCode(row.code)
    if (row.customerName) row.customerName = row.customerName.slice(0, 20) + '；' + LONG
  })
  cloneRows(dataset.products, '-ov', (row, i) => {
    if (row.name) row.name = row.name.slice(0, 20) + '；' + LONG
    if (i % 2 === 0 && row.code) row.code = row.code + 'OVERFLOW'
  })
  cloneRows(dataset.financialEntries, '-ov', (row) => {
    if (row.categoryName) row.categoryName = row.categoryName + LONG
    if (row.note) row.note = row.note + LONG
  })
  function LongCode(code) {
    return new Array(24).fill(code).join('')
  }
}
if (harnessState === 'overflow') applyOverflow()

const byId = (items) => new Map(items.map((item) => [item.id, item]))
const customerById = byId(dataset.customers)
const productById = byId(dataset.products)
const orderById = byId(dataset.orders)
const workerById = byId(dataset.workers)

const stages = (seed) => ({
  making: seed,
  fluffingBagging: Math.max(0, seed - 2),
  edgeSewing: Math.max(0, seed - 3),
  packing: Math.max(0, seed - 4),
  readyToShip: Math.max(0, seed - 5),
  shipped: Math.max(0, seed - 6),
  edgeSewingRouted: Math.max(0, seed - 4)
})

const customerInsights = (customer) => {
  const orders = dataset.orders.filter((order) => order.customer?.id === customer.id)
  const rows = orders.map((order, index) => ({
    orderId: order.id,
    orderCode: order.code,
    createdAt: order.createdAt,
    currentAmountCents: order.amount.currentAmountCents,
    netReceivedCents: order.funds.netReceivedCents,
    outstandingCents: order.funds.outstandingCents,
    shipmentStatus: index % 3 === 0 ? '已发货' : index % 3 === 1 ? '部分发货' : '未发货',
    orderStatus: index % 2 === 0 ? '已完成' : '排班中'
  }))
  return {
    customerId: customer.id,
    customerName: customer.name,
    orderCount: rows.length,
    totalCurrentAmountCents: rows.reduce((sum, row) => sum + row.currentAmountCents, 0),
    totalNetReceivedCents: rows.reduce((sum, row) => sum + row.netReceivedCents, 0),
    totalOutstandingCents: rows.reduce((sum, row) => sum + row.outstandingCents, 0),
    latestOrderDate: orders[0]?.createdAt?.slice(0, 10) ?? null,
    orders: rows
  }
}

const orderBusinessRows = dataset.orders.map((order, index) => {
  const productCostCents = order.items.reduce(
    (sum, item) => sum + item.quantity * (item.productSnapshot.fixedCostCents + 300),
    0
  )
  const afterSalesCostCents = index % 4 === 0 ? 1200 : 0
  const knownAccountingCostCents = productCostCents + afterSalesCostCents
  return {
    orderId: order.id,
    orderCode: order.code,
    customerName: order.customer?.name ?? '',
    currentAmountCents: order.amount.currentAmountCents,
    netReceivedCents: order.funds.netReceivedCents,
    outstandingCents: order.funds.outstandingCents,
    productCostCents,
    afterSalesCostCents,
    knownAccountingCostCents,
    knownMarginCents: order.amount.currentAmountCents - knownAccountingCostCents
  }
})

const orderBusinessReport = {
  rows: orderBusinessRows,
  totalCurrentAmountCents: orderBusinessRows.reduce((s, r) => s + r.currentAmountCents, 0),
  totalNetReceivedCents: orderBusinessRows.reduce((s, r) => s + r.netReceivedCents, 0),
  totalOutstandingCents: orderBusinessRows.reduce((s, r) => s + r.outstandingCents, 0),
  totalProductCostCents: orderBusinessRows.reduce((s, r) => s + r.productCostCents, 0),
  totalAfterSalesCostCents: orderBusinessRows.reduce((s, r) => s + r.afterSalesCostCents, 0),
  totalKnownAccountingCostCents: orderBusinessRows.reduce(
    (s, r) => s + r.knownAccountingCostCents,
    0
  ),
  totalKnownMarginCents: orderBusinessRows.reduce((s, r) => s + r.knownMarginCents, 0)
}

const fulfillmentProgressRows = dataset.orders.flatMap((order) =>
  order.items.map((item, index) => ({
    orderId: order.id,
    orderCode: order.code,
    orderItemId: item.id,
    productName: item.productSnapshot.name,
    confirmedQuantity: item.quantity,
    stages: stages(Math.max(0, item.quantity - (index % 3)))
  }))
)

const fulfillmentProgressReport = {
  rows: fulfillmentProgressRows,
  totalConfirmedQuantity: fulfillmentProgressRows.reduce((s, r) => s + r.confirmedQuantity, 0),
  totalShippedQuantity: fulfillmentProgressRows.reduce((s, r) => s + r.stages.shipped, 0)
}

const confirmedSettlementReport = {
  rows: dataset.settlements
    .filter(
      (settlement) => settlement.status !== 'draft' && settlement.finalPaidAmountCents !== null
    )
    .map((settlement) => ({
      id: settlement.id,
      workerId: settlement.workerId,
      workerName: workerById.get(settlement.workerId)?.name ?? '',
      periodStartOn: settlement.periodStartOn,
      periodEndOn: settlement.periodEndOn,
      finalPaidAmountCents: settlement.finalPaidAmountCents,
      paidOn: settlement.paidOn ?? settlement.periodEndOn,
      managerNote: settlement.managerNote
    })),
  totalFinalPaidCents: 0
}
confirmedSettlementReport.totalFinalPaidCents = confirmedSettlementReport.rows.reduce(
  (s, r) => s + r.finalPaidAmountCents,
  0
)

const monthlyOperation = (month) => {
  const inMonth = (date) => String(date).startsWith(month)
  const income = dataset.financialEntries
    .filter((entry) => entry.direction === 'income' && inMonth(entry.occurredOn))
    .reduce((s, entry) => s + entry.amountCents, 0)
  const expense = dataset.financialEntries
    .filter((entry) => entry.direction === 'expense' && inMonth(entry.occurredOn))
    .reduce((s, entry) => s + entry.amountCents, 0)
  return {
    month,
    incomeCents: income,
    operatingExpenseCents: expense,
    operatingResultCents: income - expense,
    confirmedSettlementPaidCents: confirmedSettlementReport.totalFinalPaidCents
  }
}

const financeMonthlySummary = (month) => {
  const report = monthlyOperation(month)
  return {
    incomeCents: report.incomeCents,
    operatingExpenseCents: report.operatingExpenseCents,
    operatingResultCents: report.operatingResultCents
  }
}

const capacityRiskReport = (input) => ({
  rows: dataset.products.map((product, index) => {
    const demandQuantity = 6 + index * 2
    const scheduledQuantity = Math.max(0, demandQuantity - (index % 4))
    const availableCapacityQuantity = product.dailyCapacity * 3
    const gapQuantity = Math.max(0, demandQuantity - scheduledQuantity - availableCapacityQuantity)
    const utilization =
      availableCapacityQuantity === 0
        ? 10000
        : Math.round((demandQuantity / availableCapacityQuantity) * 10000)
    return {
      productId: product.id,
      productName: product.name,
      startOn: input.startOn,
      endOn: input.endOn,
      demandQuantity,
      scheduledQuantity,
      dailyCapacity: product.dailyCapacity,
      availableCapacityQuantity,
      gapQuantity,
      utilizationBasisPoints: utilization,
      level:
        product.dailyCapacity === 0
          ? 'unplanned'
          : gapQuantity > 0
            ? 'critical'
            : utilization > 8000
              ? 'warning'
              : 'normal',
      riskSources:
        product.dailyCapacity === 0
          ? ['未维护产能参数']
          : gapQuantity > 0
            ? ['待制作需求超出可用产能']
            : [],
      productRoute: { productId: product.id }
    }
  })
})

const deliveryRiskReport = (_input) => ({
  rows: dataset.orders.map((order, index) => {
    const shippedQuantity = dataset.shipments
      .filter((shipment) => shipment.orderId === order.id && shipment.status === 'active')
      .flatMap((shipment) => shipment.items)
      .reduce((s, item) => s + item.quantity, 0)
    const remainingQuantity = Math.max(
      0,
      order.items.reduce((s, item) => s + item.quantity, 0) - shippedQuantity
    )
    const level =
      index % 4 === 0
        ? 'unplanned'
        : index % 4 === 1
          ? 'critical'
          : index % 4 === 2
            ? 'warning'
            : 'normal'
    return {
      orderId: order.id,
      orderCode: order.code,
      expectedShipDate: order.expectedShipDate,
      productionDeadline: order.productionDeadline,
      remainingQuantity,
      shippedQuantity,
      level,
      riskSources:
        level === 'unplanned'
          ? ['未填写预计发货日期']
          : level === 'normal'
            ? []
            : ['剩余数量多于可用工期'],
      fulfillmentRoute: { orderId: order.id }
    }
  })
})

const candidatesFor = () =>
  dataset.orders.flatMap((order) =>
    order.items.map((item) => ({
      orderItemId: item.id,
      orderId: order.id,
      orderCode: order.code,
      customerName: order.customer?.name ?? '',
      productName: item.productSnapshot.name,
      deliveryDate: order.expectedShipDate,
      orderCreatedAt: order.createdAt,
      processableQuantity: item.quantity,
      expectedUnitMinutes: item.productSnapshot.standardMakingMinutes,
      pieceRateCents: item.productSnapshot.makingCommissionCents
    }))
  )

const orderItemFulfillment = (orderItemId) => {
  const order = dataset.orders.find((item) => item.items.some((line) => line.id === orderItemId))
  const line = order?.items.find((item) => item.id === orderItemId)
  return {
    orderItemId,
    orderId: order?.id ?? '',
    confirmedQuantity: line?.quantity ?? 0,
    stages: stages(line?.quantity ?? 0),
    events: []
  }
}

const settlementDetail = (settlement) => ({
  ...settlement,
  makingSources: [],
  timedSources: [],
  adjustments: [],
  deductions: [],
  deductionAllocations: []
})

const api = {
  health: async () => ({ version: 'visual-harness', databaseReady: true }),
  workbench: {
    getSnapshot: async () => dataset.workbenchSnapshot
  },
  customers: {
    list: async () => dataset.customers,
    create: write('customers.create'),
    update: write('customers.update')
  },
  studioSettings: {
    get: async () => dataset.settings,
    update: write('studioSettings.update')
  },
  products: {
    list: async () => dataset.products,
    create: write('products.create'),
    update: write('products.update'),
    getExpectedProfit: async (productId) => {
      const product = productById.get(productId)
      if (!product) return null
      const materialMicroYuan =
        product.unitWeightMilligrams * dataset.settings.materialPriceMicroYuanPerGram
      const unitCostCents =
        Math.round(materialMicroYuan / 1000000) +
        product.packagingCostCents +
        product.accessoryCostCents +
        product.replacementBagCostCents +
        product.fixedCostCents +
        product.makingCommissionCents +
        product.fluffingBaggingCommissionCents +
        product.edgeSewingCommissionCents
      const unitProfitCents = product.basePriceCents - unitCostCents
      return {
        unitCostCents,
        unitProfitCents,
        profitRateBasisPoints:
          product.basePriceCents === 0
            ? null
            : Math.round((unitProfitCents / product.basePriceCents) * 10000),
        edgeIncrementalCostCents:
          product.edgeConsumableCostCents + product.edgeSewingCommissionCents,
        breakdown: []
      }
    }
  },
  orders: {
    list: async () => dataset.orderSummaries,
    get: async (orderId) => orderById.get(orderId) ?? null,
    create: write('orders.create'),
    changeContent: write('orders.changeContent'),
    listContentChanges: async () => [],
    listFunds: async (orderId) => dataset.orderFunds.filter((fund) => fund.orderId === orderId),
    recordFund: write('orders.recordFund'),
    correctFund: write('orders.correctFund'),
    listShipments: async (orderId) => dataset.shipments.filter((item) => item.orderId === orderId),
    createShipment: write('orders.createShipment'),
    voidShipment: write('orders.voidShipment')
  },
  orderFundProofs: {
    pick: async () => null,
    discardPrepared: async () => undefined,
    get: async () => null,
    attach: write('orderFundProofs.attach'),
    open: async () => ({ status: 'none' })
  },
  fulfillment: {
    createWorkAssignment: write('fulfillment.createWorkAssignment'),
    setWorkAssignmentStatus: write('fulfillment.setWorkAssignmentStatus'),
    reassignProcessTask: write('fulfillment.reassignProcessTask'),
    getWorkAssignment: async (id) => dataset.workAssignments.find((item) => item.id === id) ?? null,
    listWorkAssignments: async () => dataset.workAssignments,
    getProcessResultForTask: async () => null,
    reviewMaking: write('fulfillment.reviewMaking'),
    correctMakingReview: write('fulfillment.correctMakingReview'),
    voidMakingReview: write('fulfillment.voidMakingReview'),
    adjustStageQuantity: write('fulfillment.adjustStageQuantity'),
    getOrderItem: async (orderItemId) => orderItemFulfillment(orderItemId)
  },
  workTimeReviews: {
    list: async () => dataset.workTimeReviews,
    get: async (id) => dataset.workTimeReviews.find((item) => item.id === id) ?? null,
    listCandidates: async () => candidatesFor(),
    review: write('workTimeReviews.review'),
    correct: write('workTimeReviews.correct'),
    void: write('workTimeReviews.void')
  },
  productInventory: {
    getSummary: async (productId) => ({
      productId,
      stages: { made: 4, fluffingBaggingDone: 3, edgeSewingDone: 2, packed: 1 }
    }),
    listEvents: async () => [],
    recordOpening: write('productInventory.recordOpening'),
    adjust: write('productInventory.adjust'),
    allocateToOrder: write('productInventory.allocateToOrder')
  },
  workers: {
    list: async () => dataset.workers,
    create: write('workers.create'),
    listWageHistory: async (workerId) =>
      dataset.wageHistory.filter((item) => item.workerId === workerId),
    recordWageHistory: write('workers.recordWageHistory')
  },
  settlements: {
    list: async () => dataset.settlements.map(settlementDetail),
    createDraft: write('settlements.createDraft'),
    get: async (id) => {
      const settlement = dataset.settlements.find((item) => item.id === id)
      return settlement ? settlementDetail(settlement) : null
    },
    updateDraft: write('settlements.updateDraft'),
    confirm: write('settlements.confirm'),
    addWorkTimeAdjustment: write('settlements.addWorkTimeAdjustment'),
    listRefunds: async () => dataset.refunds,
    resolveRefund: write('settlements.resolveRefund')
  },
  finance: {
    listCategories: async (direction) =>
      dataset.financeCategories.filter((item) => !direction || item.direction === direction),
    createCategory: write('finance.createCategory'),
    updateCategory: write('finance.updateCategory'),
    deleteCategory: write('finance.deleteCategory'),
    listAdvancePayers: async () => dataset.advancePayers,
    createAdvancePayer: write('finance.createAdvancePayer'),
    updateAdvancePayer: write('finance.updateAdvancePayer'),
    deleteAdvancePayer: write('finance.deleteAdvancePayer'),
    listEntries: async () => dataset.financialEntries,
    createManualIncome: write('finance.createManualIncome'),
    createManualExpense: write('finance.createManualExpense'),
    listPendingReimbursements: async () => dataset.pendingReimbursements,
    reimburse: write('finance.reimburse'),
    reimburseBatch: write('finance.reimburseBatch'),
    getMonthlySummary: async (month) => financeMonthlySummary(month)
  },
  afterSales: {
    listCases: async () => [],
    getCase: async () => null,
    createCase: write('afterSales.createCase'),
    updateCase: write('afterSales.updateCase'),
    linkCharge: write('afterSales.linkCharge')
  },
  reports: {
    listCustomerOrderInsights: async () => dataset.customers.map(customerInsights),
    getCustomerOrderInsights: async (customerId) => {
      const customer = customerById.get(customerId)
      return customer ? customerInsights(customer) : null
    },
    getOrderBusiness: async () => orderBusinessReport,
    getOrderBusinessDetail: async () => null,
    getShippingListPreview: async () => ({ orderCode: '', items: [] }),
    getFulfillmentProgress: async () => fulfillmentProgressReport,
    getCapacityRiskReport: async (input) => capacityRiskReport(input),
    getDeliveryRiskReport: async (input) => deliveryRiskReport(input),
    listConfirmedSettlements: async () => confirmedSettlementReport,
    getMonthlyOperation: async (month) => monthlyOperation(month),
    exportCurrentReport: write('reports.exportCurrentReport'),
    exportOrderTable: write('reports.exportOrderTable'),
    exportOrderDocuments: write('reports.exportOrderDocuments'),
    exportShippingList: write('reports.exportShippingList')
  },
  backup: {
    create: write('backup.create'),
    list: async () => [],
    restore: write('backup.restore')
  }
}

/**
 * contextBridge.exposeInMainWorld 不能克隆 Proxy，因此这里不用拦截式守卫，
 * 而是把真实 preload 的完整方法表面显式列出来：已实现的方法走 fixtures，
 * 未实现的方法记录 miss 后返回空对象（便于补齐而不是悄悄渲染空白页）。
 * 顶层与各命名空间必须保持与 src/preload/index.ts 完全一致。
 */
const SURFACE = {
  health: [''],
  workbench: ['getSnapshot'],
  customers: ['list', 'create', 'update'],
  studioSettings: ['get', 'update'],
  products: ['list', 'create', 'update', 'getExpectedProfit'],
  orders: [
    'list',
    'get',
    'create',
    'changeContent',
    'listContentChanges',
    'listFunds',
    'recordFund',
    'correctFund',
    'listShipments',
    'createShipment',
    'voidShipment'
  ],
  orderFundProofs: ['pick', 'discardPrepared', 'get', 'attach', 'open'],
  fulfillment: [
    'createWorkAssignment',
    'setWorkAssignmentStatus',
    'reassignProcessTask',
    'getWorkAssignment',
    'listWorkAssignments',
    'getProcessResultForTask',
    'reviewMaking',
    'correctMakingReview',
    'voidMakingReview',
    'adjustStageQuantity',
    'getOrderItem'
  ],
  workTimeReviews: ['list', 'get', 'listCandidates', 'review', 'correct', 'void'],
  productInventory: ['getSummary', 'listEvents', 'recordOpening', 'adjust', 'allocateToOrder'],
  workers: ['list', 'create', 'listWageHistory', 'recordWageHistory'],
  settlements: [
    'list',
    'createDraft',
    'get',
    'updateDraft',
    'addWorkTimeAdjustment',
    'confirm',
    'listRefunds',
    'resolveRefund'
  ],
  finance: [
    'listCategories',
    'createCategory',
    'updateCategory',
    'deleteCategory',
    'listAdvancePayers',
    'createAdvancePayer',
    'updateAdvancePayer',
    'deleteAdvancePayer',
    'listEntries',
    'createManualIncome',
    'createManualExpense',
    'listPendingReimbursements',
    'reimburse',
    'reimburseBatch',
    'getMonthlySummary'
  ],
  afterSales: ['listCases', 'getCase', 'createCase', 'updateCase', 'linkCharge'],
  reports: [
    'listCustomerOrderInsights',
    'getCustomerOrderInsights',
    'getOrderBusiness',
    'getOrderBusinessDetail',
    'getShippingListPreview',
    'getFulfillmentProgress',
    'getCapacityRiskReport',
    'getDeliveryRiskReport',
    'listConfirmedSettlements',
    'getMonthlyOperation',
    'exportCurrentReport',
    'exportOrderTable',
    'exportOrderDocuments',
    'exportShippingList'
  ],
  backup: ['create', 'list', 'restore']
}

const guarded = {}
for (const [namespaceName, methodNames] of Object.entries(SURFACE)) {
  const implemented = api[namespaceName]
  guarded[namespaceName] = {}
  for (const method of methodNames) {
    const methodKey = method === '' ? namespaceName : `${namespaceName}.${method}`
    if (method === '') {
      guarded[namespaceName] = (...args) => {
        calls.push(methodKey)
        return stateBody(implemented, methodKey)(...args)
      }
      continue
    }
    const impl = implemented?.[method]
    if (typeof impl === 'function') {
      const body = stateBody(impl, methodKey)
      guarded[namespaceName][method] = (...args) => {
        calls.push(methodKey)
        return body(...args)
      }
    } else {
      guarded[namespaceName][method] = async () => {
        misses.push(methodKey)
        return {}
      }
    }
  }
}

/** loading/error/empty 态对读方法的状态化包装；未命中 override 的读方法走正常实现。 */
function stateBody(impl, methodKey) {
  if (harnessState === 'loading') return hang
  if (harnessState === 'error') return fail
  if (harnessState === 'empty' && Object.prototype.hasOwnProperty.call(EMPTY_VALUES, methodKey)) {
    const value = EMPTY_VALUES[methodKey]
    return async () => value
  }
  return impl
}

contextBridge.exposeInMainWorld('yumiV2', guarded)
contextBridge.exposeInMainWorld('__yumiHarness', {
  state: harnessState,
  today: dataset.today,
  counts: dataset.counts,
  getCalls: () => calls.slice(),
  getMisses: () => misses.slice(),
  getWriteAttempts: () => stagedWrites.slice()
})
