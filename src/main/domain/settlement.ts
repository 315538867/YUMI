import type { Cents } from '@shared/contracts/index'
import { calculateMaterialCostCents } from '@shared/calculations/material-cost'
import { calculateCentsForMinutes } from '@shared/money'
import { processTypes, type ProcessType } from './fulfillment'
import { DomainValidationError } from './errors'

export interface QualifiedTaskCommissionInput {
  processType: ProcessType
  qualifiedQuantity: number
  pieceRateCents: Cents
}

export interface DeductionBalanceInput {
  id: string
  occurredAt: string
  remainingCents: Cents
}

export interface DeductionAllocationInput {
  preDeductionWageCents: Cents
  deductions: DeductionBalanceInput[]
}

export interface DeductionAllocation {
  deductionRecordId: string
  appliedCents: Cents
  carryoverCents: Cents
}

export interface DeductionAllocationResult {
  totalRemainingDeductionCents: Cents
  deductionCapCents: Cents
  appliedDeductionCents: Cents
  carryoverDeductionCents: Cents
  allocations: DeductionAllocation[]
}

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainValidationError(`${label}必须是非负整数`)
  }
  return value
}

function requireNonNegativeCents(value: Cents, label: string): Cents {
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainValidationError(`${label}必须是非负整数分`)
  }
  return value
}

function requireSignedCents(value: Cents, label: string): Cents {
  if (!Number.isInteger(value)) {
    throw new DomainValidationError(`${label}必须是整数分`)
  }
  return value
}

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new DomainValidationError(`${label}必须是正整数`)
  }
  return value
}

function requireProcessType(processType: ProcessType): ProcessType {
  if (!processTypes.includes(processType)) {
    throw new DomainValidationError('工序类型不合法')
  }
  return processType
}

/** 按整段分钟和冻结个人时薪计算计时工资，所有除法均在分级别四舍五入。 */
export function calculateTimedWageCents(input: { minutes: number; hourlyWageCents: Cents }): Cents {
  const minutes = requireNonNegativeInteger(input.minutes, '工作分钟')
  const hourlyWageCents = requireNonNegativeCents(input.hourlyWageCents, '时薪')
  return calculateCentsForMinutes({ minutes, hourlyWageCents })
}

export const calculateHourlyWageCents = calculateTimedWageCents

/** 制作按合格数量计件、捏毛装袋与缝边按完成数量计件；打包发货不产生计件提成。 */
export function calculateQualifiedCommissionCents(tasks: QualifiedTaskCommissionInput[]): Cents {
  return tasks.reduce<Cents>((total, task) => {
    const processType = requireProcessType(task.processType)
    const quantity = requireNonNegativeInteger(task.qualifiedQuantity, '完成数量')
    const pieceRateCents = requireNonNegativeCents(task.pieceRateCents, '单件提成')
    if (
      processType !== 'making' &&
      processType !== 'fluffing_bagging' &&
      processType !== 'edge_sewing'
    ) {
      return total
    }
    return total + quantity * pieceRateCents
  }, 0)
}

/** 制作不合格材料扣款：不合格数量 × 冻结单件材料重量 × 冻结材料克单价。 */
export function calculateMakingMaterialDeductionCents(input: {
  unqualifiedQuantity: number
  materialPriceMicroYuanPerGram: number
  unitWeightMilligrams: number
}): Cents {
  const unqualifiedQuantity = requirePositiveInteger(input.unqualifiedQuantity, '不合格数量')
  const materialPriceMicroYuanPerGram = requireNonNegativeInteger(
    input.materialPriceMicroYuanPerGram,
    '冻结材料克单价'
  )
  const unitWeightMilligrams = requireNonNegativeInteger(
    input.unitWeightMilligrams,
    '冻结单件材料重量'
  )
  return calculateMaterialCostCents({
    materialPriceMicroYuanPerGram,
    weightMilligrams: unitWeightMilligrams,
    quantity: unqualifiedQuantity
  })
}

/**
 * 已结算工时差异调整：按原工时冻结的个人时薪计算分钟差对应金额，可为正负。
 * 工时更正不改变任何履约完成数量。
 */
