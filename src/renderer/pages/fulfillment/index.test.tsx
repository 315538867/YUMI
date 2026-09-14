/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import {
  cleanup,
  fireEvent,
  render as renderBase,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YumiNotificationProvider } from '../../components/ui'
const render = (ui: Parameters<typeof renderBase>[0]) =>
  renderBase(<YumiNotificationProvider>{ui}</YumiNotificationProvider>)
import { installDomInteractionPolyfills } from '../../test/dom'
import { today } from '../../composables/v2-utils'
import { FulfillmentPage } from './index'

function dateParts(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfWeekFrom(dateStr: string): string {
  const current = new Date(`${dateStr}T00:00:00`)
  const day = current.getDay() || 7
  current.setDate(current.getDate() - day + 1)
  return dateParts(current)
}

function addDays(dateStr: string, count: number): string {
  const next = new Date(`${dateStr}T00:00:00`)
  next.setDate(next.getDate() + count)
  return dateParts(next)
}

const mocks = vi.hoisted(() => {
  const emptySchedule = {
    wipQuantity: 0,
    reservedQuantity: 0,
    unassignedQuantity: 0,
    overassignedQuantity: 0,
    tasks: []
  }
  const makingSchedule = {
    wipQuantity: 20,
    reservedQuantity: 12,
    unassignedQuantity: 8,
    overassignedQuantity: 0,
    tasks: [
      {
        assignmentId: 'assignment-1',
        taskId: 'task-making',
        workerId: 'worker-wang',
        workerName: '小王',
        assignedOn: '2026-09-10',
        processType: 'making',
        stage: 'making',
        plannedQuantity: 12,
        status: 'pending'
      }
    ]
  }
  return {
    selectOrder: vi.fn().mockResolvedValue(undefined),
    createWorkAssignment: vi.fn().mockResolvedValue(undefined),
    reassignProcessTask: vi.fn().mockResolvedValue(undefined),
    showSelectedOrder: false,
    workers: [
      { id: 'worker-wang', name: '小王', enabled: true },
      { id: 'worker-li', name: '小李', enabled: true }
    ] as Array<{ id: string; name: string; enabled: boolean }>,
    queueItems: [
      {
        orderId: 'order-1',
        orderCode: 'YD-001',
        customerName: '小满',
        orderItemId: 'item-making',
        productName: '草莓捏捏',
        confirmedQuantity: 20,
        outstandingQuantity: 20,
        stages: {
          making: 20,
          fluffingBagging: 0,
          edgeSewing: 0,
          packing: 0,
          readyToShip: 0,
          shipped: 0,
          edgeSewingRouted: 0
        },
        stageSchedules: {
          making: makingSchedule,
          fluffing_bagging: emptySchedule,
          edge_sewing: emptySchedule,
          packing: emptySchedule
        }
      },
      {
        orderId: 'order-1',
        orderCode: 'YD-001',
        customerName: '小满',
        orderItemId: 'item-packing',
        productName: '奶油捏捏',
        confirmedQuantity: 12,
        outstandingQuantity: 4,
        stages: {
          making: 0,
          fluffingBagging: 0,
          edgeSewing: 0,
          packing: 4,
          readyToShip: 0,
          shipped: 8,
          edgeSewingRouted: 0
        },
        stageSchedules: {
          making: emptySchedule,
          fluffing_bagging: emptySchedule,
          edge_sewing: emptySchedule,
          packing: {
            wipQuantity: 4,
            reservedQuantity: 0,
            unassignedQuantity: 4,
            overassignedQuantity: 0,
            tasks: []
          }
        }
      }
    ]
  }
})

vi.mock('../../composables/use-fulfillment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../composables/use-fulfillment')>()
  return {
    ...actual,
    useFulfillment: () => ({
      queueItems: mocks.queueItems,
      workers: mocks.workers,
      selectedOrder: mocks.showSelectedOrder
        ? {
            id: 'order-1',
            code: 'YD-001',
            customerSnapshot: { name: '小满' },
            items: [{ id: 'item-making', quantity: 20, productSnapshot: { name: '草莓捏捏' } }]
          }
        : null,
      items: [
        {
          orderItemId: 'item-making',
          stages: {
            making: 20,
            fluffingBagging: 0,
            edgeSewing: 0,
            packing: 0,
            readyToShip: 0,
            shipped: 0,
            edgeSewingRouted: 0
          }
        }
      ],
      loading: false,
      loadError: null,
      selectOrder: mocks.selectOrder,
      createWorkAssignment: mocks.createWorkAssignment,
      reassignProcessTask: mocks.reassignProcessTask,
      adjustStageQuantity: vi.fn()
    })
  }
})

