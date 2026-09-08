import { describe, expect, it } from 'vitest'
import { buildFulfillmentQueue, filterFulfillmentQueue } from './use-fulfillment'

const orders = [
  { id: 'order-1', code: 'DD-001', customerName: '小满' },
  { id: 'order-2', code: 'DD-002', customerName: '小夏' }
]

describe('buildFulfillmentQueue', () => {
  it('基于统一履约进度报表汇总跨订单未完成产品，并补充订单客户', () => {
    const queue = buildFulfillmentQueue([
      {
        orderId: 'order-1', orderCode: 'DD-001', orderItemId: 'item-making', productName: '草莓捏捏', confirmedQuantity: 20,
        stages: { making: 20, fluffingBagging: 0, packing: 0, readyToShip: 0, shipped: 0 }
      },
      {
        orderId: 'order-1', orderCode: 'DD-001', orderItemId: 'item-packing', productName: '云朵捏捏', confirmedQuantity: 12,
        stages: { making: 0, fluffingBagging: 0, packing: 7, readyToShip: 5, shipped: 0 }
      },
      {
        orderId: 'order-2', orderCode: 'DD-002', orderItemId: 'item-done', productName: '星星捏捏', confirmedQuantity: 8,
        stages: { making: 0, fluffingBagging: 0, packing: 0, readyToShip: 0, shipped: 8 }
      }
    ] as never, orders as never)

    expect(queue).toHaveLength(2)
    expect(queue.map((item) => item.productName)).toEqual(['草莓捏捏', '云朵捏捏'])
    expect(queue[1]).toMatchObject({ orderCode: 'DD-001', customerName: '小满', outstandingQuantity: 12 })
    expect(queue[1].stages).toEqual({ making: 0, fluffingBagging: 0, packing: 7, readyToShip: 5, shipped: 0 })
  })
})


describe('filterFulfillmentQueue', () => {
  const queue = [
    { orderItemId: 'making', stages: { making: 8, fluffingBagging: 0, packing: 0, readyToShip: 0, shipped: 0 } },
    { orderItemId: 'fluffing', stages: { making: 0, fluffingBagging: 6, packing: 0, readyToShip: 0, shipped: 0 } },
    { orderItemId: 'packing', stages: { making: 0, fluffingBagging: 0, packing: 4, readyToShip: 0, shipped: 0 } },
    { orderItemId: 'shipment', stages: { making: 0, fluffingBagging: 0, packing: 0, readyToShip: 2, shipped: 0 } }
  ]

  it('按单一阶段筛选跨订单履约队列，不把多个阶段混在同一个待办列表', () => {
    expect(filterFulfillmentQueue(queue as never, 'all').map((item) => item.orderItemId)).toEqual(['making', 'fluffing', 'packing', 'shipment'])
    expect(filterFulfillmentQueue(queue as never, 'making').map((item) => item.orderItemId)).toEqual(['making'])
    expect(filterFulfillmentQueue(queue as never, 'fluffing_bagging').map((item) => item.orderItemId)).toEqual(['fluffing'])
    expect(filterFulfillmentQueue(queue as never, 'packing').map((item) => item.orderItemId)).toEqual(['packing'])
    expect(filterFulfillmentQueue(queue as never, 'ready_to_ship').map((item) => item.orderItemId)).toEqual(['shipment'])
  })
})
