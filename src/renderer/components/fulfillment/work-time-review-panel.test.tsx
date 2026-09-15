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
import { YumiNotificationProvider } from '../ui'
import { installDomInteractionPolyfills } from '../../test/dom'
import { today } from '../../composables/v2-utils'
import { WorkTimeReviewPanel } from './work-time-review-panel'

const render = (ui: Parameters<typeof renderBase>[0]) =>
  renderBase(<YumiNotificationProvider>{ui}</YumiNotificationProvider>)

const mocks = vi.hoisted(() => ({
  listWorkAssignments: vi.fn(),
  getFulfillmentProgress: vi.fn(),
  reviewMaking: vi.fn(),
  correctMakingReview: vi.fn(),
  voidMakingReview: vi.fn(),
  listReviews: vi.fn(),
  listCandidates: vi.fn(),
  review: vi.fn(),
  correct: vi.fn(),
  void: vi.fn()
}))

installDomInteractionPolyfills()

const workers = [
  { id: 'worker-1', name: '小林', enabled: true },
  { id: 'worker-2', name: '小王', enabled: true }
] as never

const onChanged = vi.fn()

function installApiMock() {
  vi.stubGlobal('yumiV2', {
    fulfillment: {
      listWorkAssignments: mocks.listWorkAssignments,
      reviewMaking: mocks.reviewMaking,
      correctMakingReview: mocks.correctMakingReview,
      voidMakingReview: mocks.voidMakingReview
    },
    workTimeReviews: {
      list: mocks.listReviews,
      listCandidates: mocks.listCandidates,
      review: mocks.review,
      correct: mocks.correct,
      void: mocks.void
    },
    reports: {
      getFulfillmentProgress: mocks.getFulfillmentProgress
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  installApiMock()
  mocks.listWorkAssignments.mockResolvedValue([])
  mocks.listReviews.mockResolvedValue([])
  mocks.getFulfillmentProgress.mockResolvedValue({
    rows: defaultReportRows,
    totalConfirmedQuantity: 0,
    totalShippedQuantity: 0
  })
  mocks.listCandidates.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPanel() {
  return render(<WorkTimeReviewPanel onChanged={onChanged} workers={workers} />)
}

function dateString(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/** 已结束的核算范围：优先昨天，1 号时退回今天的最早一分钟。 */
function pastReviewRange() {
  const now = new Date()
  if (now.getDate() > 1) {
    const previous = dateString(addDays(now, -1))
    return { assignedOn: previous, start: `${previous}T09:00`, end: `${previous}T17:30` }
  }
  const current = dateString(now)
  return { assignedOn: current, start: `${current}T00:00`, end: `${current}T00:01` }
}

function makingAssignment(task?: Record<string, unknown>) {
  return {
    id: 'assignment-making',
    workerId: 'worker-2',
    assignedOn: today(),
    processType: 'making',
    scheduleMode: 'making_task',
    status: 'scheduled',
    note: null,
    tasks: [
      {
        id: 'task-making',
        workAssignmentId: 'assignment-making',
        orderItemId: 'item-making',
        processType: 'making',
        sourceType: 'normal_production',
        plannedQuantity: 30,
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
        createdAt: `${today()}T00:00:00.000Z`,
        updatedAt: `${today()}T00:00:00.000Z`,
        ...task
      }
    ],
    timedReview: null,
    createdAt: `${today()}T00:00:00.000Z`,
    updatedAt: `${today()}T00:00:00.000Z`
  }
}

function makingRecordAssignment() {
  return makingAssignment({
    status: 'confirmed',
    reviewSummary: {
      resultId: 'result-1',
      completedQuantity: 24,
      qualifiedQuantity: 22,
      unqualifiedQuantity: 2,
      unfinishedQuantity: 6,
      reviewedOn: today(),
      note: '首件确认',
      supersedesResultId: null,
      lock: { locked: false, reason: null, message: null },
      createdAt: `${today()}T00:00:00.000Z`
    }
  })
}

function timedAssignment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assignment-fluffing',
    workerId: 'worker-1',
    assignedOn: today(),
    processType: 'fluffing_bagging',
    scheduleMode: 'timed_shift',
    status: 'scheduled',
    note: null,
    tasks: [],
    timedReview: null,
    createdAt: `${today()}T00:00:00.000Z`,
    updatedAt: `${today()}T00:00:00.000Z`,
    ...overrides
  }
}

function timedReview(overrides: Record<string, unknown> = {}) {
  return {
    id: 'review-1',
    workerId: 'worker-1',
    workedOn: today(),
    processType: 'fluffing_bagging',
    approvedMinutes: 510,
    hourlyWageCentsSnapshot: 3_000,
    sourceType: 'manual_review',
    externalRecordId: null,
    rawStartedAt: `${today()}T09:00`,
    rawEndedAt: `${today()}T17:30`,
    status: 'confirmed',
    workAssignmentId: 'assignment-fluffing',
    assignmentIds: ['assignment-fluffing'],
    supersedesReviewId: null,
    voidReason: null,
    voidedAt: null,
    reviewNote: null,
    lock: { locked: false, reason: null, message: null },
    items: [
      {
        id: 'review-item-1',
        orderItemId: 'item-a',
        processTaskId: null,
        completedQuantity: 20,
        pieceRateCentsSnapshot: 85,
        expectedUnitMinutesSnapshot: 3
      }
    ],
    createdAt: `${today()}T00:00:00.000Z`,
    updatedAt: `${today()}T00:00:00.000Z`,
    ...overrides
  }
}

const candidates = [
  {
    orderItemId: 'item-a',
    orderId: 'order-1',
    orderCode: 'YD-001',
    customerName: '小满',
    productName: '抹茶捏捏',
    deliveryDate: '2026-09-20',
    orderCreatedAt: '2026-09-01T00:00:00.000Z',
    processableQuantity: 40,
    expectedUnitMinutes: 3,
    pieceRateCents: 85
  },
  {
    orderItemId: 'item-b',
    orderId: 'order-1',
    orderCode: 'YD-002',
    customerName: '小满',
    productName: '奶油捏捏',
    deliveryDate: null,
    orderCreatedAt: '2026-09-02T00:00:00.000Z',
    processableQuantity: 30,
    expectedUnitMinutes: 2,
    pieceRateCents: 50
  }
]

/** 商品展示名称来自履约进度行；待核算与已核算记录都按 orderItemId 回填。 */
const defaultReportRows = [
  {
    orderId: 'order-1',
    orderCode: 'YD-000',
    orderItemId: 'item-making',
    productName: '草莓捏捏',
    confirmedQuantity: 30,
    stages: {
      making: 30,
      fluffingBagging: 0,
      edgeSewing: 0,
      packing: 0,
      readyToShip: 0,
      shipped: 0,
      edgeSewingRouted: 0
    }
  },
  ...candidates.map((candidate) => ({
    orderId: candidate.orderId,
    orderCode: candidate.orderCode,
    orderItemId: candidate.orderItemId,
    productName: candidate.productName,
    confirmedQuantity: 100,
    stages: {
      making: 0,
      fluffingBagging: candidate.processableQuantity,
      edgeSewing: 0,
      packing: 0,
      readyToShip: 0,
      shipped: 0,
      edgeSewingRouted: 0
    }
  }))
]

function pendingTable() {
  return screen.findByRole('table', { name: '待核算事项' })
}

function recordTable() {
  return screen.findByRole('table', { name: '已核算记录' })
}

function rowOf(table: HTMLElement, text: string | RegExp): HTMLElement {
  return within(table).getByText(text).closest('tr') as HTMLElement
}

/** 通过两个日期浮层选择开始/结束日期，再直接填写 HH:MM 时间。 */
function pickRange(range: { start: string; end: string }, times: { start: string; end: string }) {
  const pickDay = (trigger: string, value: string) => {
    fireEvent.click(screen.getByRole('button', { name: trigger }))
    const [year, month, day] = value.slice(0, 10).split('-').map(Number)
    const matches = screen.getAllByRole('button', {
      name: new RegExp(`${year}年${month}月${day}日`)
    })
    fireEvent.click(matches[0]!)
  }
  pickDay('核算开始日期', range.start)
  pickDay('核算结束日期', range.end)
  fireEvent.change(screen.getByRole('textbox', { name: '核算开始时间' }), {
    target: { value: times.start }
  })
  fireEvent.change(screen.getByRole('textbox', { name: '核算结束时间' }), {
    target: { value: times.end }
  })
}

function rangeMinutes(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 60_000
}

describe('WorkTimeReviewPanel 单次核算', () => {
  it('待核算只有“核算”入口，制作行显示订单商品与计划数量，计时行不显示商品名称', async () => {
    mocks.listWorkAssignments.mockResolvedValue([makingAssignment(), timedAssignment()])
    renderPanel()

    const table = await pendingTable()
    const makingRow = rowOf(table, '草莓捏捏 · 计划 30 件')
    const timedRow = rowOf(table, '捏毛装袋')
    expect(within(makingRow).getByRole('button', { name: '核算' })).toBeVisible()
    expect(within(timedRow).getByRole('button', { name: '核算' })).toBeVisible()
    expect(within(table).getAllByRole('button')).toHaveLength(2)
    expect(within(table).getByText('实际时间范围与跨订单商品完成数量（核算时填写）')).toBeVisible()

    // 计时行在核算前不得显示商品名称，也没有制作待质检或二次确认入口
    expect(within(timedRow).queryByText('奶油捏捏')).not.toBeInTheDocument()
    for (const forbidden of ['保存草稿', '保存并确认', '确认工时', '待质检', '确认结果']) {
      expect(screen.queryByText(forbidden)).not.toBeInTheDocument()
    }
  })

  it('制作行一次核算提交实际产出与合格数量，并只读展示系统计算的不合格与未完成', async () => {
    mocks.listWorkAssignments.mockResolvedValue([makingAssignment()])
    renderPanel()

    const table = await pendingTable()
    fireEvent.click(
      within(rowOf(table, '草莓捏捏 · 计划 30 件')).getByRole('button', { name: '核算' })
    )

    const dialog = await screen.findByRole('dialog', { name: '制作核算' })
    expect(
      within(dialog).getByText(
        new RegExp(`小王 · ${today()} · 草莓捏捏 · 本次计划 30 件 · 核算日期 ${today()}`)
      )
    ).toBeVisible()

    fireEvent.change(within(dialog).getByRole('textbox', { name: '实际产出数量' }), {
      target: { value: '24' }
    })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '合格数量' }), {
      target: { value: '22' }
    })

    const computed = within(dialog).getByRole('region', { name: '系统计算的数量' })
    expect(within(computed).getByText('2 件')).toBeVisible()
    expect(within(computed).getByText('6 件')).toBeVisible()

    fireEvent.click(within(dialog).getByRole('button', { name: '确认核算' }))
    await waitFor(() =>
      expect(mocks.reviewMaking).toHaveBeenCalledWith({
        processTaskId: 'task-making',
        completedQuantity: 24,
        qualifiedQuantity: 22,
        reviewedOn: today(),
        note: null
      })
    )
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(screen.queryByRole('dialog', { name: '制作核算' })).not.toBeInTheDocument()
  })

  it('制作核算允许零产出，零产出不阻塞提交', async () => {
    mocks.listWorkAssignments.mockResolvedValue([makingAssignment()])
    renderPanel()

    const table = await pendingTable()
    fireEvent.click(
      within(rowOf(table, '草莓捏捏 · 计划 30 件')).getByRole('button', { name: '核算' })
    )

    const dialog = await screen.findByRole('dialog', { name: '制作核算' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '实际产出数量' }), {
      target: { value: '0' }
    })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '合格数量' }), {
      target: { value: '0' }
    })
    const computed = within(dialog).getByRole('region', { name: '系统计算的数量' })
    expect(within(computed).getByText('0 件')).toBeVisible()
    expect(within(computed).getByText('30 件')).toBeVisible()

    fireEvent.click(within(dialog).getByRole('button', { name: '确认核算' }))
    await waitFor(() =>
      expect(mocks.reviewMaking).toHaveBeenCalledWith(
        expect.objectContaining({ completedQuantity: 0, qualifiedQuantity: 0 })
      )
    )
  })

  it('实际产出超过本次计划或合格数量大于实际产出时阻止提交并提示', async () => {
    mocks.listWorkAssignments.mockResolvedValue([makingAssignment()])
    renderPanel()

    const table = await pendingTable()
    fireEvent.click(
      within(rowOf(table, '草莓捏捏 · 计划 30 件')).getByRole('button', { name: '核算' })
    )

    const dialog = await screen.findByRole('dialog', { name: '制作核算' })
    const submit = within(dialog).getByRole('button', { name: '确认核算' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '实际产出数量' }), {
      target: { value: '31' }
    })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '合格数量' }), {
      target: { value: '31' }
    })
    expect(
      within(dialog).getByText('实际产出不能超过本次计划 30 件，请先调整制作计划')
    ).toBeVisible()
    expect(submit).toBeDisabled()
    fireEvent.click(submit)
    expect(mocks.reviewMaking).not.toHaveBeenCalled()

    fireEvent.change(within(dialog).getByRole('textbox', { name: '实际产出数量' }), {
      target: { value: '24' }
    })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '合格数量' }), {
      target: { value: '25' }
    })
    expect(within(dialog).getByText('合格数量不能大于实际产出数量')).toBeVisible()
    expect(submit).toBeDisabled()
    expect(mocks.reviewMaking).not.toHaveBeenCalled()
  })

  it('计时核算选择时间范围与候选商品：默认填满可处理量、允许改小，并按服务端顺序展示', async () => {
    const range = pastReviewRange()
    mocks.listWorkAssignments.mockResolvedValue([timedAssignment({ assignedOn: range.assignedOn })])
    mocks.listCandidates.mockResolvedValue(candidates)
    renderPanel()

    const table = await pendingTable()
    fireEvent.click(within(rowOf(table, '捏毛装袋')).getByRole('button', { name: '核算' }))

    const dialog = await screen.findByRole('dialog', { name: '计时核算' })
    await within(dialog).findByRole('table', { name: '可核算订单商品' })
    expect(mocks.listCandidates).toHaveBeenCalledWith('assignment-fluffing', { search: null })

    const goods = within(dialog).getByRole('table', { name: '可核算订单商品' })
    const goodsRows = within(goods).getAllByRole('row').slice(1)
    expect(within(goodsRows[0]!).getByText('小满')).toBeVisible()
    expect(within(goodsRows[0]!).getByText('YD-001')).toBeVisible()
    expect(within(goodsRows[0]!).getByText('抹茶捏捏')).toBeVisible()
    expect(within(goodsRows[0]!).getByText('40 件')).toBeVisible()
    expect(within(goodsRows[1]!).getByText('奶油捏捏')).toBeVisible()

    // 搜索候选
    fireEvent.change(within(dialog).getByRole('textbox', { name: '搜索可核算的订单商品' }), {
      target: { value: '奶油' }
    })
    await waitFor(() =>
      expect(mocks.listCandidates).toHaveBeenCalledWith('assignment-fluffing', { search: '奶油' })
    )

    fireEvent.click(within(dialog).getByRole('checkbox', { name: '选择 YD-001 抹茶捏捏' }))
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '选择 YD-002 奶油捏捏' }))
    expect(within(dialog).getByRole('textbox', { name: 'YD-001 抹茶捏捏 完成数量' })).toHaveValue(
      '40'
    )
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'YD-001 抹茶捏捏 完成数量' }), {
      target: { value: '20' }
    })

    pickRange(range, { start: '09:00', end: '17:30' })
    const minutes = rangeMinutes(range.start, range.end)
    const minutesPanel = within(dialog).getByRole('region', { name: '系统计算的核算分钟' })
    expect(within(minutesPanel).getByText(`${minutes} 分钟`)).toBeVisible()
    expect(within(minutesPanel).getByText(range.assignedOn)).toBeVisible()

    // 20 × 3 + 30 × 2 = 120 分钟；时间差 = 核算分钟 − 120，预计效率 = 120 ÷ 核算分钟
    const comparison = within(dialog).getByRole('region', { name: '效率核对' })
    expect(within(comparison).getByText('120 分钟')).toBeVisible()
    expect(within(comparison).getByText(`${minutes - 120} 分钟`)).toBeVisible()
    expect(within(dialog).getByRole('group', { name: /预计效率/ })).toHaveTextContent(
      `${((120 / minutes) * 100).toFixed(2)}%`
    )
    expect(within(dialog).getByText(/只读参考：不影响提交、工资与履约数量。/)).toBeVisible()

    fireEvent.click(within(dialog).getByRole('button', { name: '确认核算' }))
    await waitFor(() =>
      expect(mocks.review).toHaveBeenCalledWith({
        workAssignmentId: 'assignment-fluffing',
        startedAt: `${range.assignedOn}T09:00`,
        endedAt: `${range.assignedOn}T17:30`,
        items: [
          { orderItemId: 'item-a', completedQuantity: 20 },
          { orderItemId: 'item-b', completedQuantity: 30 }
        ],
        reviewNote: null
      })
    )
  })

  it('结束时间尚未到达时禁止确认并提示必须在实际结束时间之后进行', async () => {
    const now = new Date()
    const current = dateString(now)
    const tomorrow = dateString(addDays(now, 1))
    mocks.listWorkAssignments.mockResolvedValue([timedAssignment({ assignedOn: current })])
    mocks.listCandidates.mockResolvedValue([candidates[0]])
    renderPanel()

    const table = await pendingTable()
    fireEvent.click(within(rowOf(table, '捏毛装袋')).getByRole('button', { name: '核算' }))

    const dialog = await screen.findByRole('dialog', { name: '计时核算' })
    await within(dialog).findByRole('table', { name: '可核算订单商品' })
    pickRange({ start: current, end: tomorrow }, { start: '23:58', end: '00:30' })
    expect(within(dialog).getAllByText('核算必须在实际结束时间之后进行').length).toBeGreaterThan(0)
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '选择 YD-001 抹茶捏捏' }))

    fireEvent.click(within(dialog).getByRole('button', { name: '确认核算' }))
    expect(mocks.review).not.toHaveBeenCalled()
    expect(within(dialog).getAllByText('核算必须在实际结束时间之后进行').length).toBeGreaterThan(0)

    // 跨日核算按开始日期归属，开始日期固定为排班日期
    const minutesPanel = within(dialog).getByRole('region', { name: '系统计算的核算分钟' })
    expect(within(minutesPanel).getByText(`${current}（跨日核算按开始日期归属）`)).toBeVisible()
  })

  it('更正核算需要填写原因，锁定记录禁用更正与作废并展示调整指引', async () => {
    mocks.listWorkAssignments.mockResolvedValue([makingRecordAssignment()])
    renderPanel()

    const table = await recordTable()
    const row = rowOf(table, '草莓捏捏 · 实际产出 24 件 · 合格 22 件')
    fireEvent.click(within(row).getByRole('button', { name: '更正' }))

    const dialog = await screen.findByRole('dialog', { name: '更正制作核算' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '实际产出数量' }), {
      target: { value: '25' }
    })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '合格数量' }), {
      target: { value: '23' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '提交更正' }))
    expect(await within(dialog).findByText('请填写更正原因')).toBeVisible()
    expect(mocks.correctMakingReview).not.toHaveBeenCalled()

    fireEvent.change(within(dialog).getByRole('textbox', { name: '更正原因' }), {
      target: { value: '数量录入错误' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '提交更正' }))
    await waitFor(() =>
      expect(mocks.correctMakingReview).toHaveBeenCalledWith({
        resultId: 'result-1',
        completedQuantity: 25,
        qualifiedQuantity: 23,
        reviewedOn: today(),
        reason: '数量录入错误',
        note: '首件确认'
      })
    )
  })

  it('锁定记录禁用更正与作废并展示不可操作原因与调整指引', async () => {
    const lockedMessage = '产出已被下游工序或发货消耗，请使用履约调整处理差异'
    mocks.listWorkAssignments.mockResolvedValue([
      makingAssignment({
        status: 'confirmed',
        reviewSummary: {
          resultId: 'result-locked',
          completedQuantity: 20,
          qualifiedQuantity: 18,
          unqualifiedQuantity: 2,
          unfinishedQuantity: 0,
          reviewedOn: today(),
          note: null,
          supersedesResultId: null,
          lock: { locked: true, reason: 'downstream_consumed', message: lockedMessage },
          createdAt: `${today()}T00:00:00.000Z`
        }
      })
    ])
    renderPanel()

    const table = await recordTable()
    expect(within(table).getByText(lockedMessage)).toBeVisible()
    const row = rowOf(table, '草莓捏捏 · 实际产出 20 件 · 合格 18 件')
    expect(within(row).getByRole('button', { name: '更正' })).toBeDisabled()
    expect(within(row).getByRole('button', { name: '作废' })).toBeDisabled()
    expect(within(row).getByRole('button', { name: '查看' })).toBeEnabled()
  })

  it('作废要求填写原因，填写后调用计时作废接口并要求刷新待核算', async () => {
    mocks.listWorkAssignments.mockResolvedValue([
      timedAssignment({
        timedReview: {
          reviewId: 'review-1',
          approvedMinutes: 510,
          reviewedOn: today(),
          lock: { locked: false, reason: null, message: null }
        }
      })
    ])
    mocks.listReviews.mockResolvedValue([timedReview()])
    renderPanel()

    const table = await recordTable()
    const row = rowOf(table, '1 个商品 · 合计 20 件 · 510 分钟')
    fireEvent.click(within(row).getByRole('button', { name: '作废' }))

    const dialog = await screen.findByRole('dialog', { name: '作废核算记录？' })
    fireEvent.click(within(dialog).getByRole('button', { name: '确认作废' }))
    expect(await within(dialog).findByText('请填写作废原因')).toBeVisible()
    expect(mocks.void).not.toHaveBeenCalled()

    fireEvent.change(within(dialog).getByRole('textbox', { name: '作废原因' }), {
      target: { value: '时间段录错' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '确认作废' }))
    await waitFor(() =>
      expect(mocks.void).toHaveBeenCalledWith('review-1', { reason: '时间段录错' })
    )
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('历史草稿记录只读展示，不出现更正或作废操作', async () => {
    mocks.listWorkAssignments.mockResolvedValue([])
    mocks.listReviews.mockResolvedValue([
      timedReview({
        status: 'draft',
        workAssignmentId: null,
        assignmentIds: ['assignment-legacy'],
        rawStartedAt: null,
        rawEndedAt: null
      })
    ])
    renderPanel()

    const table = await recordTable()
    const row = rowOf(table, '1 个商品 · 合计 20 件 · 510 分钟')
    expect(within(row).getByText('历史草稿')).toBeVisible()
    expect(within(row).getByText('只读历史')).toBeVisible()
    expect(within(row).queryByRole('button', { name: '更正' })).not.toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: '作废' })).not.toBeInTheDocument()
    expect(within(row).getByRole('button', { name: '查看' })).toBeVisible()
  })

  it('查看详情展示核算明细、时间范围与版本信息', async () => {
    mocks.listWorkAssignments.mockResolvedValue([
      timedAssignment({
        timedReview: {
          reviewId: 'review-1',
          approvedMinutes: 510,
          reviewedOn: today(),
          lock: { locked: false, reason: null, message: null }
        }
      })
    ])
    mocks.listReviews.mockResolvedValue([timedReview()])
    renderPanel()

    const table = await recordTable()
    fireEvent.click(
      within(rowOf(table, '1 个商品 · 合计 20 件 · 510 分钟')).getByRole('button', { name: '查看' })
    )

    const dialog = await screen.findByRole('dialog', { name: '计时核算详情' })
    const details = within(dialog).getByRole('region', { name: '计时核算详情' })
    expect(within(details).getByText(`${today()}T09:00 至 ${today()}T17:30`)).toBeVisible()
    expect(within(details).getByText('510 分钟')).toBeVisible()
    expect(within(details).getByText('¥30.00 / 小时')).toBeVisible()
    const items = within(dialog).getByRole('table', { name: '核算商品明细' })
    expect(within(items).getByText('抹茶捏捏')).toBeVisible()
    expect(within(items).getByText('20 件')).toBeVisible()
  })
})
