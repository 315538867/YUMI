import { requirePositive } from './errors'

export interface ActualProductionInput {
  actualMinutes: number
  qualifiedQuantity: number
  reworkQuantity: number
  scrapQuantity: number
  plannedQuantity: number
  hourlyWageCents: number
  commissionCentsPerUnit: number
}

export interface ActualProductionResult {
  actualLaborCostCents: number
  commissionCostCents: number
  totalActualCostCents: number
}

export function calculateActualProductionCost(
  input: ActualProductionInput
): ActualProductionResult {
  requirePositive(input.actualMinutes, '实际制作分钟', true)
  requirePositive(input.qualifiedQuantity, '合格数量', true)
  requirePositive(input.reworkQuantity, '返工数量', true)
  requirePositive(input.scrapQuantity, '报废数量', true)
  requirePositive(input.plannedQuantity, '计划制作数量')
  requirePositive(input.hourlyWageCents, '兼职人员时薪', true)
  requirePositive(input.commissionCentsPerUnit, '单件提成', true)
  if (
    input.qualifiedQuantity + input.reworkQuantity + input.scrapQuantity >
    input.plannedQuantity
  ) {
    throw new Error('合格、返工和报废数量不能超过计划制作数量')
  }
  const actualLaborCostCents = Math.round((input.actualMinutes * input.hourlyWageCents) / 60)
  const commissionCostCents = input.qualifiedQuantity * input.commissionCentsPerUnit
  return {
    actualLaborCostCents,
    commissionCostCents,
    totalActualCostCents: actualLaborCostCents + commissionCostCents
  }
}
