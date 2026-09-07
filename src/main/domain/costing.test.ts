import { describe, expect, it } from 'vitest'
import { calculateProductCost, calculateDailyCapacity } from './costing'

describe('商品成本计算', () => {
  it('按重量、损耗、胶水克单价和其他成本计算预计单件成本', () => {
    const result = calculateProductCost({
      quantity: 10,
      weightGrams: 12,
      lossRate: 0.1,
      gluePricePerGram: 0.5,
      packagingCostPerUnit: 1.2,
      standardMinutesPerUnit: 30,
      hourlyLaborCost: 24,
      commissionPerUnit: 2,
      edgeEnabled: true,
      edgeQuantity: 4,
      edgePricePerUnit: 3
    })

    expect(result.glueGrams).toBe(132)
    expect(result.glueCost).toBe(66)
    expect(result.packagingCost).toBe(12)
    expect(result.laborHours).toBe(5)
    expect(result.laborCost).toBe(120)
    expect(result.commissionCost).toBe(20)
    expect(result).not.toHaveProperty('fixedOverheadCost')
    expect(result.edgeRevenue).toBe(12)
    expect(result.totalCost).toBe(218)
  })

  it('将配件费和替换袋费用按制作数量计入预计直接成本', () => {
    const result = calculateProductCost({
      quantity: 10,
      weightGrams: 12,
      lossRate: 0.1,
      gluePricePerGram: 0.5,
      packagingCostPerUnit: 1.2,
      accessoryCostPerUnit: 2.5,
      replacementBagCostPerUnit: 0.8,
      standardMinutesPerUnit: 30,
      hourlyLaborCost: 24,
      commissionPerUnit: 2,
      edgeEnabled: false,
      edgeQuantity: 0,
      edgePricePerUnit: 0
    })

    expect(result.accessoryCost).toBe(25)
    expect(result.replacementBagCost).toBe(8)
    expect(result.totalCost).toBe(251)
  })

  it('根据模具数量、每批产出和每日批次数计算日产能', () => {
    expect(
      calculateDailyCapacity({ moldCount: 20, outputPerMoldPerBatch: 1, maxBatchesPerDay: 2 })
    ).toBe(40)
  })
})

it('将捏毛装袋和缝边成本按订单数量计入成本，并仅在启用缝边时计算缝边成本', () => {
  const result = calculateProductCost({
    quantity: 10,
    weightGrams: 0,
    lossRate: 0,
    gluePricePerGram: 0,
    packagingCostPerUnit: 0,
    accessoryCostPerUnit: 0,
    replacementBagCostPerUnit: 0,
    fluffPackingCostPerUnit: 0.5,
    edgeCostPerUnit: 1,
    standardMinutesPerUnit: 0,
    hourlyLaborCost: 0,
    commissionPerUnit: 0,
    edgeEnabled: true,
    edgeQuantity: 10,
    edgePricePerUnit: 3
  })

  expect(result.fluffPackingCost).toBe(5)
  expect(result.edgeCost).toBe(10)
  expect(result.totalCost).toBe(15)
})
