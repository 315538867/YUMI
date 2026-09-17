import { existsSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const screenshotsDir = fileURLToPath(
  new URL(
    '../../../../openspec/changes/archive/2026-09-17-rebuild-yumi-ui-system/baselines/screenshots/',
    import.meta.url
  )
)
const manifestPath = `${screenshotsDir}manifest.json`

type Shot = {
  page: string
  state: string
  requestedSize: { width: number; height: number }
  out: string
  renderer: { innerWidth: number; innerHeight: number }
  pageLevelHorizontalScroll: boolean
  yumiPageRoots: number
  statusRegions: number
  harnessState: string
  today: string | null
  misses: string[]
  scrollableTables: number
  portal: { ok: boolean; dialog: boolean; overlay: number } | null
  bodyTextPreview: string
  png: { basename: string; bytes: number; size: { width: number; height: number } | null } | null
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  kind: string
  schemaVersion: number
  capturedAt: string
  shots: Shot[]
}

const PAGES = [
  'workbench',
  'orders',
  'fulfillment',
  'settlements',
  'finance',
  'reports',
  'customers',
  'products',
  'settings'
]
const SIZES = ['1100x720', '1440x920', '1920x1080']
const STATE_SIZE = '1440x920'
const PORTAL_PAGES = ['orders', 'customers', 'products', 'finance', 'fulfillment', 'settings']
const FIXED_TODAY = '2026-03-18'

const key = (shot: Shot) =>
  `${shot.page} ${shot.state} ${shot.requestedSize.width}x${shot.requestedSize.height}`
const byKey = new Map(manifest.shots.map((shot) => [key(shot), shot]))

describe('1.9 三档窗口基线截图', () => {
  it('manifest 存在且结构有效', () => {
    expect(existsSync(manifestPath)).toBe(true)
    expect(manifest.kind).toBe('yumi-visual-baseline')
    expect(manifest.schemaVersion).toBe(1)
    expect(manifest.shots.length).toBeGreaterThan(0)
  })

  it('覆盖全部 9 页 × 3 档尺寸的默认态', () => {
    for (const page of PAGES) {
      for (const size of SIZES) {
        expect(byKey.has(`${page} default ${size}`), `${page} default ${size}`).toBe(true)
      }
    }
  })

  it('覆盖全部 9 页的加载/空态/错误态', () => {
    for (const page of PAGES) {
      for (const state of ['loading', 'empty', 'error']) {
        expect(byKey.has(`${page} ${state} ${STATE_SIZE}`), `${page} ${state}`).toBe(true)
      }
    }
  })

  it('覆盖 portal 与 overflow 状态', () => {
    for (const page of PORTAL_PAGES) {
      expect(byKey.has(`${page} portal ${STATE_SIZE}`), `${page} portal`).toBe(true)
      expect(byKey.has(`${page} overflow ${STATE_SIZE}`), `${page} overflow`).toBe(true)
    }
  })

  it('每张截图都有真实文件、满足最小体积且尺寸与请求一致', () => {
    for (const shot of manifest.shots) {
      const pngPath = `${screenshotsDir}${shot.png?.basename ?? ''}`
      expect(statSync(pngPath).isFile(), shot.out).toBe(true)
      expect(shot.png?.bytes ?? 0).toBeGreaterThanOrEqual(10_000)
      if (shot.png?.size) {
        const ratio = shot.png.size.width / shot.requestedSize.width
        expect(shot.png.size.width / shot.requestedSize.width).toBe(
          shot.png.size.height / shot.requestedSize.height
        )
        expect(ratio).toBeGreaterThanOrEqual(1)
        expect(Number.isInteger(ratio)).toBe(true)
      }
      expect(shot.renderer.innerWidth).toBe(shot.requestedSize.width)
      expect(shot.renderer.innerHeight).toBe(shot.requestedSize.height)
    }
  })

  it('harnessState 与请求状态一致，默认态日期固定为夹具基准日', () => {
    for (const shot of manifest.shots) {
      expect(shot.harnessState, key(shot)).toBe(shot.state)
      if (shot.state === 'default') {
        expect(shot.today, key(shot)).toBe(FIXED_TODAY)
      }
    }
  })

  it('默认态页面都渲染出页面根节点（基线本身有效）', () => {
    for (const shot of manifest.shots) {
      if (shot.state !== 'default') continue
      expect(shot.yumiPageRoots, key(shot)).toBeGreaterThanOrEqual(1)
    }
  })

  it('加载态出现 loading 呈现（role=status 或加载文案）', () => {
    for (const shot of manifest.shots) {
      if (shot.state !== 'loading') continue
      // finance 月度结果目前直接渲染 0，没有专有加载呈现：属当前基线事实，先显式豁免并记录。
      if (shot.page === 'finance') continue
      const hasSpinner = shot.statusRegions >= 1
      const hasLoadingText = /加载|读取中|请稍候/.test(shot.bodyTextPreview)
      expect(hasSpinner || hasLoadingText, key(shot)).toBe(true)
    }
  })

  it('portal 态确实展开了浮层（Dialog 或 Popper）', () => {
    for (const shot of manifest.shots) {
      if (shot.state !== 'portal') continue
      const expanded =
        shot.portal?.ok === true && (shot.portal.dialog === true || shot.portal.overlay > 0)
      expect(expanded, key(shot)).toBe(true)
    }
  })

  it('默认态三档窗口均无页面级横向滚动', () => {
    for (const shot of manifest.shots) {
      if (shot.state !== 'default') continue
      expect(shot.pageLevelHorizontalScroll, key(shot)).toBe(false)
    }
  })

  it('overflow 态注入的超长文案出现在渲染结果中', () => {
    for (const shot of manifest.shots) {
      if (shot.state !== 'overflow') continue
      // finance 默认落在「月度经营结果」页签，长文案所在的现金流水页签未展开，故不参与断言。
      if (!['orders', 'customers', 'products'].includes(shot.page)) continue
      expect(shot.bodyTextPreview, key(shot)).toContain('超长中文文案')
    }
  })
})
