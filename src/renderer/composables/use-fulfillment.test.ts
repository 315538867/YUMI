import { describe, expect, it } from 'vitest'
import {
  buildFulfillmentQueue,
  filterFulfillmentQueue,
  getFulfillmentQueueFilterCount,
  getFulfillmentQueueStageUnassignedQuantity,
  getWorkerWeekTasks
} from './use-fulfillment'

const orders = [
  { id: 'order-1', code: 'DD-001', customerName: '小满' },
  { id: 'order-2', code: 'DD-002', customerName: '小夏' }
]

const fulfillmentRows = [
  {
    orderId: 'order-1',
    orderCode: 'DD-001',
    orderItemId: 'item-making',
    productName: '草莓捏捏',
    confirmedQuantity: 100,
    stages: { making: 100, fluffingBagging: 0, packing: 0, readyToShip: 0, shipped: 0 }
  },
  {
    orderId: 'order-1',
    orderCode: 'DD-001',
    orderItemId: 'item-packing',
    productName: '云朵捏捏',
    confirmedQuantity: 12,
    stages: { making: 0, fluffingBagging: 0, packing: 7, readyToShip: 5, shipped: 0 }
  },
  {
    orderId: 'order-2',
    orderCode: 'DD-002',
    orderItemId: 'item-done',
    productName: '星星捏捏',
    confirmedQuantity: 8,
    stages: { making: 0, fluffingBagging: 0, packing: 0, readyToShip: 0, shipped: 8 }
  }
]

describe('buildFulfillmentQueue', () => {
  it('基于统一履约进度报表汇总跨订单未完成产品，并补充订单客户', () => {
    const queue = buildFulfillmentQueue(fulfillmentRows as never, orders as never)

    expect(queue).toHaveLength(2)
    expect(queue.map((item) => item.productName)).toEqual(['草莓捏捏', '云朵捏捏'])
    expect(queue[1]).toMatchObject({
      orderCode: 'DD-001',
      customerName: '小满',
      outstandingQuantity: 12
    })
    expect(queue[1].stages).toEqual({
      making: 0,
      fluffingBagging: 0,
      packing: 7,
      readyToShip: 5,
      shipped: 0
    })
  })

  it('按任务而非工作安排聚合有效已派数量，保留待质检任务并识别超派与人员缺失', () => {
    const queue = buildFulfillmentQueue(
      fulfillmentRows as never,
      orders as never,
      [
        {
          id: 'assignment-1',
          workerId: 'worker-wang',
          assignedOn: '2026-09-10',
          processType: 'making',
          status: 'scheduled',
          tasks: [
            {
              id: 'task-pending',
              orderItemId: 'item-making',
              processType: 'making',
              plannedQuantity: 60,
              status: 'pending'
            },
            {
              id: 'task-other-item',
              orderItemId: 'item-packing',
              processType: 'making',
              plannedQuantity: 10,
              status: 'pending'
            }
          ]
        },
        {
          id: 'assignment-2',
          workerId: 'worker-missing',
          assignedOn: '2026-09-11',
          processType: 'making',
          status: 'scheduled',
          tasks: [
            {
              id: 'task-inspection',
              orderItemId: 'item-making',
              processType: 'making',
              plannedQuantity: 50,
              status: 'pending_inspection'
            },
            {
              id: 'task-confirmed',
              orderItemId: 'item-making',
              processType: 'making',
              plannedQuantity: 10,
              status: 'confirmed'
            }
          ]
        }
      ] as never,
      [{ id: 'worker-wang', name: '小王' }] as never
    )

    const making = queue.find((item) => item.orderItemId === 'item-making')!
    expect(making.stageSchedules.making).toMatchObject({
      wipQuantity: 100,
      reservedQuantity: 110,
      unassignedQuantity: 0,
      overassignedQuantity: 10
    })
    expect(making.stageSchedules.making.tasks).toEqual([
      expect.objectContaining({
        taskId: 'task-pending',
        workerName: '小王',
        status: 'pending',
        plannedQuantity: 60
      }),
      expect.objectContaining({
        taskId: 'task-inspection',
        workerName: '已删除人员',
        status: 'pending_inspection',
        plannedQuantity: 50
      })
    ])
    expect(making.stageSchedules.making.tasks).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskId: 'task-other-item' }),
        expect.objectContaining({ taskId: 'task-confirmed' })
      ])
    )
  })
})

