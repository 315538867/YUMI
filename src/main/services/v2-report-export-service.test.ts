import { describe, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import { V2ReportExportService } from './v2-report-export-service'

describe('V2 经营报表导出', () => {
  it('将当前月度口径的四类 V2 报表导出为业务工作表，不暴露 V1 表结构', () => {
    const service = new V2ReportExportService({
      getOrderBusiness: () => ({
        rows: [
          {
            orderId: 'order-1',
            orderCode: 'V2-001',
            customerName: '小雨',
            currentAmountCents: 1000,
            netReceivedCents: 700,
            outstandingCents: 300,
            productCostCents: 250,
            afterSalesCostCents: 80,
            knownAccountingCostCents: 330,
            knownMarginCents: 370
          }
        ],
        totalCurrentAmountCents: 1000,
        totalNetReceivedCents: 700,
        totalOutstandingCents: 300,
        totalProductCostCents: 250,
        totalAfterSalesCostCents: 80,
        totalKnownAccountingCostCents: 330,
        totalKnownMarginCents: 370
      }),
      getFulfillmentProgress: () => ({
        rows: [
          {
            orderId: 'order-1',
            orderCode: 'V2-001',
            orderItemId: 'item-1',
            productName: '云朵',
            confirmedQuantity: 10,
            stages: { making: 2, fluffingBagging: 1, packing: 3, readyToShip: 1, shipped: 3 }
          }
        ],
        totalConfirmedQuantity: 10,
        totalShippedQuantity: 3
      }),
      listConfirmedSettlements: () => ({
        rows: [
          {
            id: 'settlement-1',
            workerId: 'worker-1',
            workerName: '小林',
            periodStartOn: '2026-09-01',
            periodEndOn: '2026-09-07',
            finalPaidAmountCents: 300,
            paidOn: '2026-09-08',
            managerNote: '已确认'
          }
        ],
        totalFinalPaidCents: 300
      }),
      getMonthlyOperation: (month: string) => ({
        month,
        incomeCents: 700,
        operatingExpenseCents: 420,
        operatingResultCents: 280,
        confirmedSettlementPaidCents: 300
      })
    } as never)

    const workbook = XLSX.read(service.exportWorkbook({ month: '2026-09' }), { type: 'buffer' })

    expect(workbook.SheetNames).toEqual(['订单核算', '履约进度', '已确认工资', '月度经营'])
    const orders = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['订单核算']!)
    const monthly = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['月度经营']!)
    expect(Object.keys(orders[0]!)).toEqual([
      '订单号',
      '客户',
      '订单金额',
      '净收款',
      '待收',
      '商品成本',
      '售后成本',
      '已知核算成本',
      '核算利润参考'
    ])
    expect(orders[0]).toMatchObject({ 订单号: 'V2-001', 客户: '小雨', 净收款: 700 })
    expect(orders[0]).not.toHaveProperty('customer_snapshot_json')
    expect(monthly).toEqual([
      {
        统计月份: '2026-09',
        实际收入: 700,
        经营支出: 420,
        经营结果: 280,
        已确认工资: 300
      }
    ])
  })

  it('即使当前没有对应事实，也保留与页面一致的四张业务表表头', () => {
    const service = new V2ReportExportService({
      getOrderBusiness: () => ({ rows: [] }),
      getFulfillmentProgress: () => ({ rows: [] }),
      listConfirmedSettlements: () => ({ rows: [] }),
      getMonthlyOperation: (month: string) => ({
        month,
        incomeCents: 0,
        operatingExpenseCents: 0,
        operatingResultCents: 0,
        confirmedSettlementPaidCents: 0
      })
    } as never)

    const workbook = XLSX.read(service.exportWorkbook({ month: '2026-09' }), { type: 'buffer' })

    expect(XLSX.utils.sheet_to_json(workbook.Sheets['订单核算']!, { header: 1 })[0]).toEqual([
      '订单号',
      '客户',
      '订单金额',
      '净收款',
      '待收',
      '商品成本',
      '售后成本',
      '已知核算成本',
      '核算利润参考'
    ])
    expect(XLSX.utils.sheet_to_json(workbook.Sheets['履约进度']!, { header: 1 })[0]).toEqual([
      '订单号',
      '商品',
      '确认数量',
      '制作中',
      '待捏毛装袋',
      '待打包',
      '待发货',
      '已发货'
    ])
    expect(XLSX.utils.sheet_to_json(workbook.Sheets['已确认工资']!, { header: 1 })[0]).toEqual([
      '兼职人员',
      '结算周期',
      '实际付款日',
      '实发金额',
      '负责人备注'
    ])
  })
  it('以正式工作簿分别导出订单表和发货清单，并保留图片、金额和发货数量', async () => {
    const getOrderTableDocuments = vi.fn(() => [{
      orderCode: 'V2-001', customerName: '小雨', customerContact: '微信 yumi', customerAddress: '上海市静安区',
      createdAt: '2026-09-09', expectedShipDate: null, notes: '礼品包装',
      items: [{
        productName: '云朵', imageAttachmentId: 'image-1', unitWeightMilligrams: null,
        unitPriceCents: 1_280, itemAmountCents: 12_800, edgeEnabled: true, edgeQuantity: 10,
        edgeUnitPriceCents: 100, edgeAmountCents: 1_000, itemDiscountCents: 0, quantity: 10,
        lineAmountCents: 13_800, notes: '奶油白'
      }],
      totals: {
        totalQuantity: 10, itemAmountCents: 12_800, edgeAmountCents: 1_000,
        itemDiscountCents: 0, orderDiscountCents: 0, orderAmountCents: 13_800
      }
    }])
    const getShippingListDocuments = vi.fn(() => [{
      orderCode: 'V2-001', customerName: '小雨', customerContact: '微信 yumi', customerAddress: '上海市静安区',
      generatedAt: '2026-09-09', shippedOn: '2026-09-09', carrier: '顺丰', trackingNumber: 'SF-001',
      items: [{
        productName: '云朵', imageAttachmentId: 'image-1', unitWeightMilligrams: null,
        orderedQuantity: 10, thisShipmentQuantity: 3, shippedQuantity: 3, remainingQuantity: 7, notes: '奶油白'
      }]
    }])
    const imageResolver = vi.fn(async () => null)
    const service = new V2ReportExportService({ getOrderTableDocuments, getShippingListDocuments } as never, imageResolver)

    const orderTable = await new ExcelJS.Workbook().xlsx.load(await service.exportOrderTableWorkbook())
    const shippingList = await new ExcelJS.Workbook().xlsx.load(
      await service.exportShippingListWorkbook({ shipmentId: 'shipment-1' })
    )
    const orderSheet = orderTable.getWorksheet('订单表')!
    const shippingSheet = shippingList.getWorksheet('发货清单')!

    expect(getOrderTableDocuments).toHaveBeenCalledOnce()
    expect(getShippingListDocuments).toHaveBeenCalledWith({ shipmentId: 'shipment-1' })
    expect(imageResolver).toHaveBeenCalledWith('image-1')
    expect(orderSheet.getCell('B3').value).toBe('V2-001')
    expect(orderSheet.getCell('F8').value).toBe(10)
    expect(orderSheet.getCell('L16').value).toBe(138)
    expect(shippingSheet.getCell('D8').value).toBe(3)
    expect(shippingSheet.getCell('G8').value).toBe(7)
  })

  it('按已保存订单合并导出订单表和发货清单', async () => {
    const getOrderTableDocuments = vi.fn(() => [])
    const getShippingListDocuments = vi.fn(() => [])
    const service = new V2ReportExportService({ getOrderTableDocuments, getShippingListDocuments } as never)

    const workbook = await new ExcelJS.Workbook().xlsx.load(
      await service.exportOrderDocumentsWorkbook({ orderId: 'order-1', shipmentId: 'shipment-1' })
    )

    expect(getOrderTableDocuments).toHaveBeenCalledWith({ orderId: 'order-1' })
    expect(getShippingListDocuments).toHaveBeenCalledWith({ orderId: 'order-1', shipmentId: 'shipment-1' })
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['订单表', '发货清单'])
  })

  it('未指定发货批次时，合并导出入口只保留订单表，不伪造发货清单', async () => {
    const getOrderTableDocuments = vi.fn(() => [])
    const getShippingListDocuments = vi.fn(() => [])
    const service = new V2ReportExportService({ getOrderTableDocuments, getShippingListDocuments } as never)

    const workbook = await new ExcelJS.Workbook().xlsx.load(
      await service.exportOrderDocumentsWorkbook({ orderId: 'order-1' })
    )

    expect(getOrderTableDocuments).toHaveBeenCalledWith({ orderId: 'order-1' })
    expect(getShippingListDocuments).not.toHaveBeenCalled()
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['订单表'])
  })

  it('图片附件缺失时仍可完成正式订单表导出', async () => {
    const imageResolver = vi.fn(async () => {
      throw new Error('附件不存在')
    })
    const service = new V2ReportExportService({
      getOrderTableDocuments: () => [{
        orderCode: 'V2-001', customerName: '小雨', customerContact: null, customerAddress: null,
        createdAt: '2026-09-09', expectedShipDate: null, notes: null,
        items: [{
          productName: '云朵', imageAttachmentId: 'missing', unitWeightMilligrams: null,
          unitPriceCents: 100, itemAmountCents: 100, edgeEnabled: false, edgeQuantity: 0,
          edgeUnitPriceCents: 0, edgeAmountCents: 0, itemDiscountCents: 0, quantity: 1,
          lineAmountCents: 100, notes: null
        }],
        totals: {
          totalQuantity: 1, itemAmountCents: 100, edgeAmountCents: 0,
          itemDiscountCents: 0, orderDiscountCents: 0, orderAmountCents: 100
        }
      }]
    } as never, imageResolver)

    await expect(service.exportOrderTableWorkbook()).resolves.toBeInstanceOf(Uint8Array)
  })

})
