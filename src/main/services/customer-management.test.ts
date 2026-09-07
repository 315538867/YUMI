import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type StudioDatabase } from '@main/database/connection'
import { StudioRepository } from '@main/repositories/studio-repository'
import { StudioService } from './studio-service'

const productInput = {
  name: '客户汇总测试商品',
  code: 'CUSTOMER-SUMMARY',
  category: '测试',
  basePriceCents: 5000,
  edgePriceCents: 0,
  weightGrams: 10,
  lossRate: 0,
  standardMinutesPerUnit: 10,
  packagingCostCents: 0,
  commissionCentsPerUnit: 0,
  moldCount: 1,
  outputPerMoldPerBatch: 1,
  maxBatchesPerDay: 1
}

function createService() {
  const database = createDatabase(':memory:')
  const repository = new StudioRepository(database)
  return { database, repository, service: new StudioService(repository) }
}

describe('独立客户管理', () => {
  const databases: StudioDatabase[] = []

  afterEach(() => databases.splice(0).forEach((database) => database.close()))

  it('独立维护客户主档，并按名称、联系方式和地址查询', () => {
    const context = createService()
    databases.push(context.database)
    const customer = context.service.createCustomer({
      name: '青柠客户',
      contact: '13900001111',
      defaultAddress: '上海市静安区',
      notes: '只在工作日收货'
    })

    const listed = context.service.listCustomerManagement({ keyword: '1390000' })
    expect(listed).toEqual([
      expect.objectContaining({
        id: customer.id,
        name: '青柠客户',
        orderCount: 0,
        pendingShipmentOrderCount: 0,
        outstandingCents: 0
      })
    ])

    const updated = context.service.updateCustomer({
      ...customer,
      contact: '13800002222',
      defaultAddress: '上海市浦东新区'
    })
    expect(updated).toMatchObject({ contact: '13800002222', defaultAddress: '上海市浦东新区' })
    expect(context.service.listCustomerManagement({ keyword: '浦东' })).toEqual([
      expect.objectContaining({ id: customer.id })
    ])

    const detail = context.service.getCustomerDetail(customer.id)
    expect(detail).toMatchObject({ id: customer.id, notes: '只在工作日收货', orders: [] })

    const removable = context.service.createCustomer({ name: '可删除客户' })
    context.service.deleteCustomer(removable.id)
    expect(context.service.listCustomerManagement()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: removable.id })])
    )
  })

  it('只汇总关联订单，收退款后更新欠款，并拒绝删除有关联订单的客户', () => {
    const context = createService()
    databases.push(context.database)
    const product = context.service.createProduct(productInput)
    const customer = context.service.createCustomer({
      name: '订单客户',
      contact: '13700003333',
      defaultAddress: '原始地址'
    })
    const anotherCustomer = context.service.createCustomer({ name: '其他客户' })
    const order = context.service.createOrder({
      customer: {
        id: customer.id,
        name: customer.name,
        contact: customer.contact,
        defaultAddress: customer.defaultAddress
      },
      expectedShipDate: '2026-09-20',
      items: [{ productId: product.id, quantity: 2 }]
    })
    context.service.createOrder({
      customer: { id: anotherCustomer.id, name: anotherCustomer.name },
      expectedShipDate: '2026-09-21',
      items: [{ productId: product.id, quantity: 1 }]
    })
    context.service.updateOrderProductionStatus({
      orderId: order.id,
      productionStatus: 'pending_schedule'
    })
    context.service.updateOrderProductionStatus({
      orderId: order.id,
      productionStatus: 'in_production'
    })
    context.service.updateOrderProductionStatus({
      orderId: order.id,
      productionStatus: 'pending_shipment'
    })
    context.service.recordPayment({
      orderId: order.id,
      type: 'receipt',
      amountCents: 3000,
      paymentMethod: '微信',
      paidAt: '2026-09-08'
    })
    context.service.recordPayment({
      orderId: order.id,
      type: 'refund',
      amountCents: 500,
      paymentMethod: '微信',
      paidAt: '2026-09-09'
    })

    const detail = context.service.getCustomerDetail(customer.id)
    expect(detail).toMatchObject({
      id: customer.id,
      orderCount: 1,
      pendingShipmentOrderCount: 1,
      outstandingCents: 7500,
      orders: [expect.objectContaining({ id: order.id, outstandingCents: 7500 })]
    })
    expect(detail.orders).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ customerName: anotherCustomer.name })])
    )
    expect(() => context.service.deleteCustomer(customer.id)).toThrow(
      '该客户已有订单记录，不能删除'
    )
  })

  it('保留历史订单快照读取兼容，不依赖客户主档关联', () => {
    const context = createService()
    databases.push(context.database)
    const product = context.service.createProduct(productInput)
    const customer = context.service.createCustomer({
      name: '历史快照客户',
      contact: '13600000000'
    })
    const order = context.service.createOrder({
      customer: { id: customer.id, name: customer.name, contact: customer.contact },
      expectedShipDate: '2026-09-20',
      items: [{ productId: product.id, quantity: 1 }]
    })
    context.database.prepare('UPDATE orders SET customer_id = NULL WHERE id = ?').run(order.id)

    expect(context.service.getOrderDetail(order.id)?.customer).toMatchObject({
      id: customer.id,
      name: '历史快照客户',
      contact: '13600000000'
    })
  })
})
