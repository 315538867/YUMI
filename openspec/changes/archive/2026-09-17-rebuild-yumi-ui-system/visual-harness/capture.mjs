// 用确定性数据在真实 Electron 中给真实 renderer 拍基线截图（任务 1.9 / Task 6 扩展）。
//
//   YUMI_SHOT_PAGE=workbench YUMI_SHOT_SIZE=1440x920 YUMI_SHOT_STATE=default \
//     node_modules/.bin/electron --no-sandbox \
//     openspec/changes/archive/2026-09-17-rebuild-yumi-ui-system/visual-harness/capture.mjs
//
// 一个进程只拍一张：本机 Electron 在同一进程里创建第二个 BrowserWindow 会失败，
// 因此批量采集交给 run-capture.sh 串行调度。
//
// 环境变量：
//   YUMI_SHOT_PAGE     页面 id（9 个顶层页 + workers/work-assignments 两个嵌入页）
//   YUMI_SHOT_SIZE     外层窗口尺寸，形如 1440x920
//   YUMI_SHOT_OUT      输出 PNG 路径
//   YUMI_SHOT_STATE    数据/交互状态：
//                      default | loading | empty | error | overflow | long-text |
//                      portal | dialog | sheet | popover | form | detail | invalid
//                      loading/empty/error/overflow/long-text 由 stub preload 读取；
//                      portal/dialog/sheet/popover/form/detail/invalid 由 TRIGGERS 里
//                      登记的真实 DOM 交互打开（点击按钮/Tab/表单提交）。
import { app, BrowserWindow } from 'electron'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

app.commandLine.appendSwitch('no-sandbox')
app.disableHardwareAcceleration()

const harnessDir = dirname(fileURLToPath(import.meta.url))
// 归档后视觉 harness 位于 openspec/changes/archive/2026-09-17-rebuild-yumi-ui-system/visual-harness，
// 上溯 5 级才回到仓库根（4 级会解析到 openspec/ 并让 out/renderer/index.html 加载失败）。
const repoRoot = join(harnessDir, '..', '..', '..', '..', '..')

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

// 交互步骤：每个步骤在 renderer 里执行真实的 DOM 点击/提交，等待后返回是否成功。
// ops:
//   nav(label)             点击侧栏导航项（精确文本）
//   tab(label)             点击 Tab/工作区切换钮（nav.yumi-*-tabs 下的 button，其次 [role=tab]）
//   click(label)           点击文本精确相等的按钮
//   clickRowContains(label, rowText)  点击某行内的按钮（行 innerText 包含 rowText）
//   clickAria(label)       点击 aria-label 精确相等的可点击元素
//   wait(ms)               等待（主进程 sleep）
const step = (op, arg) => ({ op, arg })

