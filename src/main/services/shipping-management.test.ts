import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type StudioDatabase } from '@main/database/connection'
import { StudioRepository } from '@main/repositories/studio-repository'
import { StudioService } from './studio-service'

function createService(): { database: StudioDatabase; repository: StudioRepository; service: StudioService } {
  const database = createDatabase(':memory:')
  const repository = new StudioRepository(database)
  return { database, repository, service: new StudioService(repository) }
}

const productInput = {
  name: '奶油小熊',
  basePriceCents: 3900,
  edgePriceCents: 300,
  weightGrams: 20,
  lossRate: 0.1,
  standardMinutesPerUnit: 30,
  packagingCostCents: 100,
  commissionCentsPerUnit: 200,
  moldCount: 20,
  outputPerMoldPerBatch: 1,
  maxBatchesPerDay: 2
}

describe('订单发货记录', () => {
  const databases: StudioDatabase[] = []

  afterEach(() => databases.splice(0).forEach((database) => database.close()))

  it('由用户录入每次发货，并按订单商品自动汇总已发与待发数量', () => {
    const context = createService()
    databases.push(context.database)
    const product = context.service.createProduct(productInput)
    const order = context.service.createOrder({
      customer: { name: '小雨', defaultAddress: '上海市静安区' },
      expectedShipDate: '2026-09-15',
      items: [{ productId: product.id, quantity: 5 }]
    })

    const first = context.service.createShipment({
      orderId: order.id,
      shippedAt: '2026-09-10',
      notes: '第一批',
      items: [{ orderItemId: order.items[0]!.id, quantity: 2 }]
    })
    const second = context.service.createShipment({
      orderId: order.id,
      shippedAt: '2026-09-12',
      items: [{ orderItemId: order.items[0]!.id, quantity: 1 }]
    })

    expect(first.items).toEqual([
      expect.objectContaining({
        orderItemId: order.items[0]!.id,
        shipmentQuantity: 2,
        shippedQuantity: 2,
        pendingQuantity: 3
      })
    ])
    expect(second.items).toEqual([
      expect.objectContaining({ shipmentQuantity: 1, shippedQuantity: 3, pendingQuantity: 2 })
    ])
    expect(context.service.getOrderShipmentSummary(order.id)).toEqual([
      expect.objectContaining({
        orderItemId: order.items[0]!.id,
        orderedQuantity: 5,
        shippedQuantity: 3,
        pendingQuantity: 2
      })
    ])
    expect(() =>
      context.service.createShipment({
        orderId: order.id,
        shippedAt: '2026-09-13',
        items: [{ orderItemId: order.items[0]!.id, quantity: 3 }]
      })
    ).toThrow('本次发货数量不能超过待发数量（待发 2 件）')
  })

  it('允许修正已保存的发货批次，并保护已发订单商品不能减少或删除', () => {
    const context = createService()
    databases.push(context.database)
    const product = context.service.createProduct(productInput)
    const anotherProduct = context.service.createProduct({ ...productInput, name: '云朵捏捏' })
    const order = context.service.createOrder({
      customer: { name: '小雨' },
      expectedShipDate: '2026-09-15',
      items: [
        { productId: product.id, quantity: 5 },
        { productId: anotherProduct.id, quantity: 2 }
      ]
    })
    const shipment = context.service.createShipment({
      orderId: order.id,
      shippedAt: '2026-09-10',
      items: [{ orderItemId: order.items[0]!.id, quantity: 3 }]
    })

    const corrected = context.service.updateShipment({
      id: shipment.id,
      orderId: order.id,
      shippedAt: '2026-09-11',
      notes: '改为实际数量',
      items: [{ orderItemId: order.items[0]!.id, quantity: 2 }]
    })
    expect(corrected.items[0]).toMatchObject({ shipmentQuantity: 2, shippedQuantity: 2, pendingQuantity: 3 })

    expect(() =>
      context.service.updateOrder({
        id: order.id,
        customer: order.customer,
        expectedShipDate: order.expectedShipDate,
        items: [
          { id: order.items[0]!.id, productId: product.id, quantity: 1 },
          { id: order.items[1]!.id, productId: anotherProduct.id, quantity: 2 }
        ]
      })
    ).toThrow('商品数量不能低于累计已发数量（累计已发 2 件）')
    expect(() =>
      context.service.updateOrder({
        id: order.id,
        customer: order.customer,
        expectedShipDate: order.expectedShipDate,
        items: [{ id: order.items[1]!.id, productId: anotherProduct.id, quantity: 2 }]
      })
    ).toThrow('已有发货明细的订单商品不能删除')
  })
})

describe('订单工作簿导出', () => {
  const databases: StudioDatabase[] = []

  afterEach(() => databases.splice(0).forEach((database) => database.close()))

  it('按已保存订单快照导出订单表和发货清单，并且导出不新增发货记录', async () => {
    const XLSX = await import('xlsx')
    const context = createService()
    databases.push(context.database)
    const product = context.service.createProduct({
      ...productInput,
      accessoryCostCents: 250,
      replacementBagCostCents: 80
    })
    const order = context.service.createOrder({
      customer: { name: '小雨', contact: '13800000000', defaultAddress: '上海市静安区' },
      expectedShipDate: '2026-09-15',
      items: [{ productId: product.id, quantity: 5 }]
    })
    const shipment = context.service.createShipment({
      orderId: order.id,
      shippedAt: '2026-09-10',
      items: [{ orderItemId: order.items[0]!.id, quantity: 2 }]
    })

    const buffer = context.service.exportOrderWorkbook({ orderId: order.id, shipmentId: shipment.id })
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const orderRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets['订单表']!,
      { defval: '' }
    )
    const shippingRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets['发货清单表']!,
      { defval: '' }
    )

    expect(workbook.SheetNames).toEqual(['订单表', '发货清单表'])
    expect(orderRows).toEqual([
      expect.objectContaining({
        收货地址: '上海市静安区',
        配件费: 250,
        替换袋费用: 80,
        订购数量: 5,
        金额: 19500
      }),
      expect.objectContaining({ 商品名称: '合计', 订购数量: 5, 金额: 19500 })
    ])
    expect(shippingRows).toEqual([
      expect.objectContaining({ 本次发货数量: 2, 累计已发数量: 2, 待发数量: 3 })
    ])
    expect(context.service.listShipments(order.id)).toHaveLength(1)

    const withoutShipment = XLSX.read(context.service.exportOrderWorkbook({ orderId: order.id }), {
      type: 'buffer'
    })
    const noShipmentRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      withoutShipment.Sheets['发货清单表']!,
      { defval: '' }
    )
    expect(noShipmentRows[0]).toMatchObject({ 本次发货数量: '', 累计已发数量: 2, 待发数量: 3 })
  })
})
