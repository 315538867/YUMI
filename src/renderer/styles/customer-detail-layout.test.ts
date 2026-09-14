import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

const css = readFileSync(resolve(__dirname, 'pages.css'), 'utf8')

function rule(selector: string) {
  const blocks = css.matchAll(/(?:^|\n)\s*([^{}]+?)\s*\{([^{}]*)\}/g)
  for (const block of blocks) {
    const selectors = block[1]
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    if (selectors.includes(selector)) return block[2]
  }
  throw new Error(`Missing CSS rule: ${selector}`)
}

it('客户历史订单使用固定列宽和横向滚动兜底，避免关键信息逐字换行', () => {
  expect(rule('.yumi-customer-order-history .yumi-data-table')).toContain('min-width: 920px')
  expect(rule('.yumi-customer-order-history .yumi-data-table th:first-child')).toContain(
    'min-width: 120px'
  )
  expect(rule('.yumi-customer-order-history .yumi-data-table th:nth-child(2)')).toContain(
    'min-width: 108px'
  )
  expect(rule('.yumi-customer-order-history .yumi-data-table th:nth-child(6)')).toContain(
    'min-width: 148px'
  )
  const actions = rule('.yumi-customer-order-history .yumi-data-table th:last-child')
  expect(actions).toContain('min-width: 84px')
  expect(actions).toContain('white-space: nowrap')
})
