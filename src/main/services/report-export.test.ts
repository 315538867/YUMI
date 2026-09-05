import { afterEach, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { createDatabase, type StudioDatabase } from '@main/database/connection'
import { StudioRepository } from '@main/repositories/studio-repository'
import { StudioService } from './studio-service'

describe('业务报表 XLSX 导出', () => {
  const databases: StudioDatabase[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
  })

  it('导出订单资金报表的业务列，不暴露数据库表结构', () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const service = new StudioService(new StudioRepository(database))
    const product = service.createProduct({
      name: '云朵',
      basePriceCents: 3000,
      edgePriceCents: 200,
      weightGrams: 10,
      lossRate: 0.1,
      standardMinutesPerUnit: 30,
      packagingCostCents: 50,
      commissionCentsPerUnit: 150,
      moldCount: 10,
      outputPerMoldPerBatch: 2,
      maxBatchesPerDay: 2
    })
    service.createOrder({
      customer: { name: '小雨' },
      expectedShipDate: '2026-09-20',
      items: [{ productId: product.id, quantity: 2 }]
    })

    const buffer = service.exportReport({
      kind: 'orders',
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
      productionStatus: 'all',
      outstandingOnly: false
    })
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[workbook.SheetNames[0]]!
    )

    expect(workbook.SheetNames).toEqual(['订单资金与利润'])
    expect(Object.keys(rows[0]!)).toEqual([
      '订单号',
      '客户',
      '预计发货',
      '制作状态',
      '财务状态',
      '应收',
      '已收净额',
      '待收',
      '预计成本',
      '实际成本',
      '预计利润',
      '实际利润'
    ])
    expect(rows[0]).toMatchObject({ 订单号: expect.any(String), 客户: '小雨', 应收: 6000 })
    expect(rows[0]).not.toHaveProperty('customer_snapshot_json')
  })
})
