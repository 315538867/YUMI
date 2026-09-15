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
      name: '草莓捏捏',
      basePriceCents: 8_000,
      packagingCostCents: 300,
      accessoryCostCents: 200,
      replacementBagCostCents: 50,
      edgeConsumableCostCents: 100,
      standardMakingMinutes: 15,
      makingCommissionCents: 500
    })
    const order = service.createOrder({
      customerId: customer.id,
      customer: { name: customer.name, contact: customer.contact },
      items: [{ productId: product.id, quantity: 3, unitPriceCents: 8_000 }],
      expectedShipDate: '2026-09-15'
    })

    service.updateCustomer({
      id: customer.id,
      name: '阿月（更新）',
      contact: '新微信',
      enabled: true
    })
    service.updateProduct({
      id: product.id,
      name: '草莓捏捏（更新）',
      basePriceCents: 9_000,
      packagingCostCents: product.packagingCostCents,
      accessoryCostCents: product.accessoryCostCents,
      replacementBagCostCents: product.replacementBagCostCents,
      edgeConsumableCostCents: product.edgeConsumableCostCents,
      standardMakingMinutes: product.standardMakingMinutes,
      makingCommissionCents: product.makingCommissionCents,
      enabled: true
    })
    service.recordOrderFund(order.id, {
      businessType: 'payment',
      amountCents: 15_000,
      occurredOn: '2026-09-07'
    })
    service.recordOrderFund(order.id, {
      businessType: 'refund',
      amountCents: 1_000,
      occurredOn: '2026-09-08'
    })
    runtime.fulfillmentService.adjustStageQuantity({
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
      funds: {
        receivedCents: 15_000,
        refundedCents: 1_000,
        netReceivedCents: 14_000,
        outstandingCents: 10_000
      }
    })
    expect(service.listShipments(order.id).map((shipment) => shipment.items)).toEqual([
      [expect.objectContaining({ orderItemId: order.items[0].id, quantity: 2 })],
      [expect.objectContaining({ orderItemId: order.items[0].id, quantity: 1 })]
    ])
    expect(
      runtime.fulfillmentService.getOrderItemFulfillment(order.items[0].id).stages
    ).toMatchObject({
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
    await expect(
      readFile(join(runtime.storage.attachmentDirectory, 'order-note.txt'), 'utf8')
    ).resolves.toBe('V2 attachment')
    await expect(
      readFile(join(runtime.storage.attachmentDirectory, 'later.txt'), 'utf8')
    ).rejects.toThrow()
    await expect(readFile(v1DatabasePath, 'utf8')).resolves.toBe('v1-only')
    await expect(readFile(v1AttachmentPath, 'utf8')).resolves.toBe('v1-attachment')
  })

  it('四工序一次核算链路：合格流转、不合格与未完成留在待制作，三道计时工序按订单商品推进', async () => {
    const userDataDirectory = await mkdtemp(join(tmpdir(), 'yumi-v2-four-process-'))
    const runtime = new V2ApplicationRuntime(userDataDirectory, '2.0.0')
    runtimes.push(runtime)
    runtime.start()
    const orders = runtime.orderService
    const fulfillment = runtime.fulfillmentService
    const settlements = runtime.settlementService
    const reviews = runtime.workTimeReviewService
    const worker = settlements.createWorker({
      name: '链路兼职',
      hourlyWageCents: 2_000,
      effectiveOn: '2026-08-01'
    })
    const product = orders.createProduct({
      name: '草莓捏捏',
      basePriceCents: 8_000,
      packagingCostCents: 300,
      accessoryCostCents: 200,
      replacementBagCostCents: 50,
      edgeConsumableCostCents: 100,
      unitWeightMilligrams: 25_000,
      standardMakingMinutes: 15,
      expectedFluffingBaggingMinutes: 20,
      expectedEdgeSewingMinutes: 10,
      expectedPackingMinutes: 5,
      makingCommissionCents: 500,
      fluffingBaggingCommissionCents: 85,
      edgeSewingCommissionCents: 40
    })
    const order = orders.createOrder({
      customer: { name: '链路客户' },
      items: [
        {
          productId: product.id,
          quantity: 10,
          unitPriceCents: 8_000,
          edge: { enabled: true, quantity: 4, unitPriceCents: 300 }
        },
        { productId: product.id, quantity: 6, unitPriceCents: 8_000 }
      ]
    })
    const edgedItem = order.items[0]!
    const plainItem = order.items[1]!
    /** 阶段数量守恒：所有阶段余额之和必须等于订单数量。 */
    const totalQuantity = (orderItemId: string) => {
      const stages = fulfillment.getOrderItemFulfillment(orderItemId).stages
      return (
        stages.making +
        stages.fluffingBagging +
        stages.edgeSewing +
        stages.packing +
        stages.readyToShip +
        stages.shipped
      )
    }
    const createTimedShift = (
      processType: 'fluffing_bagging' | 'edge_sewing' | 'packing',
      assignedOn: string
    ) =>
      fulfillment.createWorkAssignment({
        scheduleMode: 'timed_shift',
        workerId: worker.id,
        assignedOn,
        processType
      })

    // 1. 制作一次核算：实际产出 8 件、合格 7 件，不合格 1 与未完成 2 都留在待制作。
    const making = fulfillment.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-08-03',
      processType: 'making',
      tasks: [
        { orderItemId: edgedItem.id, sourceType: 'normal_production', plannedQuantity: 10 },
        { orderItemId: plainItem.id, sourceType: 'normal_production', plannedQuantity: 6 }
      ]
    })
    const edgedTask = making.tasks.find((task) => task.orderItemId === edgedItem.id)!
    const plainTask = making.tasks.find((task) => task.orderItemId === plainItem.id)!
    fulfillment.reviewMaking({
      processTaskId: edgedTask.id,
      completedQuantity: 8,
      qualifiedQuantity: 7,
      reviewedOn: '2026-08-03'
    })
    fulfillment.reviewMaking({
      processTaskId: plainTask.id,
      completedQuantity: 6,
      qualifiedQuantity: 6,
      reviewedOn: '2026-08-03'
    })
    expect(
      fulfillment.getWorkAssignment(making.id)!.tasks.find((task) => task.id === edgedTask.id)!
        .reviewSummary
    ).toMatchObject({
      completedQuantity: 8,
      qualifiedQuantity: 7,
      unqualifiedQuantity: 1,
      unfinishedQuantity: 2
    })
    // 待制作只被合格数量扣减：10 − 7 = 3（1 件不合格与 2 件未完成都留在这里）。
    expect(fulfillment.getOrderItemFulfillment(edgedItem.id).stages).toMatchObject({
      making: 3,
      fluffingBagging: 7
    })
    expect(totalQuantity(edgedItem.id)).toBe(10)

    // 2. 捏毛装袋一次核算：合格 7 件按剩余缝边需求分流 4 件待缝边、3 件待打包。
    const fluffing = createTimedShift('fluffing_bagging', '2026-08-04')
    const fluffingCandidates = new Map(
      reviews.listCandidates(fluffing.id).map((candidate) => [candidate.orderItemId, candidate])
    )
    expect(fluffingCandidates.get(edgedItem.id)).toMatchObject({
      processableQuantity: 7,
      expectedUnitMinutes: 20,
      pieceRateCents: 85
    })
    expect(fluffingCandidates.get(plainItem.id)).toMatchObject({ processableQuantity: 6 })
    const fluffingReview = reviews.review({
      workAssignmentId: fluffing.id,
      startedAt: '2026-08-04T09:00',
      endedAt: '2026-08-04T11:00',
      items: [
        { orderItemId: edgedItem.id, completedQuantity: 7 },
        { orderItemId: plainItem.id, completedQuantity: 6 }
      ]
    })
    expect(fluffingReview).toMatchObject({ workedOn: '2026-08-04', approvedMinutes: 120 })
    expect(fulfillment.getOrderItemFulfillment(edgedItem.id).stages).toMatchObject({
      fluffingBagging: 0,
      edgeSewing: 4,
      packing: 3,
      edgeSewingRouted: 4
    })
    expect(fulfillment.getOrderItemFulfillment(plainItem.id).stages).toMatchObject({
      fluffingBagging: 0,
      packing: 6
    })
    expect(totalQuantity(edgedItem.id)).toBe(10)
    expect(totalQuantity(plainItem.id)).toBe(6)

    // 3. 缝边一次核算：候选受剩余缝边需求约束（min(待缝边 4, 剩余需求 4)），完成后进入待打包。
    const edgeSewing = createTimedShift('edge_sewing', '2026-08-05')
    const edgeCandidates = reviews.listCandidates(edgeSewing.id)
    expect(edgeCandidates).toHaveLength(1)
    expect(edgeCandidates[0]).toMatchObject({
      orderItemId: edgedItem.id,
      processableQuantity: 4,
      expectedUnitMinutes: 10,
      pieceRateCents: 40
    })
    reviews.review({
      workAssignmentId: edgeSewing.id,
      startedAt: '2026-08-05T09:00',
      endedAt: '2026-08-05T10:00',
      items: [{ orderItemId: edgedItem.id, completedQuantity: 4 }]
    })
    expect(fulfillment.getOrderItemFulfillment(edgedItem.id).stages).toMatchObject({
      edgeSewing: 0,
      packing: 7
    })
    expect(totalQuantity(edgedItem.id)).toBe(10)

    // 4. 打包一次核算：打包不产生提成，完成后进入待发货。
    const packing = createTimedShift('packing', '2026-08-06')
    const packingCandidates = new Map(
      reviews.listCandidates(packing.id).map((candidate) => [candidate.orderItemId, candidate])
    )
    expect(packingCandidates.get(edgedItem.id)).toMatchObject({
      processableQuantity: 7,
      expectedUnitMinutes: 5,
      pieceRateCents: 0
    })
    expect(packingCandidates.get(plainItem.id)).toMatchObject({
      processableQuantity: 6,
      pieceRateCents: 0
    })
    reviews.review({
      workAssignmentId: packing.id,
      startedAt: '2026-08-06T09:00',
      endedAt: '2026-08-06T10:00',
      items: [
        { orderItemId: edgedItem.id, completedQuantity: 7 },
        { orderItemId: plainItem.id, completedQuantity: 6 }
      ]
    })
    expect(fulfillment.getOrderItemFulfillment(edgedItem.id).stages).toMatchObject({
      packing: 0,
      readyToShip: 7
    })
    expect(fulfillment.getOrderItemFulfillment(plainItem.id).stages).toMatchObject({
      packing: 0,
      readyToShip: 6
    })
    expect(totalQuantity(edgedItem.id)).toBe(10)
    expect(totalQuantity(plainItem.id)).toBe(6)
    // 已进入待发货的数量不再出现在任何计时工序候选里。
    const idlePacking = createTimedShift('packing', '2026-08-07')
    expect(reviews.listCandidates(idlePacking.id)).toEqual([])

    // 未完成数量释放回待制作缺口：剩余 3 件可以重新排制作并一次核算。
    const remaining = fulfillment.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-08-07',
      processType: 'making',
      tasks: [{ orderItemId: edgedItem.id, sourceType: 'normal_production', plannedQuantity: 3 }]
    })
    fulfillment.reviewMaking({
      processTaskId: remaining.tasks[0]!.id,
      completedQuantity: 3,
      qualifiedQuantity: 3,
      reviewedOn: '2026-08-07'
    })
    expect(fulfillment.getOrderItemFulfillment(edgedItem.id).stages).toMatchObject({
      making: 0,
      fluffingBagging: 3,
      readyToShip: 7
    })
    expect(totalQuantity(edgedItem.id)).toBe(10)
  })
})
