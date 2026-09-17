import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const primitivesPath = new URL('./primitives.css', import.meta.url)
const patternsPath = new URL('./patterns.css', import.meta.url)

/**
 * 页面布局所有权契约：断言给定 CSS 源码满足「固定操作区不透明表面 + 内容安全留白」。
 * 供全页面整改期间各批次的布局验收复用。
 */
export function assertPageLayoutOwnership(source: string): void {
  expect(source).toMatch(/\.yumi-sticky-actions[\s\S]*background:\s*var\(--yumi-surface\)/)
  expect(source).toMatch(
    /\.yumi-form-workspace[\s\S]*padding-bottom:\s*var\(--yumi-sticky-actions-space\)/
  )
}

describe('P1 · 页面布局所有权契约（任务 1）', () => {
  it('固定操作区遮挡滚动内容时保留不透明表面和内容安全留白', () => {
    const primitives = readFileSync(primitivesPath, 'utf8')
    const patterns = readFileSync(patternsPath, 'utf8')
    assertPageLayoutOwnership(`${patterns}\n${primitives}`)
  })
})
