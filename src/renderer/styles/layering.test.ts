import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./components.css', import.meta.url), 'utf8')

function zIndexOf(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*z-index:\\s*(\\d+)`, 'm'))
  if (!match) throw new Error(`未找到 ${selector} 的 z-index`)
  return Number(match[1])
}

describe('弹层层级', () => {
  it('下拉菜单在抽屉表单之上显示', () => {
    const sheet = zIndexOf('.yumi-sheet')

    expect(zIndexOf('.yumi-select__content')).toBeGreaterThan(sheet)
    expect(zIndexOf('.yumi-select__search-content')).toBeGreaterThan(sheet)
  })
})
