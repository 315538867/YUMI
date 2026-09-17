/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDensity } from './density'
import { DEFAULT_PATTERN_DENSITY, PAGE_PATTERNS, PatternRoot, usePagePattern } from './page-pattern'

const patternMap = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'src/renderer/test/ui-baseline/page-pattern-map.json'),
    'utf8'
  )
) as { patterns: string[] }

function DensityProbe() {
  const density = useDensity()
  return <span data-testid="density-probe">{density}</span>
}

function PatternProbe() {
  const pattern = usePagePattern()
  return <span data-testid="pattern-probe">{pattern ?? 'none'}</span>
}

afterEach(cleanup)

describe('P2 · 页面模式公共根契约（任务 5.1）', () => {
  it('七个页面模式标识与 P0 页面模式地图一致，默认密度按规格归属三档', () => {
    expect(PAGE_PATTERNS).toEqual(patternMap.patterns)
    expect(Object.keys(DEFAULT_PATTERN_DENSITY).sort()).toEqual([...PAGE_PATTERNS].sort())

    expect(DEFAULT_PATTERN_DENSITY['list-page']).toBe('compact')
    expect(DEFAULT_PATTERN_DENSITY['review-workspace']).toBe('compact')
    expect(DEFAULT_PATTERN_DENSITY['calendar-workspace']).toBe('compact')
    expect(DEFAULT_PATTERN_DENSITY['detail-page']).toBe('standard')
    expect(DEFAULT_PATTERN_DENSITY['dashboard-overview']).toBe('standard')
    expect(DEFAULT_PATTERN_DENSITY['settings-workspace']).toBe('standard')
    expect(DEFAULT_PATTERN_DENSITY['form-workspace']).toBe('standard')
  })

  it('模式根发出 data-page-pattern 与默认 data-density，全树唯一且上下文穿透到深层后代', () => {
    for (const pattern of PAGE_PATTERNS) {
      const { container, unmount } = render(
        <PatternRoot pattern={pattern}>
          <div>
            <DensityProbe />
            <PatternProbe />
          </div>
        </PatternRoot>
      )
      const root = container.querySelector('[data-page-pattern]')
      expect(root).toHaveAttribute('data-page-pattern', pattern)
      expect(root).toHaveAttribute('data-density', DEFAULT_PATTERN_DENSITY[pattern])
      expect(container.querySelectorAll('[data-page-pattern]').length).toBe(1)
      expect(container.querySelectorAll('[data-density]').length).toBe(1)
      expect(container.querySelector('[data-testid="density-probe"]')).toHaveTextContent(
        DEFAULT_PATTERN_DENSITY[pattern]
      )
      expect(container.querySelector('[data-testid="pattern-probe"]')).toHaveTextContent(pattern)
      unmount()
    }
  })

  it('模式根显式密度覆盖仅允许长流程/高风险变体由根统一指定', () => {
    const { container } = render(
      <PatternRoot pattern="form-workspace" density="comfortable">
        <DensityProbe />
      </PatternRoot>
    )
    expect(container.querySelector('[data-page-pattern]')).toHaveAttribute(
      'data-page-pattern',
      'form-workspace'
    )
    expect(container.querySelector('[data-density]')).toHaveAttribute('data-density', 'comfortable')
    expect(container.querySelector('[data-testid="density-probe"]')).toHaveTextContent(
      'comfortable'
    )
  })

  it('模式外 usePagePattern 返回 null，模式内返回自身标识', () => {
    const outside = render(<PatternProbe />)
    expect(outside.container.querySelector('[data-testid="pattern-probe"]')).toHaveTextContent(
      'none'
    )
    outside.unmount()

    const inside = render(
      <PatternRoot pattern="dashboard-overview">
        <PatternProbe />
      </PatternRoot>
    )
    expect(inside.container.querySelector('[data-testid="pattern-probe"]')).toHaveTextContent(
      'dashboard-overview'
    )
  })

  it('禁止嵌套：模式根置于另一个模式根内部时抛错，保证顶层唯一', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() =>
      render(
        <PatternRoot pattern="list-page">
          <PatternRoot pattern="detail-page">nested</PatternRoot>
        </PatternRoot>
      )
    ).toThrow(/不允许嵌套/)
    errorSpy.mockRestore()
  })
})
