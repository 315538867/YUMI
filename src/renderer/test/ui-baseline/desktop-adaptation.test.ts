import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type AdaptationDecision = {
  viewportSupportedRange: { minViewportWidth: number }
  adaptationPoints: Array<{ name: string; width: number; appliesWhen: string }>
  ranges: Array<{ name: string; minWidth: number; maxWidth: number | null }>
  acceptanceViewportCoverage: Array<{ viewportWidth: number; range: string; windowLabel: string }>
}

const decision = JSON.parse(
  readFileSync(new URL('./desktop-adaptation.json', import.meta.url), 'utf8')
) as AdaptationDecision

const componentsCss = readFileSync(new URL('../../styles/composites.css', import.meta.url), 'utf8')
const patternsCss = readFileSync(new URL('../../styles/patterns.css', import.meta.url), 'utf8')

function rule(css: string, selector: string, source = css): string {
  const blocks = source.matchAll(/(?:^|\n)\s*([^{}]+?)\s*\{([^{}]*)\}/g)
  for (const block of blocks) {
    const selectors = block[1]
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    if (selectors.includes(selector)) return block[2]
  }
  throw new Error(`未找到 ${selector} 规则`)
}

function mediaRule(css: string, maxWidth: number, selector: string): string {
  const media = new RegExp(`@media\\s*\\(max-width:\\s*${maxWidth}px\\)\\s*\\{`, 'g')
  let match: RegExpExecArray | null

  while ((match = media.exec(css))) {
    const bodyStart = css.indexOf('{', match.index)
    let depth = 0
    let bodyEnd = -1
    for (let index = bodyStart; index < css.length; index += 1) {
      if (css[index] === '{') depth += 1
      if (css[index] === '}') depth -= 1
      if (depth === 0) {
        bodyEnd = index
        break
      }
    }
    if (bodyEnd < 0) throw new Error(`max-width: ${maxWidth}px 媒体查询缺少结束括号`)

    const body = css.slice(bodyStart + 1, bodyEnd)
    try {
      return rule(css, selector, body)
    } catch {
      media.lastIndex = bodyEnd + 1
    }
  }

  throw new Error(`未找到 max-width: ${maxWidth}px 下的 ${selector} 规则`)
}

describe('桌面适配点固化', () => {
  it('页面只保留两个适配点，数值与设计候选一致', () => {
    expect(decision.adaptationPoints).toHaveLength(2)
    const widths = decision.adaptationPoints.map((point) => point.width).sort((a, b) => a - b)
    expect(widths).toEqual([1280, 1440])
  })

  it('适配点与区间边界一致', () => {
    const byName = new Map(decision.adaptationPoints.map((point) => [point.name, point]))
    for (const range of decision.ranges) {
      const point = byName.get(range.name)
      if (!point) continue
      const expected = range.maxWidth === null ? range.minWidth : range.maxWidth + 1
      expect(point.width, `${range.name} 适配点应等于区间边界`).toBe(expected)
    }
  })

  it('三个桌面区间连续、无重叠、无空洞', () => {
    const sorted = [...decision.ranges].sort((a, b) => a.minWidth - b.minWidth)
    expect(sorted[0].minWidth).toBe(decision.viewportSupportedRange.minViewportWidth)
    expect(sorted.at(-1)?.maxWidth).toBeNull()
    for (let index = 1; index < sorted.length; index += 1) {
      expect(sorted[index].minWidth, `${sorted[index].name} 应紧接上一区间`).toBe(
        (sorted[index - 1].maxWidth ?? 0) + 1
      )
    }
  })

  it('三档验收 viewport 全部归属唯一区间', () => {
    expect(decision.acceptanceViewportCoverage).toHaveLength(3)
    for (const entry of decision.acceptanceViewportCoverage) {
      const matches = decision.ranges.filter(
        (range) =>
          entry.viewportWidth >= range.minWidth &&
          (range.maxWidth === null || entry.viewportWidth <= range.maxWidth)
      )
      expect(matches, `${entry.viewportWidth}px 应恰好归属一个区间`).toHaveLength(1)
      expect(matches[0].name, `${entry.viewportWidth}px 的区间归属`).toBe(entry.range)
    }
  })

  it('表格已经在自身区域内横向滚动，而不是让页面整体横滚', () => {
    expect(rule(componentsCss, '.yumi-data-table-wrap')).toMatch(/overflow-x:\s*auto/)
  })
})

// 以下是 P2/P3 已达成的目标契约：样式库只保留唯一窄桌面适配点，
// 其余窄幅收敛由内蕴 minmax/溢出隐藏承担，页面不持有私有断点。
describe('窄桌面适配契约', () => {
  it('工具栏在窄桌面适配点折行，控件不拉伸填满', () => {
    expect(mediaRule(componentsCss, 1279, '.yumi-list-toolbar')).toMatch(/flex-wrap:\s*wrap/)
  })

  it('双栏工作区用 minmax 列压缩辅助栏，而不是直接上下堆叠或 1fr 摊平', () => {
    const overview = rule(patternsCss, '.yumi-workbench-overview')
    expect(overview).toMatch(/grid-template-columns:\s*minmax/)
    expect(overview).not.toMatch(/grid-template-columns:\s*1fr\s*;/)
  })

  it('应用内容区不横向滚动，且保留唯一的页面级纵向滚动入口', () => {
    expect(rule(patternsCss, '.yumi-app-content')).toMatch(/overflow-x:\s*(hidden|clip)/)
    expect(rule(patternsCss, '.yumi-app-content')).toMatch(/overflow-y:\s*auto/)
  })
})
