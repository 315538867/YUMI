import Decimal from 'decimal.js'

export const CENTS_PER_YUAN = 100
export const MICRO_YUAN_PER_YUAN = 1_000_000
export const MILLIGRAMS_PER_GRAM = 1_000

const INTEGER_PATTERN = /^(?:0|[1-9]\d*)$/

function rejectInvalid(label: string): never {
  throw new Error(`${label}格式无效`)
}

function parseScaled(
  input: string,
  decimalPlaces: number,
  scale: number,
  label: string,
  allowNegative = false
): number {
  const value = input.trim()
  const negative = value.startsWith('-')
  if (negative && !allowNegative) throw new Error(`${label}不能小于 0`)
  const unsignedValue = negative ? value.slice(1) : value
  const [whole, fraction = ''] = unsignedValue.split('.')
  if (!INTEGER_PATTERN.test(whole ?? '') || unsignedValue.split('.').length > 2)
    rejectInvalid(label)
  if (fraction && !/^\d+$/.test(fraction)) rejectInvalid(label)
  if (fraction.length > decimalPlaces) throw new Error(`${label}最多支持 ${decimalPlaces} 位小数`)

  const scaled = new Decimal(whole)
    .times(scale)
    .plus(new Decimal(fraction || '0').times(new Decimal(10).pow(decimalPlaces - fraction.length)))
  if (!scaled.isInteger() || scaled.gt(Number.MAX_SAFE_INTEGER))
    throw new Error(`${label}数值超出范围`)
  return (negative ? scaled.negated() : scaled).toNumber()
}

function formatScaled(value: number, scale: number, decimalPlaces: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('金额单位必须是非负安全整数')
  const formatted = new Decimal(value).div(scale).toFixed(decimalPlaces)
  return formatted.replace(/(?:\.0+|(?<=\.\d*?)0+)$/, '').replace(/\.$/, '')
}

/** 将负责人输入的元金额精确转换为整数分。 */
export function parseYuanToCents(input: string): number {
  return parseScaled(input, 2, CENTS_PER_YUAN, '金额')
}

/** 仅用于允许负责人填写正负调整的金额字段。 */
export function parseSignedYuanToCents(input: string): number {
  return parseScaled(input, 2, CENTS_PER_YUAN, '金额', true)
}

export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error('金额单位必须是安全整数')
  return new Decimal(cents).div(CENTS_PER_YUAN).toFixed(2)
}

/** 将元/克材料单价转换为微元/克，允许最多六位小数。 */
export function parseMaterialPriceYuanPerGram(input: string): number {
  return parseScaled(input, 6, MICRO_YUAN_PER_YUAN, '材料单价')
}

export function formatMaterialPriceYuanPerGram(value: number): string {
  return formatScaled(value, MICRO_YUAN_PER_YUAN, 6)
}

/** 将以克录入的材料重量转换为毫克，允许最多三位小数。 */
export function parseGramsToMilligrams(input: string): number {
  return parseScaled(input, 3, MILLIGRAMS_PER_GRAM, '克重')
}

export function formatMilligramsAsGrams(value: number): string {
  return formatScaled(value, MILLIGRAMS_PER_GRAM, 3)
}

/**
 * 按“总重量 × 冻结材料单价”在最终金额边界一次四舍五入到分。
 * 1 分 = 10,000,000（微元/克 × 毫克）的乘积单位。
 */
export function calculateMaterialCents(input: {
  materialPriceMicroYuanPerGram: number
  weightMilligrams: number
  quantity: number
}): number {
  const { materialPriceMicroYuanPerGram, weightMilligrams, quantity } = input
  for (const [label, value] of [
    ['材料单价', materialPriceMicroYuanPerGram],
    ['材料重量', weightMilligrams],
    ['数量', quantity]
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label}必须是非负安全整数`)
  }

  const cents = new Decimal(materialPriceMicroYuanPerGram)
    .times(weightMilligrams)
    .times(quantity)
    .div(10_000_000)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)

  if (!cents.isInteger() || cents.gt(Number.MAX_SAFE_INTEGER)) throw new Error('材料金额超出范围')
  return cents.toNumber()
}

/**
 * 对以“分”保存的金额做比例计算，且仅在最终分级别按 HALF_UP 舍入。
 * 用于时薪、比例扣款等不能使用浮点运算的业务金额。
 */
export function calculateProportionalCents(input: {
  baseCents: number
  numerator: number
  denominator: number
}): number {
  const { baseCents, numerator, denominator } = input
  for (const [label, value] of [
    ['基准金额', baseCents],
    ['分子', numerator],
    ['分母', denominator]
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label}必须是非负安全整数`)
  }
  if (denominator === 0) throw new Error('分母必须大于 0')

  const result = new Decimal(baseCents)
    .times(numerator)
    .div(denominator)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
  if (!result.isInteger() || result.gt(Number.MAX_SAFE_INTEGER)) throw new Error('金额超出范围')
  return result.toNumber()
}

/** 按工作分钟和每小时整数分时薪计算时薪金额。 */
export function calculateCentsForMinutes(input: {
  minutes: number
  hourlyWageCents: number
}): number {
  return calculateProportionalCents({
    baseCents: input.hourlyWageCents,
    numerator: input.minutes,
    denominator: 60
  })
}

/**
 * 计算分子与分母之比对应的万分比整数，仅在最终万分比边界按 HALF_UP 舍入。
 * 用于利润率等允许负数的比例展示，分母为 0 时由调用方处理为不可计算。
 */
export function calculateRatioBasisPoints(input: {
  numerator: number
  denominator: number
}): number {
  const { numerator, denominator } = input
  if (!Number.isSafeInteger(numerator)) throw new Error('分子必须是安全整数')
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error('分母必须大于 0')
  }

  const result = new Decimal(numerator)
    .times(10_000)
    .div(denominator)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
  if (!result.isInteger() || result.abs().gt(Number.MAX_SAFE_INTEGER))
    throw new Error('比例超出范围')
  return result.toNumber()
}

/**
 * 允许正负分子的比例金额，用于来源关联工资调整；仍在最终分级别按 HALF_UP 舍入。
 */
export function calculateSignedProportionalCents(input: {
  baseCents: number
  numerator: number
  denominator: number
}): number {
  const { baseCents, numerator, denominator } = input
  for (const [label, value] of [
    ['基准金额', baseCents],
    ['分子', numerator]
  ] as const) {
    if (!Number.isSafeInteger(value)) throw new Error(`${label}必须是安全整数`)
  }
  if (!Number.isSafeInteger(denominator) || denominator <= 0) throw new Error('分母必须大于 0')

  const result = new Decimal(baseCents)
    .times(numerator)
    .div(denominator)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
  if (!result.isInteger() || result.abs().gt(Number.MAX_SAFE_INTEGER))
    throw new Error('金额超出范围')
  return result.toNumber()
}
