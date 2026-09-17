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

describe('P1 · 字段类令牌迁移（任务 3.6）', () => {
  it('字段容器间距消费 --yumi-field-gap 并按密度联动', () => {
    expect(ruleBody('.yumi-field')).toMatch(/gap:\s*var\(--yumi-field-gap\)/)
  })

  it('字段标签与提示消费排版令牌，无 13px/650/18px 裸值', () => {
    const label = ruleBody('.yumi-field__label')
    expect(label).toMatch(/font-size:\s*var\(--yumi-font-size-sm\)/)
    expect(label).toMatch(/font-weight:\s*var\(--yumi-font-weight-semibold\)/)
    expect(label).toMatch(/line-height:\s*var\(--yumi-line-height-tight\)/)
    expect(label).not.toMatch(/font-size:\s*13px|font-weight:\s*650|line-height:\s*18px/)

    const hint = ruleBody('.yumi-field__label-hint')
    expect(hint).toMatch(/font-size:\s*var\(--yumi-font-size-xs\)/)
    expect(hint).toMatch(/line-height:\s*var\(--yumi-line-height-normal\)/)
    expect(hint).not.toMatch(/font-size:\s*12px|line-height:\s*18px/)
  })

  it('文本输入框消费控件高度与内边距令牌，无裸值', () => {
    const input = ruleBody('.yumi-input')
    expect(input).toMatch(/min-height:\s*var\(--yumi-control-height\)/)
    expect(input).toMatch(/padding-inline:\s*var\(--yumi-control-padding-x\)/)
    expect(input).toMatch(/line-height:\s*var\(--yumi-line-height-normal\)/)
    expect(input).not.toMatch(/min-height:\s*36px|line-height:\s*20px|padding:\s*7px 10px/)
  })

  it('文本域消费控件高度、水平与垂直内边距令牌，无裸值', () => {
    const textarea = ruleBody('.yumi-textarea', 1)
    expect(textarea).toMatch(/padding-inline:\s*var\(--yumi-control-padding-x\)/)
    expect(textarea).toMatch(/padding-block:\s*var\(--yumi-space-2\)/)
    expect(textarea).toMatch(/line-height:\s*var\(--yumi-line-height-normal\)/)
    expect(textarea).not.toMatch(/padding:\s*9px 10px|line-height:\s*21px/)
  })

  it('只读字段以表面样式与默认光标呈现，不只靠颜色', () => {
    const readonly = ruleBody('.yumi-textarea:read-only')
    expect(readonly).toMatch(/background:\s*var\(--yumi-surface-muted\)/)
    expect(readonly).toMatch(/cursor:\s*default/)
  })

  it('复选框消费选项行令牌与字号令牌，禁用态有非颜色线索', () => {
    const checkbox = ruleBody('.yumi-checkbox')
    expect(checkbox).toMatch(/min-height:\s*var\(--yumi-control-height\)/)
    expect(checkbox).toMatch(/font-size:\s*var\(--yumi-font-size-sm\)/)
    expect(checkbox).toMatch(/line-height:\s*var\(--yumi-line-height-normal\)/)
    expect(checkbox).not.toMatch(/min-height:\s*32px|font-size:\s*13px|line-height:\s*20px/)

    expect(ruleBody('.yumi-checkbox__control')).toMatch(/border-radius:\s*var\(--yumi-radius-xs\)/)
    expect(ruleBody('.yumi-checkbox__input:disabled + .yumi-checkbox__control')).toMatch(/opacity:/)
  })

  it('表单消息消费字号令牌，不出现裸字号行高', () => {
    const message = ruleBody('.yumi-form-message')
    expect(message).toMatch(/font-size:\s*var\(--yumi-font-size-xs\)/)
    expect(message).toMatch(/line-height:\s*var\(--yumi-line-height-normal\)/)
    expect(message).not.toMatch(/font-size:\s*12px|line-height:\s*18px/)

    const banner = ruleBody('.yumi-form-message--error')
    expect(banner).toMatch(/font-size:\s*var\(--yumi-font-size-sm\)/)
    expect(banner).toMatch(/line-height:\s*var\(--yumi-line-height-normal\)/)
    expect(banner).not.toMatch(/font-size:\s*13px|line-height:\s*20px/)

    const fieldError = ruleBody('.yumi-field .yumi-form-message--error')
    expect(fieldError).toMatch(/font-size:\s*var\(--yumi-font-size-xs\)/)
    expect(fieldError).toMatch(/line-height:\s*var\(--yumi-line-height-normal\)/)
  })
})
