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

describe('P1 · 标签与状态标签令牌迁移（任务 3.8）', () => {
  it('Primary Tabs 项消费排版、字重与间距令牌，无裸值', () => {
    const item = ruleBody('.yumi-primary-tabs__item')
    expect(item).toMatch(/font-size:\s*var\(--yumi-font-size-md\)/)
    expect(item).toMatch(/font-weight:\s*var\(--yumi-font-weight-semibold\)/)
    expect(item).toMatch(/line-height:\s*var\(--yumi-line-height-normal\)/)
    expect(item).toMatch(
      /padding:\s*var\(--yumi-space-2\)\s+var\(--yumi-space-0-5\)\s+var\(--yumi-space-3\)/
    )
    expect(item).not.toMatch(
      /font-size:\s*14px|line-height:\s*20px|font-weight:\s*650|padding:\s*8px\s+1px\s+10px/
    )
  })

  it('Primary Tabs 舒适档与激活指示条消费令牌', () => {
    expect(ruleBody('.yumi-primary-tabs--comfortable .yumi-primary-tabs__item')).toMatch(
      /padding-bottom:\s*var\(--yumi-space-3\)/
    )
    expect(ruleBody('.yumi-primary-tabs__item--active::after')).toMatch(
      /border-radius:\s*var\(--yumi-radius-full\)/
    )
  })

  it('Segmented Control 轨道与项消费间距、圆角与排版令牌', () => {
    const track = ruleBody('.yumi-segmented-tabs')
    expect(track).toMatch(/gap:\s*var\(--yumi-space-1\)/)
    expect(track).toMatch(/padding:\s*var\(--yumi-space-1\)/)

    const item = ruleBody('.yumi-segmented-tabs__item')
    expect(item).toMatch(/border-radius:\s*var\(--yumi-radius-xs\)/)
    expect(item).toMatch(/font-size:\s*var\(--yumi-font-size-sm\)/)
    expect(item).toMatch(/font-weight:\s*var\(--yumi-font-weight-semibold\)/)
    expect(item).toMatch(/line-height:\s*var\(--yumi-line-height-normal\)/)
    expect(item).not.toMatch(
      /border-radius:\s*6px|font-size:\s*13px|line-height:\s*20px|font-weight:\s*650/
    )
  })

  it('状态标签消费字号、字重、间距与圆角令牌', () => {
    const tag = ruleBody('.yumi-status-tag')
    expect(tag).toMatch(/gap:\s*var\(--yumi-space-1\)/)
    expect(tag).toMatch(/border-radius:\s*var\(--yumi-radius-full\)/)
    expect(tag).toMatch(/padding:\s*var\(--yumi-space-0-5\)\s+var\(--yumi-space-2\)/)
    expect(tag).toMatch(/font-size:\s*var\(--yumi-font-size-xs\)/)
    expect(tag).toMatch(/font-weight:\s*var\(--yumi-font-weight-semibold\)/)
    expect(tag).toMatch(/line-height:\s*var\(--yumi-line-height-normal\)/)
    expect(tag).not.toMatch(
      /gap:\s*5px|padding:\s*2px\s+8px|font-size:\s*12px|line-height:\s*18px|font-weight:\s*650/
    )

    expect(ruleBody('.yumi-status-tag__dot')).toMatch(/border-radius:\s*var\(--yumi-radius-full\)/)
    expect(ruleBody('.yumi-status-tag--comfortable')).toMatch(
      /padding:\s*var\(--yumi-space-1\)\s+var\(--yumi-space-2\)/
    )
  })
})