describe('filterFulfillmentQueue', () => {
  const queue = [
    {
      orderItemId: 'making',
      stages: { making: 8, fluffingBagging: 0, packing: 0, readyToShip: 0, shipped: 0 }
    },
    {
      orderItemId: 'fluffing',
      stages: { making: 0, fluffingBagging: 6, packing: 0, readyToShip: 0, shipped: 0 }
    },
    {
      orderItemId: 'packing',
      stages: { making: 0, fluffingBagging: 0, packing: 4, readyToShip: 0, shipped: 0 }
    },
    {
      orderItemId: 'shipment',
      stages: { making: 0, fluffingBagging: 0, packing: 0, readyToShip: 2, shipped: 0 }
    }
  ]

  it('按单一阶段筛选跨订单履约队列，不把多个阶段混在同一个待办列表', () => {
    expect(filterFulfillmentQueue(queue as never, 'all').map((item) => item.orderItemId)).toEqual([
      'making',
      'fluffing',
      'packing',
      'shipment'
    ])
    expect(
      filterFulfillmentQueue(queue as never, 'making').map((item) => item.orderItemId)
    ).toEqual(['making'])
    expect(
      filterFulfillmentQueue(queue as never, 'fluffing_bagging').map((item) => item.orderItemId)
    ).toEqual(['fluffing'])
    expect(
      filterFulfillmentQueue(queue as never, 'packing').map((item) => item.orderItemId)
    ).toEqual(['packing'])
    expect(
      filterFulfillmentQueue(queue as never, 'ready_to_ship').map((item) => item.orderItemId)
    ).toEqual(['shipment'])
  })

  it('用待派件数而不是订单商品行数作为阶段筛选计数', () => {
    const queueWithSchedules = buildFulfillmentQueue(
      fulfillmentRows as never,
      orders as never,
      [
        {
          id: 'assignment-1',
          workerId: 'worker-wang',
          assignedOn: '2026-09-10',
          processType: 'making',
          status: 'scheduled',
          tasks: [
            {
              id: 'task-pending',
              orderItemId: 'item-making',
              processType: 'making',
              plannedQuantity: 60,
              status: 'pending'
            }
          ]
        }
      ] as never,
      [{ id: 'worker-wang', name: '小王' }] as never
    )

    expect(getFulfillmentQueueStageUnassignedQuantity(queueWithSchedules[0], 'making')).toBe(40)
    expect(getFulfillmentQueueFilterCount(queueWithSchedules, 'making')).toBe(40)
    expect(getFulfillmentQueueFilterCount(queueWithSchedules, 'all')).toBe(52)
  })
})

describe('getWorkerWeekTasks', () => {
  it('按人员与自然周日期返回待完成和待质检任务', () => {
    const queue = buildFulfillmentQueue(
      fulfillmentRows as never,
      orders as never,
      [
        {
          id: 'assignment-1',
          workerId: 'worker-wang',
          assignedOn: '2026-09-10',
          processType: 'making',
          status: 'scheduled',
          tasks: [
            {
              id: 'task-pending',
              orderItemId: 'item-making',
              processType: 'making',
              plannedQuantity: 60,
              status: 'pending'
            }
          ]
        },
        {
          id: 'assignment-2',
          workerId: 'worker-li',
          assignedOn: '2026-09-13',
          processType: 'packing',
          status: 'scheduled',
          tasks: [
            {
              id: 'task-sunday',
              orderItemId: 'item-packing',
              processType: 'packing',
              plannedQuantity: 4,
              status: 'pending_inspection'
            }
          ]
        },
        {
          id: 'assignment-3',
          workerId: 'worker-li',
          assignedOn: '2026-09-14',
          processType: 'packing',
          status: 'scheduled',
          tasks: [
            {
              id: 'task-next-week',
              orderItemId: 'item-packing',
              processType: 'packing',
              plannedQuantity: 4,
              status: 'pending_inspection'
            }
          ]
        }
      ] as never,
      [
        { id: 'worker-wang', name: '小王' },
        { id: 'worker-li', name: '小李' }
      ] as never
    )

    expect(getWorkerWeekTasks(queue, '2026-09-07')).toEqual([
      expect.objectContaining({
        taskId: 'task-pending',
        workerId: 'worker-wang',
        workerName: '小王',
        assignedOn: '2026-09-10',
        productName: '草莓捏捏'
      }),
      expect.objectContaining({
        taskId: 'task-sunday',
        workerId: 'worker-li',
        workerName: '小李',
        assignedOn: '2026-09-13',
        productName: '云朵捏捏'
      })
    ])
  })
})
