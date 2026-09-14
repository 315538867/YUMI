import { describe, expect, it } from 'vitest'
import {
  calculateCentsForMinutes,
  calculateProportionalCents,
  calculateRatioBasisPoints,
  calculateMaterialCents,
  calculateSignedProportionalCents,
  parseMaterialPriceYuanPerGram,
  parseGramsToMilligrams,
  parseSignedYuanToCents,
  parseYuanToCents
} from './index'

describe('金额与用量精度', () => {
  it('按总克重计算 0.0034 元每克的胶水成本', () => {
    expect(
      calculateMaterialCents({
        materialPriceMicroYuanPerGram: parseMaterialPriceYuanPerGram('0.0034'),
        weightMilligrams: parseGramsToMilligrams('25'),
        quantity: 100
      })
    ).toBe(850)
  })

  it('在总额边界舍入而不是先对单件舍入', () => {
    expect(
      calculateMaterialCents({
        materialPriceMicroYuanPerGram: parseMaterialPriceYuanPerGram('0.0034'),
        weightMilligrams: parseGramsToMilligrams('25'),
        quantity: 1
      })
    ).toBe(9)
    expect(
      calculateMaterialCents({
        materialPriceMicroYuanPerGram: parseMaterialPriceYuanPerGram('0.0034'),
        weightMilligrams: parseGramsToMilligrams('25'),
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
    expect(() => parseMaterialPriceYuanPerGram('0.0000001')).toThrow('最多支持 6 位小数')
    expect(() => parseGramsToMilligrams('1.0001')).toThrow('最多支持 3 位小数')
  })

  it('比例计算拒绝零分母和非整数输入', () => {
    expect(() =>
      calculateProportionalCents({ baseCents: 1_000, numerator: 1, denominator: 0 })
    ).toThrow('分母必须大于 0')
    expect(() =>
      calculateProportionalCents({ baseCents: 1_000.5, numerator: 1, denominator: 3 })
    ).toThrow('基准金额必须是非负安全整数')
    expect(() =>
      calculateProportionalCents({ baseCents: 1_000, numerator: 1.5, denominator: 3 })
    ).toThrow('分子必须是非负安全整数')
  })

  it('材料金额拒绝零值以下的输入并保持整数分结果', () => {
    expect(() =>
      calculateMaterialCents({
        materialPriceMicroYuanPerGram: -1,
        weightMilligrams: 1_000,
        quantity: 1
      })
    ).toThrow('材料单价必须是非负安全整数')
    expect(
      calculateMaterialCents({
        materialPriceMicroYuanPerGram: 0,
        weightMilligrams: 25_000,
        quantity: 100
      })
    ).toBe(0)
  })

  it('带符号比例金额在分边界 HALF_UP，用于来源关联工资调整', () => {
    expect(
      calculateSignedProportionalCents({ baseCents: 3_000, numerator: 30, denominator: 60 })
    ).toBe(1_500)
    expect(
      calculateSignedProportionalCents({ baseCents: 3_000, numerator: -15, denominator: 60 })
    ).toBe(-750)
    expect(
      calculateSignedProportionalCents({ baseCents: 1_001, numerator: -1, denominator: 60 })
    ).toBe(-17)
    expect(() =>
      calculateSignedProportionalCents({ baseCents: 1_000, numerator: 1, denominator: 0 })
    ).toThrow('分母必须大于 0')
  })

  it('万分比按 HALF_UP 计算并允许负数分子', () => {
    expect(calculateRatioBasisPoints({ numerator: 1_342, denominator: 3_500 })).toBe(3_834)
    expect(calculateRatioBasisPoints({ numerator: -658, denominator: 1_500 })).toBe(-4_387)
    expect(calculateRatioBasisPoints({ numerator: 0, denominator: 100 })).toBe(0)
    expect(() => calculateRatioBasisPoints({ numerator: 1, denominator: 0 })).toThrow(
      '分母必须大于 0'
    )
    expect(() => calculateRatioBasisPoints({ numerator: 0.5, denominator: 2 })).toThrow(
      '分子必须是安全整数'
    )
  })
})