const TRIGGERS = {
  orders: {
    form: [step('click', '新建订单')],
    detail: [step('click', '查看详情')],
    sheet: [
      step('click', '查看详情'),
      step('wait', { ms: 450 }),
      step('tab', '资金'),
      step('click', '登记收款或退款')
    ],
    portal: [step('click', '全部资金状态')]
  },
  products: {
    form: [step('click', '新建商品')],
    detail: [step('click', '查看详情')],
    portal: [step('click', '全部状态')]
  },
  customers: {
    sheet: [step('click', '新建客户')],
    detail: [step('click', '查看详情')],
    portal: [step('click', '新建客户')]
  },
  fulfillment: {
    sheet: [step('click', '＋ 派工')],
    // 计时核算 invalid：切到待核算 → 打开一行计时核算 Dialog → 不填时间直接提交，
    // 四输入字段的错误留在字段槽、摘要位置稳定，Dialog 保持打开。
    invalid: [
      step('tab', '待核算'),
      step('clickRowContains', { label: '核算', rowText: '实际时间范围' }),
      step('wait', { ms: 400 }),
      step('click', '确认核算')
    ],
    portal: [step('click', '＋ 派工')]
  },
  finance: {
    sheet: [step('click', '登记收支')],
    // 统计月份选择器就是 Radix Popover 浮层：点开即真实浮层，兼作「周期」触发器。
    popover: [step('clickAria', '统计月份')],
    // overflow/long-text 的长文案注入在现金流水流水中，必须先切到现金流水页签才能看见
    // （默认落在月度经营结果汇总页签，指标数字不含注入标记）。
    overflow: [step('tab', '现金流水')],
    'long-text': [step('tab', '现金流水')],
    portal: [step('click', '登记收支')]
  },
  reports: {
    // 经营报表「更多操作」导出菜单是 Radix Popover。
    popover: [step('click', '更多操作')]
  },
  settings: {
    sheet: [step('click', '编辑工作室参数')],
    // 删除类目/垫付人：财务资料页签 → 行内「删除」→ 确认弹窗（编辑/删除/恢复确认族）。
    dialog: [step('tab', '财务资料'), step('click', '删除')],
    // overflow/long-text 长文案注入在财务资料类目中，默认页签是只读参数，需切到财务资料页签。
    overflow: [step('tab', '财务资料')],
    'long-text': [step('tab', '财务资料')],
    // empty 的置空注入走财务资料类目/垫付人（工作室参数恒有值没有空态），也要切页签才见。
    empty: [step('tab', '财务资料')],
    portal: [step('click', '编辑工作室参数')]
  },
  settlements: {
    sheet: [step('click', '新建结算')],
    detail: [step('click', '查看详情')],
    portal: [step('click', '新建结算')]
  },
  workers: {
    form: [step('click', '新增人员')],
    detail: [step('click', '查看详情')],
    portal: [step('click', '新增人员')]
  },
  'work-assignments': {
    sheet: [step('click', '＋ 派工')],
    portal: [step('click', '＋ 派工')]
  }
}

// 嵌入页导航路径：先到宿主页，再点 Tab/入口，验证嵌入边界（单一宿主根、无第二页头）。
const NAV_PATHS = {
  workers: [step('nav', '工资'), step('tab', '人员与时薪')],
  'work-assignments': [step('nav', '排班')]
}

const SUPPORTED_STATES = new Set([
  'default',
  'loading',
  'empty',
  'error',
  'overflow',
  'long-text',
  'portal',
  'dialog',
  'sheet',
  'popover',
  'form',
  'detail',
  'invalid'
])

