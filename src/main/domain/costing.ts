import { requirePositive } from './errors'

export interface ProductCostInput {
  quantity: number
  weightGrams: number
  lossRate: number
  gluePricePerGram: number
  packagingCostPerUnit: number
  standardMinutesPerUnit: number
  hourlyLaborCost: number
  commissionPerUnit: number
  fixedOverheadHourlyRate: number
  edgeEnabled: boolean
  edgeQuantity: number
  edgePricePerUnit: number
}

export interface ProductCostResult {
  glueGrams: number
  glueCost: number
  packagingCost: number
  laborHours: number
  laborCost: number
  commissionCost: number
  fixedOverheadCost: number
  edgeRevenue: number
  totalCost: number
}

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100
const roundQuantity = (value: number): number => Math.round((value + Number.EPSILON) * 1000) / 1000

export function calculateProductCost(input: ProductCostInput): ProductCostResult {
  requirePositive(input.quantity, '制作数量')
  requirePositive(input.weightGrams, '单件重量', true)
  requirePositive(input.lossRate, '损耗率', true)
  requirePositive(input.gluePricePerGram, '胶水克单价', true)
  requirePositive(input.packagingCostPerUnit, '包装成本', true)
  requirePositive(input.standardMinutesPerUnit, '标准制作时长', true)
  requirePositive(input.hourlyLaborCost, '人工时薪', true)
  requirePositive(input.commissionPerUnit, '单件提成', true)
  requirePositive(input.fixedOverheadHourlyRate, '固定成本时薪', true)
  requirePositive(input.edgeQuantity, '缝边数量', true)
  requirePositive(input.edgePricePerUnit, '缝边单价', true)

  if (input.lossRate >= 1) {
    throw new Error('损耗率必须小于 1')
  }
  if (input.edgeQuantity > input.quantity) {
    throw new Error('缝边数量不能超过制作数量')
  }

  const glueGrams = roundQuantity(input.quantity * input.weightGrams * (1 + input.lossRate))
  const glueCost = roundMoney(glueGrams * input.gluePricePerGram)
  const packagingCost = roundMoney(input.quantity * input.packagingCostPerUnit)
  const laborHours = roundQuantity((input.quantity * input.standardMinutesPerUnit) / 60)
  const laborCost = roundMoney(laborHours * input.hourlyLaborCost)
  const commissionCost = roundMoney(input.quantity * input.commissionPerUnit)
  const fixedOverheadCost = roundMoney(laborHours * input.fixedOverheadHourlyRate)
  const edgeRevenue = input.edgeEnabled
    ? roundMoney(input.edgeQuantity * input.edgePricePerUnit)
    : 0

  return {
    glueGrams,
    glueCost,
    packagingCost,
    laborHours,
    laborCost,
    commissionCost,
    fixedOverheadCost,
    edgeRevenue,
    totalCost: roundMoney(glueCost + packagingCost + laborCost + commissionCost + fixedOverheadCost)
  }
}

export interface DailyCapacityInput {
  moldCount: number
  outputPerMoldPerBatch: number
  maxBatchesPerDay: number
}

export function calculateDailyCapacity(input: DailyCapacityInput): number {
  requirePositive(input.moldCount, '模具数量')
  requirePositive(input.outputPerMoldPerBatch, '每模每批产出')
  requirePositive(input.maxBatchesPerDay, '每日批次数')
  return input.moldCount * input.outputPerMoldPerBatch * input.maxBatchesPerDay
}
