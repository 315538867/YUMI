import { calculateOrderAmountSummary } from '@main/domain/order-amounts'
import { summarizeMonthlyFinance } from '@main/domain/finance'
import { createFulfillmentState, applyFulfillmentEvent } from '@main/domain/fulfillment'
import { calculateOrderFundSummary } from '@main/domain/order-funds'
import { ReportRepository } from '@main/repositories/report-repository'
import { calculateProductSnapshotCostCents } from '@main/domain/product-costing'
import { calculateOrderSchedule } from '@main/domain/order-schedule'
import { DomainValidationError } from '@main/domain/errors'
import type { V2Database } from '@main/database/v2-connection'
import type { V2ProductOrderSnapshot } from '@shared/contracts/products'
import type {
  V2CapacityRiskReport,
  V2CapacityRiskReportInput,
  V2CapacityRiskReportRow,
  V2ConfirmedSettlementReport,
  V2CustomerOrderInsights,
  V2CustomerOrderShipmentStatus,
  V2CustomerOrderStatus,
  V2DeliveryRiskReport,
  V2DeliveryRiskReportInput,
  V2DeliveryRiskReportRow,
  V2FulfillmentProgressReport,
  V2MonthlyOperationReport,
  V2OrderBusinessReport,
  V2OrderBusinessReportRow,
  V2OrderDocumentsExportInput,
  V2OrderTableDocument,
  V2OrderTableExportInput,
  V2OrderTableExportRow,
  V2ShippingListDocument,
  V2ShippingListExportInput,
  V2ShippingListExportRow
} from '@shared/contracts/reports'


const RISK_BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/

function requireRiskBusinessDate(value: string, label: string): string {
  if (!RISK_BUSINESS_DATE.test(value)) throw new DomainValidationError(`${label}格式必须为 YYYY-MM-DD`)
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new DomainValidationError(`${label}无效`)
  }
  return value
}

function countCalendarDays(startOn: string, endOn: string): number {
  return Math.round((Date.parse(`${endOn}T00:00:00Z`) - Date.parse(`${startOn}T00:00:00Z`)) / 86_400_000)
}

function countInclusiveDays(startOn: string, endOn: string): number {
  return countCalendarDays(startOn, endOn) + 1
}

function riskLevelRank(level: V2CapacityRiskReportRow['level'] | V2DeliveryRiskReportRow['level']): number {
  return { normal: 0, warning: 1, critical: 2, unplanned: 3 }[level]
}

interface CustomerSnapshot {
  name?: string
  contact?: string | null
  defaultAddress?: string | null
}

interface ShipmentDocumentSnapshot {
  shipment?: {
    shippedOn?: string
    carrier?: string | null
    trackingNumber?: string | null
  }
  order?: {
    code?: string
    customerSnapshot?: CustomerSnapshot
    expectedShipDate?: string | null
  }
  items?: Array<{
    orderItemId?: string
    productSnapshot?: V2ProductOrderSnapshot
    orderedQuantity?: number
    thisShipmentQuantity?: number
    shippedQuantity?: number
    remainingQuantity?: number
  }>
}

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

interface OrderBusinessRowWithContext extends V2OrderBusinessReportRow {
  customerId: string | null
  createdAt: string
}

interface CustomerOrderFulfillmentStatus {
  shipmentStatus: V2CustomerOrderShipmentStatus
  orderStatus: V2CustomerOrderStatus
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

  private getOrderBusinessRows(): OrderBusinessRowWithContext[] {
    return this.repository.listOrderBusinessSources().map((source) => {
      const amount = calculateOrderAmountSummary({
        items: source.itemSnapshots.map((item) => ({
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          edge: {
            enabled: item.edgeEnabled,
            quantity: item.edgeQuantity,
            unitPriceCents: item.edgeUnitPriceCents
          },
          itemDiscountCents: item.itemDiscountCents
        })),
        orderDiscountCents: source.orderDiscountCents,
        adjustmentsCents: source.adjustmentsCents
      })
      const funds = calculateOrderFundSummary({
        currentAmountCents: amount.currentAmountCents,
        entries: source.funds
      })
      const productCostCents = source.itemSnapshots.reduce(
        (total, item) =>
          total +
          calculateProductSnapshotCostCents(
            parseJson<V2ProductOrderSnapshot>(item.productSnapshotJson),
            item.quantity,
            item.edgeEnabled ? item.edgeQuantity : 0
          ),
        0
      )
      const knownAccountingCostCents = productCostCents + source.afterSalesCostCents
      return {
        orderId: source.id,
        orderCode: source.code,
        customerId: source.customerId,
        customerName:
          parseJson<CustomerSnapshot>(source.customerSnapshotJson).name?.trim() || '未命名客户',
        createdAt: source.createdAt,
        currentAmountCents: amount.currentAmountCents,
        netReceivedCents: funds.netReceivedCents,
        outstandingCents: funds.outstandingCents,
        productCostCents,
        afterSalesCostCents: source.afterSalesCostCents,
        knownAccountingCostCents,
        knownMarginCents: funds.netReceivedCents - knownAccountingCostCents
      }
    })
  }

