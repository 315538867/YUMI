import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import {
  buildOrderAndShippingWorkbook,
  buildOrderTableWorkbook,
  buildShippingListWorkbook,
  type OrderTableDocument,
  type ShippingListDocument
} from './order-document-workbook'

const imageBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+CdS6WQAAAABJRU5ErkJggg==',
  'base64'
)

const order: OrderTableDocument = {
  orderCode: 'YUMI-20260909-001',
  customer: { name: '小雨', contact: '微信：xiaoyu', address: '上海市静安区' },
  createdAt: '2026-09-09',
  expectedShipDate: '2026-09-15',
  notes: '请在发货前确认地址',
  items: [
    {
      productName: '云朵捏捏',
      image: { buffer: imageBuffer, extension: 'png' },
      unitWeightMilligrams: 12500,
      unitPriceCents: 1990,
      itemAmountCents: 3980,
      edgeEnabled: true,
      edgeQuantity: 2,
      edgeUnitPriceCents: 300,
      edgeAmountCents: 600,
      itemDiscountCents: 180,
      quantity: 2,
      lineAmountCents: 4400,
      notes: '奶油白'
    }
  ],
  totals: {
    totalQuantity: 2,
    itemAmountCents: 3980,
    edgeAmountCents: 600,
    itemDiscountCents: 180,
    orderDiscountCents: 100,
    orderAmountCents: 4300
  }
}

const shipping: ShippingListDocument = {
  orderCode: order.orderCode,
  customer: order.customer,
  generatedAt: '2026-09-09',
  shipment: { shippedOn: '2026-09-09', carrier: '顺丰', trackingNumber: 'SF001' },
  items: [
    {
      productName: '云朵捏捏',
      image: { buffer: imageBuffer, extension: 'png' },
      unitWeightMilligrams: 12500,
      orderedQuantity: 2,
      thisShipmentQuantity: 1,
      shippedQuantity: 1,
      remainingQuantity: 1,
      notes: '奶油白'
    },
    {
      productName: '草莓捏捏',
      image: null,
      unitWeightMilligrams: null,
      orderedQuantity: 3,
      thisShipmentQuantity: 0,
      shippedQuantity: 0,
      remainingQuantity: 3,
      notes: null
    }
  ]
}

describe('订单与发货单工作簿构建器', () => {
  it('生成可打印的订单表，包含订单级缝边和金额汇总', async () => {
    const workbook = await new ExcelJS.Workbook().xlsx.load(await buildOrderTableWorkbook([order]))
    const sheet = workbook.getWorksheet('订单表')!

    expect(sheet.getCell('A1').value).toBe('YUMI 订单表')
    expect(sheet.getCell('B3').value).toBe(order.orderCode)
    expect(sheet.getCell('C7').value).toBe('缝边')
    expect(sheet.getCell('L8').value).toBe(44)
    expect(sheet.getCell('A11').value).toBe('订单优惠')
    expect(sheet.getCell('L16').value).toBe(43)
    expect(sheet.views[0]?.state).toBe('frozen')
    expect(sheet.pageSetup.fitToPage).toBe(true)
    expect(sheet.pageSetup.printArea).toContain('A1:M16')
    expect(workbook.model.media).toHaveLength(1)
  })

  it('合并工作簿固定包含订单表和发货清单两个可打印工作表', async () => {
    const workbook = await new ExcelJS.Workbook().xlsx.load(
      await buildOrderAndShippingWorkbook([order], [shipping])
    )

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['订单表', '发货清单'])
    expect(workbook.getWorksheet('订单表')!.getCell('B3').value).toBe(order.orderCode)
    expect(workbook.getWorksheet('发货清单')!.getCell('B3').value).toBe(shipping.orderCode)
  })

  it('无批次入口生成发货汇总，不伪装为某一批次清单', async () => {
    const workbook = await new ExcelJS.Workbook().xlsx.load(
      await buildShippingListWorkbook([{ ...shipping, shipment: null, items: shipping.items.map((item) => ({
        ...item,
        thisShipmentQuantity: null
      })) }])
    )
    const sheet = workbook.getWorksheet('发货汇总')!

    expect(sheet.getCell('A1').value).toBe('YUMI 发货汇总')
    expect(sheet.getCell('F4').value).toBe('仅统计有效发货批次')
  })

  it('生成发货清单，未发商品也保留，并支持缺失图片和重量', async () => {
    const workbook = await new ExcelJS.Workbook().xlsx.load(await buildShippingListWorkbook([shipping]))
    const sheet = workbook.getWorksheet('发货清单')!

    expect(sheet.getCell('A1').value).toBe('YUMI 发货清单')
    expect(sheet.getCell('B3').value).toBe(shipping.orderCode)
    expect(sheet.getCell('D7').value).toBe('本批发货')
    expect(sheet.getCell('D8').value).toBe(1)
    expect(sheet.getCell('D9').value).toBe(0)
    expect(sheet.getCell('B9').value).toBe('草莓捏捏')
    expect(sheet.getCell('C9').value).toBe('未维护')
    expect(sheet.pageSetup.printArea).toContain('A1:H9')
    expect(workbook.model.media).toHaveLength(1)
  })
})
