import * as XLSX from 'xlsx'
import type { V2ReportExportInput } from '@shared/contracts/reports'
import type { ReportService } from './report-service'

function appendBusinessSheet(
  workbook: XLSX.WorkBook,
  name: string,
  headers: string[],
  rows: Array<Array<string | number>>
): void {
  // 固定表头保证空数据时的导出结构仍与报表页面一致。
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...rows]), name)
}

/**
 * 以报表服务提供的 V2 已确认事实生成工作簿。
 * 此处不读取数据库、更不引用 V1 服务或表，确保导出与报表页面使用相同口径。
 */
export class V2ReportExportService {
  constructor(private readonly reports: Pick<ReportService, 'getOrderBusiness' | 'getFulfillmentProgress' | 'listConfirmedSettlements' | 'getMonthlyOperation'>) {}

  exportWorkbook(input: V2ReportExportInput): Uint8Array {
    const orderBusiness = this.reports.getOrderBusiness()
    const fulfillment = this.reports.getFulfillmentProgress()
    const settlements = this.reports.listConfirmedSettlements()
    const monthly = this.reports.getMonthlyOperation(input.month)
    const workbook = XLSX.utils.book_new()

    appendBusinessSheet(workbook, '订单核算', [
      '订单号', '客户', '确认金额', '净收款', '待收', '商品成本', '售后成本', '已知核算成本', '核算利润参考'
    ], orderBusiness.rows.map((row) => [
      row.orderCode, row.customerName, row.currentAmountCents, row.netReceivedCents, row.outstandingCents,
      row.productCostCents, row.afterSalesCostCents, row.knownAccountingCostCents, row.knownMarginCents
    ]))

    appendBusinessSheet(workbook, '履约进度', [
      '订单号', '商品', '确认数量', '制作中', '待捏毛装袋', '待打包', '待发货', '已发货'
    ], fulfillment.rows.map((row) => [
      row.orderCode, row.productName, row.confirmedQuantity, row.stages.making, row.stages.fluffingBagging,
      row.stages.packing, row.stages.readyToShip, row.stages.shipped
    ]))

    appendBusinessSheet(workbook, '已确认工资', [
      '兼职人员', '结算周期', '实际付款日', '实发金额', '负责人备注'
    ], settlements.rows.map((row) => [
      row.workerName, `${row.periodStartOn} 至 ${row.periodEndOn}`, row.paidOn,
      row.finalPaidAmountCents, row.managerNote ?? ''
    ]))

    appendBusinessSheet(workbook, '月度经营', [
      '统计月份', '实际收入', '经营支出', '经营结果', '已确认工资'
    ], [[
      monthly.month, monthly.incomeCents, monthly.operatingExpenseCents,
      monthly.operatingResultCents, monthly.confirmedSettlementPaidCents
    ]])

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  }
}
