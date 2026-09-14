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