export function calculateWorkTimeAdjustmentCents(input: {
  originalMinutes: number
  correctedMinutes: number
  hourlyWageCentsSnapshot: Cents
}): Cents {
  const originalMinutes = requireNonNegativeInteger(input.originalMinutes, '原核算分钟')
  const correctedMinutes = requireNonNegativeInteger(input.correctedMinutes, '更正核算分钟')
  const hourlyWageCentsSnapshot = requireNonNegativeCents(
    input.hourlyWageCentsSnapshot,
    '冻结个人时薪'
  )
  const differenceMinutes = correctedMinutes - originalMinutes
  if (differenceMinutes === 0) {
    throw new DomainValidationError('更正核算分钟必须与原核算分钟不同')
  }
  const minuteWageCents = calculateCentsForMinutes({
    minutes: Math.abs(differenceMinutes),
    hourlyWageCents: hourlyWageCentsSnapshot
  })
  return differenceMinutes > 0 ? minuteWageCents : -minuteWageCents
}

/** 唯一计算候选应发：计时工资 + 计件提成 + 来源调整 + 其他调整，不为负。 */
export function calculatePreDeductionWageCents(input: {
  timedWageCents: Cents
  commissionCents: Cents
  adjustmentCents: Cents
  otherAdjustmentCents: Cents
}): Cents {
  const timedWageCents = requireNonNegativeCents(input.timedWageCents, '计时工资')
  const commissionCents = requireNonNegativeCents(input.commissionCents, '计件提成')
  const adjustmentCents = requireSignedCents(input.adjustmentCents, '来源调整')
  const otherAdjustmentCents = requireSignedCents(input.otherAdjustmentCents, '其他调整')
  return Math.max(0, timedWageCents + commissionCents + adjustmentCents + otherAdjustmentCents)
}

/** 抵扣上限为本期扣前应发，避免出现负工资。 */
export function calculateDefaultDeductionCapCents(preDeductionWageCents: Cents): Cents {
  return requireNonNegativeCents(preDeductionWageCents, '扣前应发')
}

/**
 * 依不合格事实的发生时间依次抵扣。不能在本期抵掉的部分原样顺延，
 * 后续服务只需将该结果持久化为扣款分配和待抵扣余额。
 */
export function allocateDeductionsInOccurrenceOrder(
  input: DeductionAllocationInput
): DeductionAllocationResult {
  const deductionCapCents = calculateDefaultDeductionCapCents(input.preDeductionWageCents)
  const ids = new Set<string>()
  const orderedDeductions = input.deductions
    .map((deduction, index) => {
      if (!deduction.id.trim()) throw new DomainValidationError('扣款记录标识不能为空')
      if (!deduction.occurredAt.trim()) throw new DomainValidationError('扣款发生时间不能为空')
      if (ids.has(deduction.id)) throw new DomainValidationError('扣款记录不能重复')
      ids.add(deduction.id)
      return {
        ...deduction,
        remainingCents: requireNonNegativeCents(deduction.remainingCents, '待抵扣金额'),
        index
      }
    })
    .sort(
      (left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.index - right.index
    )

  let availableCents = deductionCapCents
  const allocations = orderedDeductions.map(({ id, remainingCents }) => {
    const appliedCents = Math.min(remainingCents, availableCents)
    availableCents -= appliedCents
    return {
      deductionRecordId: id,
      appliedCents,
      carryoverCents: remainingCents - appliedCents
    }
  })
  const totalRemainingDeductionCents = allocations.reduce(
    (total, allocation) => total + allocation.appliedCents + allocation.carryoverCents,
    0
  )
  const appliedDeductionCents = allocations.reduce(
    (total, allocation) => total + allocation.appliedCents,
    0
  )

  return {
    totalRemainingDeductionCents,
    deductionCapCents,
    appliedDeductionCents,
    carryoverDeductionCents: totalRemainingDeductionCents - appliedDeductionCents,
    allocations
  }
}

/** 最终实发由负责人决定，但真实付款金额不得为负。 */
export function validateFinalPaidCents(finalPaidCents: Cents): void {
  if (!Number.isInteger(finalPaidCents) || finalPaidCents < 0) {
    throw new DomainValidationError('最终实发金额必须是非负整数分')
  }
}
