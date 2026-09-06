import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type StudioDatabase } from '@main/database/connection'
import { StudioRepository } from '@main/repositories/studio-repository'
import { StudioService } from './studio-service'

async function withTemporaryProductImage<T>(
  callback: (imagePath: string) => Promise<T>
): Promise<T> {
  const imagePath = join(tmpdir(), `yumi-export-${randomUUID()}.png`)
  await writeFile(
    imagePath,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9J5i8AAAAASUVORK5CYII=',
      'base64'
    )
  )
  try {
    return await callback(imagePath)
  } finally {
    await rm(imagePath, { force: true })
  }
}

function createService(): {
  database: StudioDatabase
  repository: StudioRepository
  service: StudioService
} {
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
    expect(corrected.items[0]).toMatchObject({
      shipmentQuantity: 2,
      shippedQuantity: 2,
      pendingQuantity: 3
    })

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

describe('订单表与发货清单分离导出', () => {
  const databases: StudioDatabase[] = []

  afterEach(() => databases.splice(0).forEach((database) => database.close()))

  it('导出带客户确认版式、报价构成、产品图和合计的订单表', async () => {
    const XLSX = await import('xlsx')
    const ExcelJS = await import('exceljs')
    await withTemporaryProductImage(async (imagePath) => {
      const context = createService()
      databases.push(context.database)
      const product = context.service.createProduct({
        ...productInput,
        packagingCostCents: 100,
        replacementBagCostCents: 80,
        imagePath
      })
      const order = context.service.createOrder({
        customer: { name: '小雨', contact: '13800000000', defaultAddress: '上海市静安区' },
        expectedShipDate: '2026-09-15',
        notes: '双面防尘扣',
        items: [{ productId: product.id, quantity: 5 }]
      })
      context.service.createShipment({
        orderId: order.id,
        shippedAt: '2026-09-10',
        items: [{ orderItemId: order.items[0]!.id, quantity: 2 }]
      })

      const shipmentsBeforeExport = context.service.listShipments(order.id)
      const workbook = XLSX.read(await context.service.exportOrderSheet({ orderId: order.id }), {
        type: 'buffer'
      })
      const sheet = workbook.Sheets['订单表']!
      const orderDate = order.createdAt.slice(0, 10).replaceAll('-', '.')

      expect(workbook.SheetNames).toEqual(['订单表'])
      expect(sheet.A1?.v).toBe('客户：小雨')
      expect(sheet.F1?.v).toBe('联系电话：13800000000')
      expect(sheet.A2?.v).toBe('收货地址：上海市静安区')
      expect(sheet.A3?.v).toBe(`下单表：${orderDate}`)
      expect(
        [
          '序号',
          '产品图',
          '产品名称',
          '产品克重',
          '理望单价',
          '包装费',
          '替换袋',
          '总单价',
          '订购数量',
          '总金额',
          '备注'
        ].map((column) => sheet[`${column === '序号' ? 'A' : ''}4`]?.v)
      ).not.toEqual([])
      expect(
        ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].map(
          (column) => sheet[`${column}4`]?.v
        )
      ).toEqual([
        '序号',
        '产品图',
        '产品名称',
        '产品克重',
        '理望单价',
        '包装费',
        '替换袋',
        '总单价',
        '订购数量',
        '总金额',
        '备注'
      ])
      expect(
        ['A', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].map((column) => sheet[`${column}5`]?.v)
      ).toEqual([1, '奶油小熊', 20, 39, 1, 0.8, 40.8, 5, 204, '双面防尘扣'])
      expect(sheet.A6?.v).toBe('合计')
      expect(sheet.I6?.v).toBe(5)
      expect(sheet.J6?.v).toBe(204)
      const styledWorkbook = new ExcelJS.Workbook()
      await styledWorkbook.xlsx.load(
        Buffer.from(await context.service.exportOrderSheet({ orderId: order.id }))
      )
      expect(styledWorkbook.getWorksheet('订单表')!.getImages()).toHaveLength(1)
      expect(context.service.listShipments(order.id)).toEqual(shipmentsBeforeExport)
    })
  })

  it('按单条发货记录导出带全订单商品、累计未发数量、产品图与页尾信息的发货清单', async () => {
    const XLSX = await import('xlsx')
    const ExcelJS = await import('exceljs')
    await withTemporaryProductImage(async (imagePath) => {
      const context = createService()
      databases.push(context.database)
      const firstProduct = context.service.createProduct({ ...productInput, imagePath })
      const secondProduct = context.service.createProduct({
        ...productInput,
        name: '云朵捏捏',
        imagePath
      })
      const order = context.service.createOrder({
        customer: { name: '小雨', defaultAddress: '上海市静安区' },
        expectedShipDate: '2026-09-15',
        items: [
          { productId: firstProduct.id, quantity: 5 },
          { productId: secondProduct.id, quantity: 3 }
        ]
      })
      const shipment = context.service.createShipment({
        orderId: order.id,
        shippedAt: '2026-09-10',
        notes: '第一批',
        items: [{ orderItemId: order.items[0]!.id, quantity: 2 }]
      })
      const anotherOrder = context.service.createOrder({
        customer: { name: '小林' },
        expectedShipDate: '2026-09-18',
        items: [{ productId: firstProduct.id, quantity: 1 }]
      })
      const foreignShipment = context.service.createShipment({
        orderId: anotherOrder.id,
        shippedAt: '2026-09-11',
        items: [{ orderItemId: anotherOrder.items[0]!.id, quantity: 1 }]
      })

      const shipmentsBeforeExport = context.service.listShipments(order.id)
      const workbook = XLSX.read(
        await context.service.exportShipmentManifest({
          orderId: order.id,
          shipmentId: shipment.id
        }),
        { type: 'buffer' }
      )
      const sheet = workbook.Sheets['发货清单']!

      expect(workbook.SheetNames).toEqual(['发货清单'])
      expect(sheet.A1?.v).toBe('9. 10发货清单')
      expect(sheet.A2?.v).toBe('客户：小雨')
      expect(sheet.D2?.v).toBe('发货总数：2')
      expect(['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((column) => sheet[`${column}3`]?.v)).toEqual([
        '序号',
        '产品图',
        '产品名称',
        '采购总数量',
        '本次发货数量',
        '未发货数量',
        '备注'
      ])
      expect(['A', 'C', 'D', 'E', 'F'].map((column) => sheet[`${column}4`]?.v)).toEqual([
        1,
        '奶油小熊',
        5,
        2,
        3
      ])
      expect(['A', 'C', 'D', 'E', 'F'].map((column) => sheet[`${column}5`]?.v)).toEqual([
        2,
        '云朵捏捏',
        3,
        0,
        3
      ])
      expect(sheet.A6?.v).toBe('总计')
      expect(['D', 'E', 'F'].map((column) => sheet[`${column}6`]?.v)).toEqual([8, 2, 6])
      expect(sheet.A7?.v).toBe('发货时间：2026.9.10')
      expect(sheet.D7?.v).toBe('收货人：小雨')
      expect(sheet.A8?.v).toBe('备注：第一批')
      const styledWorkbook = new ExcelJS.Workbook()
      await styledWorkbook.xlsx.load(
        Buffer.from(
          await context.service.exportShipmentManifest({
            orderId: order.id,
            shipmentId: shipment.id
          })
        )
      )
      expect(styledWorkbook.getWorksheet('发货清单')!.getImages()).toHaveLength(2)
      expect(context.service.listShipments(order.id)).toEqual(shipmentsBeforeExport)
      await expect(
        context.service.exportShipmentManifest({
          orderId: order.id,
          shipmentId: foreignShipment.id
        })
      ).rejects.toThrow('发货记录不存在或不属于当前订单')
    })
  })
})
