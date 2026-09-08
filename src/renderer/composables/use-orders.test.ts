import { describe, expect, it } from 'vitest'
import type { V2Order, V2OrderItemFulfillment, V2Shipment } from '@shared/contracts/index'
import { buildShipmentItemAvailability } from './use-orders'

describe('buildShipmentItemAvailability', () => {
  it('以履约中的待发货数量为本批上限，同时保留确认、已发和待发数据', () => {
    const order = {
      id: 'order-1',
      items: [
        { id: 'item-a', quantity: 100, productSnapshot: { name: '草莓' } },
        { id: 'item-b', quantity: 80, productSnapshot: { name: '奶油' } }
      ]
    } as V2Order
    const shipments = [
      { id: 'shipment-1', items: [{ orderItemId: 'item-a', quantity: 30 }] }
    ] as V2Shipment[]
    const fulfillmentItems = [
      {
        orderItemId: 'item-a',
        confirmedQuantity: 100,
        stages: { making: 0, fluffingBagging: 0, packing: 0, readyToShip: 18, shipped: 30 }
      },
      {
        orderItemId: 'item-b',
        confirmedQuantity: 80,
        stages: { making: 0, fluffingBagging: 0, packing: 0, readyToShip: 90, shipped: 0 }
      }
    ] as V2OrderItemFulfillment[]

    expect(buildShipmentItemAvailability(order, shipments, fulfillmentItems)).toEqual([
      {
        orderItemId: 'item-a',
        confirmedQuantity: 100,
        shippedQuantity: 30,
        remainingQuantity: 70,
        availableQuantity: 18
      },
      {
        orderItemId: 'item-b',
        confirmedQuantity: 80,
        shippedQuantity: 0,
        remainingQuantity: 80,
        availableQuantity: 80
      }
    ])
  })
})
