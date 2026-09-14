import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./components.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  ''
)

function rule(selector: string) {
  const blocks = css.matchAll(/(?:^|\n)\s*([^{}]+?)\s*\{([^{}]*)\}/g)
  for (const block of blocks) {
    const selectors = block[1]
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    if (selectors.includes(selector)) return block[2]
  }
  throw new Error(`未找到 ${selector} 规则`)
}

describe('共享业务表格布局契约', () => {
  it('表格在窄宽度下由容器横向滚动承接，不压缩成不可读的列', () => {
    expect(rule('.yumi-data-table-wrap')).toMatch(/overflow-x:\s*auto/)
    expect(rule('.yumi-data-table')).toMatch(/min-width:\s*720px/)
  })

  it('操作单元格保留最小可读宽度，按钮横向排列且标签不逐字换行', () => {
    const actionsCell = rule('.yumi-list-cell--actions')
    expect(actionsCell).toMatch(/min-width:\s*124px/)
    expect(actionsCell).toMatch(/white-space:\s*nowrap/)
    expect(actionsCell).toMatch(/display:\s*flex/)
    expect(actionsCell).toMatch(/flex-wrap:\s*wrap/)
    expect(rule('.yumi-list-cell--actions .yumi-button')).toMatch(/white-space:\s*nowrap/)
  })

  it('列表次级长文本只在必要时断词，不使用任意位置断词导致逐字竖排', () => {
    const textCell = rule('.yumi-list-cell span')
    expect(textCell).toMatch(/overflow-wrap:\s*break-word/)
    expect(textCell).not.toMatch(/overflow-wrap:\s*anywhere/)
  })
})
