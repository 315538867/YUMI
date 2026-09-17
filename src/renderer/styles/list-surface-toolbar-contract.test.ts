import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const compositesCss = readFileSync(new URL('./composites.css', import.meta.url), 'utf8')

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 提取指定选择器的声明体；支持多选择器共享规则体，occurrence 指定第几次出现。 */
function ruleBody(selector: string, occurrence = 0): string {
  const re = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, 'g')
  const matches = [...compositesCss.matchAll(re)]
  const match = matches[occurrence]
  if (!match) throw new Error(`未找到规则 ${selector}[${occurrence}]`)
  return match[1]
}

/** 提取 max-width 媒体查询的完整声明体（用于断言唯一窄桌面适配点的折行顺序）。 */
function mediaBody(maxWidth: number): string {
  const start = compositesCss.indexOf(`@media (max-width: ${maxWidth}px) {`)
  if (start < 0) throw new Error(`未找到 max-width: ${maxWidth}px 媒体查询`)
  const bodyStart = compositesCss.indexOf('{', start)
  let depth = 0
  for (let index = bodyStart; index < compositesCss.length; index += 1) {
    if (compositesCss[index] === '{') depth += 1
    if (compositesCss[index] === '}') depth -= 1
    if (depth === 0) return compositesCss.slice(bodyStart + 1, index)
  }
  throw new Error('媒体查询缺少结束括号')
}

describe('P1 · ListSurface 与 ListToolbar 布局契约（任务 4.3）', () => {
  it('工具条控件按内容宽度布局，不为了填满整行等宽拉伸', () => {
    const search = ruleBody('.yumi-list-toolbar__search')
    expect(search).toMatch(/flex:\s*0 1 280px/)
    expect(search).toMatch(/min-width:\s*min\(100%, 280px\)/)
    expect(search).not.toMatch(/flex:\s*1\b|flex-grow:\s*1/)

    const filter = ruleBody('.yumi-list-toolbar__filter')
    expect(filter).toMatch(/flex:\s*0 0 184px/)
    expect(filter).not.toMatch(/flex:\s*1\b|flex-grow:\s*1/)

    const filters = ruleBody('.yumi-list-toolbar__filters')
    expect(filters).toMatch(/flex:\s*0 0 auto/)
    expect(filters).not.toMatch(/flex:\s*1\b|flex-grow:\s*1/)

    const controls = ruleBody('.yumi-list-toolbar__controls')
    expect(controls).toMatch(/flex:\s*0 1 auto/)
    expect(controls).not.toMatch(/flex:\s*1\b|flex-grow:\s*1/)
  })

  it('统计独立于筛选控件，不压缩、不断行并保持右对齐', () => {
    const count = ruleBody('.yumi-list-toolbar__count')
    expect(count).toMatch(/white-space:\s*nowrap/)
    expect(count).toMatch(/margin-left:\s*auto/)
    expect(count).toMatch(/font-size:\s*var\(--yumi-font-size-sm\)/)
    expect(count).toMatch(/line-height:\s*var\(--yumi-line-height-normal\)/)
    expect(count).not.toMatch(/font-size:\s*13px|line-height:\s*20px/)
  })

  it('唯一窄桌面适配点（1279px）按工具栏、控件、筛选的顺序折行，不改变控件顺序', () => {
    const narrow = mediaBody(1279)
    const toolbar = ruleBody('.yumi-list-toolbar', 1)
    const controls = ruleBody('.yumi-list-toolbar__controls', 1)
    const filters = ruleBody('.yumi-list-toolbar__filters', 1)
    expect(toolbar).toMatch(/flex-wrap:\s*wrap/)
    expect(controls).toMatch(/flex-wrap:\s*wrap/)
    expect(filters).toMatch(/flex-wrap:\s*wrap/)

    const order = [
      '.yumi-list-toolbar',
      '.yumi-list-toolbar__controls',
      '.yumi-list-toolbar__filters'
    ].map((selector) => narrow.indexOf(selector))
    expect(order[0]).toBeGreaterThanOrEqual(0)
    expect(order[0]).toBeLessThan(order[1])
    expect(order[1]).toBeLessThan(order[2])
  })

  it('ListSurface 统一容器消费共享令牌，不出现裸视觉值', () => {
    const surface = ruleBody('.yumi-list-surface')
    expect(surface).toMatch(/border:\s*1px solid var\(--yumi-border\)/)
    expect(surface).toMatch(/border-radius:\s*var\(--yumi-radius-lg\)/)
    expect(surface).toMatch(/padding:\s*var\(--yumi-space-5\)/)
    expect(surface).toMatch(/background:\s*var\(--yumi-surface\)/)
    expect(surface).toMatch(/box-shadow:\s*var\(--yumi-shadow-sm\)/)
  })
})
