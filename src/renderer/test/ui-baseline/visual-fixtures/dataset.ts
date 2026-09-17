/**
 * 隔离视觉验收数据集（任务 1.6）。
 *
 * 为什么需要它：业务页面在 Electron 里读真实 SQLite 数据，同一份界面在不同机器、
 * 不同日期、不同记录数下渲染结果都不同，基线截图无法比对。这里用固定种子把
 * 「日期、时区、排序、长中文文案、极端金额、记录数量、随机值」全部钉死，
 * 产出可复现的夹具，供基线截图与后续页面测试复用。
 *
 *   const dataset = buildVisualDataset()
 *   const dataset = buildVisualDataset({ seed: 1, customers: 0 })
 *
 * 硬性约束（由 visual-fixtures.test.ts 把守）：
 * - 金额一律整数分，重量一律整数毫克，不出现浮点。
 * - 金额与数量保持算术自洽（行金额 = 数量 × 单价 + 缝边金额 − 折扣 等）。
 * - 不读宿主时区，不使用 Date.now() 与 Math.random()。
 */
import type {
  V2AdvancePayer,
  V2Customer,
  V2FinanceCategory,
  V2FinancialEntry,
  V2Order,
  V2OrderFund,
  V2OrderSummary,
  V2PendingReimbursement,
  V2Product,
  V2Shipment,
  V2StudioSettings,
  V2WorkAssignment,
  V2WorkbenchSnapshot,
  V2Worker,
  V2WorkerRefundRecord,
  V2WorkerSettlement,
  V2WorkerWageHistory,
  V2WorkTimeReview
} from '@shared/contracts/index'
import { FIXED_TIMEZONE, FIXED_TODAY, FIXED_WEEK_START } from './determinism'
import {
  DECLARED_COUNTS,
  baseSettings,
  createFactoryContext,
  type BuildOptions,
  type DeclaredCountKey
} from './context'
import {
  buildCustomerFixtures,
  buildOrderFixtures,
  buildOrderFundFixtures,
  buildProductFixtures,
  buildShipmentFixtures,
  toOrderSummary
} from './factories-commercial'
import {
  buildWorkAssignmentFixtures,
  buildRefundFixtures,
  buildSettlementFixtures,
  buildWageHistoryFixtures,
  buildWorkerFixtures,
  buildWorkTimeReviewFixtures,
  buildWorkbenchSnapshot
} from './factories-operations'
import {
  buildAdvancePayerFixtures,
  buildFinanceCategoryFixtures,
  buildFinancialEntryFixtures,
  buildPendingReimbursementFixtures
} from './factories-finance'

export { DECLARED_COUNTS }
export type { BuildOptions, DeclaredCountKey }

export type VisualDataset = {
  timezone: string
  today: string
  weekStart: string
  settings: V2StudioSettings
  customers: V2Customer[]
  products: V2Product[]
  orders: V2Order[]
  orderSummaries: V2OrderSummary[]
  orderFunds: V2OrderFund[]
  shipments: V2Shipment[]
  workers: V2Worker[]
  wageHistory: V2WorkerWageHistory[]
  settlements: V2WorkerSettlement[]
  refunds: V2WorkerRefundRecord[]
  financeCategories: V2FinanceCategory[]
  advancePayers: V2AdvancePayer[]
  financialEntries: V2FinancialEntry[]
  pendingReimbursements: V2PendingReimbursement[]
  workAssignments: V2WorkAssignment[]
  workTimeReviews: V2WorkTimeReview[]
  workbenchSnapshot: V2WorkbenchSnapshot
  counts: Record<DeclaredCountKey, number>
}

export const buildVisualDataset = (options: BuildOptions = {}): VisualDataset => {
  const context = createFactoryContext(options.seed)
  const count = (key: DeclaredCountKey) => options[key] ?? DECLARED_COUNTS[key]

  const customers = buildCustomerFixtures(context, count('customers'))
  const products = buildProductFixtures(context, count('products'))
  const orders = buildOrderFixtures(context, count('orders'), customers, products)
  const orderFunds = buildOrderFundFixtures(context, count('orderFunds'), orders)
  const shipments = buildShipmentFixtures(context, count('shipments'), orders)

  const shippedByOrderId = new Map<string, number>()
  for (const shipment of shipments) {
    if (shipment.status !== 'active') continue
    const shipped = shipment.items.reduce((sum, item) => sum + item.quantity, 0)
    shippedByOrderId.set(shipment.orderId, (shippedByOrderId.get(shipment.orderId) ?? 0) + shipped)
  }
  const orderSummaries = orders.map((order) =>
    toOrderSummary(order, shippedByOrderId.get(order.id) ?? 0)
  )

  const workers = buildWorkerFixtures(context, count('workers'))
  const wageHistory = buildWageHistoryFixtures(context, count('wageHistory'), workers)
  const settlements = buildSettlementFixtures(context, count('settlements'), workers)
  const refunds = buildRefundFixtures(context, count('refunds'), workers, settlements)
  const workAssignments = buildWorkAssignmentFixtures(context, count('workAssignments'), workers)
  const workTimeReviews = buildWorkTimeReviewFixtures(
    context,
    count('workTimeReviews'),
    workers,
    workAssignments
  )

  const financeCategories = buildFinanceCategoryFixtures(context, count('financeCategories'))
  const advancePayers = buildAdvancePayerFixtures(context, count('advancePayers'))
  const financialEntries = buildFinancialEntryFixtures(
    context,
    count('financialEntries'),
    financeCategories,
    advancePayers
  )
  const pendingReimbursements = buildPendingReimbursementFixtures(
    financialEntries,
    count('pendingReimbursements')
  )

  const workbenchSnapshot = buildWorkbenchSnapshot(
    context,
    count('workbenchDecision'),
    count('workbenchAdvance')
  )

  return {
    timezone: FIXED_TIMEZONE,
    today: FIXED_TODAY,
    weekStart: FIXED_WEEK_START,
    settings: baseSettings(),
    customers,
    products,
    orders,
    orderSummaries,
    orderFunds,
    shipments,
    workers,
    wageHistory,
    settlements,
    refunds,
    financeCategories,
    advancePayers,
    financialEntries,
    pendingReimbursements,
    workAssignments,
    workTimeReviews,
    workbenchSnapshot,
    counts: {
      customers: customers.length,
      products: products.length,
      orders: orders.length,
      orderFunds: orderFunds.length,
      shipments: shipments.length,
      workers: workers.length,
      wageHistory: wageHistory.length,
      settlements: settlements.length,
      refunds: refunds.length,
      financeCategories: financeCategories.length,
      advancePayers: advancePayers.length,
      financialEntries: financialEntries.length,
      pendingReimbursements: pendingReimbursements.length,
      workAssignments: workAssignments.length,
      workTimeReviews: workTimeReviews.length,
      workbenchDecision: workbenchSnapshot.decisionItems.length,
      workbenchAdvance: workbenchSnapshot.advanceItems.length
    }
  }
}
