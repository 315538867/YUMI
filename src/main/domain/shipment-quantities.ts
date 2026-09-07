import { DomainValidationError } from './errors'

export interface ShipmentQuantityInput {
  confirmedQuantity: number
  shippedQuantity: number
  addingQuantity: number
  availableQuantity?: number
}

export function validateShipmentQuantity(input: ShipmentQuantityInput): void {
  for (const [label, value] of [
    ['订单确认数量', input.confirmedQuantity],
    ['已发货数量', input.shippedQuantity],
    ['本次发货数量', input.addingQuantity],
    ['待发货可用数量', input.availableQuantity]
  ] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
      throw new DomainValidationError(`${label}必须是非负整数`)
    }
  }
  if (input.availableQuantity === undefined) {
    const nextShippedQuantity = input.shippedQuantity + input.addingQuantity
    if (nextShippedQuantity > input.confirmedQuantity) {
      throw new DomainValidationError('累计发货数量不能超过订单确认数量')
    }
    return
  }
  if (input.addingQuantity > input.availableQuantity) {
    throw new DomainValidationError('本次发货数量超过待发货可用数量')
  }
}

export function calculateShipmentQuantities(
  confirmedQuantity: number,
  shippedQuantity: number,
  availableQuantity?: number
): { confirmedQuantity: number; shippedQuantity: number; pendingQuantity: number; availableQuantity?: number } {
  validateShipmentQuantity({
    confirmedQuantity,
    shippedQuantity,
    addingQuantity: 0,
    availableQuantity
  })
  return {
    confirmedQuantity,
    shippedQuantity,
    pendingQuantity: confirmedQuantity - shippedQuantity,
    availableQuantity
  }
}
