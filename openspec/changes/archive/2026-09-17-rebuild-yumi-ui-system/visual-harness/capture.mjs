// 用确定性数据在 Electron 中给真实 renderer 拍基线截图（任务 1.9）。
//
//   YUMI_SHOT_PAGE=workbench YUMI_SHOT_SIZE=1440x920 YUMI_SHOT_STATE=default \
//     node_modules/.bin/electron --no-sandbox \
//     openspec/changes/rebuild-yumi-ui-system/visual-harness/capture.mjs
//
// 一个进程只拍一张：本机 Electron 在同一进程里创建第二个 BrowserWindow 会失败，
// 因此批量采集交给 run-capture.sh 串行调度。
//
// 环境变量：
//   YUMI_SHOT_PAGE     路由级页面 id（workbench/orders/fulfillment/settlements/finance/reports/customers/products/settings）
//   YUMI_SHOT_SIZE     外层窗口尺寸，形如 1440x920
//   YUMI_SHOT_OUT      输出 PNG 路径
//   YUMI_SHOT_STATE    数据状态：default | loading | empty | error | overflow | portal
//                      状态由 stub preload 读取（loading/empty/error/overflow）；
//                      portal 在这里点击对应页面的主操作触发器后截图。
import { app, BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

app.commandLine.appendSwitch('no-sandbox')
app.disableHardwareAcceleration()

const harnessDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(harnessDir, '..', '..', '..', '..')

const NAV_LABELS = {
  workbench: '工作台',
  orders: '订单',
  fulfillment: '排班',
  settlements: '工资',
  finance: '财务',
  reports: '报表',
  customers: '客户',
  products: '商品',
  settings: '设置'
}

// portal 态触发器：页面主操作按钮的精确文字。products 的「新建商品」是全页工作区而非
// 浮层，故用「全部状态」筛选下拉（Select Popover）作为 portal 代表。
const PORTAL_TRIGGERS = {
  orders: '全部资金状态',
  customers: '新建客户',
  products: '全部状态',
  finance: '登记收支',
  fulfillment: '＋ 派工',
  settings: '编辑工作室参数'
}

const SUPPORTED_STATES = new Set(['default', 'loading', 'empty', 'error', 'overflow', 'portal'])

const parseSize = (raw) => {
  const match = /^(\d+)x(\d+)$/.exec(String(raw ?? '').trim())
  if (!match) throw new Error(`YUMI_SHOT_SIZE 需形如 1440x920，当前为「${raw}」`)
  return { width: Number(match[1]), height: Number(match[2]) }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const SETTLE_MS = 900
const PORTAL_EXTRA_MS = 500

app.whenReady().then(async () => {
  const page = process.env.YUMI_SHOT_PAGE ?? 'workbench'
  const size = parseSize(process.env.YUMI_SHOT_SIZE)
  const state = process.env.YUMI_SHOT_STATE ?? 'default'
  const navLabel = process.env.YUMI_SHOT_NAV_LABEL ?? NAV_LABELS[page]
  const outPath =
    process.env.YUMI_SHOT_OUT ??
    join(harnessDir, `shot-${page}-${size.width}x${size.height}-${state}.png`)

  if (!navLabel) throw new Error(`未知页面 id「${page}」，请显式传 YUMI_SHOT_NAV_LABEL`)
  if (!SUPPORTED_STATES.has(state)) {
    throw new Error(
      `不支持的 YUMI_SHOT_STATE「${state}」，可选：${[...SUPPORTED_STATES].join(' | ')}`
    )
  }

  const window = new BrowserWindow({
    width: size.width,
    height: size.height,
    show: false,
    titleBarStyle: 'hiddenInset',
    useContentSize: false,
    webPreferences: {
      preload: join(harnessDir, 'preload-stub.cjs'),
      additionalArguments: [`--yumi-harness-state=${state}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  await window.loadFile(join(repoRoot, 'out/renderer/index.html'))

  // 等 React 挂载并把 stub 注入完成。
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await window.webContents.executeJavaScript(
      `Boolean(window.__yumiHarness && document.querySelector('.yumi-app-shell'))`
    )
    if (ready) break
    await sleep(100)
  }

  if (page !== 'workbench') {
    const clicked = await window.webContents.executeJavaScript(`(() => {
      const label = ${JSON.stringify(navLabel)}
      const items = Array.from(document.querySelectorAll('.yumi-app-navigation__item'))
      const target = items.find((item) => item.textContent.trim() === label)
      if (!target) return { ok: false, seen: items.map((item) => item.textContent.trim()) }
      target.click()
      return { ok: true }
    })()`)
    if (!clicked.ok) {
      throw new Error(`侧栏找不到「${navLabel}」；实际有：${clicked.seen.join('、')}`)
    }
  }

  await sleep(SETTLE_MS)

  let portal = null
  if (state === 'portal') {
    const trigger = PORTAL_TRIGGERS[page]
    if (!trigger) {
      throw new Error(`页面「${page}」没有登记 portal 触发器，请补充 PORTAL_TRIGGERS`)
    }
    portal = await window.webContents.executeJavaScript(`(async () => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const target = buttons.find((el) => el.textContent.trim() === ${JSON.stringify(trigger)})
      if (!target) {
        return { ok: false, reason: 'trigger-not-found', seen: buttons.map((el) => el.textContent.trim().slice(0, 20)).slice(0, 40) }
      }
      target.click()
      await new Promise((resolve) => setTimeout(resolve, ${PORTAL_EXTRA_MS}))
      return {
        ok: true,
        dialog: Boolean(document.querySelector('[role="dialog"]')),
        overlay: Array.from(document.querySelectorAll('[data-radix-popper-content-wrapper]')).length,
        modal: Boolean(document.querySelector('[role="dialog"] [aria-modal="true"]'))
      }
    })()`)
    await sleep(PORTAL_EXTRA_MS)
  }

  const diagnostics = await window.webContents.executeJavaScript(`(() => {
    const harness = window.__yumiHarness
    const tables = Array.from(document.querySelectorAll('.yumi-data-table-wrap'))
    return {
      harnessState: harness?.state ?? null,
      today: harness?.today ?? null,
      counts: harness?.counts ?? null,
      misses: harness?.getMisses() ?? [],
      bodyText: (document.body.innerText || '').slice(0, 2500),
      pageRoots: Array.from(document.querySelectorAll('.yumi-page')).length,
      loading: document.querySelectorAll('[role="status"]').length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      tableWraps: tables.length,
      scrollableTables: tables.filter((el) => el.scrollWidth > el.clientWidth).length
    }
  })()`)

  const image = await window.webContents.capturePage()
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, image.toPNG())

  const report = {
    page,
    state,
    requestedSize: size,
    out: outPath.replace(`${repoRoot}/`, ''),
    renderer: { innerWidth: diagnostics.innerWidth, innerHeight: diagnostics.innerHeight },
    pageLevelHorizontalScroll: diagnostics.scrollWidth > diagnostics.clientWidth,
    yumiPageRoots: diagnostics.pageRoots,
    statusRegions: diagnostics.loading,
    harnessState: diagnostics.harnessState,
    today: diagnostics.today,
    misses: diagnostics.misses,
    tableWraps: diagnostics.tableWraps,
    scrollableTables: diagnostics.scrollableTables,
    portal: portal ? { ...portal, seen: undefined } : null,
    bodyTextPreview: diagnostics.bodyText
  }
  if (portal && !portal.ok) report.portal = portal
  console.log(`SHOT ${JSON.stringify(report)}`)

  window.destroy()
  app.exit(0)
})
