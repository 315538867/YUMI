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

describe('P1 · DataTable/DetailList/MetricStrip 契约（任务 4.4）', () => {
  it('表格在自身区域局部滚动，不压缩列宽导致文字不可读', () => {
    expect(ruleBody('.yumi-data-table-wrap')).toMatch(/overflow-x:\s*auto/)
    expect(ruleBody('.yumi-data-table')).toMatch(/min-width:\s*720px/)
  })

  it('数字列右对齐并使用等宽数字，表头保持左对齐', () => {
    expect(ruleBody('.yumi-data-table__right')).toMatch(/text-align:\s*right\s*!important/)
    expect(ruleBody('.yumi-data-table__numeric')).toMatch(/font-variant-numeric:\s*tabular-nums/)
    expect(ruleBody('.yumi-data-table th')).toMatch(/text-align:\s*left/)
  })

  it('空态在表格内居中呈现并以表面色弱化，不依赖多余容器', () => {
    const empty = ruleBody('.yumi-data-table__empty')
    expect(empty).toMatch(/text-align:\s*center/)
    expect(empty).toMatch(/color:\s*var\(--yumi-muted\)/)
    expect(empty).toMatch(/padding:\s*var\(--yumi-space-9\)\s*!important/)
  })

  it('表头不折行，摘要与指标对极端长文案允许断行', () => {
    expect(ruleBody('.yumi-data-table th')).toMatch(/white-space:\s*nowrap/)
    expect(ruleBody('.yumi-detail-list__item dd')).toMatch(/overflow-wrap:\s*anywhere/)
    expect(ruleBody('.yumi-metric-strip__item dd')).toMatch(/overflow-wrap:\s*anywhere/)
  })

  it('表格消费排版与间距令牌，无裸字号行高内边距', () => {
    expect(ruleBody('.yumi-data-table')).toMatch(/font-size:\s*var\(--yumi-font-size-sm\)/)
    expect(ruleBody('.yumi-data-table th')).toMatch(/font-size:\s*var\(--yumi-font-size-xs\)/)
    expect(ruleBody('.yumi-data-table th')).toMatch(
      /line-height:\s*var\(--yumi-line-height-normal\)/
    )
    expect(ruleBody('.yumi-data-table th')).toMatch(
      /padding:\s*var\(--yumi-space-2-5\) var\(--yumi-space-3\)/
    )
    expect(ruleBody('.yumi-data-table td')).toMatch(/padding:\s*var\(--yumi-space-3\)/)
    expect(ruleBody('.yumi-data-table td')).toMatch(
      /line-height:\s*var\(--yumi-line-height-normal\)/
    )
    expect(ruleBody('.yumi-data-table-wrap--compact .yumi-data-table th')).toMatch(
      /padding-block:\s*var\(--yumi-space-2\)/
    )
    expect(ruleBody('.yumi-data-table-wrap--compact .yumi-data-table td')).toMatch(
      /padding-block:\s*var\(--yumi-space-2-5\)/
    )
  })

  it('详情描述列表消费排版令牌，无裸字号行高', () => {
    expect(ruleBody('.yumi-detail-list__item dt')).toMatch(
      /font-size:\s*var\(--yumi-font-size-xs\)/
    )
    expect(ruleBody('.yumi-detail-list__item dt')).toMatch(
      /line-height:\s*var\(--yumi-line-height-normal\)/
    )
    expect(ruleBody('.yumi-detail-list__item dd')).toMatch(
      /font-size:\s*var\(--yumi-font-size-md\)/
    )
    expect(ruleBody('.yumi-detail-list__item dd')).toMatch(
      /line-height:\s*var\(--yumi-line-height-normal\)/
    )
  })

  it('经营指标带消费排版、间距与圆角令牌，无裸值', () => {
    expect(ruleBody('.yumi-metric-strip')).toMatch(/border-radius:\s*var\(--yumi-radius-lg\)/)
    expect(ruleBody('.yumi-metric-strip__item')).toMatch(/gap:\s*var\(--yumi-space-1\)/)
    expect(ruleBody('.yumi-metric-strip__item')).toMatch(
      /padding:\s*var\(--yumi-space-4-5\) var\(--yumi-space-4\)/
    )
    expect(ruleBody('.yumi-metric-strip__item dt')).toMatch(
      /font-size:\s*var\(--yumi-font-size-xs\)/
    )
    expect(ruleBody('.yumi-metric-strip__item dt')).toMatch(
      /line-height:\s*var\(--yumi-line-height-normal\)/
    )
    expect(ruleBody('.yumi-metric-strip__item dd')).toMatch(
      /font-size:\s*var\(--yumi-font-size-2xl\)/
    )
    expect(ruleBody('.yumi-metric-strip__item dd')).toMatch(
      /line-height:\s*var\(--yumi-line-height-display\)/
    )
    expect(ruleBody('.yumi-metric-strip__item small')).toMatch(
      /font-size:\s*var\(--yumi-font-size-xs\)/
    )
    expect(ruleBody('.yumi-metric-strip__item small')).toMatch(
      /line-height:\s*var\(--yumi-line-height-normal\)/
    )
  })
})
