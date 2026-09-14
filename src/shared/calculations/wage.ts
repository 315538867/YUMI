import type { Cents } from '@shared/contracts/index'
import { DomainValidationError } from '@shared/errors'
import { calculateCentsForMinutes } from '@shared/money'
import {
  constantNode,
  createMoneyCalculationResult,
  proportionalNode,
  variableNode
} from './expression'
import type { MoneyCalculationResult } from './types'

export interface TimedWageInput {
  minutes: number
  hourlyWageCents: Cents
}

export const wageFormulaIds = {
  timedWage: 'wage.timed'
} as const

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainValidationError(`${label}必须是非负整数`)
  }
  return value
}

function requireNonNegativeCents(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainValidationError(`${label}必须是非负整数分`)
  }
  return value
}

/** 按整段核算分钟和个人时薪计算计时工资，只在整数分边界 HALF_UP。 */
export function calculateTimedWageCents(input: TimedWageInput): Cents {
  const minutes = requireNonNegativeInteger(input.minutes, '工作分钟')
  const hourlyWageCents = requireNonNegativeCents(input.hourlyWageCents, '时薪')
  return calculateCentsForMinutes({ minutes, hourlyWageCents })
}

export function createTimedWageCalculation(
  input: TimedWageInput & { label: string; notes?: string[] }
): MoneyCalculationResult {
  const minutes = requireNonNegativeInteger(input.minutes, '工作分钟')
  const hourlyWageCents = requireNonNegativeCents(input.hourlyWageCents, '时薪')
  return createMoneyCalculationResult({
    formulaId: wageFormulaIds.timedWage,
    formulaVersion: 1,
    label: input.label,
    node: proportionalNode({
      base: variableNode({
        key: 'hourlyWage',
        label: '个人时薪',
        unit: 'cents',
        value: hourlyWageCents
      }),
      numerator: variableNode({
        key: 'minutes',
        label: '核算分钟',
        unit: 'minutes',
        value: minutes
      }),
      denominator: constantNode({ label: '60', unit: 'minutes', value: 60 })
    }),
    notes: input.notes
  })
}
