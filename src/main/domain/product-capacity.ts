import Decimal from 'decimal.js'
import { DomainValidationError } from './errors'

const BASIS_POINTS_PER_RATE = 10_000

export interface MaterialRequirementInput {
  quantity: number
  unitWeightMilligrams: number
  materialLossRateBasisPoints: number
}

export interface MoldCapacityInput {
  moldCount: number
  outputPerMoldPerBatch: number
  maxBatchesPerDay: number
}

export interface ProductMaterialAndCapacityInput extends MoldCapacityInput {
  unitWeightMilligrams: number
  materialLossRateBasisPoints: number
}

function requireNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainValidationError(`${label}必须是非负整数`)
  }
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DomainValidationError(`${label}必须是正整数`)
  }
}

export function validateProductMaterialAndCapacity(
  input: ProductMaterialAndCapacityInput
): void {
  requireNonNegativeInteger(input.unitWeightMilligrams, '单件材料重量')
  requireNonNegativeInteger(input.materialLossRateBasisPoints, '损耗率')
  if (input.materialLossRateBasisPoints >= BASIS_POINTS_PER_RATE) {
    throw new DomainValidationError('损耗率必须小于 100%')
  }
  const capacityValues = [input.moldCount, input.outputPerMoldPerBatch, input.maxBatchesPerDay]
  if (capacityValues.some((value) => value > 0)) {
    requirePositiveInteger(input.moldCount, '模具数量')
    requirePositiveInteger(input.outputPerMoldPerBatch, '每模每批产出')
    requirePositiveInteger(input.maxBatchesPerDay, '每日批次数')
  } else {
    for (const [label, value] of [
      ['模具数量', input.moldCount],
      ['每模每批产出', input.outputPerMoldPerBatch],
      ['每日批次数', input.maxBatchesPerDay]
    ] as const) requireNonNegativeInteger(value, label)
  }
}

export function calculateDailyMoldCapacity(input: MoldCapacityInput): number {
  requirePositiveInteger(input.moldCount, '模具数量')
  requirePositiveInteger(input.outputPerMoldPerBatch, '每模每批产出')
  requirePositiveInteger(input.maxBatchesPerDay, '每日批次数')
  const capacity = new Decimal(input.moldCount)
    .times(input.outputPerMoldPerBatch)
    .times(input.maxBatchesPerDay)
  if (!capacity.isInteger() || capacity.gt(Number.MAX_SAFE_INTEGER)) {
    throw new DomainValidationError('模具日产能超出安全范围')
  }
  return capacity.toNumber()
}

export function calculateMaterialRequirementMilligrams(input: MaterialRequirementInput): number {
  requirePositiveInteger(input.quantity, '商品数量')
  requireNonNegativeInteger(input.unitWeightMilligrams, '单件材料重量')
  requireNonNegativeInteger(input.materialLossRateBasisPoints, '损耗率')
  if (input.materialLossRateBasisPoints >= BASIS_POINTS_PER_RATE) {
    throw new DomainValidationError('损耗率必须小于 100%')
  }
  const requirement = new Decimal(input.quantity)
    .times(input.unitWeightMilligrams)
    .times(BASIS_POINTS_PER_RATE + input.materialLossRateBasisPoints)
    .div(BASIS_POINTS_PER_RATE)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
  if (requirement.gt(Number.MAX_SAFE_INTEGER)) {
    throw new DomainValidationError('预计材料用量超出安全范围')
  }
  return requirement.toNumber()
}
