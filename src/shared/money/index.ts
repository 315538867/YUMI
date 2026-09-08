import Decimal from 'decimal.js'

export const CENTS_PER_YUAN = 100
export const MICRO_YUAN_PER_YUAN = 1_000_000
export const MILLIGRAMS_PER_GRAM = 1_000

const INTEGER_PATTERN = /^(?:0|[1-9]\d*)$/

function rejectInvalid(label: string): never {
  throw new Error(`${label}格式无效`)
}

function parseNonNegativeScaled(input: string, decimalPlaces: number, scale: number, label: string): number {
  const value = input.trim()
  if (value.startsWith('-')) throw new Error(`${label}不能小于 0`)
  const [whole, fraction = ''] = value.split('.')
  if (!INTEGER_PATTERN.test(whole ?? '') || value.split('.').length > 2) rejectInvalid(label)
  if (fraction && !/^\d+$/.test(fraction)) rejectInvalid(label)
  if (fraction.length > decimalPlaces) throw new Error(`${label}最多支持 ${decimalPlaces} 位小数`)

  const scaled = new Decimal(whole)
    .times(scale)
    .plus(new Decimal(fraction || '0').times(new Decimal(10).pow(decimalPlaces - fraction.length)))

  if (!scaled.isInteger() || scaled.gt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label}数值超出范围`)
  return scaled.toNumber()
}

function formatScaled(value: number, scale: number, decimalPlaces: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('金额单位必须是非负安全整数')
  const formatted = new Decimal(value).div(scale).toFixed(decimalPlaces)
  return formatted.replace(/(?:\.0+|(?<=\.\d*?)0+)$/, '').replace(/\.$/, '')
}

/** 将负责人输入的元金额精确转换为整数分。 */
export function parseYuanToCents(input: string): number {
  return parseNonNegativeScaled(input, 2, CENTS_PER_YUAN, '金额')
}

export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error('金额单位必须是安全整数')
  return new Decimal(cents).div(CENTS_PER_YUAN).toFixed(2)
}

/** 将元/克胶水单价转换为微元/克，允许最多六位小数。 */
export function parseGluePriceYuanPerGram(input: string): number {
  return parseNonNegativeScaled(input, 6, MICRO_YUAN_PER_YUAN, '胶水单价')
}

export function formatGluePriceYuanPerGram(value: number): string {
  return formatScaled(value, MICRO_YUAN_PER_YUAN, 6)
}

/** 将以克录入的单件胶水用量转换为毫克，允许最多三位小数。 */
export function parseGramsToMilligrams(input: string): number {
  return parseNonNegativeScaled(input, 3, MILLIGRAMS_PER_GRAM, '克重')
}

export function formatMilligramsAsGrams(value: number): string {
  return formatScaled(value, MILLIGRAMS_PER_GRAM, 3)
}

/**
 * 按“总克重 × 冻结单价”在最终金额边界一次四舍五入到分。
 * 1 分 = 10,000,000（微元/克 × 毫克）的乘积单位。
 */
export function calculateGlueCostCents(input: {
  gluePriceMicroYuanPerGram: number
  glueWeightMilligrams: number
  quantity: number
}): number {
  const { gluePriceMicroYuanPerGram, glueWeightMilligrams, quantity } = input
  for (const [label, value] of [
    ['胶水单价', gluePriceMicroYuanPerGram],
    ['胶水克重', glueWeightMilligrams],
    ['数量', quantity]
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label}必须是非负安全整数`)
  }

  const cents = new Decimal(gluePriceMicroYuanPerGram)
    .times(glueWeightMilligrams)
    .times(quantity)
    .div(10_000_000)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)

  if (!cents.isInteger() || cents.gt(Number.MAX_SAFE_INTEGER)) throw new Error('胶水金额超出范围')
  return cents.toNumber()
}
