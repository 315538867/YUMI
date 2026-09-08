import { calculateOrderAmountSummary } from '@main/domain/order-amounts'
import { summarizeMonthlyFinance } from '@main/domain/finance'
import { createFulfillmentState, applyFulfillmentEvent } from '@main/domain/fulfillment'
import { calculateOrderFundSummary } from '@main/domain/order-funds'
import { ReportRepository } from '@main/repositories/report-repository'
import { calculateProductSnapshotCostCents } from '@main/domain/product-costing'
import type { V2Database } from '@main/database/v2-connection'
import type { V2ProductOrderSnapshot } from '@shared/contracts/products'
import type {
  V2ConfirmedSettlementReport,
  V2FulfillmentProgressReport,
  V2MonthlyOperationReport,
  V2OrderBusinessReport
} from '@shared/contracts/reports'

interface CustomerSnapshot { name?: string }

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T
}



function toStageBalances(state: ReturnType<typeof createFulfillmentState>) {
  return {
    making: state.making,
    fluffingBagging: state.fluffingBagging,
    packing: state.packing,
    readyToShip: state.readyToShip,
    shipped: state.shipped
  }
}

/**
 * V2 报表只从 V2 事实表读取：订单资金、商品快照、履约事件、已确认工资与财务流水。
 * 草稿工资、未写入资金事实的数据和 V1 数据库均不会进入这里的汇总。
 */
export class ReportService {
  private readonly repository: ReportRepository

  constructor(database: V2Database) {
    this.repository = new ReportRepository(database)
  }

  getOrderBusiness(): V2OrderBusinessReport {
    const rows = this.repository.listOrderBusinessSources().map((source) => {
      const amount = calculateOrderAmountSummary({
        initialConfirmedAmountCents: source.initialConfirmedAmountCents,
        adjustmentsCents: source.adjustmentsCents
      })
      const funds = calculateOrderFundSummary({
        currentAmountCents: amount.currentAmountCents,
        entries: source.funds
      })
      const productCostCents = source.itemSnapshots.reduce((total, item) => (
        total + calculateProductSnapshotCostCents(parseJson<V2ProductOrderSnapshot>(item.productSnapshotJson), item.quantity)
      ), 0)
      const knownAccountingCostCents = productCostCents + source.afterSalesCostCents
      return {
        orderId: source.id,
        orderCode: source.code,
        customerName: parseJson<CustomerSnapshot>(source.customerSnapshotJson).name?.trim() || '未命名客户',
        currentAmountCents: amount.currentAmountCents,
        netReceivedCents: funds.netReceivedCents,
        outstandingCents: funds.outstandingCents,
        productCostCents,
        afterSalesCostCents: source.afterSalesCostCents,
        knownAccountingCostCents,
        knownMarginCents: funds.netReceivedCents - knownAccountingCostCents
      }
    })
    return {
      rows,
      totalCurrentAmountCents: rows.reduce((total, row) => total + row.currentAmountCents, 0),
      totalNetReceivedCents: rows.reduce((total, row) => total + row.netReceivedCents, 0),
      totalOutstandingCents: rows.reduce((total, row) => total + row.outstandingCents, 0),
      totalProductCostCents: rows.reduce((total, row) => total + row.productCostCents, 0),
      totalAfterSalesCostCents: rows.reduce((total, row) => total + row.afterSalesCostCents, 0),
      totalKnownAccountingCostCents: rows.reduce((total, row) => total + row.knownAccountingCostCents, 0),
      totalKnownMarginCents: rows.reduce((total, row) => total + row.knownMarginCents, 0)
    }
  }

  getFulfillmentProgress(): V2FulfillmentProgressReport {
    const rows = this.repository.listFulfillmentProgressSources().map((source) => {
      const state = source.events.reduce(
        (current, event) => applyFulfillmentEvent(current, event),
        createFulfillmentState(source.confirmedQuantity)
      )
      return {
        orderId: source.orderId,
        orderCode: source.orderCode,
        orderItemId: source.orderItemId,
        productName: parseJson<V2ProductOrderSnapshot>(source.productSnapshotJson).name,
        confirmedQuantity: source.confirmedQuantity,
        stages: toStageBalances(state)
      }
    })
    return {
      rows,
      totalConfirmedQuantity: rows.reduce((total, row) => total + row.confirmedQuantity, 0),
      totalShippedQuantity: rows.reduce((total, row) => total + row.stages.shipped, 0)
    }
  }

  listConfirmedSettlements(): V2ConfirmedSettlementReport {
    const rows = this.repository.listConfirmedSettlements()
    return {
      rows,
      totalFinalPaidCents: rows.reduce((total, row) => total + row.finalPaidAmountCents, 0)
    }
  }

  getMonthlyOperation(month: string): V2MonthlyOperationReport {
    const summary = summarizeMonthlyFinance({ month, entries: this.repository.listMonthlyFinanceSources() })
    const confirmedSettlementPaidCents = this.repository.listConfirmedSettlements()
      .filter((settlement) => settlement.paidOn.startsWith(`${month}-`))
      .reduce((total, settlement) => total + settlement.finalPaidAmountCents, 0)
    return { month, ...summary, confirmedSettlementPaidCents }
  }
}