Object.assign(window, {
  yumiV2: {
    workTimeReviews: {
      list: vi.fn(async () => []),
      get: vi.fn(async () => null),
      createDraft: vi.fn(),
      updateDraft: vi.fn(),
      confirm: vi.fn(),
      void: vi.fn()
    }
  }
})

installDomInteractionPolyfills()
afterEach(() => {
  cleanup()
  mocks.selectOrder.mockClear()
  mocks.createWorkAssignment.mockClear()
  mocks.reassignProcessTask.mockClear()
  mocks.showSelectedOrder = false
})

describe('履约排班双视角交互', () => {
  it('订单视角以具名工具条和固定列排班队列表承载待派与已派任务', () => {
    render(<FulfillmentPage />)

    const viewSwitch = screen.getByRole('navigation', { name: '排班视角' })
    expect(viewSwitch).toHaveClass('yumi-primary-tabs')
    expect(within(viewSwitch).getByRole('button', { name: '订单视角' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByRole('region', { name: '订单排班队列' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '订单排班队列' })).toBeVisible()
    expect(screen.getByRole('toolbar', { name: '排班队列列表工具' })).toBeVisible()
    const table = screen.getByRole('table', { name: '排班队列列表' })
    expect(table).toBeVisible()
    expect(within(table).getByRole('columnheader', { name: '任务分配' })).toBeVisible()
    expect(within(table).getAllByText('制作').length).toBeGreaterThan(0)
    expect(table.querySelectorAll('.yumi-fulfillment-stage')).toHaveLength(2)
    expect(table.querySelectorAll('.yumi-fulfillment-task-card')).toHaveLength(0)
    expect(screen.getByText('已指派：小王 12 件')).toBeVisible()
    expect(screen.getByText('未指派：8 件')).toBeVisible()
    expect(screen.getByRole('button', { name: '查看制作任务' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '进入处理：草莓捏捏' }))
    expect(mocks.selectOrder).toHaveBeenCalledWith('order-1')

    fireEvent.click(screen.getByRole('button', { name: '派工制作' }))
    expect(screen.getByRole('dialog', { name: '派工：制作' })).toBeVisible()
    expect(screen.getByText('待派上限：8 件')).toBeVisible()
  })

  it('订单视角按工序独立汇总未派、单人已派、多人已派与超派数量，不重复渲染任务卡片', () => {
    const originalQueueItems = mocks.queueItems
    mocks.queueItems = [
      {
        ...originalQueueItems[0],
        stages: {
          making: 10,
          fluffingBagging: 5,
          edgeSewing: 4,
          packing: 10,
          readyToShip: 6,
          shipped: 0,
          edgeSewingRouted: 4
        },
        stageSchedules: {
          making: {
            wipQuantity: 10,
            reservedQuantity: 0,
            unassignedQuantity: 10,
            overassignedQuantity: 0,
            tasks: []
          },
          fluffing_bagging: {
            wipQuantity: 5,
            reservedQuantity: 5,
            unassignedQuantity: 0,
            overassignedQuantity: 0,
            tasks: [
              {
                assignmentId: 'assignment-fluffing',
                taskId: 'task-fluffing',
                workerId: 'worker-li',
                workerName: '小李',
                assignedOn: '2026-09-10',
                processType: 'fluffing_bagging',
                stage: 'fluffing_bagging',
                plannedQuantity: 5,
                status: 'pending'
              }
            ]
          },
          packing: {
            wipQuantity: 10,
            reservedQuantity: 8,
            unassignedQuantity: 2,
            overassignedQuantity: 0,
            tasks: [
              {
                assignmentId: 'assignment-packing-1',
                taskId: 'task-packing-1',
                workerId: 'worker-wang',
                workerName: '小王',
                assignedOn: '2026-09-10',
                processType: 'packing',
                stage: 'packing',
                plannedQuantity: 3,
                status: 'pending'
              },
              {
                assignmentId: 'assignment-packing-2',
                taskId: 'task-packing-2',
                workerId: 'worker-li',
                workerName: '小李',
                assignedOn: '2026-09-10',
                processType: 'packing',
                stage: 'packing',
                plannedQuantity: 5,
                status: 'pending_inspection'
              }
            ]
          },
          edge_sewing: {
            wipQuantity: 4,
            reservedQuantity: 6,
            unassignedQuantity: 0,
            overassignedQuantity: 2,
            tasks: [
              {
                assignmentId: 'assignment-edge',
                taskId: 'task-edge',
                workerId: 'worker-wang',
                workerName: '小王',
                assignedOn: '2026-09-10',
                processType: 'edge_sewing',
                stage: 'edge_sewing',
                plannedQuantity: 6,
                status: 'pending'
              }
            ]
          }
        }
      }
    ]

    try {
      render(<FulfillmentPage />)

      const table = screen.getByRole('table', { name: '排班队列列表' })
      expect(table.querySelectorAll('.yumi-fulfillment-stage')).toHaveLength(4)
      expect(table.querySelectorAll('.yumi-fulfillment-task-card')).toHaveLength(0)
      expect(screen.getByText('已指派：0 件')).toBeVisible()
      expect(screen.getByText('未指派：10 件')).toBeVisible()
      expect(screen.getByText('已指派：小李 5 件')).toBeVisible()
      expect(screen.getAllByText('未指派：0 件')).toHaveLength(2)
      expect(screen.getByText('已指派：2 人 8 件')).toBeVisible()
      expect(screen.getByText('未指派：2 件')).toBeVisible()
      expect(screen.getByText('已指派：小王 6 件')).toBeVisible()
      expect(screen.getByText('超派：2 件')).toBeVisible()
    } finally {
      mocks.queueItems = originalQueueItems
    }
  })

  it('排班页将页头、阶段总量、视图切换和队列内容按固定顺序排列', () => {
    render(<FulfillmentPage />)

    const header = screen.getByRole('heading', { level: 1, name: '排班' }).closest('header')
    const metrics = screen.getByRole('region', { name: '排班阶段总量' })
    const viewSwitch = screen.getByRole('navigation', { name: '排班视角' })
    const queue = screen.getByRole('region', { name: '订单排班队列' })

    expect(header).not.toBeNull()
    expect(within(metrics).getByText('待制作')).toBeVisible()
    expect(within(metrics).getByText('待捏毛装袋')).toBeVisible()
    expect(within(metrics).getByText('待缝边')).toBeVisible()
    expect(within(metrics).getByText('待打包发货')).toBeVisible()
    expect(within(header!).getByRole('group', { name: '排班页面动作' })).toBeVisible()
    expect(
      header!.compareDocumentPosition(viewSwitch) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      viewSwitch.compareDocumentPosition(metrics) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(metrics.compareDocumentPosition(queue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('切换排班视角后页头动作组仍固定在页头，主 Tab 不回落到内容区', () => {
    render(<FulfillmentPage />)

    const header = screen.getByRole('heading', { level: 1, name: '排班' }).closest('header')
    const viewSwitch = screen.getByRole('navigation', { name: '排班视角' })
    const actionGroup = within(header!).getByRole('group', { name: '排班页面动作' })

    fireEvent.click(within(viewSwitch).getByRole('button', { name: '人员周历' }))

    const workersHeading = screen.getByRole('heading', { name: '人员周历' })
    expect(within(header!).getByRole('group', { name: '排班页面动作' })).toBe(actionGroup)
    expect(
      header!.compareDocumentPosition(viewSwitch) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      viewSwitch.compareDocumentPosition(workersHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(within(viewSwitch).getByRole('button', { name: '人员周历' })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('行内派工会限制待派数量，并提交到既有创建工作安排接口', async () => {
    render(<FulfillmentPage />)

    fireEvent.click(screen.getByRole('button', { name: '派工制作' }))
    const workerSelect = screen.getByRole('combobox', { name: '派工人员' })
    fireEvent.keyDown(workerSelect, { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('option', { name: '小王' }), { key: 'Enter' })
    fireEvent.change(screen.getByRole('textbox', { name: '派工数量' }), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: '保存派工' }))
    expect(screen.getByRole('alert')).toHaveTextContent('计划数量不能超过当前待派上限 8 件。')

    fireEvent.change(screen.getByRole('textbox', { name: '派工数量' }), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: '保存派工' }))
    await waitFor(() =>
      expect(mocks.createWorkAssignment).toHaveBeenCalledWith(
        expect.objectContaining({
          workerId: 'worker-wang',
          processType: 'making',
          tasks: [
            expect.objectContaining({
              orderItemId: 'item-making',
              plannedQuantity: 8,
              plannedMinutes: null,
              extraMinutes: 0
            })
          ]
        })
      )
    )
  })

  it('非制作工序不要求计划分钟，排班只登记人员、日期、工序与数量', async () => {
    render(<FulfillmentPage />)

    fireEvent.click(screen.getByRole('button', { name: '派工打包发货' }))
    const workerSelect = screen.getByRole('combobox', { name: '派工人员' })
    fireEvent.keyDown(workerSelect, { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('option', { name: '小王' }), { key: 'Enter' })
    fireEvent.change(screen.getByRole('textbox', { name: '派工数量' }), { target: { value: '4' } })
    expect(screen.queryByRole('textbox', { name: '计划分钟' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '保存派工' }))

    await waitFor(() =>
      expect(mocks.createWorkAssignment).toHaveBeenCalledWith(
        expect.objectContaining({
          processType: 'packing',
          tasks: [expect.objectContaining({ orderItemId: 'item-packing', plannedQuantity: 4 })]
        })
      )
    )
  })

  it('人员周历按天分列、按人成框展示任务，并能从任务框进入精确处理上下文', () => {
    mocks.queueItems[0].stageSchedules.making.tasks[0].assignedOn = startOfWeekFrom(today())
    render(<FulfillmentPage />)

    fireEvent.click(screen.getByRole('button', { name: '人员周历' }))
    const weekCalendar = screen.getByRole('region', { name: '人员周历' })
    expect(weekCalendar).toHaveClass('yumi-section', 'yumi-worker-week')
    expect(within(weekCalendar).getByRole('group', { name: '人员周历日期导航' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '人员周历' })).toBeVisible()
    expect(within(weekCalendar).queryByText('人员')).not.toBeInTheDocument()

    const personBox = screen.getByText('小王').closest('.yumi-worker-week__person')
    expect(personBox).not.toBeNull()
    expect(within(personBox as HTMLElement).getByText('1 条')).toBeVisible()
    const taskButton = within(personBox as HTMLElement).getByRole('button', {
      name: /草莓捏捏.*制作.*12.*待完成/
    })
    expect(taskButton).toBeVisible()

    fireEvent.click(taskButton)
    expect(mocks.selectOrder).toHaveBeenCalledWith('order-1')
  })

  it('同一人员的多项任务聚合到同一个人员框，不同人员颜色不同且跨天稳定', () => {
    const originalQueueItems = mocks.queueItems
    const weekStart = startOfWeekFrom(today())
    const makingTask = (
      taskId: string,
      workerId: string,
      workerName: string,
      assignedOn: string,
      plannedQuantity: number,
      status: 'pending' | 'pending_inspection'
    ) => ({
      assignmentId: `assignment-${taskId}`,
      taskId,
      workerId,
      workerName,
      assignedOn,
      processType: 'making',
      stage: 'making',
      plannedQuantity,
      status
    })
    mocks.queueItems = [
      {
        ...originalQueueItems[0],
        stageSchedules: {
          ...originalQueueItems[0].stageSchedules,
          making: {
            wipQuantity: 24,
            reservedQuantity: 24,
            unassignedQuantity: 0,
            overassignedQuantity: 0,
            tasks: [
              makingTask('task-a', 'worker-wang', '小王', weekStart, 5, 'pending'),
              makingTask('task-b', 'worker-wang', '小王', weekStart, 7, 'pending_inspection'),
              makingTask('task-c', 'worker-li', '小李', addDays(weekStart, 2), 9, 'pending'),
              makingTask('task-d', 'worker-wang', '小王', addDays(weekStart, 4), 3, 'pending')
            ]
          }
        }
      }
    ]
    try {
      render(<FulfillmentPage />)

      fireEvent.click(screen.getByRole('button', { name: '人员周历' }))

      const wangBoxes = screen
        .getAllByText('小王')
        .map((node) => node.closest('.yumi-worker-week__person') as HTMLElement)
      expect(wangBoxes).toHaveLength(2)
      const firstDayBox = wangBoxes[0]
      const laterDayBox = wangBoxes[1]
      expect(within(firstDayBox).getByText('2 条')).toBeVisible()
      expect(
        within(firstDayBox).getByRole('button', { name: /草莓捏捏.*制作.*5.*待完成/ })
      ).toBeVisible()
      expect(
        within(firstDayBox).getByRole('button', { name: /草莓捏捏.*制作.*7.*待质检/ })
      ).toBeVisible()
      expect(within(laterDayBox).getByText('1 条')).toBeVisible()

      const liBox = screen.getByText('小李').closest('.yumi-worker-week__person') as HTMLElement
      expect(liBox).not.toBeNull()

      expect(firstDayBox.dataset.tone).toBe(laterDayBox.dataset.tone)
      expect(firstDayBox.dataset.tone).not.toBe(liBox.dataset.tone)
      expect(screen.getAllByText('小王')).toHaveLength(2)
      expect(screen.getAllByText('小李')).toHaveLength(1)
    } finally {
      mocks.queueItems = originalQueueItems
    }
  })

  it('负责人调整转派当前待处理任务，并保留历史安排的说明边界', async () => {
    mocks.showSelectedOrder = true
    render(<FulfillmentPage />)

    fireEvent.click(screen.getByRole('button', { name: '查看制作任务' }))
    expect(await screen.findByRole('heading', { name: '任务处理' })).toBeVisible()
    expect(screen.getByRole('navigation', { name: '排班处理导航' })).toBeVisible()
    expect(
      within(screen.getByRole('group', { name: '排班处理页面动作' })).queryByRole('button', {
        name: '返回排班队列'
      })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '负责人调整' }))

    expect(screen.getByText('当前安排')).toBeVisible()
    expect(screen.getByText('调整负责人')).toBeVisible()
    expect(screen.getByText('调整只影响未结算的后续处理；历史处理记录继续保留。')).toBeVisible()
    const workerSelect = screen.getByRole('combobox', { name: '新负责人' })
    fireEvent.keyDown(workerSelect, { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('option', { name: '小李' }), { key: 'Enter' })
    fireEvent.change(screen.getByRole('textbox', { name: '调整原因' }), {
      target: { value: '原负责人临时请假' }
    })
    fireEvent.submit(screen.getByRole('button', { name: '确认调整' }).closest('form')!)

    await waitFor(() =>
      expect(mocks.reassignProcessTask).toHaveBeenCalledWith('task-making', {
        workerId: 'worker-li',
        effectiveOn: new Date().toISOString().slice(0, 10),
        reason: '原负责人临时请假'
      })
    )
    fireEvent.click(
      within(screen.getByRole('navigation', { name: '排班处理导航' })).getByRole('button', {
        name: '返回排班队列'
      })
    )
    expect(screen.getByRole('heading', { level: 1, name: '排班' })).toBeVisible()
  }, 20_000)

  it('排班页不再提供期初在制品入口，存量投入订单在商品详情完成', () => {
    render(<FulfillmentPage />)

    expect(screen.queryByRole('button', { name: '补录期初在制品' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '期初在制品导航' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出排班' })).toBeVisible()
    expect(screen.getByRole('region', { name: '排班阶段总量' })).toBeVisible()
    expect(screen.getByText('订单总量')).toBeVisible()
    expect(screen.getByText('已发货')).toBeVisible()
    expect(screen.getByText('待缝边')).toBeVisible()
  })

  it('待核算视图区分制作结果确认与计时工序工时核算', async () => {
    const originalQueueItems = mocks.queueItems
    mocks.queueItems = [
      {
        ...originalQueueItems[0],
        stageSchedules: {
          ...originalQueueItems[0].stageSchedules,
          making: {
            ...originalQueueItems[0].stageSchedules.making,
            tasks: [
              {
                ...originalQueueItems[0].stageSchedules.making.tasks[0]!,
                status: 'pending_inspection'
              }
            ]
          }
        }
      }
    ]
    try {
      render(<FulfillmentPage />)

      fireEvent.click(screen.getByRole('button', { name: '待核算' }))

      const inspections = await screen.findByRole('table', { name: '制作结果待确认' })
      expect(within(inspections).getByText('草莓捏捏')).toBeVisible()
      expect(within(inspections).getByRole('button', { name: '确认制作结果' })).toBeVisible()
      expect(screen.getByRole('heading', { name: '计时工序待核算' })).toBeVisible()
      expect(screen.getByRole('heading', { name: '1 选择员工与日期' })).toBeVisible()
      expect(screen.getByText('选择员工与日期后自动列出当天待核算安排。')).toBeVisible()
      expect(screen.queryByRole('button', { name: '查找待核算安排' })).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '已登记工时核算' })).toBeVisible()
      expect(screen.queryByRole('button', { name: '补录期初在制品' })).not.toBeInTheDocument()
    } finally {
      mocks.queueItems = originalQueueItems
    }
  })

  it('没有启用兼职人员时，人员周历给出创建人员的指引而不是空表头', () => {
    const originalWorkers = mocks.workers
    const originalQueueItems = mocks.queueItems
    mocks.workers = []
    mocks.queueItems = []
    try {
      render(<FulfillmentPage />)
      fireEvent.click(screen.getByRole('button', { name: '人员周历' }))

      expect(screen.getByRole('heading', { name: '人员周历' })).toBeVisible()
      expect(screen.getByRole('status', { name: '首次使用' })).toBeVisible()
      expect(screen.getByText('还没有可排班的兼职人员')).toBeVisible()
      expect(
        screen.getByText(
          '先到「工资」页的「人员与时薪」新增兼职人员并设置生效时薪；这里会按日期分列展示每位人员的待处理任务，并提供每天列底部的「＋ 派工」入口。'
        )
      ).toBeVisible()
    } finally {
      mocks.workers = originalWorkers
      mocks.queueItems = originalQueueItems
    }
  })

  it('人员周历支持自然周切换，并从日期列底部入口预填派工日期', () => {
    render(<FulfillmentPage />)

    const currentWeekStart = startOfWeekFrom(today())
    const currentWeekEnd = addDays(currentWeekStart, 6)
    const previousWeekStart = addDays(currentWeekStart, -7)
    const previousWeekEnd = addDays(currentWeekStart, -1)
    const todayDate = new Date()
    const todayLabel = dateParts(todayDate)

    fireEvent.click(screen.getByRole('button', { name: '人员周历' }))
    expect(
      screen.getByText(`${currentWeekStart} 至 ${currentWeekEnd} · 仅显示待完成与待质检任务`)
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '上一周' }))
    expect(
      screen.getByText(`${previousWeekStart} 至 ${previousWeekEnd} · 仅显示待完成与待质检任务`)
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '本周' }))

    fireEvent.click(screen.getByRole('button', { name: `为${todayLabel}派工` }))
    expect(screen.getByRole('dialog', { name: '派工：制作' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: '派工人员' })).toHaveTextContent('选择人员')
    expect(screen.getByRole('button', { name: '派工日期' })).toHaveTextContent(
      `${todayDate.getFullYear()}/${todayDate.getMonth() + 1}/${todayDate.getDate()}`
    )
  })
})
