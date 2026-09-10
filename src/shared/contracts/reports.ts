import type { BusinessDate, Cents, WeightMilligrams } from './common'
import type { V2FulfillmentStageBalances } from './fulfillment'

/**
 * 订单经营报表只统计已写入 V2 的订单资金、产品快照成本与售后核算成本。
 * 兼职工资尚未建立订单分摊规则，故不纳入单订单核算成本。
 */
export interface V2OrderBusinessReportRow {
  orderId: string
  orderCode: string
  customerName: string
  currentAmountCents: Cents
  netReceivedCents: Cents
  outstandingCents: Cents
  productCostCents: Cents
  afterSalesCostCents: Cents
  knownAccountingCostCents: Cents
  knownMarginCents: Cents
}

export interface V2OrderBusinessReport {
  rows: V2OrderBusinessReportRow[]
  totalCurrentAmountCents: Cents
  totalNetReceivedCents: Cents
  totalOutstandingCents: Cents
  totalProductCostCents: Cents
  totalAfterSalesCostCents: Cents
  totalKnownAccountingCostCents: Cents
  totalKnownMarginCents: Cents
}

export type V2CustomerOrderShipmentStatus = '未发货' | '部分发货' | '已发货'
export type V2CustomerOrderStatus = '履约中' | '已完成'

/** 客户详情和客户经营报表共用，orderId 可直接作为订单详情深链。 */
export interface V2CustomerOrderHistoryRow {
  orderId: string
  orderCode: string
  createdAt: string
  currentAmountCents: Cents
  netReceivedCents: Cents
  outstandingCents: Cents
  shipmentStatus: V2CustomerOrderShipmentStatus
  orderStatus: V2CustomerOrderStatus
}

export interface V2CustomerOrderInsights {
  customerId: string
  customerName: string
  orderCount: number
  totalCurrentAmountCents: Cents
  totalNetReceivedCents: Cents
  totalOutstandingCents: Cents
  latestOrderDate: BusinessDate | null
  orders: V2CustomerOrderHistoryRow[]
}

export interface V2FulfillmentProgressReportRow {
  orderId: string
  orderCode: string
  orderItemId: string
  productName: string
  confirmedQuantity: number
  stages: V2FulfillmentStageBalances
}

export interface V2FulfillmentProgressReport {
  rows: V2FulfillmentProgressReportRow[]
  totalConfirmedQuantity: number
  totalShippedQuantity: number
}

/** 仅展示负责人已确认并实际发放的兼职工资结算。 */
export interface V2ConfirmedSettlementReportRow {
  id: string
  workerId: string
  workerName: string
  periodStartOn: BusinessDate
  periodEndOn: BusinessDate
  finalPaidAmountCents: Cents
  paidOn: BusinessDate
  managerNote: string | null
}

export interface V2ConfirmedSettlementReport {
  rows: V2ConfirmedSettlementReportRow[]
  totalFinalPaidCents: Cents
}

/** 按实际收付款日期归集；报销现金事实不重复作为经营支出。 */
export interface V2MonthlyOperationReport {
  month: string
  incomeCents: Cents
  operatingExpenseCents: Cents
  operatingResultCents: Cents
  confirmedSettlementPaidCents: Cents
}

/** 导出按钮沿用页面当前的月度筛选；其他三个工作表均为同一时点的全量 V2 事实。 */

export interface V2OrderTableExportRow {
  orderCode: string
  customerName: string
  createdAt: string
  expectedShipDate: BusinessDate | null
  itemCount: number
  totalQuantity: number
  orderAmountCents: Cents
  currentAmountCents: Cents
  netReceivedCents: Cents
  outstandingCents: Cents
  notes: string | null
}