  getOrderBusiness(): V2OrderBusinessReport {
    const rows = this.getOrderBusinessRows()
    return {
      rows,
      totalCurrentAmountCents: rows.reduce((total, row) => total + row.currentAmountCents, 0),
      totalNetReceivedCents: rows.reduce((total, row) => total + row.netReceivedCents, 0),
      totalOutstandingCents: rows.reduce((total, row) => total + row.outstandingCents, 0),
      totalProductCostCents: rows.reduce((total, row) => total + row.productCostCents, 0),
      totalAfterSalesCostCents: rows.reduce((total, row) => total + row.afterSalesCostCents, 0),
      totalKnownAccountingCostCents: rows.reduce(
        (total, row) => total + row.knownAccountingCostCents,
        0
      ),
      totalKnownMarginCents: rows.reduce((total, row) => total + row.knownMarginCents, 0)
    }
  }

  private getCustomerOrderFulfillmentStatuses(): Map<string, CustomerOrderFulfillmentStatus> {
    const totals = new Map<string, { confirmedQuantity: number; shippedQuantity: number }>()
    for (const row of this.getFulfillmentProgress().rows) {
      const current = totals.get(row.orderId) ?? { confirmedQuantity: 0, shippedQuantity: 0 }
      current.confirmedQuantity += row.confirmedQuantity
      current.shippedQuantity += row.stages.shipped
      totals.set(row.orderId, current)
    }
    return new Map([...totals].map(([orderId, total]) => {
      const shipmentStatus: V2CustomerOrderShipmentStatus = total.shippedQuantity <= 0
        ? '未发货'
        : total.shippedQuantity >= total.confirmedQuantity
          ? '已发货'
          : '部分发货'
      return [orderId, {
        shipmentStatus,
        orderStatus: shipmentStatus === '已发货' ? '已完成' : '履约中'
      }]
    }))
  }

  listCustomerOrderInsights(): V2CustomerOrderInsights[] {
    const businessRows = this.getOrderBusinessRows()
    const fulfillmentStatuses = this.getCustomerOrderFulfillmentStatuses()
    return this.repository.listCustomersForOrderInsights().map((customer) => {
      const orders = businessRows
        .filter((row) => row.customerId === customer.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.orderId.localeCompare(left.orderId))
        .map((row) => ({
          orderId: row.orderId,
          orderCode: row.orderCode,
          createdAt: row.createdAt,
          currentAmountCents: row.currentAmountCents,
          netReceivedCents: row.netReceivedCents,
          outstandingCents: row.outstandingCents,
          ...(fulfillmentStatuses.get(row.orderId) ?? {
            shipmentStatus: '未发货' as const,
            orderStatus: '履约中' as const
          })
        }))
      return {
        customerId: customer.id,
        customerName: customer.name,
        orderCount: orders.length,
        totalCurrentAmountCents: orders.reduce((total, row) => total + row.currentAmountCents, 0),
        totalNetReceivedCents: orders.reduce((total, row) => total + row.netReceivedCents, 0),
        totalOutstandingCents: orders.reduce((total, row) => total + row.outstandingCents, 0),
        latestOrderDate: orders[0]?.createdAt.slice(0, 10) ?? null,
        orders
      }
    })
  }

