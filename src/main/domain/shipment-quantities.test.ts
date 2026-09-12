import { describe, expect, it } from 'vitest'
import { calculateShipmentQuantities, validateShipmentQuantity } from './shipment-quantities'

describe('V2 发货数量', () => {
  it('汇总已发货和待发货数量', () => {
    expect(calculateShipmentQuantities(100, 30)).toEqual({
      confirmedQuantity: 100,
      shippedQuantity: 30,
      pendingQuantity: 70,
      availableQuantity: undefined
    })
  })

  it('阶段 A 不允许累计发货超过确认数量', () => {
    expect(() =>
      validateShipmentQuantity({
        confirmedQuantity: 100,
        shippedQuantity: 90,
        addingQuantity: 11
      })
    ).toThrow('确认数量')
  })

  it('启用履约流转后不允许超过待发货可用量', () => {
    expect(() =>
      validateShipmentQuantity({
        confirmedQuantity: 100,
        shippedQuantity: 30,
        addingQuantity: 8,
        availableQuantity: 7
      })
    ).toThrow('可用数量')
  })
})
