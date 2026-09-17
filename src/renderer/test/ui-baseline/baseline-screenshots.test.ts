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
  interaction: {
    ok: boolean
    dialog?: boolean
    popper?: boolean
    overlay?: number
    fieldErrors?: number
    reason?: string
  } | null
  layout:
    | {
        overlaps: Array<{ a: string; b: string }>
        pageHorizontalScroll: boolean
        fixedActionContentLeak: boolean
        verticalGlyphRuns: Array<{ selector: string; text: string }>
      }
    | undefined
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
  'settings',
  'workers',
  'work-assignments'
]
const SIZES = ['1100x720', '1280x800', '1440x920', '1920x1080']
const STATE_SIZE = '1440x920'
// 与 capture.mjs 的 PORTAL 状态触发器一致：凡登记了真实浮层/弹层触发器的页面都纳入。
// workbench 没有可打开的浮层（工作台只有刷新/进入处理），reports 的浮层归入 popover 状态。
const PORTAL_PAGES = [
  'orders',
  'customers',
  'products',
  'finance',
  'fulfillment',
  'settings',
  'settlements',
  'workers',
  'work-assignments'
]
// capture.mjs 中为每页登记的「真实交互状态」，测试与采集矩阵共享同一份期望。
// 这些状态都必须由真实 DOM 交互打开，禁用以默认态截图或空 screenshots 冒充。
const REGISTERED_STATES: Record<string, string[]> = {
  workbench: [],
  orders: ['form', 'detail', 'sheet'],
  fulfillment: ['sheet', 'invalid'],
  settlements: ['sheet', 'detail'],
  finance: ['sheet', 'popover'],
  reports: ['popover'],
  customers: ['sheet', 'detail'],
  products: ['form', 'detail'],
  settings: ['sheet', 'dialog'],
  workers: ['form', 'detail'],
  'work-assignments': ['sheet']
}
const INTERACTION_STATES = new Set(['dialog', 'sheet', 'popover', 'form', 'detail', 'invalid'])
const FIXED_TODAY = '2026-03-18'

const key = (shot: Shot) =>
  `${shot.page} ${shot.state} ${shot.requestedSize.width}x${shot.requestedSize.height}`
const byKey = new Map(manifest.shots.map((shot) => [key(shot), shot]))

describe('1.9 四档窗口基线截图（视觉 harness 真实状态矩阵）', () => {
  it('manifest 存在且结构有效', () => {
    expect(existsSync(manifestPath)).toBe(true)
    expect(manifest.kind).toBe('yumi-visual-baseline')
    expect(manifest.schemaVersion).toBe(1)
    expect(manifest.shots.length).toBeGreaterThan(0)
  })

  it('覆盖全部 11 页 × 4 档尺寸的默认态', () => {
    for (const page of PAGES) {
      for (const size of SIZES) {
        expect(byKey.has(`${page} default ${size}`), `${page} default ${size}`).toBe(true)
      }
    }
  })

  it('覆盖全部 11 页的加载/空态/错误态/长文本态/溢出态', () => {
    for (const page of PAGES) {
      for (const state of ['loading', 'empty', 'error', 'long-text', 'overflow']) {
        expect(byKey.has(`${page} ${state} ${STATE_SIZE}`), `${page} ${state}`).toBe(true)
      }
    }
  })

  it('覆盖 portal 与每页登记的真实交互状态', () => {
    for (const page of PORTAL_PAGES) {
      expect(byKey.has(`${page} portal ${STATE_SIZE}`), `${page} portal`).toBe(true)
    }
    for (const page of PAGES) {
      for (const state of REGISTERED_STATES[page] ?? []) {
        expect(byKey.has(`${page} ${state} ${STATE_SIZE}`), `${page} ${state}`).toBe(true)
      }
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

  it('加载态出现 loading 呈现（role=status 或加载文案），财政页不再豁免', () => {
    for (const shot of manifest.shots) {
      if (shot.state !== 'loading') continue
      const hasSpinner = shot.statusRegions >= 1
      const hasLoadingText = /加载|读取中|请稍候/.test(shot.bodyTextPreview)
      expect(hasSpinner || hasLoadingText, key(shot)).toBe(true)
    }
  })

  it('空态渲染的是真实空内容（空态文案/占位），而不是默认数据带', () => {
    for (const shot of manifest.shots) {
      if (shot.state !== 'empty') continue
      expect(
        /暂无|还没有|尚未|没有符合|暂时没有|未找到|当前没有|先完成基础资料/.test(
          shot.bodyTextPreview
        ),
        key(shot)
      ).toBe(true)
    }
  })

  it('portal 态确实展开了浮层（Dialog、Sheet 或 Popper）', () => {
    for (const shot of manifest.shots) {
      if (shot.state !== 'portal') continue
      const expanded =
        shot.portal?.ok === true && (shot.portal.dialog === true || shot.portal.overlay > 0)
      expect(expanded, key(shot)).toBe(true)
    }
  })

  it('默认态四档窗口均无页面级横向滚动', () => {
    for (const shot of manifest.shots) {
      if (shot.state !== 'default') continue
      expect(shot.pageLevelHorizontalScroll, key(shot)).toBe(false)
    }
  })

  it('溢出态/长文本态注入的超长文案出现在所有页面的渲染结果中', () => {
    for (const shot of manifest.shots) {
      if (shot.state !== 'overflow' && shot.state !== 'long-text') continue
      expect(shot.bodyTextPreview, key(shot)).toContain('超长中文文案')
    }
  })

  it('真实交互状态都由真实触发器打开（interaction.ok），弹层态浮层确实展开，invalid 态错误留在字段槽', () => {
    for (const shot of manifest.shots) {
      if (!INTERACTION_STATES.has(shot.state)) continue
      expect(shot.interaction?.ok, key(shot)).toBe(true)
      if (['dialog', 'sheet', 'popover'].includes(shot.state)) {
        const opened =
          shot.interaction?.dialog === true ||
          (shot.interaction?.overlay ?? 0) > 0 ||
          shot.interaction?.popper === true
        expect(opened, key(shot)).toBe(true)
      }
      if (shot.state === 'invalid') {
        expect(shot.interaction?.dialog, key(shot)).toBe(true)
        expect(shot.interaction?.fieldErrors ?? 0, key(shot)).toBeGreaterThanOrEqual(1)
      }
      if (shot.state === 'form' || shot.state === 'detail') {
        expect(shot.yumiPageRoots, key(shot)).toBeGreaterThanOrEqual(1)
      }
    }
  })
})
