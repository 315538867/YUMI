import { describe, expect, it } from 'vitest'
import { calculateTimedWageCents, createTimedWageCalculation } from './wage'

describe('共享计时工资公式', () => {
  it('按核算分钟与个人时薪在分边界 HALF_UP', () => {
    expect(calculateTimedWageCents({ minutes: 240, hourlyWageCents: 3_000 })).toBe(12_000)
    expect(calculateTimedWageCents({ minutes: 30, hourlyWageCents: 1_001 })).toBe(501)
    expect(calculateTimedWageCents({ minutes: 1, hourlyWageCents: 1_000 })).toBe(17)
    expect(calculateTimedWageCents({ minutes: 0, hourlyWageCents: 3_000 })).toBe(0)
  })

  it('生成核算时长与个人时薪的公式展示', () => {
    const result = createTimedWageCalculation({
      label: '捏毛装袋计时工资',
      minutes: 240,
      hourlyWageCents: 3_000
    })
    expect(result.amountCents).toBe(12_000)
    expect(result.expression).toBe('核算分钟 ÷ 60 × 个人时薪')
    expect(result.substitutedExpression).toBe('240 ÷ 60 × 30.00 = 120.00')
  })

  it('拒绝负分钟与非整数时薪', () => {
    expect(() => calculateTimedWageCents({ minutes: -1, hourlyWageCents: 3_000 })).toThrow(
      '工作分钟必须是非负整数'
    )
    expect(() => calculateTimedWageCents({ minutes: 60, hourlyWageCents: 30.5 })).toThrow(
      '时薪必须是非负整数分'
    )
  })
})
