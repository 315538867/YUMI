import { createPercentageCalculationResult } from './expression'
import type { PercentageCalculationResult } from './types'

export interface ExpectedWorkTimeItem {
  /** 业务名称，用于展示明细，例如商品名。 */
  label: string
  completedQuantity: number
  expectedMinutesPerUnit: number
}

export interface MinutesCalculationResult {
  label: string
  minutes: number
  expression: string
  substitutedExpression: string
}

export interface WorkTimeComparison {
  expectedMinutes: MinutesCalculationResult
  differenceMinutes: number
  /** 预计效率 = 预计总分钟 ÷ 负责人核算分钟；核算分钟为零时不可计算。 */
  efficiency: PercentageCalculationResult
  /** 实际用时高于预计时提示负责人核对，但不自动扣薪也不阻止确认。 */
  needsAttention: boolean
  attentionMessage: string | null
}

export const workTimeFormulaIds = {
  expectedMinutes: 'work_time.expected_minutes',
  efficiency: 'work_time.efficiency'
} as const

/** 分钟精度本地时间串：YYYY-MM-DDTHH:mm，可选零秒与零毫秒后缀。 */
const MINUTE_PRECISION_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/

export interface MinutePrecisionDateTime {
  /** 原始输入串，保留给原始时间审计字段。 */
  value: string
  /** 按本地时区解析的时间。 */
  date: Date
  /** 本地业务日期（YYYY-MM-DD）。 */
  localDate: string
}

export interface ReviewTimeRangeResult {
  minutes: number
  /** 核算归属的业务日期，跨日时取开始日期。 */
  workedOn: string
  crossesDay: boolean
}

/** 解析分钟精度本地时间；秒、毫秒非零或日期不合法时返回 null。 */
export function parseMinutePrecisionDateTime(value: string): MinutePrecisionDateTime | null {
  const match = MINUTE_PRECISION_PATTERN.exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute, second, millisecond] = match
  if (second !== undefined && second !== '00') return null
  if (millisecond !== undefined && Number(millisecond) !== 0) return null
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
  if (Number.isNaN(date.getTime())) return null
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day) ||
    date.getHours() !== Number(hour) ||
    date.getMinutes() !== Number(minute)
  ) {
    return null
  }
  return { value, date, localDate: `${year}-${month}-${day}` }
}

/**
 * 实际时间范围换算：单一连续区间，分钟由绝对时间差计算，跨日不拆单。
 * 输入不合法或结束不晚于开始时返回 null。
 */
export function calculateReviewTimeRange(
  startedAt: string,
  endedAt: string
): ReviewTimeRangeResult | null {
  const started = parseMinutePrecisionDateTime(startedAt)
  const ended = parseMinutePrecisionDateTime(endedAt)
  if (!started || !ended) return null
  const totalMinutes = (ended.date.getTime() - started.date.getTime()) / 60_000
  if (!Number.isInteger(totalMinutes) || totalMinutes <= 0) return null
  return {
    minutes: totalMinutes,
    workedOn: started.localDate,
    crossesDay: ended.localDate !== started.localDate
  }
}

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label}必须是非负整数`)
  }
  return value
}

/** 预计总分钟 = Σ（商品完成数量 × 该商品该工序预计单件分钟）。 */
export function calculateExpectedWorkMinutes(
  items: readonly ExpectedWorkTimeItem[]
): MinutesCalculationResult {
  const evaluated = items.map((item) => ({
    label: item.label,
    completedQuantity: requireNonNegativeInteger(item.completedQuantity, '完成数量'),
    expectedMinutesPerUnit: requireNonNegativeInteger(item.expectedMinutesPerUnit, '预计单件分钟')
  }))
  const total = evaluated.reduce(
    (sum, item) => sum + item.completedQuantity * item.expectedMinutesPerUnit,
    0
  )
  const expression =
    evaluated.length > 1
      ? `Σ（${evaluated.map((item) => `${item.label}完成数量 × 预计单件分钟`).join(' + ')}）`
      : '完成数量 × 预计单件分钟'
  const substituted = evaluated
    .map((item) => `${item.completedQuantity} × ${item.expectedMinutesPerUnit}`)
    .join(' + ')
  return {
    label: '预计总分钟',
    minutes: total,
    expression,
    substitutedExpression: `${substituted} = ${total}`
  }
}

/**
 * 工时核对：负责人核算分钟与预计总分钟的差异和预计效率。
 * 只作为复核信息，不参与任何自动扣减。
 */
export function calculateWorkTimeComparison(input: {
  approvedMinutes: number
  items: readonly ExpectedWorkTimeItem[]
}): WorkTimeComparison {
  const approvedMinutes = requireNonNegativeInteger(input.approvedMinutes, '核算分钟')
  const expectedMinutes = calculateExpectedWorkMinutes(input.items)
  const differenceMinutes = approvedMinutes - expectedMinutes.minutes
  const efficiency = createPercentageCalculationResult({
    formulaId: workTimeFormulaIds.efficiency,
    formulaVersion: 1,
    label: '预计效率',
    numerator: {
      kind: 'variable',
      variable: {
        key: 'expectedMinutes',
        label: '预计总分钟',
        unit: 'minutes',
        value: expectedMinutes.minutes
      }
    },
    denominator: {
      kind: 'variable',
      variable: {
        key: 'approvedMinutes',
        label: '负责人核算分钟',
        unit: 'minutes',
        value: approvedMinutes
      }
    },
    notes: ['核算分钟为零时无法计算预计效率']
  })
  const needsAttention = differenceMinutes > 0
  return {
    expectedMinutes,
    differenceMinutes,
    efficiency,
    needsAttention,
    attentionMessage: needsAttention ? '实际用时高于预计，请核对' : null
  }
}
