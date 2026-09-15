import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createV2Database, type V2Database } from '@main/database/v2-connection'
import { V2FulfillmentRepository } from '@main/repositories/fulfillment-repository'
import { V2OrderRepository } from '@main/repositories/v2-order-repository'
import { SettlementService } from '@main/services/settlement-service'
import { FulfillmentService } from '@main/services/fulfillment-service'
import { WorkTimeReviewService } from '@main/services/work-time-review-service'
import { V2OrderService } from '@main/services/v2-order-service'
import { registerV2Ipc, type V2IpcMain } from './register-v2-ipc'

function createIpcMain(): {
  ipcMain: V2IpcMain
  handlers: Map<string, (...args: unknown[]) => unknown>
} {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler)
      }
    }
  }
}

describe('履约与核算 IPC 集成', () => {
  const databases: V2Database[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
  })

  function createHarness() {
    const database = createV2Database(':memory:')
    databases.push(database)
    const clock = {
      createId: () => randomUUID(),
      now: () => new Date(2026, 8, 15, 16, 0).toISOString()
    }
    const orderService = new V2OrderService(new V2OrderRepository(database), clock)
    const settlements = new SettlementService(database, clock)
    const fulfillment = new FulfillmentService(
      new V2FulfillmentRepository(database),
      clock,
      settlements
    )
    const workTimeReviews = new WorkTimeReviewService(database, clock, settlements)
    const { ipcMain, handlers } = createIpcMain()
    registerV2Ipc(
      orderService as never,
      { get: vi.fn(), update: vi.fn() } as never,
      { getSnapshot: vi.fn() } as never,
      fulfillment as never,
      { getSummary: vi.fn() } as never,
      workTimeReviews as never,
      settlements as never,
      {} as never,
      {} as never,
      {} as never,
      { exporter: { exportCurrentReport: vi.fn() } } as never,
      { service: {}, restore: vi.fn() } as never,
      { service: {}, pickFile: vi.fn(), openFile: vi.fn() } as never,
      ipcMain
    )
    const worker = settlements.createWorker({
      name: '小林',
      hourlyWageCents: 3_000,
      effectiveOn: '2026-09-01'
    })
    const product = orderService.createProduct({
      name: '奶油小熊',
      basePriceCents: 6_000,
      packagingCostCents: 0,
      accessoryCostCents: 0,
      replacementBagCostCents: 0,
      edgeConsumableCostCents: 0,
      unitWeightMilligrams: 0,
      standardMakingMinutes: 10,
      makingCommissionCents: 100,
      fluffingBaggingCommissionCents: 85,
      expectedFluffingBaggingMinutes: 3
    })
    const order = orderService.createOrder({
      customer: { name: '小雨' },
      items: [{ productId: product.id, quantity: 20, unitPriceCents: 6_000 }]
    })
    const call = async (channel: string, ...args: unknown[]) => {
      const handler = handlers.get(channel)
      if (!handler) throw new Error(`通道未注册：${channel}`)
      return handler(undefined, ...args)
    }
    return { database, call, worker, order, orderItem: order.items[0]!, settlements }
  }

  it('渲染层输入经 IPC 仍受时间范围、可处理量、重复核算与排班唯一性约束', async () => {
    const { call, worker, orderItem, settlements } = createHarness()

    // 制作一次核算后进入待捏毛装袋池
    const making = (await call('v2:fulfillment:assignments:create', {
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-09-13',
      processType: 'making',
      tasks: [{ orderItemId: orderItem.id, sourceType: 'normal_production', plannedQuantity: 20 }]
    })) as { tasks: Array<{ id: string }> }
    await call('v2:fulfillment:making-reviews:create', {
      processTaskId: making.tasks[0]!.id,
      completedQuantity: 20,
      qualifiedQuantity: 20,
      reviewedOn: '2026-09-13'
    })

    // 计时班次唯一性
    const timedInput = {
      scheduleMode: 'timed_shift',
      workerId: worker.id,
      assignedOn: '2026-09-14',
      processType: 'fluffing_bagging'
    }
    const timed = (await call('v2:fulfillment:assignments:create', timedInput)) as { id: string }
    await expect(call('v2:fulfillment:assignments:create', timedInput)).rejects.toThrow(
      '同一人员同一天已有该工序的计时安排'
    )

    // 结束时间晚于当前时间（本地 2026-09-15 16:00）
    await expect(
      call('v2:work-time-reviews:create', {
        workAssignmentId: timed.id,
        startedAt: '2026-09-14T09:00',
        endedAt: '2026-09-15T20:00',
        items: [{ orderItemId: orderItem.id, completedQuantity: 20 }]
      })
    ).rejects.toThrow('尚未到达')

    // 超过可处理数量
    await expect(
      call('v2:work-time-reviews:create', {
        workAssignmentId: timed.id,
        startedAt: '2026-09-14T09:00',
        endedAt: '2026-09-14T12:00',
        items: [{ orderItemId: orderItem.id, completedQuantity: 21 }]
      })
    ).rejects.toThrow('超过当前可处理数量')

    // 有效确认
    const review = (await call('v2:work-time-reviews:create', {
      workAssignmentId: timed.id,
      startedAt: '2026-09-14T09:00',
      endedAt: '2026-09-14T12:00',
      items: [{ orderItemId: orderItem.id, completedQuantity: 20 }]
    })) as { id: string; approvedMinutes: number }
    expect(review.approvedMinutes).toBe(180)

    // 重复核算
    await expect(
      call('v2:work-time-reviews:create', {
        workAssignmentId: timed.id,
        startedAt: '2026-09-14T09:00',
        endedAt: '2026-09-14T12:00',
        items: [{ orderItemId: orderItem.id, completedQuantity: 20 }]
      })
    ).rejects.toThrow('已完成核算，不能重复核算')

    // 候选查询经 IPC 返回当前可处理量
    const packing = (await call('v2:fulfillment:assignments:create', {
      scheduleMode: 'timed_shift',
      workerId: worker.id,
      assignedOn: '2026-09-15',
      processType: 'packing'
    })) as { id: string }
    const candidates = (await call('v2:work-time-reviews:candidates:list', packing.id)) as Array<{
      processableQuantity: number
    }>
    expect(candidates[0]?.processableQuantity).toBe(20)

    // 锁定校验：工时进入确认结算后不能经 IPC 直接作废
    const draft = (await call('v2:settlements:drafts:create', {
      workerId: worker.id,
      periodStartOn: '2026-09-14',
      periodEndOn: '2026-09-14'
    })) as { id: string; candidateWageCents: number }
    await call('v2:settlements:drafts:update', draft.id, {
      finalPaidAmountCents: draft.candidateWageCents,
      paidOn: '2026-09-15'
    })
    await call('v2:settlements:confirm', draft.id)
    await expect(
      call('v2:work-time-reviews:void', review.id, { reason: '试图作废' })
    ).rejects.toThrow('已进入已确认工资结算')
    expect(settlements.getSettlement(draft.id)?.status).toBe('confirmed')
  })

  it('制作更正与作废经 IPC 生效且保留版本链', async () => {
    const { call, worker, orderItem } = createHarness()
    const making = (await call('v2:fulfillment:assignments:create', {
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-09-13',
      processType: 'making',
      tasks: [{ orderItemId: orderItem.id, sourceType: 'normal_production', plannedQuantity: 10 }]
    })) as { id: string; tasks: Array<{ id: string }> }
    const result = (await call('v2:fulfillment:making-reviews:create', {
      processTaskId: making.tasks[0]!.id,
      completedQuantity: 10,
      qualifiedQuantity: 8,
      reviewedOn: '2026-09-13'
    })) as { id: string }

    const corrected = (await call('v2:fulfillment:making-reviews:correct', {
      resultId: result.id,
      completedQuantity: 10,
      qualifiedQuantity: 10,
      reviewedOn: '2026-09-13',
      reason: '复核后改为全合格'
    })) as { id: string; supersedesResultId: string }
    expect(corrected.supersedesResultId).toBe(result.id)

    const voided = (await call('v2:fulfillment:making-reviews:void', {
      resultId: corrected.id,
      reason: '核算对象选错'
    })) as { status: string }
    expect(voided.status).toBe('voided')

    const assignment = (await call('v2:fulfillment:assignments:get', making.id)) as {
      status: string
      tasks: Array<{ status: string; reviewSummary: unknown }>
    }
    expect(assignment.status).toBe('scheduled')
    expect(assignment.tasks[0]).toMatchObject({ status: 'pending', reviewSummary: null })
  })
})
