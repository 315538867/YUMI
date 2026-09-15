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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { YumiNotificationProvider } from '../../components/ui'
import { installDomInteractionPolyfills } from '../../test/dom'
import { today } from '../../composables/v2-utils'
import { FulfillmentPage } from './index'

const render = (ui: Parameters<typeof renderBase>[0]) =>
  renderBase(<YumiNotificationProvider>{ui}</YumiNotificationProvider>)

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

const mocks = vi.hoisted(() => ({
  createWorkAssignment: vi.fn(),
  listWorkAssignments: vi.fn(),
  getFulfillmentProgress: vi.fn(),
  listWorkers: vi.fn(),
  listOrders: vi.fn(),
  listReviews: vi.fn(),
  reviewMaking: vi.fn(),
  correctMakingReview: vi.fn(),
  voidMakingReview: vi.fn(),
  listCandidates: vi.fn(),
  reviewTimed: vi.fn(),
  correctTimed: vi.fn(),
  voidTimed: vi.fn()
}))

const workers = [
  {
    id: 'worker-wang',
    name: '小王',
    enabled: true,
    note: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'worker-li',
    name: '小李',
    enabled: true,
    note: null,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z'
  }
]

const progressRows = [
  {
    orderId: 'order-1',
    orderCode: 'YD-001',
    orderItemId: 'item-making',
    productName: '草莓捏捏',
    confirmedQuantity: 20,
    stages: {
      making: 20,
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
    orderCode: 'YD-001',
    orderItemId: 'item-packing',
    productName: '奶油捏捏',
    confirmedQuantity: 12,
    stages: {
      making: 0,
      fluffingBagging: 0,
      edgeSewing: 0,
      packing: 4,
      readyToShip: 0,
      shipped: 8,
      edgeSewingRouted: 0
    }
  }
]

function makingTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-making',
    workAssignmentId: 'assignment-making',
    orderItemId: 'item-making',
    processType: 'making',
    sourceType: 'normal_production',
    plannedQuantity: 12,
    plannedMinutes: 0,
    extraMinutes: 0,
    scheduledMinutes: 0,
    status: 'pending',
    hourlyWageCents: null,
    pieceRateCents: 300,
    glueCostCents: null,
    materialPriceMicroYuanPerGram: null,
    glueWeightMilligrams: null,
    rateSnapshot: null,
    note: null,
    reviewSummary: null,
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
    ...overrides
  }
}

function makingAssignment(assignedOn: string, taskOverrides: Record<string, unknown> = {}) {
  return {
    id: 'assignment-making',
    workerId: 'worker-wang',
    assignedOn,
    processType: 'making',
    scheduleMode: 'making_task',
    status: 'scheduled',
    note: null,
    tasks: [makingTask({ assignedOn, ...taskOverrides })],
    timedReview: null,
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z'
  }
}

function timedAssignment(assignedOn: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'assignment-timed',
    workerId: 'worker-li',
    assignedOn,
    processType: 'fluffing_bagging',
    scheduleMode: 'timed_shift',
    status: 'scheduled',
    note: null,
    tasks: [],
    timedReview: null,
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
    ...overrides
  }
}

function installApiMock() {
  vi.stubGlobal('yumiV2', {
    fulfillment: {
      createWorkAssignment: mocks.createWorkAssignment,
      listWorkAssignments: mocks.listWorkAssignments,
      reviewMaking: mocks.reviewMaking,
      correctMakingReview: mocks.correctMakingReview,
      voidMakingReview: mocks.voidMakingReview
    },
    workTimeReviews: {
      list: mocks.listReviews,
      listCandidates: mocks.listCandidates,
      review: mocks.reviewTimed,
      correct: mocks.correctTimed,
      void: mocks.voidTimed
    },
    workers: { list: mocks.listWorkers },
    orders: { list: mocks.listOrders },
    reports: { getFulfillmentProgress: mocks.getFulfillmentProgress }
  })
}

let weekStart = ''
let currentWeekPending: Record<string, unknown>

