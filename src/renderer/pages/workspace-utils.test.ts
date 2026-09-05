import { describe, expect, it } from 'vitest'
import { calculateDraftTotals, getWeekDates } from './workspace-utils'

describe('桌面工作区辅助计算', () => {
  it('按商品数量、缝边数量和逐项优惠计算订单草稿金额', () => {
    const totals = calculateDraftTotals(
      [
        {
          quantity: 2,
          unitPriceCents: 1290,
          edgeEnabled: true,
          edgeQuantity: 1,
          edgePriceCents: 300,
          discountCents: 80
        },
        {
          quantity: 3,
          unitPriceCents: 500,
          edgeEnabled: false,
          edgeQuantity: 0,
          edgePriceCents: 0,
          discountCents: 0
        }
      ],
      120
    )

    expect(totals.itemSubtotalCents).toBe(4380)
    expect(totals.itemDiscountCents).toBe(80)
    expect(totals.orderDiscountCents).toBe(120)
    expect(totals.receivableCents).toBe(4180)
  })

  it('将周视图锚定日期扩展为周一到周日', () => {
    expect(getWeekDates('2026-09-04')).toEqual([
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06'
    ])
  })
})

describe('工作区状态辅助', () => {
  it('将未知异常安全转换为用户可读错误，并保留错误实例消息', async () => {
    const { getErrorMessage } = await import('./workspace-utils')
    expect(getErrorMessage(new Error('数据库不可用'), '读取失败')).toBe('数据库不可用')
    expect(getErrorMessage('unexpected', '读取失败')).toBe('读取失败')
  })
})
