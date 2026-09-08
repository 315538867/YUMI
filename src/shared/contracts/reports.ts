import type { BusinessDate, Cents } from './common'
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
