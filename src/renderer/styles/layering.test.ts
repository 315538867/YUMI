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
  // Radix Popper 把下拉、日期等浮层内容包在 position: fixed 的 [data-radix-popper-content-wrapper] 里，
  // 包裹层自建层叠上下文，浮层内部元素的 z-index 不参与和抽屉/对话框的比较，层级必须加在包裹层上。
  it('Radix 浮层包裹层在抽屉与对话框之上显示', () => {
    const popperWrapper = zIndexOf('[data-radix-popper-content-wrapper]')

    expect(popperWrapper).toBeGreaterThan(zIndexOf('.yumi-sheet'))
    expect(popperWrapper).toBeGreaterThan(zIndexOf('.yumi-dialog__content'))
  })
})
