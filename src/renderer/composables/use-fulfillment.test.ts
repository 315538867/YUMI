import { describe, expect, it } from 'vitest'
import {
  buildFulfillmentQueue,
  buildWorkerWeekCards,
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
    stages: {
      making: 100,
      fluffingBagging: 0,
      edgeSewing: 0,
      packing: 0,
      readyToShip: 0,
      shipped: 0,
      edgeSewingRouted: 0
    }
  },
  {
    orderId: 'order-1',
    orderCode: 'DD-001',
    orderItemId: 'item-packing',
    productName: '云朵捏捏',
    confirmedQuantity: 12,
    stages: {
      making: 0,
      fluffingBagging: 0,
      edgeSewing: 0,
      packing: 7,
      readyToShip: 5,
      shipped: 0,
      edgeSewingRouted: 0
    }
  },
  {
    orderId: 'order-2',
    orderCode: 'DD-002',
    orderItemId: 'item-done',
    productName: '星星捏捏',
    confirmedQuantity: 8,
    stages: {
      making: 0,
      fluffingBagging: 0,
      edgeSewing: 0,
      packing: 0,
      readyToShip: 0,
      shipped: 8,
      edgeSewingRouted: 0
    }
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
      outstandingQuantity: 7
    })
    expect(queue[1].stages).toEqual({
      making: 0,
      fluffingBagging: 0,
      edgeSewing: 0,
      packing: 7,
      readyToShip: 5,
      shipped: 0,
      edgeSewingRouted: 0
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
      stages: {
        making: 8,
        fluffingBagging: 0,
        edgeSewing: 0,
        packing: 0,
        readyToShip: 0,
        shipped: 0,
        edgeSewingRouted: 0
      }
    },
    {
      orderItemId: 'fluffing',
      stages: {
        making: 0,
        fluffingBagging: 6,
        edgeSewing: 0,
        packing: 0,
        readyToShip: 0,
        shipped: 0,
        edgeSewingRouted: 0
      }
    },
    {
      orderItemId: 'packing',
      stages: {
        making: 0,
        fluffingBagging: 0,
        edgeSewing: 0,
        packing: 4,
        readyToShip: 0,
        shipped: 0,
        edgeSewingRouted: 0
      }
    },
    {
      orderItemId: 'edge',
      stages: {
        making: 0,
        fluffingBagging: 0,
        edgeSewing: 2,
        packing: 0,
        readyToShip: 0,
        shipped: 0,
        edgeSewingRouted: 2
      }
    }
  ]

  it('按单一阶段筛选跨订单履约队列，不把多个阶段混在同一个待办列表', () => {
    expect(filterFulfillmentQueue(queue as never, 'all').map((item) => item.orderItemId)).toEqual([
      'making',
      'fluffing',
      'packing',
      'edge'
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
      filterFulfillmentQueue(queue as never, 'edge_sewing').map((item) => item.orderItemId)
    ).toEqual(['edge'])
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
    expect(getFulfillmentQueueFilterCount(queueWithSchedules, 'all')).toBe(47)
  })
})

describe('buildFulfillmentQueue 制作口径边界', () => {
  it('计时班次与历史计时任务都不参与订单已派、待派与超派推导', () => {
    const queue = buildFulfillmentQueue(
      fulfillmentRows as never,
      orders as never,
      [
        {
          id: 'assignment-timed',
          workerId: 'worker-wang',
          assignedOn: '2026-09-10',
          processType: 'fluffing_bagging',
          scheduleMode: 'timed_shift',
          status: 'scheduled',
          tasks: [],
          timedReview: null
        },
        {
          id: 'assignment-legacy',
          workerId: 'worker-wang',
          assignedOn: '2026-09-10',
          processType: 'packing',
          scheduleMode: 'legacy_task',
          status: 'scheduled',
          tasks: [
            {
              id: 'task-legacy',
              orderItemId: 'item-making',
              processType: 'packing',
              plannedQuantity: 40,
              status: 'pending'
            }
          ],
          timedReview: null
        }
      ] as never,
      [
        { id: 'worker-wang', name: '小王' },
        { id: 'worker-li', name: '小李' }
      ] as never
    )

    const making = queue.find((item) => item.orderItemId === 'item-making')!
    expect(making.stageSchedules.making).toMatchObject({
      wipQuantity: 100,
      reservedQuantity: 0,
      unassignedQuantity: 100,
      overassignedQuantity: 0,
      tasks: []
    })
    expect(making.stageSchedules.packing).toMatchObject({ reservedQuantity: 0, tasks: [] })
  })

  it('缺勤或取消的制作安排释放尚未核算的计划数量', () => {
    const queue = buildFulfillmentQueue(
      fulfillmentRows as never,
      orders as never,
      [
        {
          id: 'assignment-cancelled',
          workerId: 'worker-wang',
          assignedOn: '2026-09-10',
          processType: 'making',
          scheduleMode: 'making_task',
          status: 'cancelled',
          tasks: [
            {
              id: 'task-cancelled',
              orderItemId: 'item-making',
              processType: 'making',
              plannedQuantity: 30,
              status: 'cancelled'
            }
          ],
          timedReview: null
        },
        {
          id: 'assignment-absent',
          workerId: 'worker-li',
          assignedOn: '2026-09-11',
          processType: 'making',
          scheduleMode: 'making_task',
          status: 'absent',
          tasks: [
            {
              id: 'task-absent',
              orderItemId: 'item-making',
              processType: 'making',
              plannedQuantity: 30,
              status: 'pending'
            }
          ],
          timedReview: null
        }
      ] as never,
      [{ id: 'worker-wang', name: '小王' }] as never
    )

    const making = queue.find((item) => item.orderItemId === 'item-making')!
    expect(making.stageSchedules.making).toMatchObject({
      reservedQuantity: 0,
      unassignedQuantity: 100,
      overassignedQuantity: 0,
      tasks: []
    })
  })
})

