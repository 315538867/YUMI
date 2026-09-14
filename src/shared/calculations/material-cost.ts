import type { Cents } from '@shared/contracts/index'
import { DomainValidationError } from '@shared/errors'
import { calculateMaterialCents } from '@shared/money'
import { createMoneyCalculationResult, materialNode, variableNode } from './expression'
import type { MoneyCalculationResult } from './types'

export interface MaterialCostInput {
  materialPriceMicroYuanPerGram: number
  weightMilligrams: number
  quantity?: number
}

export const materialCostFormulaIds = {
  unitMaterialCost: 'material.unit_cost',
  batchMaterialCost: 'material.batch_cost'
} as const

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainValidationError(`${label}必须是非负安全整数`)
  }
  return value
}

/** 按克单价、毫克重量与数量计算材料成本，只在最终金额边界四舍五入到分。 */
export function calculateMaterialCostCents(input: MaterialCostInput): Cents {
  const materialPriceMicroYuanPerGram = requireNonNegativeInteger(
    input.materialPriceMicroYuanPerGram,
    '材料克单价'
  )
  const weightMilligrams = requireNonNegativeInteger(input.weightMilligrams, '单件材料重量')
  const quantity = requireNonNegativeInteger(input.quantity ?? 1, '数量')
  return calculateMaterialCents({
    materialPriceMicroYuanPerGram: materialPriceMicroYuanPerGram,
    weightMilligrams: weightMilligrams,
    quantity
  })
}

export function createMaterialCostCalculation(
  input: MaterialCostInput & {
    label: string
    quantityLabel?: string
    notes?: string[]
  }
): MoneyCalculationResult {
  const materialPriceMicroYuanPerGram = requireNonNegativeInteger(
    input.materialPriceMicroYuanPerGram,
    '材料克单价'
  )
  const weightMilligrams = requireNonNegativeInteger(input.weightMilligrams, '单件材料重量')
  const quantity =
    input.quantity === undefined ? undefined : requireNonNegativeInteger(input.quantity, '数量')

  return createMoneyCalculationResult({
    formulaId:
      quantity === undefined
        ? materialCostFormulaIds.unitMaterialCost
        : materialCostFormulaIds.batchMaterialCost,
    formulaVersion: 1,
    label: input.label,
    node: materialNode({
      unitPrice: variableNode({
        key: 'materialPrice',
        label: '全局材料克单价',
        unit: 'microYuanPerGram',
        value: materialPriceMicroYuanPerGram
      }),
      weightMilligrams: variableNode({
        key: 'weight',
        label: '单件材料重量',
        unit: 'milligrams',
        value: weightMilligrams
      }),
      quantity:
        quantity === undefined
          ? undefined
          : variableNode({
              key: 'quantity',
              label: input.quantityLabel ?? '数量',
              unit: 'quantity',
              value: quantity
            })
    }),
    notes: input.notes
  })
}
