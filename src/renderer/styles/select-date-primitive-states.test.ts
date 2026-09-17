import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const primitivesCss = readFileSync(new URL('./primitives.css', import.meta.url), 'utf8')

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 提取指定选择器的声明体；支持多选择器共享规则体，occurrence 指定第几次出现。 */
function ruleBody(selector: string, occurrence = 0): string {
  const re = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, 'g')
  const matches = [...primitivesCss.matchAll(re)]
  const match = matches[occurrence]
  if (!match) throw new Error(`未找到规则 ${selector}[${occurrence}]`)
  return match[1]
}

describe('P1 · 选择类令牌迁移（任务 3.7）', () => {
  it('Select 触发器消费控件高度与内边距令牌，无裸内边距', () => {
    const trigger = ruleBody('.yumi-select__trigger')
    expect(trigger).toMatch(/min-height:\s*var\(--yumi-control-height\)/)
    expect(trigger).toMatch(/padding-inline:\s*var\(--yumi-control-padding-x\)/)
    expect(trigger).toMatch(/padding-block:\s*0/)
    expect(trigger).not.toMatch(/padding:\s*7px\s+10px/)
  })

  it('Select 项、搜索选项与新建项消费控件高度、间距与排版令牌，无裸值', () => {
    const item = ruleBody('.yumi-select__item,\n.yumi-select__option,\n.yumi-select__create')
    expect(item).toMatch(/min-height:\s*var\(--yumi-control-height\)/)
    expect(item).toMatch(/padding-inline:\s*var\(--yumi-space-2\)/)
    expect(item).toMatch(/border-radius:\s*var\(--yumi-radius-xs\)/)
    expect(item).toMatch(/font-size:\s*var\(--yumi-font-size-md\)/)
    expect(item).toMatch(/line-height:\s*var\(--yumi-line-height-normal\)/)
    expect(item).not.toMatch(
      /min-height:\s*34px|padding:\s*7px|font-size:\s*14px|line-height:\s*20px|border-radius:\s*6px/
    )
  })

  it('搜索框内边距、选项间距与空态文案消费令牌', () => {
    expect(ruleBody('.yumi-select__search')).toMatch(/padding-block:\s*var\(--yumi-space-1\)/)
    expect(ruleBody('.yumi-select__options')).toMatch(/gap:\s*var\(--yumi-space-0-5\)/)
    expect(ruleBody('.yumi-select__empty')).toMatch(/font-size:\s*var\(--yumi-font-size-sm\)/)
    expect(ruleBody('.yumi-select__create', 1)).toMatch(
      /font-weight:\s*var\(--yumi-font-weight-semibold\)/
    )
  })

  it('日期浮层消费排版与圆角令牌，无裸字号行高', () => {
    expect(ruleBody('.yumi-date-popover .rdp-root')).toMatch(
      /font-size:\s*var\(--yumi-font-size-sm\)/
    )
    expect(ruleBody('.yumi-date-popover .rdp-caption_label')).toMatch(
      /font-size:\s*var\(--yumi-font-size-md\)/
    )
    expect(ruleBody('.yumi-date-popover .rdp-nav button')).toMatch(
      /border-radius:\s*var\(--yumi-radius-xs\)/
    )
    expect(ruleBody('.yumi-date-popover .rdp-weekday')).toMatch(
      /font-size:\s*var\(--yumi-font-size-2xs\)/
    )
  })

  it('月份网格项、错误文案与时间字段消费令牌', () => {
    expect(ruleBody('.yumi-month-grid__item')).toMatch(/border-radius:\s*var\(--yumi-radius-sm\)/)
    expect(ruleBody('.yumi-date-popover__error')).toMatch(/font-size:\s*var\(--yumi-font-size-xs\)/)
    expect(ruleBody('.yumi-date-popover__error')).toMatch(
      /line-height:\s*var\(--yumi-line-height-normal\)/
    )
    expect(ruleBody('.yumi-date-popover__time-field')).toMatch(
      /font-size:\s*var\(--yumi-font-size-sm\)/
    )
    expect(ruleBody('.yumi-date-popover__time-range label')).toMatch(/gap:\s*var\(--yumi-space-1\)/)
    expect(ruleBody('.yumi-date-popover__time-range label')).toMatch(
      /font-size:\s*var\(--yumi-font-size-xs\)/
    )
  })
})