beforeEach(() => {
  vi.clearAllMocks()
  installApiMock()
  weekStart = startOfWeekFrom(today())
  currentWeekPending = makingAssignment(today())
  mocks.listOrders.mockResolvedValue([])
  mocks.listWorkers.mockResolvedValue(workers)
  mocks.listReviews.mockResolvedValue([])
  mocks.listCandidates.mockResolvedValue([])
  mocks.listWorkAssignments.mockResolvedValue([])
  mocks.getFulfillmentProgress.mockResolvedValue({
    rows: progressRows,
    totalConfirmedQuantity: 0,
    totalShippedQuantity: 0
  })
  mocks.createWorkAssignment.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

installDomInteractionPolyfills()

function installWeekData(assignments: Array<Record<string, unknown>> = [currentWeekPending]) {
  mocks.listWorkAssignments.mockResolvedValue(assignments)
}

function selectOption(comboboxName: string, optionName: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: comboboxName }), { key: 'ArrowDown' })
  fireEvent.keyDown(screen.getByRole('option', { name: optionName }), { key: 'Enter' })
}

describe('排班人员周历与唯一入口', () => {
  it('默认进入人员周历，页面不存在订单视角切换入口', async () => {
    installWeekData()
    render(<FulfillmentPage />)

    const viewSwitch = screen.getByRole('navigation', { name: '排班视角' })
    expect(viewSwitch).toHaveClass('yumi-primary-tabs')
    expect(within(viewSwitch).getByRole('button', { name: '人员周历' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(within(viewSwitch).queryByRole('button', { name: '订单视角' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: '排班阶段总量' })).toBeVisible()
    expect(screen.getByRole('button', { name: '导出排班' })).toBeVisible()

    expect(await screen.findByRole('region', { name: '人员周历' })).toBeVisible()
    expect(screen.getByRole('group', { name: '人员周历日期导航' })).toBeVisible()
    expect(screen.queryByRole('region', { name: '订单排班队列' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /进入处理|查看制作任务|查看任务/ })
    ).not.toBeInTheDocument()
  })

  it('页头、主 Tab、阶段总量与周历按固定顺序排列，且页头动作组保持唯一', async () => {
    installWeekData()
    render(<FulfillmentPage />)

    const header = screen.getByRole('heading', { level: 1, name: '排班' }).closest('header')
    const metrics = screen.getByRole('region', { name: '排班阶段总量' })
    const viewSwitch = screen.getByRole('navigation', { name: '排班视角' })
    const week = await screen.findByRole('region', { name: '人员周历' })

    expect(header).not.toBeNull()
    expect(within(metrics).getByText('待制作')).toBeVisible()
    expect(within(metrics).getByText('待捏毛装袋')).toBeVisible()
    expect(within(header!).getByRole('group', { name: '排班页面动作' })).toBeVisible()
    expect(
      header!.compareDocumentPosition(viewSwitch) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      viewSwitch.compareDocumentPosition(metrics) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(metrics.compareDocumentPosition(week) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('人员周历支持上一周、本周与下一周切换，并继续浏览任意自然周', async () => {
    installWeekData()
    render(<FulfillmentPage />)
    await screen.findByRole('region', { name: '人员周历' })

    const weekDescription = (start: string) =>
      `${start} 至 ${addDays(start, 6)} · 按人员聚合当天排班；制作显示商品与数量，计时只显示工序与核算状态`

    expect(screen.getByText(weekDescription(weekStart))).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '上一周' }))
    expect(screen.getByText(weekDescription(addDays(weekStart, -7)))).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '本周' }))
    expect(screen.getByText(weekDescription(weekStart))).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '下一周' }))
    expect(screen.getByText(weekDescription(addDays(weekStart, 7)))).toBeVisible()
  })

  it('“＋ 派工”只出现在日期格，是页面唯一的新建排班入口', async () => {
    installWeekData()
    render(<FulfillmentPage />)
    await screen.findByRole('region', { name: '人员周历' })

    const dispatchButtons = screen.getAllByRole('button', { name: /派工/ })
    expect(dispatchButtons).toHaveLength(7)
    dispatchButtons.forEach((button) => {
      expect(button).toHaveAccessibleName(/^为\d{4}-\d{2}-\d{2}派工$/)
    })
    for (const forbidden of ['新建工作安排', '创建排班', '订单视角']) {
      expect(screen.queryByRole('button', { name: forbidden })).not.toBeInTheDocument()
    }
  })

  it('制作卡片显示订单商品、工序、计划数量与核算状态，计时卡片只显示工序与核算状态', async () => {
    mocks.listWorkAssignments.mockResolvedValue([
      currentWeekPending,
      timedAssignment(today()),
      {
        ...makingAssignment(today()),
        id: 'assignment-reviewed',
        tasks: [
          makingTask({
            id: 'task-reviewed',
            workAssignmentId: 'assignment-reviewed',
            reviewSummary: {
              resultId: 'result-1',
              completedQuantity: 12,
              qualifiedQuantity: 11,
              unqualifiedQuantity: 1,
              unfinishedQuantity: 0,
              reviewedOn: today(),
              note: null,
              supersedesResultId: null,
              lock: { locked: false, reason: null, message: null },
              createdAt: '2026-01-04T00:00:00.000Z'
            }
          })
        ]
      }
    ])
    render(<FulfillmentPage />)
    await screen.findByRole('region', { name: '人员周历' })

    expect(screen.getByRole('button', { name: '草莓捏捏 制作 计划 12 件 待核算' })).toBeVisible()
    expect(screen.getByRole('button', { name: '捏毛装袋 待核算' })).toBeVisible()
    expect(screen.getByRole('button', { name: '草莓捏捏 制作 计划 12 件 已核算' })).toBeVisible()

    const timedCard = screen.getByRole('button', { name: '捏毛装袋 待核算' })
    expect(timedCard).toHaveTextContent('捏毛装袋 · 待核算')
    expect(within(timedCard).queryByText('奶油捏捏')).not.toBeInTheDocument()
    expect(within(timedCard).queryByText(/计划/)).not.toBeInTheDocument()
  })

  it('同一人员的多项安排聚合到同一个人员框，不同人员颜色不同且跨天稳定', async () => {
    mocks.listWorkAssignments.mockResolvedValue([
      {
        ...makingAssignment(weekStart),
        tasks: [
          makingTask({ id: 'task-a', plannedQuantity: 5 }),
          makingTask({
            id: 'task-b',
            plannedQuantity: 7,
            status: 'pending_inspection'
          })
        ]
      },
      makingAssignment(addDays(weekStart, 4), { id: 'task-d', plannedQuantity: 3 }),
      timedAssignment(addDays(weekStart, 2), { workerId: 'worker-li' })
    ])
    render(<FulfillmentPage />)
    await screen.findByRole('region', { name: '人员周历' })

    const wangBoxes = screen
      .getAllByText('小王')
      .map((node) => node.closest('.yumi-worker-week__person') as HTMLElement)
    expect(wangBoxes).toHaveLength(2)
    expect(within(wangBoxes[0]!).getByText('2 条')).toBeVisible()
    expect(within(wangBoxes[1]!).getByText('1 条')).toBeVisible()
    expect(wangBoxes[0]!.dataset.tone).toBe(wangBoxes[1]!.dataset.tone)

    const liBox = screen.getByText('小李').closest('.yumi-worker-week__person') as HTMLElement
    expect(liBox).not.toBeNull()
    expect(wangBoxes[0]!.dataset.tone).not.toBe(liBox.dataset.tone)
  })

  it('点击不晚于今天的待核算卡片切换到待核算页签并给出定位提示', async () => {
    installWeekData()
    render(<FulfillmentPage />)
    await screen.findByRole('region', { name: '人员周历' })

    fireEvent.click(screen.getByRole('button', { name: '草莓捏捏 制作 计划 12 件 待核算' }))

    const viewSwitch = screen.getByRole('navigation', { name: '排班视角' })
    expect(within(viewSwitch).getByRole('button', { name: '待核算' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(
      await screen.findByText(
        `已切换到待核算：小王 · ${today()} · 制作待核算，请在下方待核算列表选择「核算」。`
      )
    ).toBeVisible()
    expect(await screen.findByRole('heading', { name: '待核算' })).toBeVisible()
  })

  it('点击已核算卡片同样进入待核算页签，并提示到已核算记录中查看', async () => {
    mocks.listWorkAssignments.mockResolvedValue([
      {
        ...makingAssignment(today()),
        tasks: [
          makingTask({
            reviewSummary: {
              resultId: 'result-1',
              completedQuantity: 10,
              qualifiedQuantity: 10,
              unqualifiedQuantity: 0,
              unfinishedQuantity: 2,
              reviewedOn: today(),
              note: null,
              supersedesResultId: null,
              lock: { locked: false, reason: null, message: null },
              createdAt: '2026-01-04T00:00:00.000Z'
            }
          })
        ]
      }
    ])
    render(<FulfillmentPage />)
    await screen.findByRole('region', { name: '人员周历' })

    fireEvent.click(screen.getByRole('button', { name: '草莓捏捏 制作 计划 12 件 已核算' }))
    expect(
      await screen.findByText(
        `已切换到待核算：小王 · ${today()} · 制作已核算，请在「已核算记录」中查看、更正或作废。`
      )
    ).toBeVisible()
  })

  it('未来日期卡片只打开只读安排详情，不创建任何安排', async () => {
    const futureDate = addDays(weekStart, 8)
    mocks.listWorkAssignments.mockResolvedValue([makingAssignment(futureDate)])
    render(<FulfillmentPage />)
    await screen.findByRole('region', { name: '人员周历' })

    fireEvent.click(screen.getByRole('button', { name: '下一周' }))
    fireEvent.click(screen.getByRole('button', { name: '草莓捏捏 制作 计划 12 件 待核算' }))

    const detail = await screen.findByRole('dialog', { name: '工作安排详情' })
    expect(within(detail).getByText('小王')).toBeVisible()
    expect(within(detail).getByText(futureDate)).toBeVisible()
    expect(within(detail).getByText('制作排班')).toBeVisible()
    expect(mocks.createWorkAssignment).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: '派工：制作' })).not.toBeInTheDocument()
  })

  it('待核算页签渲染统一核算面板，而不是旧的计时查找入口', async () => {
    installWeekData()
    mocks.listReviews.mockResolvedValue([])
    render(<FulfillmentPage />)
    await screen.findByRole('region', { name: '人员周历' })

    fireEvent.click(screen.getByRole('button', { name: '待核算' }))

    const pending = await screen.findByRole('table', { name: '待核算事项' })
    expect(within(pending).getByText('草莓捏捏 · 计划 12 件')).toBeVisible()
    expect(within(pending).getByText('小王')).toBeVisible()
    expect(within(pending).getByRole('button', { name: '核算' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '已核算记录' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '查找待核算安排' })).not.toBeInTheDocument()
    expect(screen.queryByText('1 选择员工与日期')).not.toBeInTheDocument()
  })

  it('深链排班任务进入只读任务处理，并可返回人员周历', async () => {
    installWeekData()
    render(
      <FulfillmentPage
        navigationTarget={{
          view: 'fulfillment',
          processTaskId: 'task-making',
          focus: 'inspection'
        }}
      />
    )

    expect(await screen.findByRole('heading', { name: '任务处理' })).toBeVisible()
    expect(await screen.findByRole('table', { name: '工作安排列表' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /新建工作安排|打开新建工作安排/ })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '完成数量' })).not.toBeInTheDocument()

    fireEvent.click(
      within(screen.getByRole('navigation', { name: '排班处理导航' })).getByRole('button', {
        name: '返回人员周历'
      })
    )
    expect(screen.getByRole('heading', { level: 1, name: '排班' })).toBeVisible()
    expect(screen.getByRole('region', { name: '人员周历' })).toBeVisible()
  })

  it('待核算 focus 的导航目标直接打开待核算页签', async () => {
    installWeekData()
    render(<FulfillmentPage navigationTarget={{ view: 'fulfillment', focus: 'inspection' }} />)

    const viewSwitch = screen.getByRole('navigation', { name: '排班视角' })
    expect(within(viewSwitch).getByRole('button', { name: '待核算' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(await screen.findByRole('heading', { name: '待核算' })).toBeVisible()
  })

  it('没有启用兼职人员时给出创建人员指引而不是空表头', async () => {
    mocks.listWorkers.mockResolvedValue([])
    mocks.listWorkAssignments.mockResolvedValue([])
    render(<FulfillmentPage />)

    expect(await screen.findByRole('heading', { name: '人员周历' })).toBeVisible()
    expect(screen.getByRole('status', { name: '首次使用' })).toBeVisible()
    expect(screen.getByText('还没有可排班的兼职人员')).toBeVisible()
  })
})

describe('派工抽屉按工序类型切换表单', () => {
  it('日期格预填派工日期，制作表单要求订单商品与数量并执行超排校验', async () => {
    installWeekData()
    render(<FulfillmentPage />)
    await screen.findByRole('region', { name: '人员周历' })

    fireEvent.click(screen.getByRole('button', { name: `为${today()}派工` }))
    expect(screen.getByRole('dialog', { name: '派工：制作' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: '派工人员' })).toHaveTextContent('选择人员')

    selectOption('派工人员', '小王')
    selectOption('派工订单商品', 'YD-001 · 草莓捏捏')
    expect(screen.getByText('待派上限：8 件')).toBeVisible()

    fireEvent.change(screen.getByRole('textbox', { name: '派工数量' }), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: '保存派工' }))
    expect(screen.getByRole('alert')).toHaveTextContent('计划数量不能超过当前待派上限 8 件。')
    expect(mocks.createWorkAssignment).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('textbox', { name: '派工数量' }), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: '保存派工' }))
    await waitFor(() =>
      expect(mocks.createWorkAssignment).toHaveBeenCalledWith({
        scheduleMode: 'making_task',
        workerId: 'worker-wang',
        assignedOn: today(),
        processType: 'making',
        note: undefined,
        tasks: [
          {
            orderItemId: 'item-making',
            sourceType: 'normal_production',
            plannedQuantity: 8,
            extraMinutes: 0,
            note: undefined
          }
        ]
      })
    )
  })

  it('计时工序只显示人员、日期、工序与备注，并在重复班次时展示错误且不关闭抽屉', async () => {
    installWeekData()
    mocks.createWorkAssignment.mockRejectedValue(
      new Error('同一人员同一天已有该工序的计时安排，不能重复排班')
    )
    render(<FulfillmentPage />)
    await screen.findByRole('region', { name: '人员周历' })

    fireEvent.click(screen.getByRole('button', { name: `为${today()}派工` }))
    selectOption('派工工序', '打包发货')

    expect(screen.getByRole('dialog', { name: '派工：打包发货' })).toBeVisible()
    expect(screen.queryByRole('textbox', { name: '派工数量' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '派工订单商品' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '任务来源' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '额外预留分钟' })).not.toBeInTheDocument()

    selectOption('派工人员', '小李')
    fireEvent.change(screen.getByRole('textbox', { name: '备注' }), {
      target: { value: '下午到岗' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存派工' }))

    expect(
      await screen.findByText('同一人员同一天已有该工序的计时安排，不能重复排班')
    ).toBeVisible()
    expect(screen.getByRole('dialog', { name: '派工：打包发货' })).toBeVisible()
    expect(mocks.createWorkAssignment).toHaveBeenCalledWith({
      scheduleMode: 'timed_shift',
      workerId: 'worker-li',
      assignedOn: today(),
      processType: 'packing',
      note: '下午到岗'
    })
  })
})
