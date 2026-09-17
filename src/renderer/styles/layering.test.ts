import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = `${readFileSync(new URL('./primitives.css', import.meta.url), 'utf8')}\n${readFileSync(
  new URL('./composites.css', import.meta.url),
  'utf8'
)}`
const tokensCss = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
const patternsCss = readFileSync(new URL('./patterns.css', import.meta.url), 'utf8')
const baseCss = readFileSync(new URL('./base.css', import.meta.url), 'utf8')
const indexCss = readFileSync(new URL('./index.css', import.meta.url), 'utf8')

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const blankComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '')

function zIndexOf(selector: string) {
  const escapedSelector = escapeRegExp(selector)
  const match = css.match(
    new RegExp(`${escapedSelector}\\s*\\{[^}]*z-index:\\s*var\\((--yumi-[\\w-]+)\\)`, 'm')
  )
  if (!match) throw new Error(`未找到 ${selector} 的 z-index`)
  const tokenValue = tokensCss.match(
    new RegExp(`^\\s*${escapeRegExp(match[1])}\\s*:\\s*(\\d+);`, 'm')
  )
  if (!tokenValue) throw new Error(`未找到 ${match[1]} 层级令牌`)
  return Number(tokenValue[1])
}

describe('弹层层级', () => {
  // Radix Popper 把下拉、日期等浮层内容包在 position: fixed 的 [data-radix-popper-content-wrapper] 里，
  // 包裹层自建层叠上下文，浮层内部元素的 z-index 不参与和抽屉/对话框的比较，层级必须加在包裹层上。
  it('Radix 浮层包裹层在抽屉与对话框之上显示', () => {
    const popperWrapper = zIndexOf('[data-radix-popper-content-wrapper]')

    expect(popperWrapper).toBeGreaterThan(zIndexOf('.yumi-sheet'))
    expect(popperWrapper).toBeGreaterThan(zIndexOf('.yumi-dialog__content'))
  })
})

describe('P1 · 级联层与命名层级消费契约（任务 2.8）', () => {
  it('唯一入口声明固定层顺序，vendor 层只承载第三方样式', () => {
    const statement = indexCss.match(/@layer\s+([^;{]+);/)?.[1]
    expect(statement, 'index.css 缺少 @layer 顺序语句').toBeTruthy()
    expect((statement ?? '').split(',').map((name) => name.trim())).toEqual([
      'reset',
      'vendor',
      'foundations',
      'primitives',
      'composites',
      'patterns',
      'domains',
      'utilities'
    ])
    expect(indexCss).toMatch(
      /@import\s+['"]@daypicker\/react\/style\.css['"]\s+layer\(vendor\)\s*;/
    )
  })

  it('命名层级消费关系：遮罩用 overlay、对话框/抽屉用 dialog、菜单/浮层与 Radix 包裹层用 menu、固定项用 sticky、页面与通知锚定各自层', () => {
    const tokenOf = (selector: string) => {
      const match = css.match(
        new RegExp(
          `${escapeRegExp(selector)}\\s*\\{[^}]*z-index:\\s*var\\((--yumi-z-[\\w-]+)\\)`,
          'm'
        )
      )
      if (!match) throw new Error(`未找到 ${selector} 的层级令牌消费`)
      return match[1]
    }

    expect(tokenOf('.yumi-dialog__overlay')).toBe('--yumi-z-overlay')
    expect(tokenOf('.yumi-dialog__content')).toBe('--yumi-z-dialog')
    expect(tokenOf('.yumi-sheet')).toBe('--yumi-z-dialog')
    expect(tokenOf('.yumi-action-menu__content')).toBe('--yumi-z-menu')
    expect(tokenOf('.yumi-select__content')).toBe('--yumi-z-menu')
    expect(tokenOf('.yumi-select__search-content')).toBe('--yumi-z-menu')
    expect(tokenOf('.yumi-date-popover')).toBe('--yumi-z-menu')
    expect(tokenOf('[data-radix-popper-content-wrapper]')).toBe('--yumi-z-menu')
    expect(patternsCss).toMatch(/\.yumi-page\s*\{[^}]*z-index:\s*var\(--yumi-z-page\)/)
    expect(css).toMatch(/\.yumi-notification-host\s*\{[^}]*z-index:\s*var\(--yumi-z-toast\)/)
  })

  it('所有浮层面共享 menu 层级，且 menu > dialog > overlay > page', () => {
    const value = (name: string) => {
      const match = tokensCss.match(new RegExp(`^\\s*${escapeRegExp(name)}\\s*:\\s*(\\d+);`, 'm'))
      if (!match) throw new Error(`未找到 ${name} 层级令牌`)
      return Number(match[1])
    }
    const menu = value('--yumi-z-menu')
    const dialog = value('--yumi-z-dialog')
    const overlay = value('--yumi-z-overlay')
    const page = value('--yumi-z-page')
    expect(menu).toBeGreaterThan(dialog)
    expect(dialog).toBeGreaterThan(overlay)
    expect(overlay).toBeGreaterThan(page)
    expect(dialog - overlay).toBe(1)
  })

  it('本地样式禁止裸层级数字：所有 z-index 声明必须引用命名层级令牌', () => {
    for (const [name, source] of [
      ['base.css', baseCss],
      ['primitives.css', css],
      ['patterns.css', patternsCss]
    ] as const) {
      for (const declaration of blankComments(source).matchAll(/z-index\s*:\s*[^;]+;/g)) {
        expect(declaration[0], `${name} 存在裸层级数字，必须引用 --yumi-z-* 命名令牌`).toMatch(
          /z-index\s*:\s*var\(--yumi-z-[\w-]+\)\s*;/
        )
      }
    }
    // 抬升面必须真实存在：遮罩/对话框/菜单规则位于 primitives/composites，页面与通知锚定位于 patterns/composites。
    expect([...blankComments(css).matchAll(/z-index\s*:/g)].length).toBeGreaterThan(0)
    expect([...blankComments(patternsCss).matchAll(/z-index\s*:/g)].length).toBeGreaterThan(0)
  })
})
