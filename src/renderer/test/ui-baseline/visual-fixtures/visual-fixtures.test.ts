import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  EXTREME_AMOUNTS,
  EXTREME_MATERIAL_PRICE,
  EXTREME_MINUTES,
  EXTREME_QUANTITIES,
  EXTREME_WEIGHTS,
  LONG_TEXT
} from './edge-values'
import {
  FIXED_NOW_ISO,
  FIXED_TIMEZONE,
  FIXED_TODAY,
  FIXED_WEEK_START,
  createRandom,
  shiftDate,
  stableSortBy
} from './determinism'
import { DECLARED_COUNTS, buildVisualDataset } from './dataset'

const manifest = JSON.parse(
  readFileSync(new URL('./visual-fixtures.manifest.json', import.meta.url), 'utf8')
) as {
  timezone: string
  today: string
  weekStart: string
  seed: number
  counts: Record<string, number>
  edgeSamples: { longestTextMinChars: number; amountKeys: string[]; quantityKeys: string[] }
}

const dataset = buildVisualDataset()

const DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/

const collectStrings = (value: unknown, key: string, out: Array<[string, string]> = []) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${key}[${index}]`, out))
    return out
  }
  if (value && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) {
      collectStrings(child, key ? `${key}.${childKey}` : childKey, out)
    }
    return out
  }
  if (typeof value === 'string') out.push([key, value])
  return out
}

const collectNumbers = (value: unknown, key: string, out: Array<[string, number]> = []) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectNumbers(item, `${key}[${index}]`, out))
    return out
  }
  if (value && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) {
      collectNumbers(child, key ? `${key}.${childKey}` : childKey, out)
    }
    return out
  }
  if (typeof value === 'number') out.push([key, value])
  return out
}

const walkStrings = (value: object) => collectStrings(value, '')

const forEachRecord = (collection: object[]) => collection.map((item) => walkStrings(item))

describe('P0 · 隔离视觉验收数据集（任务 1.6）', () => {
  it('同一份代码连跑两次产出完全相同的夹具', () => {
    expect(buildVisualDataset()).toEqual(dataset)
  })

  it('换种子会换一批数据，说明随机值确实来自种子而不是环境', () => {
    const other = buildVisualDataset({ seed: 1 })
    expect(other.customers).not.toEqual(dataset.customers)
    expect(other.orders.map((order) => order.code)).toEqual(
      dataset.orders.map((order) => order.code)
    )
  })

  it('记录数量与 manifest 声明一致，且可被逐项覆盖（含清空到 0）', () => {
    expect(dataset.counts).toEqual(manifest.counts)
    expect(dataset.counts).toEqual(DECLARED_COUNTS)

    const emptied = buildVisualDataset({ customers: 0, orders: 0, workbenchDecision: 0 })
    expect(emptied.customers).toEqual([])
    expect(emptied.orders).toEqual([])
    expect(emptied.workbenchSnapshot.decisionItems).toEqual([])
    expect(emptied.products.length).toBe(DECLARED_COUNTS.products)
  })

  it('日期与时间戳全部带固定时区偏移，不依赖宿主时区', () => {
    expect(manifest.timezone).toBe(FIXED_TIMEZONE)
    expect(manifest.today).toBe(FIXED_TODAY)
    expect(manifest.weekStart).toBe(FIXED_WEEK_START)
    expect(FIXED_NOW_ISO).toMatch(ISO_WITH_OFFSET)

    const dateKeys = new Set([
      'assignedOn',
      'occurredOn',
      'expectedShipDate',
      'periodEndOn',
      'periodStartOn',
      'paidOn',
      'productionDeadline',
      'refundedOn',
      'reviewedOn',
      'shippedOn',
      'effectiveOn',
      'voidedOn',
      'workedOn',
      'generatedOn'
    ])
    const pairs = [
      ...forEachRecord(dataset.customers),
      ...forEachRecord(dataset.products),
      ...forEachRecord(dataset.orders),
      ...forEachRecord(dataset.orderFunds),
      ...forEachRecord(dataset.shipments),
      ...forEachRecord(dataset.workers),
      ...forEachRecord(dataset.wageHistory),
      ...forEachRecord(dataset.settlements),
      ...forEachRecord(dataset.refunds),
      ...forEachRecord(dataset.financialEntries),
      ...forEachRecord(dataset.workAssignments),
      ...forEachRecord(dataset.workTimeReviews)
    ].flat()

    let dateCount = 0
    let isoCount = 0
    for (const [key, value] of pairs) {
      const leaf = key.split('.').pop() ?? ''
      if (dateKeys.has(leaf) && DATE.test(value)) {
        dateCount += 1
        continue
      }
      if (/At$/.test(leaf) && ISO_WITH_OFFSET.test(value)) isoCount += 1
    }
    expect(dateCount).toBeGreaterThan(50)
    expect(isoCount).toBeGreaterThan(50)
  })

  it('所有金额都是整数分、所有重量都是整数毫克，不出现浮点', () => {
    const amountLeaf = /(Cents|Milligrams|MicroYuanPerGram)$/
    const allNumbers = [
      ...collectNumbers(dataset.customers, 'customers'),
      ...collectNumbers(dataset.products, 'products'),
      ...collectNumbers(dataset.orders, 'orders'),
      ...collectNumbers(dataset.orderFunds, 'orderFunds'),
      ...collectNumbers(dataset.settlements, 'settlements'),
      ...collectNumbers(dataset.financialEntries, 'financialEntries'),
      ...collectNumbers(dataset.pendingReimbursements, 'pendingReimbursements'),
      ...collectNumbers(dataset.workTimeReviews, 'workTimeReviews')
    ]
    const checked = allNumbers.filter(([key]) => amountLeaf.test(key.split('.').pop() ?? ''))
    expect(checked.length).toBeGreaterThan(100)
    const fractional = checked.filter(([, value]) => !Number.isInteger(value))
    expect(fractional, `出现非整数金额或重量：${JSON.stringify(fractional.slice(0, 5))}`).toEqual(
      []
    )
  })

  it('订单金额与资金算术自洽', () => {
    for (const order of dataset.orders) {
      const items = order.items.reduce(
        (sum, item) => ({
          itemAmountCents: sum.itemAmountCents + item.itemAmountCents,
          edgeAmountCents: sum.edgeAmountCents + item.edgeAmountCents,
          itemDiscountCents: sum.itemDiscountCents + item.itemDiscountCents
        }),
        { itemAmountCents: 0, edgeAmountCents: 0, itemDiscountCents: 0 }
      )
      expect(order.amount.itemAmountCents).toBe(items.itemAmountCents)
      expect(order.amount.edgeAmountCents).toBe(items.edgeAmountCents)
      expect(order.amount.itemDiscountCents).toBe(items.itemDiscountCents)
      expect(order.amount.orderAmountCents).toBe(
        items.itemAmountCents +
          items.edgeAmountCents -
          items.itemDiscountCents -
          order.amount.orderDiscountCents
      )
      expect(order.amount.currentAmountCents).toBe(
        order.amount.orderAmountCents + order.amount.adjustmentsCents
      )
      expect(order.funds.netReceivedCents).toBe(
        order.funds.receivedCents - order.funds.refundedCents
      )
      expect(order.funds.outstandingCents).toBe(
        order.amount.currentAmountCents - order.funds.netReceivedCents
      )
      for (const item of order.items) {
        expect(item.lineAmountCents).toBe(
          item.itemAmountCents + item.edgeAmountCents - item.itemDiscountCents
        )
        expect(item.itemAmountCents).toBe(item.quantity * item.unitPriceCents)
        expect(item.edgeQuantity).toBeLessThanOrEqual(item.quantity)
      }
    }
  })

  it('时间校验收紧：制作核算合格不超过产出，产出不超过计划', () => {
    const tasks = dataset.workAssignments.flatMap((assignment) => assignment.tasks)
    const reviewed = tasks.filter((task) => task.reviewSummary !== null)
    expect(reviewed.length).toBeGreaterThan(0)
    for (const task of reviewed) {
      const summary = task.reviewSummary
      if (!summary) continue
      const planned = task.plannedQuantity ?? 0
      expect(summary.qualifiedQuantity).toBeLessThanOrEqual(summary.completedQuantity)
      expect(summary.completedQuantity).toBeLessThanOrEqual(planned)
      expect(summary.unqualifiedQuantity).toBe(
        summary.completedQuantity - summary.qualifiedQuantity
      )
      expect(summary.unfinishedQuantity).toBe(planned - summary.completedQuantity)
    }
  })

  it('排班与核算覆盖固定那一周的每一天，并覆盖各状态', () => {
    const days = new Set(dataset.workAssignments.map((assignment) => assignment.assignedOn))
    for (let offset = 0; offset < 7; offset += 1) {
      expect(days.has(shiftDate(FIXED_WEEK_START, offset)), `缺少第 ${offset} 天`).toBe(true)
    }
    const statuses = new Set(dataset.workAssignments.map((assignment) => assignment.status))
    expect([...statuses].sort()).toEqual(['absent', 'cancelled', 'completed', 'scheduled'])
    const reviewStatuses = new Set(dataset.workTimeReviews.map((review) => review.status))
    expect([...reviewStatuses].sort()).toEqual(['confirmed', 'draft', 'voided'])
    expect(dataset.workTimeReviews.some((review) => review.lock.locked)).toBe(true)
  })

  it('覆盖极端金额、极端数量与最长中文文案', () => {
    const amountCents = dataset.products
      .map((product) => product.basePriceCents)
      .concat(dataset.orders.flatMap((order) => order.items.map((item) => item.unitPriceCents)))
      .concat(dataset.orderFunds.map((fund) => fund.amountCents))
      .concat(
        dataset.orders.flatMap((order) => [
          order.funds.receivedCents,
          order.funds.refundedCents,
          order.funds.netReceivedCents,
          order.funds.outstandingCents
        ])
      )
      .concat(dataset.settlements.map((settlement) => settlement.timedWageCents))
      .concat(dataset.financialEntries.map((entry) => entry.amountCents))
      .concat(dataset.refunds.map((refund) => refund.materialRefundCents))
    expect(amountCents).toContain(EXTREME_AMOUNTS.huge)
    expect(amountCents).toContain(EXTREME_AMOUNTS.oneCent)
    expect(amountCents).toContain(EXTREME_AMOUNTS.wide)
    expect(amountCents).toContain(EXTREME_AMOUNTS.zero)
    expect(manifest.edgeSamples.amountKeys.sort()).toEqual(Object.keys(EXTREME_AMOUNTS).sort())

    const quantities = dataset.orders.flatMap((order) => order.items.map((item) => item.quantity))
    expect(quantities).toContain(EXTREME_QUANTITIES.min)
    expect(manifest.edgeSamples.quantityKeys.sort()).toEqual(Object.keys(EXTREME_QUANTITIES).sort())

    const weights = dataset.products.map((product) => product.unitWeightMilligrams)
    expect(Math.max(...weights)).toBeLessThanOrEqual(EXTREME_WEIGHTS.huge)
    expect(Math.min(...weights)).toBeGreaterThanOrEqual(EXTREME_WEIGHTS.min)
    expect(
      dataset.workTimeReviews.every((review) => review.approvedMinutes >= EXTREME_MINUTES.zero)
    ).toBe(true)
    expect(dataset.settings.materialPriceMicroYuanPerGram).toBeGreaterThanOrEqual(
      EXTREME_MATERIAL_PRICE.min
    )
    expect(dataset.settings.materialPriceMicroYuanPerGram).toBeLessThanOrEqual(
      EXTREME_MATERIAL_PRICE.max
    )

    const longest = Math.max(...Object.values(LONG_TEXT).map((text) => text.length))
    expect(longest).toBeGreaterThanOrEqual(manifest.edgeSamples.longestTextMinChars)
    const customers = dataset.customers.map((customer) => customer.name)
    expect(customers).toContain(LONG_TEXT.customerName)
  })

  it('列表排序是显式且稳定的，不依赖引擎默认排序实现', () => {
    const ordered = stableSortBy(
      [
        { id: 'b', value: 1 },
        { id: 'a', value: 2 },
        { id: 'c', value: 2 }
      ],
      (item) => String(item.value)
    )
    expect(ordered.map((item) => item.id)).toEqual(['b', 'a', 'c'])

    const assignments = stableSortBy(dataset.workAssignments, (assignment) => assignment.assignedOn)
    expect(assignments.map((assignment) => assignment.assignedOn)).toEqual(
      [...assignments.map((assignment) => assignment.assignedOn)].sort()
    )
  })

  it('伪随机数发生器不受平台影响，固定种子产出固定序列', () => {
    const first = createRandom(20260318)
    const second = createRandom(20260318)
    expect([first.next(), first.next(), first.next()]).toEqual([
      second.next(),
      second.next(),
      second.next()
    ])
    const seeded = createRandom(7)
    const firstInt = seeded.int(1, 100)
    expect(createRandom(7).int(1, 100)).toBe(firstInt)
  })

  it('夹具源码不读宿主时区、不使用 Date.now 与 Math.random', () => {
    const files = [
      './determinism.ts',
      './edge-values.ts',
      './context.ts',
      './factories-commercial.ts',
      './factories-operations.ts',
      './factories-finance.ts',
      './dataset.ts'
    ]
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8')
      const code = source
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
        .join('\n')
      expect(code, `${file} 不得调用 Date.now()`).not.toMatch(/\bDate\.now\s*\(/)
      expect(code, `${file} 不得调用 Math.random()`).not.toMatch(/\bMath\.random\s*\(/)
      expect(code, `${file} 不得用无参 new Date() 读取宿主时钟`).not.toMatch(/\bnew Date\s*\(\s*\)/)
      expect(code, `${file} 不得读取宿主时区`).not.toMatch(/Intl\.DateTimeFormat|getTimezoneOffset/)
    }
  })
})
