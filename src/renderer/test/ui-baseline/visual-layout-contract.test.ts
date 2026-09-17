import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// 视觉布局契约（Task 6）：真实交互状态矩阵 + 每张验收截图的布局诊断。
// PAGES 是 harness 登记了「真实交互状态」的页面：除工作台外，每个页面都有可点击打开的
// 真实浮层/工作区/详情（workbench 只有刷新与进入处理跳转，没有可打开的浮层/表单/详情，
// 因此不登记交互状态；其默认/加载/空态/错误/长文本截图仍由 baseline-screenshots.test.ts 覆盖）。
const PAGES = [
  'orders',
  'products',
  'fulfillment',
  'finance',
  'reports',
  'customers',
  'settings',
  'settlements',
  'workers',
  'work-assignments'
]
const INTERACTIVE_STATES = ['dialog', 'sheet', 'popover', 'form', 'detail', 'invalid']

const manifest = JSON.parse(
  readFileSync(
    new URL(
      '../../../../openspec/changes/archive/2026-09-17-rebuild-yumi-ui-system/baselines/screenshots/manifest.json',
      import.meta.url
    ),
    'utf8'
  )
) as {
  shots: Array<{
    page: string
    state: string
    layout?: {
      overlaps: unknown[]
      pageHorizontalScroll: boolean
      fixedActionContentLeak: boolean
      verticalGlyphRuns: unknown[]
    }
  }>
}

const statesFor = (page: string) =>
  Array.from(new Set(manifest.shots.filter((shot) => shot.page === page).map((shot) => shot.state)))

describe('视觉布局契约（真实交互状态 + 布局零缺陷）', () => {
  it('每个顶层页至少包含 default、loading、empty、error、long-text 和一个真实交互状态', () => {
    for (const page of PAGES) {
      expect(statesFor(page)).toEqual(
        expect.arrayContaining(['default', 'loading', 'empty', 'error', 'long-text'])
      )
      expect(
        statesFor(page).some((state) => INTERACTIVE_STATES.includes(state)),
        `${page} 缺少真实交互状态`
      ).toBe(true)
    }
  })

  it('每张验收截图记录重叠、固定操作条遮挡、逐字断行和页面横滚诊断', () => {
    for (const shot of manifest.shots) {
      expect(shot.layout, `${shot.page} ${shot.state} 缺少 layout 诊断`).toBeDefined()
      expect(shot.layout).toMatchObject({
        overlaps: [],
        pageHorizontalScroll: false,
        fixedActionContentLeak: false,
        verticalGlyphRuns: []
      })
    }
  })
})
