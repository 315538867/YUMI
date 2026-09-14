/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'

function countMatchesCalls(run: () => unknown) {
  const original = Element.prototype.matches
  let calls = 0
  Element.prototype.matches = function (selector: string) {
    calls += 1
    return original.call(this, selector)
  }
  try {
    run()
  } finally {
    Element.prototype.matches = original
  }
  return calls
}

// nwsapi 2.2.27 在 :modal/:fullscreen 上会递归回 Element.matches 并按栈溢出终止，
// 单次匹配内部放大上百万次调用；jsdom 下这两个伪类只由 fullscreenElement 状态决定。
describe('jsdom 顶层状态伪类快速路径', () => {
  it('匹配 :modal 与 :fullscreen 时不再进入 nwsapi 深递归', () => {
    const element = document.createElement('div')
    document.body.append(element)

    const modalCalls = countMatchesCalls(() => element.matches(':modal'))
    const fullscreenCalls = countMatchesCalls(() => element.matches(':fullscreen'))

    expect(modalCalls).toBeLessThan(10)
    expect(fullscreenCalls).toBeLessThan(10)
  })

  it('保留 fullscreenElement 状态语义', () => {
    const element = document.createElement('div')
    const other = document.createElement('div')
    document.body.append(element, other)
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: element })
    try {
      expect(element.matches(':fullscreen')).toBe(true)
      expect(element.matches(':modal')).toBe(true)
      expect(other.matches(':fullscreen')).toBe(false)
      expect(other.matches(':modal')).toBe(false)
    } finally {
      Reflect.deleteProperty(document, 'fullscreenElement')
    }
  })

  it('其余选择器继续走原始匹配实现', () => {
    const element = document.createElement('div')
    element.className = 'sample'
    document.body.append(element)

    expect(element.matches('div.sample')).toBe(true)
    expect(element.matches('span')).toBe(false)
  })
})
