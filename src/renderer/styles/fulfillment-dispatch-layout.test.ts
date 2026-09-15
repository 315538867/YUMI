import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'pages.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

function rule(selector: string, source = css) {
  const blocks = source.matchAll(/(?:^|\n)\s*([^{}]+?)\s*\{([^{}]*)\}/g)
  for (const block of blocks) {
    const selectors = block[1]
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    if (selectors.includes(selector)) return block[2]
  }
  throw new Error(`Missing CSS rule: ${selector}`)
}

function mediaRule(query: string, selector: string) {
  let searchFrom = 0
  while (searchFrom < css.length) {
    const start = css.indexOf(`@media ${query}`, searchFrom)
    if (start < 0) break
    const bodyStart = css.indexOf('{', start)
    let depth = 0
    for (let index = bodyStart; index < css.length; index += 1) {
      if (css[index] === '{') depth += 1
      if (css[index] === '}') depth -= 1
      if (depth === 0) {
        const body = css.slice(bodyStart + 1, index)
        try {
          return rule(selector, body)
        } catch {
          searchFrom = index + 1
          break
        }
      }
    }
  }
  throw new Error(`Missing ${selector} in media query: ${query}`)
}

it('人员周历按七天网格分列，人员分组框用 data-tone 保持整周稳定配色', () => {
  const grid = rule('.yumi-worker-week__grid')
  const column = rule('.yumi-worker-week__column')
  const person = rule('.yumi-worker-week__person')

  expect(grid).toContain('display: grid')
  expect(grid).toContain('gap: var(--yumi-space-2)')
  expect(column).toContain('min-height: 200px')
  expect(column).toContain('border: 1px solid var(--yumi-border)')
  expect(person).toContain('background: var(--worker-tone-soft)')
  expect(rule(".yumi-worker-week__person[data-tone='1']")).toContain('--worker-tone-color')
  expect(rule(".yumi-worker-week__person[data-tone='12']")).toContain('--worker-tone-color')
})

it('制作卡与计时卡共用卡片基线，计时卡只保留单行工序与核算状态', () => {
  const task = rule('.yumi-worker-week__task')
  const meta = rule('.yumi-worker-week__task-meta')
  const timedTask = rule('.yumi-worker-week__task--timed')
  const timedMeta = rule('.yumi-worker-week__task--timed .yumi-worker-week__task-meta')

  expect(task).toContain('flex-direction: column')
  expect(task).toContain('white-space: normal')
  expect(task).toContain('width: 100%')
  expect(meta).toContain('color: var(--yumi-muted)')
  expect(timedTask).toContain('justify-content: center')
  expect(timedMeta).toContain('color: var(--yumi-ink)')
  expect(timedMeta).toContain('font-weight: 600')
})

it('日期格“＋ 派工”保持整宽可点，窄屏下与周导航按钮一起撑满可用宽度', () => {
  expect(rule('.yumi-worker-week__add')).toContain('width: 100%')
  expect(rule('.yumi-worker-week__empty')).toContain('width: 100%')
  expect(mediaRule('(max-width: 640px)', '.yumi-worker-week .yumi-section__actions')).toContain(
    'width: 100%'
  )
  expect(
    mediaRule('(max-width: 640px)', '.yumi-worker-week .yumi-section__actions .yumi-button')
  ).toContain('flex: 1')
})

it('订单视角派工样式已移除，页面不再保留订单对话框格与行内工序摘要', () => {
  for (const selector of [
    '.yumi-fulfillment-dispatch-surface',
    '.yumi-fulfillment-stage',
    '.yumi-fulfillment-order-cell',
    '.yumi-fulfillment-product-cell'
  ]) {
    expect(css).not.toContain(selector)
  }
})
