import type { Cents } from '@shared/contracts/index'
import { processTypes, type ProcessType } from './fulfillment'
import { DomainValidationError } from './errors'

export interface QualifiedTaskCommissionInput {
  processType: ProcessType
  qualifiedQuantity: number
  pieceRateCents: Cents
}

export interface MakingDefectDeductionInput {
  unqualifiedQuantity: number
  pieceRateCents: Cents
  standardMakingMinutes: number
  hourlyWageCents: Cents
  glueDeductionCentsPerUnit: Cents
}

export interface FluffingDefectDeductionInput {
  unqualifiedQuantity: number
  plannedQuantity: number
  plannedMinutes: number
  pieceRateCents: Cents
  hourlyWageCents: Cents
}

export interface DefectDeductionResult {
  unqualifiedQuantity: number
  commissionDeductionCents: Cents
  hourlyWageDeductionCents: Cents
  glueDeductionCents: Cents
  totalDeductionCents: Cents
}

export interface FluffingDefectDeductionResult extends DefectDeductionResult {
  deductedMinutes: number
}

export interface SettlementReferenceWageInput {
  scheduledMinutes: number
  attendanceMinutes: number
  hourlyWageCents: Cents
  qualifiedCommissionCents: Cents
  deductionCents: Cents
  otherAdjustmentCents: Cents
}

export interface SettlementReferenceWages {
  scheduledHourlyWageCents: Cents
  attendanceHourlyWageCents: Cents
  scheduledPreDeductionWageCents: Cents
  attendancePreDeductionWageCents: Cents
  scheduledReferenceWageCents: Cents
  attendanceReferenceWageCents: Cents
}

export interface DeductionBalanceInput {
  id: string
  occurredAt: string
  remainingCents: Cents
}

