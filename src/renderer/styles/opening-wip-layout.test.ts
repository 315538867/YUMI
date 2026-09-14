import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

function mediaRule(query: string, selector: string) {
  let searchFrom = 0
  while (searchFrom < css.length) {
    const start = css.indexOf(`@media ${query}`, searchFrom)
    if (start < 0) break
    const open = css.indexOf('{', start)
    let depth = 1
    let end = open + 1
    while (depth > 0 && end < css.length) {
      if (css[end] === '{') depth += 1
      if (css[end] === '}') depth -= 1
      end += 1
    }
    const mediaCss = css.slice(open + 1, end - 1)
    const blocks = mediaCss.matchAll(/(?:^|\n)\s*([^{}]+?)\s*\{([^{}]*)\}/g)
    for (const block of blocks) {
      const selectors = block[1]
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
      if (selectors.includes(selector)) return block[2]
    }
    searchFrom = end
  }
  throw new Error(`Missing ${query} CSS rule: ${selector}`)
}

it('期初在制品的两步工作区使用同层级边框、内边距和标题承载', () => {
  const step = rule('.yumi-workflow-step')

  expect(step).toContain('display: grid')
  expect(step).toContain('gap: var(--yumi-space-4)')
  expect(step).toContain('border: 1px solid var(--yumi-border)')
  expect(step).toContain('border-radius: var(--yumi-radius-lg)')
  expect(step).toContain('padding: var(--yumi-space-5)')
  expect(step).toContain('background: var(--yumi-surface)')
})

it('候选行保留三列结构、选中态和窄屏单列回退', () => {
  expect(rule('.yumi-opening-wip__candidate')).toContain(
    'grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto'
  )
  expect(rule(".yumi-opening-wip__candidate[data-selected='true']")).toContain(
    'border-color: var(--yumi-brand)'
  )
  expect(rule('.yumi-opening-wip__empty')).toContain('padding: var(--yumi-space-3)')
  expect(mediaRule('(max-width: 640px)', '.yumi-opening-wip__candidate')).toContain(
    'grid-template-columns: 1fr'
  )
})
