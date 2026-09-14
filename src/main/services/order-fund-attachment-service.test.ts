import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createV2Database, type V2Database } from '@main/database/v2-connection'
import { V2OrderRepository } from '@main/repositories/v2-order-repository'
import { OrderFundAttachmentService } from '@main/services/order-fund-attachment-service'
import { V2OrderService } from '@main/services/v2-order-service'

describe('OrderFundAttachmentService', () => {
  const databases: V2Database[] = []
  const directories: string[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
    directories
      .splice(0)
      .forEach((directory) => rmSync(directory, { force: true, recursive: true }))
  })

  function createFixture() {
    const database = createV2Database(':memory:')
    databases.push(database)
    const directory = mkdtempSync(join(tmpdir(), 'yumi-order-fund-proof-'))
    directories.push(directory)
    let sequence = 0
    const orderService = new V2OrderService(new V2OrderRepository(database), {
      createId: () => `id-${++sequence}`,
      now: () => '2026-09-09T08:00:00.000Z'
    })
    const product = orderService.createProduct({
      name: '凭证测试商品',
      basePriceCents: 5_000,
      packagingCostCents: 0,
      accessoryCostCents: 0,
      replacementBagCostCents: 0,
      edgeConsumableCostCents: 0,
      standardMakingMinutes: 0,
      makingCommissionCents: 0
    })
    const order = orderService.createOrder({
      customer: { name: '小雨' },
      items: [{ productId: product.id, quantity: 1, unitPriceCents: 5_000 }]
    })
    return {
      database,
      directory,
      order,
      orderService,
      attachments: new OrderFundAttachmentService(database, directory, {
        createId: () => `proof-${++sequence}`,
        now: () => '2026-09-09T08:01:00.000Z'
      })
    }
  }

  it('替换收款凭证只改变附件关联，不改变资金事实', () => {
    const { attachments, database, directory, order, orderService } = createFixture()
    const firstSource = join(directory, '定金凭证.txt')
    const replacementSource = join(directory, '尾款凭证.txt')
    writeFileSync(firstSource, 'deposit-proof')
    writeFileSync(replacementSource, 'balance-proof')

    const firstAttachment = attachments.prepareFromFile(firstSource)
    const fund = orderService.recordOrderFund(order.id, {
      businessType: 'payment',
      amountCents: 5_000,
      occurredOn: '2026-09-09',
      paymentMethod: '微信',
      attachmentId: firstAttachment.id,
      note: '定金'
    })
    const factsBefore = database
      .prepare(
        `
      SELECT amount_cents, occurred_on, payment_method, business_type
      FROM financial_entries WHERE id = ?
    `
      )
      .get(fund.id)

    const replacement = attachments.prepareFromFile(replacementSource)
    attachments.attachToFund(fund.id, replacement.id)

    expect(
      database
        .prepare(
          `
      SELECT amount_cents, occurred_on, payment_method, business_type
      FROM financial_entries WHERE id = ?
    `
        )
        .get(fund.id)
    ).toEqual(factsBefore)
    expect(attachments.getFundProof(fund.id)).toMatchObject({
      id: replacement.id,
      originalName: '尾款凭证.txt',
      status: 'available'
    })
    expect(readFileSync(join(directory, replacement.storageKey), 'utf8')).toBe('balance-proof')
    expect(
      database
        .prepare('SELECT action FROM audit_logs WHERE entity_id = ? ORDER BY created_at, id')
        .all(fund.id)
    ).toEqual([{ action: 'order.fund_recorded' }, { action: 'order_fund.proof_replaced' }])
  })

  it('标记缺失的收款凭证，但保持资金流水可读取', () => {
    const { attachments, directory, order, orderService } = createFixture()
    const source = join(directory, '定金凭证.txt')
    writeFileSync(source, 'deposit-proof')
    const attachment = attachments.prepareFromFile(source)
    const fund = orderService.recordOrderFund(order.id, {
      businessType: 'payment',
      amountCents: 2_000,
      occurredOn: '2026-09-09',
      attachmentId: attachment.id
    })
    rmSync(join(directory, attachment.storageKey))

    expect(attachments.getFundProof(fund.id)).toMatchObject({
      id: attachment.id,
      status: 'missing'
    })
    expect(orderService.listOrderFunds(order.id)).toMatchObject([
      { id: fund.id, amountCents: 2_000 }
    ])
  })
})
