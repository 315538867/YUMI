import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type ProtectedFile = {
  path: string
  gitState: 'modified' | 'added'
  sha256: string | null
  wipMarkers: string[]
  note?: string
}
type Protection = {
  recordedAt: string
  resolvedAt: string
  resolution: string
  rule: string
  files: ProtectedFile[]
  protectedCssRegions: Array<{
    file: string
    fromMarker: string
    containsMarkers: string[]
  }>
  wipProtectedBaselineKeys: Array<{
    file: string
    category: string
    selector: string
    detail: string
  }>
  forbiddenPathPrefixes: string[]
}

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const repoFile = (relative: string) =>
  readFileSync(new URL(`../../../../${relative}`, import.meta.url), 'utf8')

const protection = JSON.parse(read('./wip-protection.json')) as Protection
const violations = JSON.parse(read('./style-violations.json')) as {
  entries: Array<{ file: string; category: string; selector: string }>
}

/**
 * 本次变更（P0）的产物清单。新增产物必须登记在这里，
 * 这样「本变更没有碰受保护文件」才是可验证的结论而不是口号。
 * P1 起基础尺度和令牌测试落在 styles 目录，allowedRoots 相应扩展。
 */
const CHANGE_ARTIFACTS = {
  allowedRoots: [
    'src/renderer/test/ui-baseline/',
    'openspec/changes/rebuild-yumi-ui-system/',
    'src/renderer/styles/'
  ],
  files: [
    'src/renderer/styles/token-foundations.test.ts',
    'src/renderer/styles/patterns.css',
    'src/renderer/styles/domains-strict-gate.test.ts',
    'src/renderer/test/ui-baseline/source-scan.ts',
    'src/renderer/test/ui-baseline/css-scan.ts',
    'src/renderer/test/ui-baseline/css-scan.test.ts',
    'src/renderer/test/ui-baseline/violations.ts',
    'src/renderer/test/ui-baseline/ui-inventory.json',
    'src/renderer/test/ui-baseline/ui-inventory.test.ts',
    'src/renderer/test/ui-baseline/page-inventory.json',
    'src/renderer/test/ui-baseline/page-pattern-map.json',
    'src/renderer/test/ui-baseline/page-pattern.test.ts',
    'src/renderer/test/ui-baseline/style-violations.json',
    'src/renderer/test/ui-baseline/style-violations.test.ts',
    'src/renderer/test/ui-baseline/window-viewport.test.ts',
    'src/renderer/test/ui-baseline/desktop-adaptation.json',
    'src/renderer/test/ui-baseline/desktop-adaptation.test.ts',
    'src/renderer/test/ui-baseline/feature-matrix.json',
    'src/renderer/test/ui-baseline/feature-matrix-counts.json',
    'src/renderer/test/ui-baseline/feature-matrix.test.ts',
    'src/renderer/test/ui-baseline/wip-protection.json',
    'src/renderer/test/ui-baseline/wip-protection.test.ts',
    'src/renderer/test/ui-baseline/visual-fixtures/determinism.ts',
    'src/renderer/test/ui-baseline/visual-fixtures/edge-values.ts',
    'src/renderer/test/ui-baseline/visual-fixtures/context.ts',
    'src/renderer/test/ui-baseline/visual-fixtures/factories-commercial.ts',
    'src/renderer/test/ui-baseline/visual-fixtures/factories-operations.ts',
    'src/renderer/test/ui-baseline/visual-fixtures/factories-finance.ts',
    'src/renderer/test/ui-baseline/visual-fixtures/dataset.ts',
    'src/renderer/test/ui-baseline/visual-fixtures/visual-fixtures.manifest.json',
    'src/renderer/test/ui-baseline/visual-fixtures/visual-fixtures.test.ts',
    'openspec/changes/rebuild-yumi-ui-system/baselines/ui-inventory.md',
    'openspec/changes/rebuild-yumi-ui-system/baselines/page-inventory.md',
    'openspec/changes/rebuild-yumi-ui-system/baselines/style-violations.md',
    'openspec/changes/rebuild-yumi-ui-system/baselines/feature-matrix.md',
    'openspec/changes/rebuild-yumi-ui-system/baselines/viewport-measurements.json',
    'openspec/changes/rebuild-yumi-ui-system/scripts/inventory-exports.mjs',
    'openspec/changes/rebuild-yumi-ui-system/scripts/inventory-pages.mjs',
    'openspec/changes/rebuild-yumi-ui-system/scripts/probe-viewport.mjs',
    'openspec/changes/rebuild-yumi-ui-system/scripts/run-viewport-probe.sh',
    'openspec/changes/rebuild-yumi-ui-system/scripts/render-feature-matrix.mjs'
  ]
}

describe('P0 · 财务总览 WIP 保护清单（任务 1.10，2026-09-16 已还原）', () => {
  it('WIP 已按负责人决定还原：financial-overview 源文件不存在', () => {
    for (const file of [
      'src/renderer/pages/reports/financial-overview.tsx',
      'src/renderer/pages/reports/financial-overview-model.ts',
      'src/renderer/pages/reports/financial-overview.test.ts',
      'src/renderer/pages/reports/financial-overview.test.tsx'
    ]) {
      expect(existsSync(new URL(`../../../../${file}`, import.meta.url)), `${file} 应已删除`).toBe(
        false
      )
    }
  })

  it('报表页已迁移至 DashboardOverview：不再引用 FinancialOverview WIP', () => {
    const source = repoFile('src/renderer/pages/reports/index.tsx')
    expect(source).toContain('DashboardOverview')
    expect(source).not.toContain('FinancialOverview')
    expect(source).not.toContain('yumi-report-details')
    expect(source).not.toContain('yumi-financial-overview')
  })

  it('保护清单已清空：无受保护文件、无 CSS 段落、无禁入路径前缀', () => {
    expect(protection.files).toEqual([])
    expect(protection.protectedCssRegions).toEqual([])
    expect(protection.wipProtectedBaselineKeys).toEqual([])
    expect(protection.forbiddenPathPrefixes).toEqual([])
    expect(protection.resolution).toMatch(/还原|回退/)
  })

  it('WIP 拥有的基线条目已出基线：style-violations 不再含 financial-overview 条目', () => {
    const leftovers = violations.entries.filter(
      (entry) =>
        entry.file.endsWith('pages.css') && entry.selector.includes('yumi-financial-overview')
    )
    expect(leftovers, 'WIP 已还原，其登记的违规条目必须同步从基线删除').toEqual([])
  })

  it('本变更的产物不与任何禁入路径相交，且只落在测试与变更目录内', () => {
    for (const file of CHANGE_ARTIFACTS.files) {
      for (const prefix of protection.forbiddenPathPrefixes) {
        expect(file.startsWith(prefix), `本变更产物 ${file} 落在受保护路径 ${prefix} 内`).toBe(
          false
        )
      }
      expect(
        CHANGE_ARTIFACTS.allowedRoots.some((root) => file.startsWith(root)),
        `本变更产物 ${file} 落在允许的测试/变更目录之外`
      ).toBe(true)
    }
  })

  it('保护清单显式写明还原决定与无继续保护项', () => {
    expect(protection.rule).toMatch(/无继续保护项/)
    expect(protection.resolvedAt).toBe('2026-09-16')
    expect(protection.resolution).toContain('/tmp/yumi-wip-backup-20260916')
  })
})
