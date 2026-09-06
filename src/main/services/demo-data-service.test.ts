import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type StudioDatabase } from '@main/database/connection'
import { DomainValidationError } from '@main/domain/errors'
import { StudioRepository } from '@main/repositories/studio-repository'
import { DemoDataService } from './demo-data-service'
import { StudioService } from './studio-service'

describe('演示数据', () => {
  const databases: StudioDatabase[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
  })

  it('生成可验收的多商品、分次收退款、产能风险、缺勤待补排和实际制作数据', () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const repository = new StudioRepository(database)
    const studio = new StudioService(repository)
    const demo = new DemoDataService(studio, repository)

    const summary = demo.load()

    expect(summary).toMatchObject({ products: 2, orders: 2, workers: 2, shifts: 3 })

    const products = repository.listProducts()
    expect(products.map((product) => product.edgePriceCents).sort((a, b) => a - b)).toEqual([
      300, 500
    ])

    const orders = repository.listOrders()
    const multiProductOrder = orders.find((order) => order.customerName === '林小姐')
    expect(multiProductOrder).toBeDefined()
    const multiProductOrderDetail = repository.getOrderDetail(multiProductOrder!.id)!
    expect(multiProductOrderDetail.items).toHaveLength(2)
    expect(multiProductOrderDetail.payments.map((payment) => payment.type)).toEqual([
      'receipt',
      'receipt',
      'refund'
    ])
    expect(repository.listShipments(multiProductOrder!.id)).toHaveLength(2)
    expect(repository.getOrderShipmentSummary(multiProductOrder!.id)).toEqual([
      expect.objectContaining({ orderedQuantity: 8, shippedQuantity: 3, pendingQuantity: 5 }),
      expect.objectContaining({ orderedQuantity: 3, shippedQuantity: 2, pendingQuantity: 1 })
    ])
    expect(multiProductOrderDetail.items.map((item) => item.productSnapshot.accessoryCostCents)).toEqual([80, 120])
    expect(multiProductOrderDetail.items.map((item) => item.productSnapshot.replacementBagCostCents)).toEqual([30, 40])

    const shifts = repository.listShifts('2000-01-01', '2100-01-01')
    expect(shifts.some((shift) => shift.status === 'absent')).toBe(true)
    expect(
      shifts.some((shift) => shift.confirmedRisks.includes('MOLD_DAILY_CAPACITY_EXCEEDED'))
    ).toBe(true)
    expect(repository.getDashboard().rescheduleTaskCount).toBeGreaterThan(0)

    const completedShift = shifts.find((shift) => shift.status === 'completed')!
    expect(completedShift).toMatchObject({ extraMinutes: 25, totalMinutes: 145 })
    expect(repository.getShiftDetail(completedShift.id)!.tasks[0]).toMatchObject({
      qualifiedQuantity: 3,
      unqualifiedQuantity: 1,
      commissionCostCents: 0
    })
  })

  it('遇到已有业务数据时拒绝加载，避免覆盖真实数据', () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const repository = new StudioRepository(database)
    const studio = new StudioService(repository)
    const demo = new DemoDataService(studio, repository)

    demo.load()

    expect(() => demo.load()).toThrow(DomainValidationError)
    expect(() => demo.load()).toThrow('已有业务数据，不能加载演示数据')
  })
})
