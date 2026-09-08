import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { V2ReportExportService } from './v2-report-export-service'

describe('V2 经营报表导出', () => {
  it('将当前月度口径的四类 V2 报表导出为业务工作表，不暴露 V1 表结构', () => {
    const service = new V2ReportExportService({
      getOrderBusiness: () => ({
        rows: [{
          orderId: 'order-1', orderCode: 'V2-001', customerName: '小雨', currentAmountCents: 1000,
          netReceivedCents: 700, outstandingCents: 300, productCostCents: 250,
          afterSalesCostCents: 80, knownAccountingCostCents: 330, knownMarginCents: 370
        }],
        totalCurrentAmountCents: 1000, totalNetReceivedCents: 700, totalOutstandingCents: 300,
        totalProductCostCents: 250, totalAfterSalesCostCents: 80,
        totalKnownAccountingCostCents: 330, totalKnownMarginCents: 370
      }),
      getFulfillmentProgress: () => ({
        rows: [{
          orderId: 'order-1', orderCode: 'V2-001', orderItemId: 'item-1', productName: '云朵', confirmedQuantity: 10,
          stages: { making: 2, fluffingBagging: 1, packing: 3, readyToShip: 1, shipped: 3 }
        }],
        totalConfirmedQuantity: 10, totalShippedQuantity: 3
      }),
      listConfirmedSettlements: () => ({
        rows: [{
          id: 'settlement-1', workerId: 'worker-1', workerName: '小林', periodStartOn: '2026-09-01',
          periodEndOn: '2026-09-07', finalPaidAmountCents: 300, paidOn: '2026-09-08', managerNote: '已确认'
        }],
        totalFinalPaidCents: 300
      }),
      getMonthlyOperation: (month: string) => ({
        month, incomeCents: 700, operatingExpenseCents: 420, operatingResultCents: 280,
        confirmedSettlementPaidCents: 300
      })
    } as never)

    const workbook = XLSX.read(service.exportWorkbook({ month: '2026-09' }), { type: 'buffer' })

    expect(workbook.SheetNames).toEqual(['订单核算', '履约进度', '已确认工资', '月度经营'])
    const orders = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['订单核算']!)
    const monthly = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['月度经营']!)
    expect(Object.keys(orders[0]!)).toEqual([
      '订单号', '客户', '确认金额', '净收款', '待收', '商品成本', '售后成本', '已知核算成本', '核算利润参考'
    ])
    expect(orders[0]).toMatchObject({ 订单号: 'V2-001', 客户: '小雨', 净收款: 700 })
    expect(orders[0]).not.toHaveProperty('customer_snapshot_json')
    expect(monthly).toEqual([{
      统计月份: '2026-09', 实际收入: 700, 经营支出: 420, 经营结果: 280, 已确认工资: 300
    }])
  })

  it('即使当前没有对应事实，也保留与页面一致的四张业务表表头', () => {
    const service = new V2ReportExportService({
      getOrderBusiness: () => ({ rows: [] }),
      getFulfillmentProgress: () => ({ rows: [] }),
      listConfirmedSettlements: () => ({ rows: [] }),
      getMonthlyOperation: (month: string) => ({
        month, incomeCents: 0, operatingExpenseCents: 0, operatingResultCents: 0, confirmedSettlementPaidCents: 0
      })
    } as never)

    const workbook = XLSX.read(service.exportWorkbook({ month: '2026-09' }), { type: 'buffer' })

    expect(XLSX.utils.sheet_to_json(workbook.Sheets['订单核算']!, { header: 1 })[0]).toEqual([
      '订单号', '客户', '确认金额', '净收款', '待收', '商品成本', '售后成本', '已知核算成本', '核算利润参考'
    ])
    expect(XLSX.utils.sheet_to_json(workbook.Sheets['履约进度']!, { header: 1 })[0]).toEqual([
      '订单号', '商品', '确认数量', '制作中', '待捏毛装袋', '待打包', '待发货', '已发货'
    ])
    expect(XLSX.utils.sheet_to_json(workbook.Sheets['已确认工资']!, { header: 1 })[0]).toEqual([
      '兼职人员', '结算周期', '实际付款日', '实发金额', '负责人备注'
    ])
  })
})