  getCustomerOrderInsights(customerId: string): V2CustomerOrderInsights | null {
    return this.listCustomerOrderInsights().find((item) => item.customerId === customerId) ?? null
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

  getCapacityRiskReport(input: V2CapacityRiskReportInput): V2CapacityRiskReport {
    const startOn = requireRiskBusinessDate(input.startOn, '产能风险开始日期')
    const endOn = requireRiskBusinessDate(input.endOn, '产能风险结束日期')
    if (startOn > endOn) throw new DomainValidationError('产能风险开始日期不能晚于结束日期')
    const utilizationWarningBasisPoints = input.utilizationWarningBasisPoints ?? 8_000
    if (!Number.isInteger(utilizationWarningBasisPoints) || utilizationWarningBasisPoints <= 0) {
      throw new DomainValidationError('产能利用率预警阈值必须为正整数')
    }
    const calendarDays = countInclusiveDays(startOn, endOn)
    const grouped = new Map<string, V2CapacityRiskReportRow>()
    for (const source of this.repository.listRiskOrderItemSources()) {
      if (!source.expectedShipDate || source.expectedShipDate < startOn || source.expectedShipDate > endOn) continue
      const state = source.events.reduce(
        (current, event) => applyFulfillmentEvent(current, event),
        createFulfillmentState(source.confirmedQuantity)
      )
      if (state.making <= 0) continue
      const scheduledQuantity = source.scheduledMakingTasks
        .filter((task) => task.assignedOn >= startOn && task.assignedOn <= endOn)
        .reduce((total, task) => total + task.plannedQuantity, 0)
      const existing = grouped.get(source.productId)
      if (existing) {
        existing.demandQuantity += state.making
        existing.scheduledQuantity += scheduledQuantity
        continue
      }
      grouped.set(source.productId, {
        productId: source.productId,
        productName: parseJson<V2ProductOrderSnapshot>(source.productSnapshotJson).name,
        startOn,
        endOn,
        demandQuantity: state.making,
        scheduledQuantity,
        dailyCapacity: source.dailyCapacity,
        availableCapacityQuantity: source.dailyCapacity * calendarDays,
        gapQuantity: 0,
        utilizationBasisPoints: 0,
        level: 'normal',
        riskSources: [],
        productRoute: { productId: source.productId }
      })
    }
    const rows = [...grouped.values()].map((row) => {
      const available = row.availableCapacityQuantity
      row.gapQuantity = Math.max(row.demandQuantity - available, 0)
      const relevantQuantity = Math.max(row.demandQuantity, row.scheduledQuantity)
      row.utilizationBasisPoints = available > 0
        ? Math.ceil((relevantQuantity * 10_000) / available)
        : relevantQuantity > 0 ? 10_000 : 0
      const sources: string[] = []
      if (row.dailyCapacity <= 0) sources.push('未维护有效模具日产能')
      if (row.gapQuantity > 0) sources.push('订单需求超过周期产能')
      if (row.scheduledQuantity > available) sources.push('已排产数量超过周期产能')
      if (sources.length > 0) row.level = 'critical'
      else if (row.utilizationBasisPoints >= utilizationWarningBasisPoints) {
        row.level = 'warning'
        sources.push('产能利用率达到预警阈值')
      }
      row.riskSources = sources
      return row
    })
    return {
      rows: rows.sort((left, right) => riskLevelRank(right.level) - riskLevelRank(left.level)
        || right.gapQuantity - left.gapQuantity || left.productName.localeCompare(right.productName))
    }
  }

  getDeliveryRiskReport(input: V2DeliveryRiskReportInput): V2DeliveryRiskReport {
    const asOf = requireRiskBusinessDate(input.asOf, '交期风险统计日期')
    const warningDays = input.warningDays ?? 2
    if (!Number.isInteger(warningDays) || warningDays < 0) {
      throw new DomainValidationError('交期预警天数必须是非负整数')
    }
    const grouped = new Map<string, V2DeliveryRiskReportRow>()
    for (const source of this.repository.listRiskOrderItemSources()) {
      const state = source.events.reduce(
        (current, event) => applyFulfillmentEvent(current, event),
        createFulfillmentState(source.confirmedQuantity)
      )
      const remainingQuantity = source.confirmedQuantity - state.shipped
      if (remainingQuantity <= 0) continue
      const current = grouped.get(source.orderId)
      if (current) {
        current.remainingQuantity += remainingQuantity
        current.shippedQuantity += state.shipped
        continue
      }
      const productionDeadline = source.expectedShipDate
        ? calculateOrderSchedule({ expectedShipDate: source.expectedShipDate, reservedDays: source.reservedDays }).productionDeadline
        : null
      const row: V2DeliveryRiskReportRow = {
        orderId: source.orderId,
        orderCode: source.orderCode,
        expectedShipDate: source.expectedShipDate,
        productionDeadline,
        remainingQuantity,
        shippedQuantity: state.shipped,
        level: 'normal',
        riskSources: [],
        fulfillmentRoute: { orderId: source.orderId }
      }
      if (!productionDeadline) {
        row.level = 'unplanned'
        row.riskSources.push('缺少预计发货日期')
      } else {
        const daysUntilDeadline = countCalendarDays(asOf, productionDeadline)
        if (daysUntilDeadline < 0) {
          row.level = 'critical'
          row.riskSources.push('制作截止日期已过')
        } else if (daysUntilDeadline <= warningDays) {
          row.level = 'warning'
          row.riskSources.push('接近制作截止日期')
        }
      }
      grouped.set(source.orderId, row)
    }
    return {
      rows: [...grouped.values()].sort((left, right) => riskLevelRank(right.level) - riskLevelRank(left.level)
        || (left.productionDeadline ?? '9999-12-31').localeCompare(right.productionDeadline ?? '9999-12-31')
        || left.orderCode.localeCompare(right.orderCode))
    }
  }

  listConfirmedSettlements(): V2ConfirmedSettlementReport {
    const rows = this.repository.listConfirmedSettlements()
    return {
      rows,
      totalFinalPaidCents: rows.reduce((total, row) => total + row.finalPaidAmountCents, 0)
    }
  }

  /** 订单表导出使用订单主事实与统一金额口径，不把内部字段暴露给业务人员。 */
  getOrderTable(): V2OrderTableExportRow[] {
    return this.repository.listOrderTableSources().map((source) => {
      const amount = calculateOrderAmountSummary({
        items: source.itemSnapshots.map((item) => ({
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          edge: {
            enabled: item.edgeEnabled,
            quantity: item.edgeQuantity,
            unitPriceCents: item.edgeUnitPriceCents
          },
          itemDiscountCents: item.itemDiscountCents
        })),
        orderDiscountCents: source.orderDiscountCents,
        adjustmentsCents: source.adjustmentsCents
      })
      const funds = calculateOrderFundSummary({
        currentAmountCents: amount.currentAmountCents,
        entries: source.funds
      })
      return {
        orderCode: source.code,
        customerName:
          parseJson<CustomerSnapshot>(source.customerSnapshotJson).name?.trim() || '未命名客户',
        createdAt: source.createdAt.slice(0, 10),
        expectedShipDate: source.expectedShipDate as V2OrderTableExportRow['expectedShipDate'],
        itemCount: source.itemCount,
        totalQuantity: source.totalQuantity,
        orderAmountCents: amount.orderAmountCents,
        currentAmountCents: amount.currentAmountCents,
        netReceivedCents: funds.netReceivedCents,
        outstandingCents: funds.outstandingCents,
        notes: source.notes
      }
    })
  }

  /**
   * 订单表工作簿使用逐订单、逐明细的冻结事实。金额使用当前订单金额，
   * 不再输出任何“初期确认金额”概念。
   */
  getOrderTableDocuments(input: V2OrderTableExportInput = {}): V2OrderTableDocument[] {
    return this.repository.listOrderTableSources(input.orderId).map((source) => {
      const customer = parseJson<CustomerSnapshot>(source.customerSnapshotJson)
      const amount = calculateOrderAmountSummary({
        items: source.itemSnapshots.map((item) => ({
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          edge: {
            enabled: item.edgeEnabled,
            quantity: item.edgeQuantity,
            unitPriceCents: item.edgeUnitPriceCents
          },
          itemDiscountCents: item.itemDiscountCents
        })),
        orderDiscountCents: source.orderDiscountCents,
        adjustmentsCents: source.adjustmentsCents
      })
      return {
        orderCode: source.code,
        customerName: customer.name?.trim() || '未命名客户',
        customerContact: customer.contact ?? null,
        customerAddress: customer.defaultAddress ?? null,
        createdAt: source.createdAt.slice(0, 10),
        expectedShipDate: source.expectedShipDate as V2OrderTableDocument['expectedShipDate'],
        notes: source.notes,
        items: source.itemSnapshots.map((item) => {
          const product = parseJson<V2ProductOrderSnapshot>(item.productSnapshotJson)
          const itemAmountCents = item.quantity * item.unitPriceCents
          const edgeAmountCents = item.edgeEnabled ? item.edgeQuantity * item.edgeUnitPriceCents : 0
          return {
            productName: product.name,
            imageAttachmentId: product.imageAttachmentId ?? null,
            unitWeightMilligrams: product.unitWeightMilligrams ?? null,
            unitPriceCents: item.unitPriceCents,
            itemAmountCents,
            edgeEnabled: item.edgeEnabled,
            edgeQuantity: item.edgeEnabled ? item.edgeQuantity : 0,
            edgeUnitPriceCents: item.edgeEnabled ? item.edgeUnitPriceCents : 0,
            edgeAmountCents,
            itemDiscountCents: item.itemDiscountCents,
            quantity: item.quantity,
            lineAmountCents: itemAmountCents + edgeAmountCents - item.itemDiscountCents,
            notes: product.notes ?? null
          }
        }),
        totals: {
          totalQuantity: source.totalQuantity,
          itemAmountCents: amount.itemAmountCents,
          edgeAmountCents: amount.edgeAmountCents,
          itemDiscountCents: amount.itemDiscountCents,
          orderDiscountCents: amount.orderDiscountCents,
          orderAmountCents: amount.currentAmountCents
        }
      }
    })
  }

  /**
   * 全量清单汇总当前发货事实；指定批次则优先使用该批生成时冻结的订单快照，
   * 避免后续订单/客户/商品变化改写历史发货文件。
   */
  getShippingList(input: V2ShippingListExportInput = {}): V2ShippingListExportRow[] {
    return this.repository.listShippingListSources(input.shipmentId, input.orderId).map((source) => {
      const documentSnapshot = source.shipmentSnapshotJson
        ? parseJson<ShipmentDocumentSnapshot>(source.shipmentSnapshotJson)
        : null
      const itemSnapshot = documentSnapshot?.items?.find(
        (item) => item.orderItemId === source.orderItemId
      )
      const customer = documentSnapshot?.order?.customerSnapshot ??
        parseJson<CustomerSnapshot>(source.customerSnapshotJson)
      const orderedQuantity = itemSnapshot?.orderedQuantity ?? source.orderedQuantity
      const shippedQuantity = Math.min(
        itemSnapshot?.shippedQuantity ?? source.shippedQuantity,
        orderedQuantity
      )
      const product = itemSnapshot?.productSnapshot ??
        parseJson<V2ProductOrderSnapshot>(source.productSnapshotJson)
      return {
        orderCode: documentSnapshot?.order?.code ?? source.orderCode,
        customerName: customer.name?.trim() || '未命名客户',
        customerContact: customer.contact ?? null,
        customerAddress: customer.defaultAddress ?? null,
        productName: product.name,
        productImageAttachmentId: product.imageAttachmentId ?? null,
        productNotes: product.notes ?? null,
        unitWeightMilligrams: product.unitWeightMilligrams ?? null,
        expectedShipDate: (documentSnapshot?.order?.expectedShipDate ?? source.expectedShipDate) as V2ShippingListExportRow['expectedShipDate'],
        orderedQuantity,
        thisShipmentQuantity: itemSnapshot?.thisShipmentQuantity ?? null,
        shippedQuantity,
        remainingQuantity: itemSnapshot?.remainingQuantity ?? Math.max(orderedQuantity - shippedQuantity, 0),
        latestShippedOn: (documentSnapshot?.shipment?.shippedOn ?? source.latestShippedOn) as V2ShippingListExportRow['latestShippedOn'],
        carrier: documentSnapshot?.shipment?.carrier ?? source.carrier,
        trackingNumber: documentSnapshot?.shipment?.trackingNumber ?? source.trackingNumber
      }
    })
  }

  /** 发货清单始终保留订单的全部商品；指定批次时仅“本批发货”使用该批冻结数量。 */
  getShippingListDocuments(input: V2OrderDocumentsExportInput = {}): V2ShippingListDocument[] {
    const generatedAt = new Date().toISOString().slice(0, 10)
    const grouped = new Map<string, V2ShippingListDocument>()
    for (const row of this.getShippingList(input)) {
      const existing = grouped.get(row.orderCode)
      const document = existing ?? {
        orderCode: row.orderCode,
        customerName: row.customerName,
        customerContact: row.customerContact ?? null,
        customerAddress: row.customerAddress ?? null,
        generatedAt,
        shippedOn: input.shipmentId ? row.latestShippedOn : null,
        carrier: input.shipmentId ? row.carrier : null,
        trackingNumber: input.shipmentId ? row.trackingNumber : null,
        items: []
      }
      document.items.push({
        productName: row.productName,
        imageAttachmentId: row.productImageAttachmentId ?? null,
        unitWeightMilligrams: row.unitWeightMilligrams ?? null,
        orderedQuantity: row.orderedQuantity,
        thisShipmentQuantity: row.thisShipmentQuantity ?? null,
        shippedQuantity: row.shippedQuantity,
        remainingQuantity: row.remainingQuantity,
        notes: row.productNotes ?? null
      })
      grouped.set(row.orderCode, document)
    }
    return [...grouped.values()]
  }

  getMonthlyOperation(month: string): V2MonthlyOperationReport {
    const summary = summarizeMonthlyFinance({
      month,
      entries: this.repository.listMonthlyFinanceSources()
    })
    const confirmedSettlementPaidCents = this.repository
      .listConfirmedSettlements()
      .filter((settlement) => settlement.paidOn.startsWith(`${month}-`))
      .reduce((total, settlement) => total + settlement.finalPaidAmountCents, 0)
    return { month, ...summary, confirmedSettlementPaidCents }
  }
}
