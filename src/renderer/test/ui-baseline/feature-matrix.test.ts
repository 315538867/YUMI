import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type MatrixPage = {
  module: string
  file: string
  label: string
  targetPatterns: string[]
  features: string[]
}
type MatrixFamily = { id: string; label: string; pages: MatrixPage[] }
type Matrix = { families: MatrixFamily[]; entryFormat: string }

type PageInventory = {
  topLevelViews: Array<{ view: string; label: string; file: string }>
  embeddedViews: Array<{ component: string; file: string }>
}
type PatternMap = { patterns: string[]; families: Record<string, string[]> }

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T

const matrix = readJson<Matrix>('./feature-matrix.json')
const counts = readJson<{ counts: Record<string, number> }>('./feature-matrix-counts.json').counts
const inventory = readJson<PageInventory>('./page-inventory.json')
const patternMap = readJson<PatternMap>('./page-pattern-map.json')

const CATEGORIES = [
  'view',
  'metric',
  'list',
  'filter',
  'action',
  'form',
  'state',
  'calendar',
  'interaction'
]

const ENTRY = /^([a-z]+)\/([a-z0-9-]+):\s*\S/

const moduleIdOf = (file: string) => {
  const parts = file.split('/')
  return parts[parts.length - 2]
}

const allPages = matrix.families.flatMap((family) =>
  family.pages.map((page) => ({ family: family.id, page }))
)

describe('P0 · 功能保留矩阵（任务 1.5）', () => {
  it('六大页面家族与 page-pattern-map 的家族划分一致', () => {
    expect(matrix.families.map((family) => family.id).sort()).toEqual(
      Object.keys(patternMap.families).sort()
    )
    for (const family of matrix.families) {
      const modules = family.pages.map((page) => page.module).sort()
      expect(modules, `家族 ${family.id} 的页面归属`).toEqual(
        [...patternMap.families[family.id]].sort()
      )
    }
  })

  it('矩阵覆盖全部路由级页面与嵌入式页面，且文件路径与页面清单一致', () => {
    const expected = new Map<string, string>([
      ...inventory.topLevelViews.map((view) => [view.view, view.file] as [string, string]),
      ...inventory.embeddedViews.map(
        (view) => [moduleIdOf(view.file), view.file] as [string, string]
      )
    ])

    const covered = new Map(allPages.map(({ page }) => [page.module, page.file]))
    expect([...covered.keys()].sort(), '矩阵必须覆盖页面清单里的每个页面模块').toEqual(
      [...expected.keys()].sort()
    )
    for (const [module, file] of covered) {
      expect(file, `模块 ${module} 的文件路径`).toBe(expected.get(module))
    }
  })

  it('每个页面至少挂在一个目标 Pattern 上，且 Pattern 名合法', () => {
    for (const { page } of allPages) {
      expect(page.targetPatterns.length, `${page.module} 必须声明目标 Pattern`).toBeGreaterThan(0)
      for (const pattern of page.targetPatterns) {
        expect(patternMap.patterns, `${page.module} 声明了非法 Pattern ${pattern}`).toContain(
          pattern
        )
      }
    }
  })

  it('条目格式合法、类别受控、同页条目 id 不重复', () => {
    for (const { page } of allPages) {
      const ids = new Set<string>()
      for (const entry of page.features) {
        const match = ENTRY.exec(entry)
        expect(match, `${page.module} 的条目格式非法：${entry}`).not.toBeNull()
        const category = match?.[1] ?? ''
        const slug = match?.[2] ?? ''
        expect(CATEGORIES, `${page.module} 使用了未知类别 ${category}`).toContain(category)
        const id = `${category}/${slug}`
        expect(ids.has(id), `${page.module} 的条目 id 重复：${id}`).toBe(false)
        ids.add(id)
      }
    }
  })

  it('条目只增不减：每页条目数不得低于已登记数量', () => {
    for (const { family, page } of allPages) {
      const key = `${family}.${page.module}`
      const recorded = counts[key]
      expect(recorded, `缺少 ${key} 的登记数量`).toBeTypeOf('number')
      expect(
        page.features.length,
        `${key} 的条目从 ${recorded} 降到 ${page.features.length}；若确实要废弃某项，请在任务说明里写明理由后再同步下调 feature-matrix-counts.json`
      ).toBeGreaterThanOrEqual(recorded)
    }
  })

  it('每个页面都覆盖了「状态呈现」这一类，避免迁移只搬正常路径', () => {
    for (const { page } of allPages) {
      const hasState = page.features.some((entry) => entry.startsWith('state/'))
      expect(hasState, `${page.module} 未登记任何 state 条目`).toBe(true)
    }
  })

  it('输出矩阵规模供 P3 逐家族核对', () => {
    const summary = matrix.families
      .map((family) => {
        const total = family.pages.reduce((sum, page) => sum + page.features.length, 0)
        return `${family.id}=${total}`
      })
      .join(' ')
    const total = allPages.reduce((sum, { page }) => sum + page.features.length, 0)
    console.info(`[feature-matrix] ${summary} | 合计 ${total} 条 / ${allPages.length} 个页面`)
    expect(total).toBeGreaterThan(0)
  })
})
