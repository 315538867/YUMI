import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'pages.css'), 'utf8')

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

it('订单视角为任务分配列和行内工序摘要保留紧凑但可读的桌面宽度', () => {
  const assignmentColumn = rule(
    '.yumi-fulfillment-dispatch-surface .yumi-data-table td:nth-child(4)'
  )
  const stage = rule('.yumi-fulfillment-stage')
  const row = rule('.yumi-fulfillment-stage__row')

  expect(assignmentColumn).toContain('min-width: 360px')
  expect(stage).toContain('background: transparent')
  expect(stage).toContain('border: 0')
  expect(stage).toContain('padding: 6px 0')
  expect(row).toContain('flex-wrap: nowrap')
})

it('窄屏才允许工序摘要与操作换行，保持表格横向滚动兜底', () => {
  expect(mediaRule('(max-width: 640px)', '.yumi-fulfillment-stage__row')).toContain(
    'flex-wrap: wrap'
  )
  expect(mediaRule('(max-width: 640px)', '.yumi-fulfillment-stage__actions')).toContain(
    'margin-left: 0'
  )
})
