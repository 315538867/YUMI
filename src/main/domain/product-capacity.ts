import Decimal from 'decimal.js'
import { DomainValidationError } from './errors'

export interface MaterialRequirementInput {
  quantity: number
  unitWeightMilligrams: number
}

export interface MoldCapacityInput {
  moldCount: number
  outputPerMoldPerBatch: number
  maxBatchesPerDay: number
}

export interface ProductMaterialAndCapacityInput extends MoldCapacityInput {
  unitWeightMilligrams: number
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

export function validateProductMaterialAndCapacity(input: ProductMaterialAndCapacityInput): void {
  requireNonNegativeInteger(input.unitWeightMilligrams, '单件材料重量')
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
    ] as const)
      requireNonNegativeInteger(value, label)
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

/** 单件材料重量同时表示实际使用量和成品材料重量，用量等于数量乘单件重量。 */
export function calculateMaterialRequirementMilligrams(input: MaterialRequirementInput): number {
  requirePositiveInteger(input.quantity, '商品数量')
  requireNonNegativeInteger(input.unitWeightMilligrams, '单件材料重量')
  const requirement = new Decimal(input.quantity).times(input.unitWeightMilligrams)
  if (requirement.gt(Number.MAX_SAFE_INTEGER)) {
    throw new DomainValidationError('预计材料用量超出安全范围')
  }
  return requirement.toNumber()
}