export interface DeductionAllocationInput {
  scheduledPreDeductionWageCents: Cents
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

function roundCentsDivision(numerator: number, denominator: number): Cents {
  return Math.round(numerator / denominator)
}

/** 按分钟和整数分时薪计算时薪，所有除法均在分级别四舍五入。 */
export function calculateHourlyWageCents(minutes: number, hourlyWageCents: Cents): Cents {
  requireNonNegativeInteger(minutes, '工作分钟')
  requireNonNegativeCents(hourlyWageCents, '时薪')
  return roundCentsDivision(minutes * hourlyWageCents, 60)
}

/** 仅制作和捏毛装袋的合格结果产生提成；返工与售后补发使用新任务结果，适用同一规则。 */
export function calculateQualifiedCommissionCents(tasks: QualifiedTaskCommissionInput[]): Cents {
  return tasks.reduce<Cents>((total, task) => {
    const processType = requireProcessType(task.processType)
    const qualifiedQuantity = requireNonNegativeInteger(task.qualifiedQuantity, '合格数量')
    const pieceRateCents = requireNonNegativeCents(task.pieceRateCents, '单件提成')
    if (processType !== 'making' && processType !== 'fluffing_bagging') return total
    return total + qualifiedQuantity * pieceRateCents
  }, 0)
}

/** 制作不合格：扣除应得提成、标准制作分钟对应时薪和胶水成本。 */
export function calculateMakingDefectDeduction(input: MakingDefectDeductionInput): DefectDeductionResult {
  const unqualifiedQuantity = requirePositiveInteger(input.unqualifiedQuantity, '不合格数量')
  const pieceRateCents = requireNonNegativeCents(input.pieceRateCents, '制作单件提成')
  const standardMakingMinutes = requireNonNegativeInteger(input.standardMakingMinutes, '产品标准制作分钟')
  const hourlyWageCents = requireNonNegativeCents(input.hourlyWageCents, '任务时薪')
  const glueDeductionCentsPerUnit = requireNonNegativeCents(input.glueDeductionCentsPerUnit, '单位胶水扣款成本')
  const commissionDeductionCents = unqualifiedQuantity * pieceRateCents
  const hourlyWageDeductionCents = calculateHourlyWageCents(
    unqualifiedQuantity * standardMakingMinutes,
    hourlyWageCents
  )
  const glueDeductionCents = unqualifiedQuantity * glueDeductionCentsPerUnit

  return {
    unqualifiedQuantity,
    commissionDeductionCents,
    hourlyWageDeductionCents,
    glueDeductionCents,
    totalDeductionCents: commissionDeductionCents + hourlyWageDeductionCents + glueDeductionCents
  }
}

/** 捏毛装袋不合格：按任务计划分钟与计划数量的比例扣除时薪，不扣胶水。 */
export function calculateFluffingDefectDeduction(input: FluffingDefectDeductionInput): FluffingDefectDeductionResult {
  const unqualifiedQuantity = requirePositiveInteger(input.unqualifiedQuantity, '不合格数量')
  const plannedQuantity = requirePositiveInteger(input.plannedQuantity, '任务计划数量')
  if (unqualifiedQuantity > plannedQuantity) {
    throw new DomainValidationError('不合格数量不能超过任务计划数量')
  }
  const plannedMinutes = requireNonNegativeInteger(input.plannedMinutes, '任务计划分钟')
  const pieceRateCents = requireNonNegativeCents(input.pieceRateCents, '捏毛装袋单件提成')
  const hourlyWageCents = requireNonNegativeCents(input.hourlyWageCents, '任务时薪')
  const deductedMinutes = (plannedMinutes * unqualifiedQuantity) / plannedQuantity
  const commissionDeductionCents = unqualifiedQuantity * pieceRateCents
  const hourlyWageDeductionCents = roundCentsDivision(
    plannedMinutes * unqualifiedQuantity * hourlyWageCents,
    plannedQuantity * 60
  )

  return {
    unqualifiedQuantity,
    deductedMinutes,
    commissionDeductionCents,
    hourlyWageDeductionCents,
    glueDeductionCents: 0,
    totalDeductionCents: commissionDeductionCents + hourlyWageDeductionCents
  }
}

/**
 * 两套参考工资共用提成、扣款和其他调整，唯有时薪由排班/考勤分钟分别计算。
 * 同一笔扣款按排班口径的扣前应发进行上限控制；各口径独立归零，避免出现负工资。
 */
export function calculateSettlementReferenceWages(input: SettlementReferenceWageInput): SettlementReferenceWages {
  const scheduledMinutes = requireNonNegativeInteger(input.scheduledMinutes, '排班总分钟')
  const attendanceMinutes = requireNonNegativeInteger(input.attendanceMinutes, '考勤总分钟')
  const hourlyWageCents = requireNonNegativeCents(input.hourlyWageCents, '时薪')
  const qualifiedCommissionCents = requireNonNegativeCents(input.qualifiedCommissionCents, '合格提成')
  const deductionCents = requireNonNegativeCents(input.deductionCents, '可扣款')
  const otherAdjustmentCents = requireSignedCents(input.otherAdjustmentCents, '其他调整')
  const scheduledHourlyWageCents = calculateHourlyWageCents(scheduledMinutes, hourlyWageCents)
  const attendanceHourlyWageCents = calculateHourlyWageCents(attendanceMinutes, hourlyWageCents)
  const scheduledPreDeductionWageCents = Math.max(
    0,
    scheduledHourlyWageCents + qualifiedCommissionCents + otherAdjustmentCents
  )
  const attendancePreDeductionWageCents = Math.max(
    0,
    attendanceHourlyWageCents + qualifiedCommissionCents + otherAdjustmentCents
  )
  const applicableDeductionCents = Math.min(deductionCents, scheduledPreDeductionWageCents)

  return {
    scheduledHourlyWageCents,
    attendanceHourlyWageCents,
    scheduledPreDeductionWageCents,
    attendancePreDeductionWageCents,
    scheduledReferenceWageCents: Math.max(0, scheduledPreDeductionWageCents - applicableDeductionCents),
    attendanceReferenceWageCents: Math.max(0, attendancePreDeductionWageCents - applicableDeductionCents)
  }
}

/** 默认抵扣上限为排班口径的扣前应发。 */
export function calculateDefaultDeductionCapCents(scheduledPreDeductionWageCents: Cents): Cents {
  return requireNonNegativeCents(scheduledPreDeductionWageCents, '排班口径扣前应发')
}

/**
 * 依不合格事实的发生时间依次抵扣。不能在本期抵掉的部分原样顺延，
 * 后续服务只需将该结果持久化为扣款分配和待抵扣余额。
 */
export function allocateDeductionsInOccurrenceOrder(input: DeductionAllocationInput): DeductionAllocationResult {
  const deductionCapCents = calculateDefaultDeductionCapCents(input.scheduledPreDeductionWageCents)
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
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.index - right.index)

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
  const totalRemainingDeductionCents = allocations.reduce((total, allocation) => total + allocation.appliedCents + allocation.carryoverCents, 0)
  const appliedDeductionCents = allocations.reduce((total, allocation) => total + allocation.appliedCents, 0)

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
