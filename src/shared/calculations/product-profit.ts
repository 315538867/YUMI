import type { Cents } from '@shared/contracts/index'
import { DomainValidationError } from '@shared/errors'
import {
  constantNode,
  createMoneyCalculationResult,
  createPercentageCalculationResult,
  groupNode,
  materialNode,
  proportionalNode,
  subtractNode,
  sumNode,
  variableNode
} from './expression'
import { materialCostFormulaIds } from './material-cost'
import type { FormulaNode, MoneyCalculationResult, PercentageCalculationResult } from './types'

export interface ProductProfitInput {
  basePriceCents: Cents
  unitWeightMilligrams: number
  materialPriceMicroYuanPerGram: number
  packagingCostCents: Cents
  accessoryCostCents: Cents
  replacementBagCostCents: Cents
  fixedCostCents: Cents
  makingCommissionCents: Cents
  fluffingBaggingCommissionCents: Cents
  expectedFluffingBaggingMinutes: number
  expectedEdgeSewingMinutes: number
  expectedPackingMinutes: number
  fluffingBaggingExpectedHourlyWageCents: Cents
  edgeSewingExpectedHourlyWageCents: Cents
  packingExpectedHourlyWageCents: Cents
  edgeConsumableCostCents: Cents
  edgeSewingCommissionCents: Cents
}

export interface ProductProfitCalculation {
  materialCost: MoneyCalculationResult
  fluffingBaggingLaborCost: MoneyCalculationResult
  packingLaborCost: MoneyCalculationResult
  edgeSewingLaborCost: MoneyCalculationResult
  unitCost: MoneyCalculationResult
  unitProfit: MoneyCalculationResult
  profitRate: PercentageCalculationResult
  edgeIncrementalCost: MoneyCalculationResult
}

export const productProfitFormulaIds = {
  materialCost: materialCostFormulaIds.unitMaterialCost,
  fluffingBaggingLaborCost: 'product.fluffing_bagging_labor_cost',
  packingLaborCost: 'product.packing_labor_cost',
  edgeSewingLaborCost: 'product.edge_sewing_labor_cost',
  unitCost: 'product.unit_cost',
  unitProfit: 'product.unit_profit',
  profitRate: 'product.profit_rate',
  edgeIncrementalCost: 'product.edge_incremental_cost'
} as const

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainValidationError(`${label}必须是非负安全整数`)
  }
  return value
}

function moneyVariable(key: string, label: string, value: number): FormulaNode {
  return variableNode({ key, label, unit: 'cents', value })
}

function laborCostNode(input: {
  key: string
  minutesLabel: string
  wageLabel: string
  minutes: number
  hourlyWageCents: number
}): FormulaNode {
  return proportionalNode({
    base: variableNode({
      key: `${input.key}HourlyWage`,
      label: input.wageLabel,
      unit: 'cents',
      value: input.hourlyWageCents
    }),
    numerator: variableNode({
      key: `${input.key}Minutes`,
      label: input.minutesLabel,
      unit: 'minutes',
      value: input.minutes
    }),
    denominator: constantNode({ label: '60', unit: 'minutes', value: 60 })
  })
}

/**
 * 商品预计盈利只使用当前商品参数和全局预计基准时薪。
 * 制作预计时长不进入预计计时人工；订单级缝边客户收入也不进入商品默认预计利润。
 */
