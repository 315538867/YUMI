import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type StudioDatabase } from '@main/database/connection'
import { StudioRepository } from '@main/repositories/studio-repository'
import { StudioService } from './studio-service'

describe('审计日志写入器', () => {
  const databases: StudioDatabase[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
  })

  it('记录商品产能、订单价格、收退款和排班风险/缺勤的前后值', () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const repository = new StudioRepository(database)
    const service = new StudioService(repository)
    const product = service.createProduct({
      name: '审计商品',
      basePriceCents: 3000,
      edgePriceCents: 200,
      weightGrams: 10,
      lossRate: 0.05,
      standardMinutesPerUnit: 20,
      packagingCostCents: 50,
      commissionCentsPerUnit: 100,
      moldCount: 2,
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 2
    })
    const productUpdate = service.updateProduct({
      ...product,
      basePriceCents: 3300,
      moldCount: 4,
      enabled: true
    })
    expect(productUpdate?.dailyCapacity).toBe(8)

    const order = service.createOrder({
      customer: { name: '审计客户' },
      expectedShipDate: '2026-09-20',
      items: [{ productId: product.id, quantity: 2, unitPriceCents: 3000 }]
    })
    const updatedOrder = service.updateOrder({
      id: order.id,
      customer: { id: order.customerId!, name: '审计客户' },
      expectedShipDate: '2026-09-19',
      discountCents: 100,
      items: [{ productId: product.id, quantity: 2, unitPriceCents: 3200 }]
    })
    const paymentOrder = service.recordPayment({
      orderId: order.id,
      type: 'receipt',
      amountCents: 1000,
      paymentMethod: '转账',
      paidAt: '2026-09-05'
    })
    const worker = service.createWorker({
      name: '审计兼职',
      hourlyWageCents: 2800,
      defaultWorkStart: '09:00',
      defaultWorkEnd: '18:00'
    })
    const shift = service.saveShift({
      workerId: worker.id,
      shiftDate: '2026-09-19',
      startTime: '09:00',
      endTime: '10:00',
      tasks: [{ orderItemId: updatedOrder.items[0]!.id, plannedQuantity: 1 }],
      confirmedWarningCodes: ['DEADLINE_RISK', 'SHIFT_UNDER_CAPACITY']
    })
    service.updateShiftStatus({ shiftId: shift.id, status: 'absent' })

    const productLogs = repository.listAuditLogs('product')
    expect(productLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'product.created', entityId: product.id }),
        expect.objectContaining({ action: 'product.updated', entityId: product.id })
      ])
    )
    const productUpdateLog = productLogs.find((log) => log.action === 'product.updated')
    expect(productUpdateLog).toBeDefined()
    const productDetailLog = repository.getAuditLog(productUpdateLog!.id)
    expect(productDetailLog).toMatchObject({
      before: expect.objectContaining({ moldCount: 2 }),
      after: expect.objectContaining({ moldCount: 4 }),
      metadata: expect.objectContaining({
        capacityBefore: expect.objectContaining({ dailyCapacity: 4 }),
        capacityAfter: expect.objectContaining({ dailyCapacity: 8 })
      })
    })

    const orderLog = repository
      .listAuditLogs('order')
      .find((log) => log.action === 'order.updated' && log.entityId === order.id)
    expect(repository.getAuditLog(orderLog!.id)).toMatchObject({
      before: expect.objectContaining({
        items: [expect.objectContaining({ unitPriceCents: 3000 })]
      }),
      after: expect.objectContaining({
        discountCents: 100,
        items: [expect.objectContaining({ unitPriceCents: 3200 })]
      }),
      metadata: expect.objectContaining({ pricingChanged: true })
    })

    const paymentLog = repository.listAuditLogs('payment').find((log) => log.entityId === order.id)
    expect(repository.getAuditLog(paymentLog!.id)).toMatchObject({
      before: null,
      after: expect.objectContaining({ id: expect.any(String), amountCents: 1000 }),
      metadata: { orderId: order.id, paymentType: 'receipt' }
    })
    expect(paymentOrder.financial.receivedCents).toBe(1000)

    const shiftLog = repository.getAuditLog(
      repository.listAuditLogs('shift').find((log) => log.action === 'shift.saved')!.id
    )
    expect(shiftLog).toMatchObject({
      metadata: expect.objectContaining({
        risks: expect.arrayContaining([expect.objectContaining({ code: 'DEADLINE_RISK' })]),
        confirmedWarningCodes: ['DEADLINE_RISK', 'SHIFT_UNDER_CAPACITY']
      })
    })
    const absenceLog = repository
      .listAuditLogs('shift')
      .find((log) => log.action === 'shift.status.updated' && log.entityId === shift.id)
    expect(repository.getAuditLog(absenceLog!.id)).toMatchObject({
      before: { status: 'scheduled' },
      after: { status: 'absent' },
      metadata: { releasesUnfinishedQuantity: true }
    })

    const recoveryLog = repository.recordAudit({
      action: 'backup.restored',
      entityType: 'backup',
      entityId: 'backup-2026-09-05',
      before: { databaseVersion: 3 },
      after: { databaseVersion: 2 },
      metadata: { confirmed: true, backupPath: 'safe-copy.zip' }
    })
    expect(recoveryLog).toMatchObject({
      action: 'backup.restored',
      entityType: 'backup',
      actorName: '本机管理员',
      before: { databaseVersion: 3 },
      after: { databaseVersion: 2 },
      metadata: { confirmed: true, backupPath: 'safe-copy.zip' }
    })
    expect(recoveryLog.createdAt).toEqual(expect.any(String))
  })
})
