import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { V2ApplicationRuntime } from './v2-runtime'

const runtimes: V2ApplicationRuntime[] = []

afterEach(() => {
  runtimes.splice(0).forEach((runtime) => runtime.close())
})

describe('V2 订单核心链路', () => {
  it('在独立数据空间完成快照、金额、资金、分批发货、附件备份恢复并保留 V1 文件', async () => {
    const userDataDirectory = await mkdtemp(join(tmpdir(), 'yumi-v2-workflow-'))
    const v1DatabasePath = join(userDataDirectory, 'yumi-studio.sqlite')
    const v1AttachmentPath = join(userDataDirectory, 'attachments', 'v1.txt')
    await mkdir(join(userDataDirectory, 'attachments'))
    await writeFile(v1DatabasePath, 'v1-only')
    await writeFile(v1AttachmentPath, 'v1-attachment')

    const runtime = new V2ApplicationRuntime(userDataDirectory, '2.0.0')
    runtimes.push(runtime)
    runtime.start()
    const service = runtime.orderService
    const customer = service.createCustomer({ name: '阿月', contact: '微信号' })
    const product = service.createProduct({
      name: '草莓捏捏', code: 'NY-001', category: '水果', basePriceCents: 8_000,
      materialCostCents: 1_500, packagingCostCents: 300, accessoryCostCents: 200,
      replacementBagCostCents: 50, edgeCostCents: 100, standardMakingMinutes: 15,
      makingCommissionCents: 500, makingGlueCostCents: 80
    })
    const order = service.createOrder({
      customerId: customer.id,
      customer: { name: customer.name, contact: customer.contact },
      items: [{ productId: product.id, quantity: 3, unitPriceCents: 8_000 }],
      initialConfirmedAmountCents: 24_000,
      expectedShipDate: '2026-09-15'
    })

    service.updateCustomer({ id: customer.id, name: '阿月（更新）', contact: '新微信', enabled: true })
    service.updateProduct({
      id: product.id, name: '草莓捏捏（更新）', code: product.code, category: product.category,
      basePriceCents: 9_000, materialCostCents: product.materialCostCents,
      packagingCostCents: product.packagingCostCents, accessoryCostCents: product.accessoryCostCents,
      replacementBagCostCents: product.replacementBagCostCents, edgeCostCents: product.edgeCostCents,
      standardMakingMinutes: product.standardMakingMinutes, makingCommissionCents: product.makingCommissionCents,
      makingGlueCostCents: product.makingGlueCostCents, enabled: true
    })
    service.recordOrderFund(order.id, { businessType: 'payment', amountCents: 15_000, occurredOn: '2026-09-07' })
    service.recordOrderFund(order.id, { businessType: 'refund', amountCents: 1_000, occurredOn: '2026-09-08' })
    runtime.fulfillmentService.recordOpeningWip({
      orderItemId: order.items[0].id,
      targetStage: 'ready_to_ship',
      quantity: 3,
      occurredOn: '2026-09-07',
      note: '上线前已打包库存'
    })
    service.createShipment(order.id, {
      shippedOn: '2026-09-09',
      items: [{ orderItemId: order.items[0].id, quantity: 2 }]
    })
    service.createShipment(order.id, {
      shippedOn: '2026-09-10',
      items: [{ orderItemId: order.items[0].id, quantity: 1 }]
    })

    const persisted = service.getOrder(order.id)
    expect(persisted).toMatchObject({
      customerSnapshot: { name: '阿月', contact: '微信号' },
      items: [{ productSnapshot: { name: '草莓捏捏', basePriceCents: 8_000 } }],
      amount: { currentAmountCents: 24_000 },
      funds: { receivedCents: 15_000, refundedCents: 1_000, netReceivedCents: 14_000, outstandingCents: 10_000 }
    })
    expect(service.listShipments(order.id).map((shipment) => shipment.items)).toEqual([
      [expect.objectContaining({ orderItemId: order.items[0].id, quantity: 2 })],
      [expect.objectContaining({ orderItemId: order.items[0].id, quantity: 1 })]
    ])
    expect(runtime.fulfillmentService.getOrderItemFulfillment(order.items[0].id).stages).toMatchObject({
      readyToShip: 0,
      shipped: 3
    })

    await mkdir(runtime.storage.attachmentDirectory)
    await writeFile(join(runtime.storage.attachmentDirectory, 'order-note.txt'), 'V2 attachment')
    const sourceBackup = await runtime.backupService.createBackup()
    service.createCustomer({ name: '仅存在于恢复前' })
    await writeFile(join(runtime.storage.attachmentDirectory, 'later.txt'), 'later')

    await runtime.restore({ backupPath: sourceBackup.backupPath, confirmed: true })

    expect(runtime.orderService.listCustomers().map((item) => item.name)).toEqual(['阿月（更新）'])
    expect(runtime.orderService.getOrder(order.id)?.funds.outstandingCents).toBe(10_000)
    await expect(readFile(join(runtime.storage.attachmentDirectory, 'order-note.txt'), 'utf8')).resolves.toBe('V2 attachment')
    await expect(readFile(join(runtime.storage.attachmentDirectory, 'later.txt'), 'utf8')).rejects.toThrow()
    await expect(readFile(v1DatabasePath, 'utf8')).resolves.toBe('v1-only')
    await expect(readFile(v1AttachmentPath, 'utf8')).resolves.toBe('v1-attachment')
  })
})
