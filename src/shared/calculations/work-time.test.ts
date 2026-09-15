import { describe, expect, it } from 'vitest'
import {
  calculateExpectedWorkMinutes,
  calculateReviewTimeRange,
  calculateWorkTimeComparison,
  parseMinutePrecisionDateTime
} from './work-time'

describe('工时核算时间范围', () => {
  it('按分钟精度解析本地时间并返回业务日期', () => {
    const parsed = parseMinutePrecisionDateTime('2026-09-10T09:30')
    expect(parsed).not.toBeNull()
    expect(parsed?.localDate).toBe('2026-09-10')
    expect(parsed?.date.getHours()).toBe(9)
    expect(parsed?.date.getMinutes()).toBe(30)

    expect(parseMinutePrecisionDateTime('2026-09-10T09:30:00')).not.toBeNull()
    expect(parseMinutePrecisionDateTime('2026-09-10T09:30:00.000')).not.toBeNull()
  })

  it('拒绝非分钟精度或非法时间', () => {
    expect(parseMinutePrecisionDateTime('2026-09-10T09:30:30')).toBeNull()
    expect(parseMinutePrecisionDateTime('2026-09-10T09:30:00.500')).toBeNull()
    expect(parseMinutePrecisionDateTime('2026-09-10 09:30')).toBeNull()
    expect(parseMinutePrecisionDateTime('2026-02-30T09:30')).toBeNull()
    expect(parseMinutePrecisionDateTime('')).toBeNull()
  })

  it('计算跨日分钟并按开始日期归属', () => {
    const sameDay = calculateReviewTimeRange('2026-09-10T09:00', '2026-09-10T17:30')
    expect(sameDay).toEqual({ minutes: 510, workedOn: '2026-09-10', crossesDay: false })

    const overnight = calculateReviewTimeRange('2026-09-10T22:00', '2026-09-11T02:00')
    expect(overnight).toEqual({ minutes: 240, workedOn: '2026-09-10', crossesDay: true })

    expect(calculateReviewTimeRange('2026-09-10T17:00', '2026-09-10T09:00')).toBeNull()
    expect(calculateReviewTimeRange('2026-09-10T09:00', '2026-09-10T09:00')).toBeNull()
  })
})

describe('工时核对公式', () => {
  it('预计总分钟按完成数量与预计单件分钟求和', () => {
    const result = calculateExpectedWorkMinutes([
      { label: '商品 A', completedQuantity: 40, expectedMinutesPerUnit: 2 },
      { label: '商品 B', completedQuantity: 30, expectedMinutesPerUnit: 3 }
    ])
    expect(result.minutes).toBe(170)
    expect(result.expression).toBe(
      'Σ（商品 A完成数量 × 预计单件分钟 + 商品 B完成数量 × 预计单件分钟）'
    )
    expect(result.substitutedExpression).toBe('40 × 2 + 30 × 3 = 170')
  })

  it('时间差与预计效率按核算分钟计算，实际高于预计时只提示核对', () => {
    const comparison = calculateWorkTimeComparison({
      approvedMinutes: 240,
      items: [{ label: '商品 A', completedQuantity: 30, expectedMinutesPerUnit: 6 }]
    })
    expect(comparison.expectedMinutes.minutes).toBe(180)
    expect(comparison.differenceMinutes).toBe(60)
    expect(comparison.efficiency.basisPoints).toBe(7_500)
    expect(comparison.efficiency.display).toBe('75.00%')
    expect(comparison.needsAttention).toBe(true)
    expect(comparison.attentionMessage).toBe('实际用时高于预计，请核对')
  })

  it('实际低于预计时不提示核对，核算分钟为零时效率不可计算', () => {
    const faster = calculateWorkTimeComparison({
      approvedMinutes: 150,
      items: [{ label: '商品 A', completedQuantity: 30, expectedMinutesPerUnit: 6 }]
    })
    expect(faster.differenceMinutes).toBe(-30)
    expect(faster.needsAttention).toBe(false)
    expect(faster.attentionMessage).toBeNull()

    const zero = calculateWorkTimeComparison({ approvedMinutes: 0, items: [] })
    expect(zero.expectedMinutes.minutes).toBe(0)
    expect(zero.efficiency.status).toBe('not_computable')
    expect(zero.efficiency.display).toBe('—')
    expect(zero.differenceMinutes).toBe(0)
    expect(zero.needsAttention).toBe(false)
  })

  it('拒绝负数输入', () => {
    expect(() =>
      calculateExpectedWorkMinutes([
        { label: '商品 A', completedQuantity: -1, expectedMinutesPerUnit: 1 }
      ])
    ).toThrow('完成数量必须是非负整数')
    expect(() => calculateWorkTimeComparison({ approvedMinutes: -1, items: [] })).toThrow(
      '核算分钟必须是非负整数'
    )
  })
})