describe('buildWorkerWeekCards', () => {
  it('按自然周过滤有效安排：制作按任务展开，计时班次单卡且不关联商品', () => {
    const cards = buildWorkerWeekCards(
      [
        {
          id: 'assignment-making',
          workerId: 'worker-wang',
          assignedOn: '2026-09-07',
          processType: 'making',
          scheduleMode: 'making_task',
          status: 'scheduled',
          tasks: [
            {
              id: 'task-1',
              orderItemId: 'item-making',
              processType: 'making',
              plannedQuantity: 5,
              status: 'pending',
              reviewSummary: null
            },
            {
              id: 'task-2',
              orderItemId: 'item-making',
              processType: 'making',
              plannedQuantity: 7,
              status: 'cancelled',
              reviewSummary: null
            }
          ],
          timedReview: null
        },
        {
          id: 'assignment-timed',
          workerId: 'worker-li',
          assignedOn: '2026-09-10',
          processType: 'edge_sewing',
          scheduleMode: 'timed_shift',
          status: 'scheduled',
          tasks: [],
          timedReview: null
        },
        {
          id: 'assignment-cancelled',
          workerId: 'worker-wang',
          assignedOn: '2026-09-08',
          processType: 'making',
          scheduleMode: 'making_task',
          status: 'cancelled',
          tasks: [
            {
              id: 'task-cancelled',
              orderItemId: 'item-making',
              processType: 'making',
              plannedQuantity: 3,
              status: 'pending',
              reviewSummary: null
            }
          ],
          timedReview: null
        },
        {
          id: 'assignment-next-week',
          workerId: 'worker-wang',
          assignedOn: '2026-09-14',
          processType: 'making',
          scheduleMode: 'making_task',
          status: 'scheduled',
          tasks: [
            {
              id: 'task-next-week',
              orderItemId: 'item-making',
              processType: 'making',
              plannedQuantity: 4,
              status: 'pending',
              reviewSummary: null
            }
          ],
          timedReview: null
        }
      ] as never,
      '2026-09-07'
    )

    expect(cards).toHaveLength(2)
    expect(cards[0]).toMatchObject({
      key: 'making-task-1',
      kind: 'making',
      workerId: 'worker-wang',
      assignedOn: '2026-09-07',
      reviewed: false
    })
    expect(cards[0]!.task?.plannedQuantity).toBe(5)
    expect(cards[1]).toMatchObject({
      key: 'timed-assignment-timed',
      kind: 'timed',
      workerId: 'worker-li',
      assignedOn: '2026-09-10',
      reviewed: false,
      task: null
    })
  })

  it('制作任务的核算状态来自任务摘要，计时班次取班次核算摘要', () => {
    const cards = buildWorkerWeekCards(
      [
        {
          id: 'assignment-making',
          workerId: 'worker-wang',
          assignedOn: '2026-09-07',
          processType: 'making',
          scheduleMode: 'making_task',
          status: 'scheduled',
          tasks: [
            {
              id: 'task-1',
              orderItemId: 'item-making',
              processType: 'making',
              plannedQuantity: 5,
              status: 'pending_inspection',
              reviewSummary: { resultId: 'result-1' }
            }
          ],
          timedReview: null
        },
        {
          id: 'assignment-timed',
          workerId: 'worker-li',
          assignedOn: '2026-09-08',
          processType: 'packing',
          scheduleMode: 'timed_shift',
          status: 'scheduled',
          tasks: [],
          timedReview: { reviewId: 'review-1', approvedMinutes: 510, reviewedOn: '2026-09-08' }
        }
      ] as never,
      '2026-09-07'
    )

    expect(cards.map((card) => card.reviewed)).toEqual([true, true])
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
          processType: 'making',
          status: 'scheduled',
          tasks: [
            {
              id: 'task-sunday',
              orderItemId: 'item-packing',
              processType: 'making',
              plannedQuantity: 4,
              status: 'pending_inspection'
            }
          ]
        },
        {
          id: 'assignment-3',
          workerId: 'worker-li',
          assignedOn: '2026-09-14',
          processType: 'making',
          status: 'scheduled',
          tasks: [
            {
              id: 'task-next-week',
              orderItemId: 'item-packing',
              processType: 'making',
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