const parseSize = (raw) => {
  const match = /^(\d+)x(\d+)$/.exec(String(raw ?? '').trim())
  if (!match) throw new Error(`YUMI_SHOT_SIZE 需形如 1440x920，当前为「${raw}」`)
  return { width: Number(match[1]), height: Number(match[2]) }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const SETTLE_MS = 900
const STEP_MS = 150
const INTERACT_EXTRA_MS = 500

app.whenReady().then(async () => {
  const page = process.env.YUMI_SHOT_PAGE ?? 'workbench'
  const size = parseSize(process.env.YUMI_SHOT_SIZE)
  const state = process.env.YUMI_SHOT_STATE ?? 'default'
  const outPath =
    process.env.YUMI_SHOT_OUT ??
    join(harnessDir, `shot-${page}-${size.width}x${size.height}-${state}.png`)

  if (!SUPPORTED_STATES.has(state)) {
    throw new Error(
      `不支持的 YUMI_SHOT_STATE「${state}」，可选：${[...SUPPORTED_STATES].sort().join(' | ')}`
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

  // 单个交互步骤在 renderer 里执行，返回 { ok, detail }。
  async function execStep(current) {
    const result = await window.webContents.executeJavaScript(`(async () => {
      const arg = ${JSON.stringify(current.arg)}
      const label = typeof arg === 'string' ? arg : (arg && arg.label) || ''
      const rowsNeedle = (arg && arg.rowText) || null
      const qsa = (sel) => Array.from(document.querySelectorAll(sel))
      const trimmed = (el) => (el.textContent || '').trim()
      switch (${JSON.stringify(current.op)}) {
        case 'nav': {
          const items = qsa('.yumi-app-navigation__item')
          const target = items.find((item) => trimmed(item) === label)
          if (!target) return { ok: false, seen: items.map((item) => trimmed(item)) }
          target.click()
          return { ok: true }
        }
        case 'tab': {
          const tabs = qsa(
            'nav[class*="yumi-"] button, nav[class*="yumi-"] [role="tab"], [role="tab"]'
          )
          const target = tabs.find(
            (tab) => trimmed(tab) === label || trimmed(tab).startsWith(label)
          )
          if (!target) return { ok: false, seen: tabs.map((item) => trimmed(item)).slice(0, 30) }
          target.click()
          return { ok: true }
        }
        case 'click': {
          const buttons = qsa('button')
          const target = buttons.find((el) => trimmed(el) === label)
          if (!target) {
            return {
              ok: false,
              seen: buttons.map((el) => trimmed(el).slice(0, 20)).slice(0, 60)
            }
          }
          target.click()
          return { ok: true }
        }
        case 'clickRowContains': {
          const buttons = qsa('button')
          const target = buttons.find((el) => {
            if (trimmed(el) !== label) return false
            const row = el.closest('tr, li, [role="row"]')
            return Boolean(row && (row.innerText || '').includes(rowsNeedle))
          })
          if (!target) return { ok: false, buttonCount: buttons.length }
          target.click()
          return { ok: true }
        }
        case 'clickAria': {
          const candidates = qsa('[aria-label]')
          const target = candidates.find((el) => (el.getAttribute('aria-label') || '') === label)
          if (!target) {
            return { ok: false, seen: candidates.map((el) => el.getAttribute('aria-label')).filter(Boolean).slice(0, 40) }
          }
          target.click()
          return { ok: true }
        }
        default:
          return { ok: false, reason: 'unknown-op' }
      }
    })()`)
    if (current.op !== 'wait') await sleep(current.op === 'tab' ? 250 : STEP_MS)
    return result
  }

  // 基础导航：顶层页走侧栏；嵌入页先到宿主页再点入口。
  const baseSteps = NAV_PATHS[page] ?? (page !== 'workbench' ? [step('nav', NAV_LABELS[page] ?? '')] : [])
  const stateSteps = TRIGGERS[page]?.[state] ?? []
  if (page !== 'workbench' && !NAV_LABELS[page] && !NAV_PATHS[page]) {
    throw new Error(`未知页面 id「${page}」，请显式传 YUMI_SHOT_NAV_LABEL`)
  }

  const interaction = { ok: true, steps: baseSteps.length + stateSteps.length, done: [] }
  const runAll = async () => {
    for (const current of [...baseSteps, ...stateSteps]) {
      if (current.op === 'wait') {
        await sleep(current.arg.ms ?? 200)
        interaction.done.push({ op: current.op, ok: true })
        continue
      }
      const result = await execStep(current)
      interaction.done.push({ op: current.op, ok: result.ok })
      if (!result.ok) {
        interaction.ok = false
        const argLabel =
          typeof current.arg === 'string' ? current.arg : (current.arg && current.arg.label) || ''
        interaction.reason = `${current.op}「${argLabel}」未找到`
        interaction.seen = result.seen ?? undefined
        return false
      }
    }
    return true
  }
  const baseSucceeded = await runAll()

  if (baseSucceeded && (stateSteps.length > 0 || NAV_PATHS[page])) {
    // 交互态等待浮层/工作区稳定渲染。
    await sleep(INTERACT_EXTRA_MS)
  } else {
    await sleep(SETTLE_MS)
  }

  // 浮层/弹层信息：dialog / sheet / popover / invalid / portal 都需要真实展开判定。
  // 应用内的浮层表面有三族：Radix Dialog（role=dialog / data-radix-dialog-*）、
  // Radix AlertDialog（role=alertdialog / data-radix-alert-dialog-*）与自定义
  // Pattern 表面（.yumi-dialog__overlay / .yumi-dialog__content / .yumi-sheet）；
  // 全部计入展开判定，避免 AlertDialog 确认框被当作「未展开」。
  const overlayInfo = state !== 'default'
    ? await window.webContents.executeJavaScript(`({
      dialog: document.querySelectorAll(
        '[role="dialog"], [role="alertdialog"], [data-radix-dialog-content], [data-radix-alert-dialog-content], .yumi-dialog__content, .yumi-sheet'
      ).length > 0,
      popper: document.querySelectorAll(
        '[data-radix-popper-content-wrapper], [data-radix-dialog-overlay], [data-radix-alert-dialog-overlay], [data-radix-popover-content-wrapper]'
      ).length,
      overlay: document.querySelectorAll(
        '[data-radix-dialog-overlay], [data-radix-alert-dialog-overlay], [data-radix-popover-overlay]'
      ).length,
      modal: Boolean(
        document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]')
      )
    })`)
    : null

  // invalid 态：Dialog 保持打开且字段错误留在字段槽。
  let fieldErrorTexts = null
  if (state === 'invalid') {
    fieldErrorTexts = await window.webContents.executeJavaScript(`(() => {
      const dialog = document.querySelector('[role="dialog"]')
      const root = dialog ?? document
      return Array.from(root.querySelectorAll('.yumi-form-message--error'))
        .filter((el) => {
          const rect = el.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0
        })
        .map((el) => (el.textContent || '').trim())
    })()`)
  }
  if (state === 'invalid') {
    interaction.fieldErrors = fieldErrorTexts?.length ?? 0
    interaction.dialog = Boolean(overlayInfo?.dialog)
  }
  if (interaction.ok && stateSteps.length > 0 && overlayInfo && overlayInfo.dialog) {
    interaction.dialog = true
  }
  if (interaction.ok && stateSteps.length > 0 && (overlayInfo?.popper ?? 0) > 0) {
    interaction.popper = true
  }
  if (interaction.ok && stateSteps.length > 0) {
    interaction.overlay = (overlayInfo?.popper ?? 0) + (overlayInfo?.overlay ?? 0)
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

  // 布局诊断（Task 6）：每张验收截图必须记录重叠、固定操作条遮挡、
  // 逐字竖排和页面横滚。检测器口径见下：
  //   pageHorizontalScroll    documentElement.scrollWidth > window.innerWidth
  //   fixedActionContentLeak  存在粘性/固定操作条，且其矩形与页面内容矩形真实相交
  //                           （内容从操作条下方透出/被操作条遮挡）；
  //                           同时检查操作条自有背景是否半透明（表面不闭合）。
  //   verticalGlyphRuns       块级 CJK 文本被拆成逐字一列（每行只是一个字宽），
  //                           或元素计算 writing-mode 为 vertical；报告选择器与文本。
  //   overlaps                两个可见语义元素矩形相交超过阈值（排除父子包含、
  //                           浮层/弹层/通知等刻意覆盖的表面），报告元素对。
  const layout = await window.webContents.executeJavaScript(`(() => {
    const qsa = (sel) => Array.from(document.querySelectorAll(sel))
    const isVisible = (el) => {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') return false
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }
    const rectKey = (el) => {
      const rect = el.getBoundingClientRect()
      return { l: Math.round(rect.left), t: Math.round(rect.top), r: Math.round(rect.right), b: Math.round(rect.bottom) }
    }
    // 元素在屏幕上的「可见」矩形：逐层向 clamping 祖先（overflow 非 visible 的
    // 滚动/裁剪容器，如 .yumi-data-table-wrap、.yumi-app-content）取交。
    // 表格固定内容宽超出局部滚动容器是矩阵认可的「表格只局部滚动」，只裁掉不可见部分，
    // 避免把「溢出内容矩形」误当成与相邻列的真实交叠。上溯到应用壳为止。
    const visibleRect = (el) => {
      const raw = el.getBoundingClientRect()
      let r = {
        l: raw.left, t: raw.top, r: raw.right, b: raw.bottom,
        w: raw.width, h: raw.height
      }
      let node = el.parentElement
      while (node && node !== document.body && !node.classList.contains('yumi-app-shell')) {
        const s = getComputedStyle(node)
        const clips = s.overflowX !== 'visible' || s.overflowY !== 'visible'
        if (clips) {
          const cr = node.getBoundingClientRect()
          r.l = Math.max(r.l, cr.left)
          r.t = Math.max(r.t, cr.top)
          r.r = Math.min(r.r, cr.right)
          r.b = Math.min(r.b, cr.bottom)
          if (r.r <= r.l || r.b <= r.t) {
            r.w = 0
            r.h = 0
            break
          }
        }
        node = node.parentElement
      }
      r.w = Math.max(0, r.r - r.l)
      r.h = Math.max(0, r.b - r.t)
      return r
    }
    const intersects = (a, b) =>
      a.l < b.r - 1 && a.r > b.l + 1 && a.t < b.b - 1 && a.b > b.t + 1
    const intersectArea = (a, b) => {
      const w = Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l))
      const h = Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t))
      return w * h
    }
    const cjk = /[\\u4e00-\\u9fff]/

    // 刻意覆盖内容的浮层表面：Radix Dialog / AlertDialog / Popover 的 overlay、
    // content 与 popper wrapper（含 Pattern 类名表面 .yumi-dialog__overlay /
    // .yumi-dialog__content / .yumi-sheet）、浮在内容上方的通知 toast
    // （.yumi-notification / .yumi-notification-host，position:fixed 且
    // z-index 高于内容区），以及渲染在应用根之外的浮动表面（Radix Portal
    // 挂到 document.body）。这些表面覆盖页面属设计行为，不算内容区布局碰撞；
    // fixedLeak / overlaps 共用该判据。
    const isCoverSurface = (el) => {
      if (
        el.closest(
          '[data-radix-dialog-overlay], [data-radix-alert-dialog-overlay], [data-radix-popover-overlay], [data-radix-dialog-content], [data-radix-alert-dialog-content], [data-radix-popper-content-wrapper], .yumi-dialog__overlay, .yumi-dialog__content, .yumi-sheet, .yumi-notification, .yumi-notification-host'
        ) !== null
      ) {
        return true
      }
      return el.closest('#root, .yumi-app-shell') === null
    }
    // 最近的纵向滚动宿主：粘性操作条的溢出语义归属到它（应用内是 .yumi-app-content，
    // 兜底到页面滚动元素）。
    const nearestScrollHost = (el) => {
      let node = el.parentElement
      while (node && node !== document.body) {
        const s = getComputedStyle(node)
        if (/(auto|scroll)/.test(s.overflowY) || /(auto|scroll)/.test(s.overflow)) return node
        node = node.parentElement
      }
      return document.scrollingElement || document.documentElement
    }

    const pageHorizontalScroll = document.documentElement.scrollWidth > window.innerWidth

    // 固定操作条遮挡（fixedActionContentLeak）：只看「真实缺陷」，避免把正常粘性条误报：
    //   判据 1  条背景半透明 —— 内容从操作条下方透出（表面不闭合）；
    //   判据 2  position:fixed —— 不随滚动容器移动，内容无法滚到其上方；
    //   判据 3  滚动容器滚到底后，仍有内容元素被操作条矩形遮挡 —— 缺少安全留白。
    // 静止截图里内容在操作条下方是粘性条的正常行为（内容可滚动离开），不算泄漏。
    const fixedLeak = (() => {
      const bars = qsa('.yumi-sticky-actions, .yumi-form-actions').filter((el) => {
        if (!isVisible(el)) return false
        const style = getComputedStyle(el)
        return style.position === 'sticky' || style.position === 'fixed'
      })
      const bgAlphaOf = (style) => {
        const raw = style.backgroundColor || ''
        const match = /rgba?\\(([^)]+)\\)/.exec(raw)
        if (!match) return raw === 'transparent' ? 0 : 1
        const parts = match[1].split(',').map((part) => parseFloat(part.trim()))
        return parts.length >= 4 ? parts[3] : 1
      }
      const details = []
      for (const bar of bars) {
        const style = getComputedStyle(bar)
        const barRect = rectKey(bar)
        if (barRect.r - barRect.l <= 2 || barRect.b - barRect.t <= 2) continue
        const className = (bar.className || bar.tagName).toString().slice(0, 80)
        const alpha = bgAlphaOf(style)
        if (alpha < 1) {
          details.push({ bar: className, behindCount: 0, cause: 'translucent-bg:' + (style.backgroundColor || 'transparent') })
          continue
        }
        if (style.position === 'fixed') {
          details.push({ bar: className, behindCount: 0, cause: 'position-fixed' })
          continue
        }
        // 判据 3：滚到底后内容仍被操作条遮挡。滚动是同步布局修改，测完原地恢复。
        const host = nearestScrollHost(bar)
        const prevScrollTop = host.scrollTop
        host.scrollTop = host.scrollHeight - host.clientHeight
        const barNow = rectKey(bar)
        const stillBehind = qsa('section, article, div, table, form, ul, ol, main, li')
          .filter((el) => el !== bar && !bar.contains(el) && el !== host && !isCoverSurface(el) && isVisible(el))
          .filter((el) => {
            const rect = visibleRect(el)
            const area = intersectArea(barNow, rect)
            if (area <= 0) return false
            const ownArea = (rect.r - rect.l) * (rect.b - rect.t)
            if (ownArea <= 0) return false
            // 至少四分之一的元素本体在操作条带内才算「真实停在条后」；
            // 纵贯整块滚动区的容器元素只是下缘越过条带，其本体比例很小，不算。
            return area > 900 && area > ownArea * 0.25
          })
        host.scrollTop = prevScrollTop
        if (stillBehind.length > 0) {
          details.push({ bar: className, behindCount: stillBehind.length, cause: 'occluded-at-max-scroll' })
        }
      }
      return { leaked: details.length > 0, details }
    })()

    const verticalGlyphRuns = (() => {
      const results = []
      const all = qsa('span, strong, b, em, p, div, h1, h2, h3, h4, td, th, li, label, button')
      let considered = 0
      for (const el of all) {
        if (!isVisible(el)) continue
        const text = (el.childNodes.length === 1 ? el.textContent : '') || ''
        if (text.length < 2 || !cjk.test(text)) continue
        const style = getComputedStyle(el)
        if (style.writingMode && style.writingMode.startsWith('vertical')) {
          results.push({ selector: ('.' + String(el.className).trim().split(/\\s+/)[0] || el.tagName).slice(0, 60), text: text.slice(0, 40), cause: 'writing-mode' })
          continue
        }
        if (el.querySelector('span, strong, b, em, p, div, li, td, th')) continue
        const range = document.createRange()
        range.selectNodeContents(el)
        const rects = Array.from(range.getClientRects())
        if (rects.length < 3) continue
        const fontSize = parseFloat(style.fontSize) || 14
        const glyphish = rects.filter((rect) => {
          const w = rect.width
          const h = rect.height
          return w > 0 && h > 0 && h > w * 1.25 && w < fontSize * 1.5
        })
        if (glyphish.length === rects.length) {
          considered += 1
          results.push({ selector: ('.' + String(el.className).trim().split(/\\s+/)[0] || el.tagName).slice(0, 60), text: text.slice(0, 40), lines: rects.length, cause: 'glyph-per-line' })
        }
      }
      return results
    })()

    const overlaps = (() => {
      // 只比较「内容元素」之间的真实交叠；浮层/弹层表面与粘性/固定表面（操作条、
      // 吸附预览等刻意悬浮的表面）不参与，前者归 portal 展开语义，后者由
      // fixedActionContentLeak 单独检查滚动底部的真实遮挡。
      const candidates = qsa('.yumi-page, section, article, main, div, table, ul, ol, form')
        .filter(isVisible)
        .filter((el) => {
          const style = getComputedStyle(el)
          if (style.position === 'sticky' || style.position === 'fixed') return false
          const rect = visibleRect(el)
          return rect.w * rect.h > 4000 && rect.w > 0 && rect.h > 0
        })
        .slice(0, 600)
      const rects = new Map(candidates.map((el) => [el, visibleRect(el)]))
      const sig = (a, b) => {
        const sa = (a.className || a.tagName).slice(0, 50)
        const sb = (b.className || b.tagName).slice(0, 50)
        return [sa, sb].sort().join('|')
      }
      const seen = new Set()
      const results = []
      for (let i = 0; i < candidates.length; i += 1) {
        const a = candidates[i]
        const ra = rects.get(a)
        for (let j = i + 1; j < candidates.length; j += 1) {
          const b = candidates[j]
          const rb = rects.get(b)
          if (!intersects(ra, rb)) continue
          if (a.contains(b) || b.contains(a)) continue
          if (isCoverSurface(a) || isCoverSurface(b)) continue
          const area = intersectArea(ra, rb)
          const minArea = Math.min(
            (ra.r - ra.l) * (ra.b - ra.t),
            (rb.r - rb.l) * (rb.b - rb.t)
          )
          if (area < 900 || area < minArea * 0.15) continue
          const signature = sig(a, b)
          if (seen.has(signature)) continue
          seen.add(signature)
          results.push({ a: signature.split('|')[0], b: signature.split('|')[1], area: Math.round(area) })
          if (results.length >= 12) return results
        }
      }
      return results
    })()

    return {
      pageHorizontalScroll,
      fixedActionContentLeak: fixedLeak.leaked,
      fixedLeakDetails: fixedLeak.details,
      verticalGlyphRuns,
      overlaps
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
    interaction: interaction.ok ? interaction : { ...interaction },
    layout: {
      overlaps: layout.overlaps,
      pageHorizontalScroll: layout.pageHorizontalScroll,
      fixedActionContentLeak: layout.fixedActionContentLeak,
      verticalGlyphRuns: layout.verticalGlyphRuns
    },
    layoutDetails: { fixedLeak: layout.fixedLeakDetails },
    portal: state !== 'default' && overlayInfo
      ? { ok: interaction.ok, dialog: overlayInfo.dialog, overlay: overlayInfo.popper, modal: overlayInfo.modal, popper: overlayInfo.popper }
      : null,
    bodyTextPreview: diagnostics.bodyText
  }
  console.log(`SHOT ${JSON.stringify(report)}`)

  window.destroy()
  // 交互状态没被真实展开时，这张截图不能当作有效基线：删除这次写入的 PNG，
  // 以非 0 退出让 run-capture.sh 重试并最终记为 FAIL（避免伪绿）。
  if (stateSteps.length > 0 && !interaction.ok) {
    try {
      rmSync(outPath, { force: true })
    } catch {
      /* 删除失败不掩盖交互失败本身 */
    }
    console.error(
      `INTERACTION FAIL ${page} ${state}: ${interaction.reason ?? '未知'} seen=${JSON.stringify(interaction.seen)}`
    )
    app.exit(1)
    return
  }
  app.exit(0)
})