export function calculateProductProfit(input: ProductProfitInput): ProductProfitCalculation {
  const basePriceCents = requireNonNegativeInteger(input.basePriceCents, '默认销售单价')
  const unitWeightMilligrams = requireNonNegativeInteger(input.unitWeightMilligrams, '单件材料重量')
  const materialPriceMicroYuanPerGram = requireNonNegativeInteger(
    input.materialPriceMicroYuanPerGram,
    '全局材料克单价'
  )
  const packagingCostCents = requireNonNegativeInteger(input.packagingCostCents, '包装成本')
  const accessoryCostCents = requireNonNegativeInteger(input.accessoryCostCents, '配饰成本')
  const replacementBagCostCents = requireNonNegativeInteger(
    input.replacementBagCostCents,
    '替换袋成本'
  )
  const fixedCostCents = requireNonNegativeInteger(input.fixedCostCents, '单件固定成本')
  const makingCommissionCents = requireNonNegativeInteger(input.makingCommissionCents, '制作提成')
  const fluffingBaggingCommissionCents = requireNonNegativeInteger(
    input.fluffingBaggingCommissionCents,
    '捏毛装袋提成'
  )
  const edgeSewingCommissionCents = requireNonNegativeInteger(
    input.edgeSewingCommissionCents,
    '缝边提成'
  )
  const edgeConsumableCostCents = requireNonNegativeInteger(
    input.edgeConsumableCostCents,
    '缝边耗材成本'
  )
  const expectedFluffingBaggingMinutes = requireNonNegativeInteger(
    input.expectedFluffingBaggingMinutes,
    '预计单件捏毛装袋时长'
  )
  const expectedEdgeSewingMinutes = requireNonNegativeInteger(
    input.expectedEdgeSewingMinutes,
    '预计单件缝边时长'
  )
  const expectedPackingMinutes = requireNonNegativeInteger(
    input.expectedPackingMinutes,
    '预计单件打包发货时长'
  )
  const fluffingBaggingExpectedHourlyWageCents = requireNonNegativeInteger(
    input.fluffingBaggingExpectedHourlyWageCents,
    '捏毛装袋预计基准时薪'
  )
  const edgeSewingExpectedHourlyWageCents = requireNonNegativeInteger(
    input.edgeSewingExpectedHourlyWageCents,
    '缝边预计基准时薪'
  )
  const packingExpectedHourlyWageCents = requireNonNegativeInteger(
    input.packingExpectedHourlyWageCents,
    '打包发货预计基准时薪'
  )

  const materialCostNode = groupNode(
    '预计单件材料成本',
    materialNode({
      unitPrice: variableNode({
        key: 'materialPrice',
        label: '全局材料克单价',
        unit: 'microYuanPerGram',
        value: materialPriceMicroYuanPerGram
      }),
      weightMilligrams: variableNode({
        key: 'unitWeight',
        label: '单件材料重量',
        unit: 'milligrams',
        value: unitWeightMilligrams
      })
    })
  )
  const fluffingBaggingLaborCostNode = groupNode(
    '预计捏毛装袋计时工资',
    laborCostNode({
      key: 'fluffingBagging',
      minutesLabel: '预计单件捏毛装袋分钟',
      wageLabel: '捏毛装袋预计基准时薪',
      minutes: expectedFluffingBaggingMinutes,
      hourlyWageCents: fluffingBaggingExpectedHourlyWageCents
    })
  )
  const packingLaborCostNode = groupNode(
    '预计打包发货计时工资',
    laborCostNode({
      key: 'packing',
      minutesLabel: '预计单件打包发货分钟',
      wageLabel: '打包发货预计基准时薪',
      minutes: expectedPackingMinutes,
      hourlyWageCents: packingExpectedHourlyWageCents
    })
  )
  const edgeSewingLaborCostNode = groupNode(
    '预计缝边计时工资',
    laborCostNode({
      key: 'edgeSewing',
      minutesLabel: '预计单件缝边分钟',
      wageLabel: '缝边预计基准时薪',
      minutes: expectedEdgeSewingMinutes,
      hourlyWageCents: edgeSewingExpectedHourlyWageCents
    })
  )

  const unitCostNode = sumNode([
    materialCostNode,
    moneyVariable('packaging', '包装成本', packagingCostCents),
    moneyVariable('accessory', '配饰成本', accessoryCostCents),
    moneyVariable('replacementBag', '替换袋成本', replacementBagCostCents),
    moneyVariable('fixedCost', '单件固定成本', fixedCostCents),
    moneyVariable('makingCommission', '制作提成', makingCommissionCents),
    moneyVariable('fluffingBaggingCommission', '捏毛装袋提成', fluffingBaggingCommissionCents),
    fluffingBaggingLaborCostNode,
    packingLaborCostNode
  ])
  const basePriceNode = moneyVariable('basePrice', '默认售价', basePriceCents)
  const unitProfitNode = subtractNode(basePriceNode, groupNode('预计单件成本', unitCostNode))
  const edgeIncrementalCostNode = sumNode([
    moneyVariable('edgeConsumableCost', '缝边耗材成本', edgeConsumableCostCents),
    moneyVariable('edgeSewingCommission', '缝边提成', edgeSewingCommissionCents),
    edgeSewingLaborCostNode
  ])

  return {
    materialCost: createMoneyCalculationResult({
      formulaId: productProfitFormulaIds.materialCost,
      formulaVersion: 1,
      label: '预计单件材料成本',
      node: materialCostNode
    }),
    fluffingBaggingLaborCost: createMoneyCalculationResult({
      formulaId: productProfitFormulaIds.fluffingBaggingLaborCost,
      formulaVersion: 1,
      label: '预计捏毛装袋计时工资',
      node: fluffingBaggingLaborCostNode
    }),
    packingLaborCost: createMoneyCalculationResult({
      formulaId: productProfitFormulaIds.packingLaborCost,
      formulaVersion: 1,
      label: '预计打包发货计时工资',
      node: packingLaborCostNode
    }),
    edgeSewingLaborCost: createMoneyCalculationResult({
      formulaId: productProfitFormulaIds.edgeSewingLaborCost,
      formulaVersion: 1,
      label: '预计缝边计时工资',
      node: edgeSewingLaborCostNode
    }),
    unitCost: createMoneyCalculationResult({
      formulaId: productProfitFormulaIds.unitCost,
      formulaVersion: 1,
      label: '预计单件成本',
      node: unitCostNode,
      notes: ['不含订单级缝边客户收入']
    }),
    unitProfit: createMoneyCalculationResult({
      formulaId: productProfitFormulaIds.unitProfit,
      formulaVersion: 1,
      label: '预计单件利润',
      node: unitProfitNode
    }),
    profitRate: createPercentageCalculationResult({
      formulaId: productProfitFormulaIds.profitRate,
      formulaVersion: 1,
      label: '预计利润率',
      numerator: groupNode('预计单件利润', unitProfitNode),
      denominator: basePriceNode,
      notes: ['默认售价为零，无法计算利润率']
    }),
    edgeIncrementalCost: createMoneyCalculationResult({
      formulaId: productProfitFormulaIds.edgeIncrementalCost,
      formulaVersion: 1,
      label: '缝边预计增加成本',
      node: edgeIncrementalCostNode,
      notes: ['只包含缝边耗材、缝边提成与预计缝边计时工资']
    })
  }
}