export interface V2OrderTableDocument {
  orderCode: string
  customerName: string
  customerContact: string | null
  customerAddress: string | null
  createdAt: string
  expectedShipDate: BusinessDate | null
  notes: string | null
  items: Array<{
    productName: string
    imageAttachmentId: string | null
    unitWeightMilligrams: WeightMilligrams | null
    unitPriceCents: Cents
    itemAmountCents: Cents
    edgeEnabled: boolean
    edgeQuantity: number
    edgeUnitPriceCents: Cents
    edgeAmountCents: Cents
    itemDiscountCents: Cents
    quantity: number
    lineAmountCents: Cents
    notes: string | null
  }>
  totals: {
    totalQuantity: number
    itemAmountCents: Cents
    edgeAmountCents: Cents
    itemDiscountCents: Cents
    orderDiscountCents: Cents
    orderAmountCents: Cents
  }
}

export interface V2ShippingListDocument {
  orderCode: string
  customerName: string
  customerContact: string | null
  customerAddress: string | null
  generatedAt: string
  shippedOn: BusinessDate | null
  carrier: string | null
  trackingNumber: string | null
  items: Array<{
    productName: string
    imageAttachmentId: string | null
    unitWeightMilligrams: WeightMilligrams | null
    orderedQuantity: number
    thisShipmentQuantity: number | null
    shippedQuantity: number
    remainingQuantity: number
    notes: string | null
  }>
}

export interface V2OrderTableExportInput {
  /** 已指定时只导出该已保存订单；未指定时导出当前全部订单。 */
  orderId?: string | null
}

export interface V2ShippingListExportInput extends V2OrderTableExportInput {
  shipmentId?: string | null
}

export interface V2OrderDocumentsExportInput extends V2OrderTableExportInput {
  shipmentId?: string | null
}

export interface V2ShippingListExportRow {
  orderCode: string
  customerName: string
  customerContact?: string | null
  customerAddress?: string | null
  productName: string
  productImageAttachmentId?: string | null
  productNotes?: string | null
  unitWeightMilligrams?: WeightMilligrams | null
  expectedShipDate: BusinessDate | null
  orderedQuantity: number
  /** 指定发货批次导出时为该批数量；全量清单中为空。 */
  thisShipmentQuantity?: number | null
  shippedQuantity: number
  remainingQuantity: number
  latestShippedOn: BusinessDate | null
  carrier: string | null
  trackingNumber: string | null
}

export interface V2ReportExportInput {
  month: string
}

export interface V2ReportExportResult {
  savedPath: string | null
}

export type V2RiskLevel = 'normal' | 'warning' | 'critical' | 'unplanned'

export interface V2CapacityRiskReportInput {
  startOn: BusinessDate
  endOn: BusinessDate
  /** 利用率达到该基点值即预警；未传时按 80% 计算。 */
  utilizationWarningBasisPoints?: number
}

export interface V2CapacityRiskReportRow {
  productId: string
  productName: string
  startOn: BusinessDate
  endOn: BusinessDate
  /** 落在周期内、尚未完成的订单制作需求。 */
  demandQuantity: number
  /** 落在周期内且未取消的制作工序排产量。 */
  scheduledQuantity: number
  dailyCapacity: number
  availableCapacityQuantity: number
  gapQuantity: number
  utilizationBasisPoints: number
  level: Exclude<V2RiskLevel, 'unplanned'>
  riskSources: string[]
  productRoute: { productId: string }
}

export interface V2CapacityRiskReport {
  rows: V2CapacityRiskReportRow[]
}

export interface V2DeliveryRiskReportInput {
  asOf: BusinessDate
  /** 距制作截止日期不超过该天数时预警；未传时按 2 天计算。 */
  warningDays?: number
}

export interface V2DeliveryRiskReportRow {
  orderId: string
  orderCode: string
  expectedShipDate: BusinessDate | null
  productionDeadline: BusinessDate | null
  remainingQuantity: number
  shippedQuantity: number
  level: V2RiskLevel
  riskSources: string[]
  fulfillmentRoute: { orderId: string }
}

export interface V2DeliveryRiskReport {
  rows: V2DeliveryRiskReportRow[]
}
