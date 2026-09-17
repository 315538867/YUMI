import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const primitivesCss = readFileSync(new URL('./primitives.css', import.meta.url), 'utf8')

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 提取指定选择器的声明体；支持 :hover/:focus-visible 及多选择器共享规则体。 */
function ruleBody(selector: string): string {
  const match = primitivesCss.match(
    new RegExp(`(?:^|\\n)\\s*${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`)
  )
  if (!match) throw new Error(`未找到规则 ${selector}`)
  return match[1]
}

describe('P1 · 按钮/图标按钮/菜单令牌迁移（任务 3.5）', () => {
  it('按钮本体消费语义令牌，垂直内边距归 flex 居中，无裸值', () => {
    const button = ruleBody('.yumi-button')
    expect(button).toMatch(/min-height:\s*var\(--yumi-control-height\)/)
    expect(button).toMatch(/font-size:\s*var\(--yumi-font-size-md\)/)
    expect(button).toMatch(/font-weight:\s*var\(--yumi-font-weight-semibold\)/)
    expect(button).toMatch(/line-height:\s*var\(--yumi-line-height-normal\)/)
    expect(button).toMatch(/padding-inline:\s*var\(--yumi-control-padding-x\)/)
    expect(button).not.toMatch(
      /min-height:\s*36px|font-size:\s*14px|font-weight:\s*650|padding:\s*7px 12px/
    )
  })

  it('hover/active/disabled 均有非颜色线索，状态不只靠颜色', () => {
    expect(ruleBody('.yumi-button:hover:not(:disabled)')).toMatch(/transform:\s*translateY\(-1px\)/)
    expect(ruleBody('.yumi-button:active:not(:disabled)')).toMatch(/transform:\s*translateY\(0\)/)
    const disabled = ruleBody('.yumi-button:disabled')
    expect(disabled).toMatch(/opacity:/)
    expect(disabled).toMatch(/cursor:\s*not-allowed/)
  })

  it('危险操作使用独立危险令牌，不引用品牌色', () => {
    expect(ruleBody('.yumi-button--danger')).toMatch(/background:\s*var\(--yumi-danger\)/)
    expect(ruleBody('.yumi-button--danger')).not.toContain('--yumi-brand')
    expect(ruleBody('.yumi-button--danger:hover:not(:disabled)')).toMatch(
      /var\(--yumi-danger-hover\)/
    )
  })

  it('图标按钮尺寸跟随密度控件高度，图标由 flex 居中', () => {
    const icon = ruleBody('.yumi-button--icon')
    expect(icon).toMatch(/width:\s*var\(--yumi-control-height\)/)
    expect(icon).toMatch(/padding:\s*0/)
  })

  it('加载旋钮消费满圆角令牌并保留必要自旋反馈', () => {
    const spinner = ruleBody('.yumi-button__spinner')
    expect(spinner).toMatch(/border-radius:\s*var\(--yumi-radius-full\)/)
    expect(spinner).toMatch(/animation:\s*yumi-spin/)
    expect(spinner).toMatch(/var\(--yumi-duration-spin\)/)
  })

  it('动作菜单项消费控件高度与字号令牌，无 34px/6px 裸值', () => {
    const item = ruleBody('.yumi-action-menu__item')
    expect(item).toMatch(/min-height:\s*var\(--yumi-control-height\)/)
    expect(item).toMatch(/border-radius:\s*var\(--yumi-radius-xs\)/)
    expect(item).toMatch(/font-size:\s*var\(--yumi-font-size-md\)/)
    expect(item).toMatch(/line-height:\s*var\(--yumi-line-height-normal\)/)
    expect(item).toMatch(/padding-inline:\s*var\(--yumi-space-2\)/)
    expect(item).not.toMatch(
      /min-height:\s*34px|border-radius:\s*6px|font-size:\s*14px|line-height:\s*20px/
    )
  })

  it('动作菜单容器间距消费令牌', () => {
    expect(ruleBody('.yumi-action-menu')).toMatch(/gap:\s*var\(--yumi-space-0-5\)/)
  })

  it('菜单项聚焦时保留可见焦点环，不只靠背景色', () => {
    const focus = ruleBody('.yumi-action-menu__item:focus-visible')
    expect(focus).toMatch(/box-shadow:\s*var\(--yumi-focus-ring\)/)
    expect(focus).not.toMatch(/outline:/)
  })
})
