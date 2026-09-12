import { describe, expect, it } from 'vitest'
import {
  calculateCentsForMinutes,
  calculateProportionalCents,
  calculateGlueCostCents,
  parseGluePriceYuanPerGram,
  parseGramsToMilligrams,
  parseSignedYuanToCents,
  parseYuanToCents
} from './index'

describe('金额与用量精度', () => {
  it('按总克重计算 0.0034 元每克的胶水成本', () => {
    expect(
      calculateGlueCostCents({
        gluePriceMicroYuanPerGram: parseGluePriceYuanPerGram('0.0034'),
        glueWeightMilligrams: parseGramsToMilligrams('25'),
        quantity: 100
      })
    ).toBe(850)
  })

  it('在总额边界舍入而不是先对单件舍入', () => {
    expect(
      calculateGlueCostCents({
        gluePriceMicroYuanPerGram: parseGluePriceYuanPerGram('0.0034'),
        glueWeightMilligrams: parseGramsToMilligrams('25'),
        quantity: 1
      })
    ).toBe(9)
    expect(
      calculateGlueCostCents({
        gluePriceMicroYuanPerGram: parseGluePriceYuanPerGram('0.0034'),
        glueWeightMilligrams: parseGramsToMilligrams('25'),
        quantity: 100
      })
    ).toBe(850)
  })

  it('所有时薪和比例金额均在整数分边界以 HALF_UP 计算', () => {
    expect(calculateCentsForMinutes({ minutes: 1, hourlyWageCents: 1_000 })).toBe(17)
    expect(calculateCentsForMinutes({ minutes: 30, hourlyWageCents: 1_001 })).toBe(501)
    expect(calculateProportionalCents({ baseCents: 1_000, numerator: 1, denominator: 6 })).toBe(167)
  })

  it('仅在明确允许的调整金额路径接受负数元金额', () => {
    expect(parseSignedYuanToCents('-12.34')).toBe(-1_234)
    expect(parseSignedYuanToCents('12.34')).toBe(1_234)
  })

  it('拒绝普通金额超出两位小数、科学计数法和负值', () => {
    expect(() => parseYuanToCents('1.235')).toThrow('最多支持 2 位小数')
    expect(() => parseYuanToCents('1e3')).toThrow('格式无效')
    expect(() => parseYuanToCents('-1.00')).toThrow('不能小于 0')
  })

  it('拒绝超出费率和克重精度的值', () => {
    expect(() => parseGluePriceYuanPerGram('0.0000001')).toThrow('最多支持 6 位小数')
    expect(() => parseGramsToMilligrams('1.0001')).toThrow('最多支持 3 位小数')
  })
})
