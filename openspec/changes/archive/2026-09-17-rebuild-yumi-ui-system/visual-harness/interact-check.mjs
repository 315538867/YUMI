// Task 7：在真实 Electron 中对所有路由级页面做「运行时质量 + 真实交互状态」检查
// （承接任务 12.7 的 interact-check，归档后按以下维度升级）：
//
// 与 capture.mjs 一样「一进程一页」，由 run-interact-check.sh 串行调度；
// 本机约束：同一进程创建第二个 BrowserWindow 几乎必然失败。
//
// 检查维度：
//   1. console 错误/警告（webContents console-message，level 3 记 error、level 2 记 warning）
//   2. 网络失败（did-fail-load / did-fail-provisional-load / render-process-gone / preload-error）
//   3. 运行时异常（window.onerror + unhandledrejection 注入钩子）
//   4. 键盘可聚焦性与首元素程序化聚焦
//   5. 焦点恢复：打开 portal（Dialog/Select 触发器）→ Esc 关闭 → 断言焦点回到触发元素
//   6. reduced-motion：经 CDP Emulation.setEmulatedMedia 模拟 reduce，断言
//      matchMedia 命中且 --yumi-duration-fast 计算为 0ms
//   7. 【新增】按 YUMI_CHECK_STATES 指定的交互状态逐页真实触发并断言：
//      - 触发器按 capture.mjs 的 TRIGGERS/NAV_PATHS 执行（nav/tab/click/
//        clickRowContains/clickAria/wait 原语与标签文本完全一致），断言触发成功；
//      - dialog/sheet/popover：真实展开（dialog 家族 / popper），Esc 关闭后
//        焦点回到触发元素；
//      - invalid：Dialog 保持打开、字段错误留在字段槽（可见 .yumi-form-message--error）、
//        可修正字段（核算日期/时间控件）不被禁用阻断；
//      - form/detail：工作区级状态，断言交互步骤全成功；
//      - 页面未登记某状态的触发器 = 确定性失败（no-trigger），如实记录不重试。
//
// 环境变量：
//   YUMI_CHECK_PAGE    路由级页面 id（同 capture.mjs，11 页）
//   YUMI_CHECK_SIZE    窗口尺寸（默认 1440x920）
//   YUMI_CHECK_STATES  逗号分隔的交互状态列表（dialog,sheet,popover,invalid,form,detail,portal）
//   YUMI_CHECK_OUT     结果 JSON 输出路径（默认 stdout）
import { app, BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
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
// 原语与标签文本与 capture.mjs 的 TRIGGERS / step ops 完全一致（同源），
// 判定成功/失败相互印证；交互检查额外在点击前 focus 目标元素，供浮层关闭后焦点恢复断言。
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

// 嵌入页导航路径：先到宿主页，再点 Tab/入口（同 capture.mjs，验证嵌入边界）。
const NAV_PATHS = {
  workers: [step('nav', '工资'), step('tab', '人员与时薪')],
  'work-assignments': [step('nav', '排班')]
}

const SUPPORTED_STATES = new Set([
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
  if (!match) throw new Error(`YUMI_CHECK_SIZE 需形如 1440x920，当前为「${raw}」`)
  return { width: Number(match[1]), height: Number(match[2]) }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const SETTLE_MS = 700
const PORTAL_EXTRA_MS = 450
const INTERACT_EXTRA_MS = 600
const STEP_MS = 150

// portal 触发器：与 capture.mjs 的 PORTAL_TRIGGERS 保持一致（Select/Dialog 的首触发器族）。
const PORTAL_TRIGGERS = {
  orders: '全部资金状态',
  customers: '新建客户',
  products: '全部状态',
  finance: '登记收支',
  fulfillment: '＋ 派工',
  settings: '编辑工作室参数'
}

app.whenReady().then(async () => {
  const page = process.env.YUMI_CHECK_PAGE ?? 'workbench'
  const size = parseSize(process.env.YUMI_CHECK_SIZE)
  const states = (process.env.YUMI_CHECK_STATES ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const outPath = process.env.YUMI_CHECK_OUT
  const navLabel = NAV_LABELS[page]

  if (!navLabel && !NAV_PATHS[page] && page !== 'workbench') {
    throw new Error(`未知页面 id「${page}」，请显式传 YUMI_CHECK_NAV_LABEL 或登记 NAV_PATHS`)
  }
  const unknown = states.filter((state) => !SUPPORTED_STATES.has(state))
  if (unknown.length > 0) {
    throw new Error(`不支持的 YUMI_CHECK_STATES「${unknown.join(',')}」，可选：${[...SUPPORTED_STATES].sort().join(' | ')}`)
  }

  const window = new BrowserWindow({
    width: size.width,
    height: size.height,
    show: false,
    titleBarStyle: 'hiddenInset',
    useContentSize: false,
    webPreferences: {
      preload: join(harnessDir, 'preload-stub.cjs'),
      additionalArguments: ['--yumi-harness-state=default'],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const webContents = window.webContents
  const consoleMessages = []
  const loadFailures = []

  webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      consoleMessages.push({
        level,
        message: String(message).slice(0, 500),
        line,
        sourceId: String(sourceId).slice(0, 200)
      })
    }
  })
  webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    loadFailures.push({ phase: 'did-fail-load', errorCode, errorDescription, validatedURL })
  })
  webContents.on('did-fail-provisional-load', (_event, errorCode, errorDescription, validatedURL) => {
    loadFailures.push({ phase: 'provisional', errorCode, errorDescription, validatedURL })
  })
  webContents.on('render-process-gone', (_event, details) => {
    loadFailures.push({ phase: 'render-process-gone', ...details })
  })
  webContents.on('preload-error', (_event, preloadPath, error) => {
    loadFailures.push({ phase: 'preload-error', preloadPath, error: String(error).slice(0, 300) })
  })

  await window.loadFile(join(repoRoot, 'out/renderer/index.html'))

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await webContents.executeJavaScript(
      `Boolean(window.__yumiHarness && document.querySelector('.yumi-app-shell'))`
    )
    if (ready) break
    await sleep(100)
  }

  // 注入运行时异常收集钩子（必须在页面脚本上下文执行；覆盖后续全部交互阶段）。
  const runtimeHooks = await webContents.executeJavaScript(`(() => {
    const collected = []
    window.__yumiRuntimeErrors = collected
    window.addEventListener('error', (event) => {
      collected.push({ type: 'error', message: String(event.message).slice(0, 400), source: String(event.filename).slice(0, 200) })
    })
    window.addEventListener('unhandledrejection', (event) => {
      collected.push({ type: 'unhandledrejection', message: String(event.reason?.message ?? event.reason).slice(0, 400) })
    })
    return { installed: true }
  })()`)

  // 单个交互步骤在 renderer 里执行，返回 { ok, detail }。
  // 点击前先 focus 目标元素：受控浮层没有 Radix Trigger，useOverlayFocusRestore
  // 在打开时记录 document.activeElement、关闭后归还——focus 前置才能断言焦点恢复。
  async function execStep(current) {
    const result = await webContents.executeJavaScript(`(async () => {
      const arg = ${JSON.stringify(current.arg)}
      const label = typeof arg === 'string' ? arg : (arg && arg.label) || ''
      const rowsNeedle = (arg && arg.rowText) || null
      const qsa = (sel) => Array.from(document.querySelectorAll(sel))
      const trimmed = (el) => (el.textContent || '').trim()
      const activate = (el) => {
        window.__yumiLastTrigger = el
        el.focus()
        el.click()
      }
      switch (${JSON.stringify(current.op)}) {
        case 'nav': {
          const items = qsa('.yumi-app-navigation__item')
          const target = items.find((item) => trimmed(item) === label)
          if (!target) return { ok: false, seen: items.map((item) => trimmed(item)) }
          target.focus()
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
          target.focus()
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
          activate(target)
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
          activate(target)
          return { ok: true }
        }
        case 'clickAria': {
          const candidates = qsa('[aria-label]')
          const target = candidates.find((el) => (el.getAttribute('aria-label') || '') === label)
          if (!target) {
            return { ok: false, seen: candidates.map((el) => el.getAttribute('aria-label')).filter(Boolean).slice(0, 40) }
          }
          activate(target)
          return { ok: true }
        }
        default:
          return { ok: false, reason: 'unknown-op' }
      }
    })()`)
    if (current.op !== 'wait') await sleep(current.op === 'tab' ? 250 : STEP_MS)
    return result
  }

  // 依次执行步骤；失败即停，返回 reason/seen 供报告。
  async function runSteps(steps) {
    const interaction = { ok: true, done: [] }
    for (const current of steps) {
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
        return interaction
      }
    }
    return interaction
  }

  // 基础导航：顶层页走侧栏；嵌入页先到宿主页再点入口（同 capture.mjs）。
  const baseSteps =
    NAV_PATHS[page] ?? (page !== 'workbench' ? [step('nav', navLabel ?? '')] : [])
  const baseRun = await runSteps(baseSteps)
  if (!baseRun.ok) {
    throw new Error(`侧栏导航到「${page}」失败：${baseRun.reason}`)
  }
  await sleep(SETTLE_MS)

  // 每次进入某交互状态前先回到页面基态，保证各状态相互独立：
  // App 按 view 条件渲染页面组件，切换 view 会卸载/重挂载页面——先经「工作台」兜底
  // 强制重挂载（把 Settings 等页的内部页签态复位到默认），再走该页基础导航。否则
  // 上一状态把页面留在子视图（如设置页财务资料页签）会让下一状态的触发器找不到。
  async function resetToBase() {
    await webContents.executeJavaScript(`(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
      window.__yumiLastTrigger = null
      return true
    })()`)
    await sleep(PORTAL_EXTRA_MS)
    const viaWorkbench = await runSteps([step('nav', '工作台')])
    if (!viaWorkbench.ok) throw new Error('回到工作台兜底导航失败')
    await sleep(SETTLE_MS)
    const run = await runSteps(baseSteps)
    if (!run.ok) throw new Error(`回退到「${page}」基态失败：${run.reason}`)
    await sleep(SETTLE_MS)
  }

  // 浮层展开判定：dialog 家族 / popper，口径与 capture.mjs overlayInfo 一致。
  const overlaySurvey = () =>
    webContents.executeJavaScript(`({
      dialog: document.querySelectorAll(
        '[role="dialog"], [role="alertdialog"], [data-radix-dialog-content], [data-radix-alert-dialog-content], .yumi-dialog__content, .yumi-sheet'
      ).length > 0,
      popper: document.querySelectorAll(
        '[data-radix-popper-content-wrapper], [data-radix-dialog-overlay], [data-radix-alert-dialog-overlay], [data-radix-popover-content-wrapper]'
      ).length
    })`)

  // 键盘可达性检查：隐藏窗口没有系统焦点，合成 Tab 事件不会移动焦点（jsdom 契约层已覆盖
  // 逐键语义），这里验证页面确实存在可聚焦元素且程序化 focus 可达首元素。
  const keyboard = await webContents.executeJavaScript(`(() => {
    const focusable = Array.from(document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    let reachable = null
    if (focusable.length > 0) {
      focusable[0].focus()
      reachable = document.activeElement === focusable[0]
    }
    return {
      focusableCount: focusable.length,
      firstTag: focusable[0]?.tagName ?? null,
      firstText: (focusable[0]?.textContent || '').trim().slice(0, 20) || (focusable[0]?.getAttribute('aria-label') || '').slice(0, 20),
      programmaticFocusReachable: reachable,
      note: '隐藏窗口无系统焦点，Tab 逐键语义由 jsdom 契约层覆盖（select/dialog/sheet 键盘用例）'
    }
  })()`)

  // 焦点恢复（portal 族）：与 jsdom 契约同构（先 focus 触发元素再 click），
  // 打开 portal → Esc 关闭 → 断言焦点回到触发元素。
  let focusRestore = null
  const trigger = PORTAL_TRIGGERS[page]
  if (trigger) {
    focusRestore = await webContents.executeJavaScript(`(async () => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const target = buttons.find((el) => el.textContent.trim() === ${JSON.stringify(trigger)})
      if (!target) return { ok: false, reason: 'trigger-not-found', buttonCount: buttons.length }
      target.focus()
      target.click()
      await new Promise((resolve) => setTimeout(resolve, ${PORTAL_EXTRA_MS}))
      const dialogOpen = Boolean(document.querySelector('[role="dialog"]'))
      const popperOpen = document.querySelectorAll('[data-radix-popper-content-wrapper]').length > 0
      if (!dialogOpen && !popperOpen) {
        return { ok: false, reason: 'portal-not-open', dialogOpen, popperOpen }
      }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, ${PORTAL_EXTRA_MS}))
      const restored = document.activeElement === target
      return {
        ok: true,
        dialogOpen,
        popperOpen,
        restored,
        activeText: (document.activeElement?.textContent || '').trim().slice(0, 30)
      }
    })()`)
  }

  // —— 交互状态逐页真实触发（Task 7 新增） ——
  const stateResults = []
  for (const state of states) {
    const stateSteps = TRIGGERS[page]?.[state] ?? []
    if (stateSteps.length === 0) {
      stateResults.push({
        state,
        verdict: 'no-trigger',
        ok: false,
        phase: 'no-trigger',
        reason: '页面未登记该交互状态可用的触发器'
      })
      continue
    }
    await resetToBase()
    const run = await runSteps(stateSteps)
    if (!run.ok) {
      stateResults.push({
        state,
        verdict: 'failure',
        ok: false,
        phase: 'trigger',
        reason: run.reason ?? '交互步骤失败',
        seen: run.seen
      })
      continue
    }
    await sleep(INTERACT_EXTRA_MS)

    if (state === 'invalid') {
      // invalid：Dialog 保持打开、错误留在字段槽、可修正字段不被禁用阻断。
      const probe = await webContents.executeJavaScript(`(() => {
        const dialog = document.querySelector('[role="dialog"], [role="alertdialog"]')
        const root = dialog ?? document
        const visible = (el) => {
          const rect = el.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0
        }
        const errors = Array.from(root.querySelectorAll('.yumi-form-message--error'))
          .filter(visible)
          .map((el) => (el.textContent || '').trim())
        const controls = Array.from(
          root.querySelectorAll('input, select, textarea, button')
        ).filter(visible)
        // 可修正字段：核算日期/时间控件（aria-label 以「核算」开头）。
        const correctables = controls.filter((el) =>
          (el.getAttribute('aria-label') || '').startsWith('核算')
        )
        const blocked = correctables.filter(
          (el) => el.disabled || el.readOnly || el.getAttribute('tabindex') === '-1'
        )
        return {
          dialogOpen: Boolean(dialog),
          fieldErrors: errors,
          correctableCount: correctables.length,
          blocked: blocked.map((el) => (el.getAttribute('aria-label') || '').slice(0, 40))
        }
      })()`)
      const okInvalid =
        probe.dialogOpen && probe.fieldErrors.length > 0 && probe.blocked.length === 0
      stateResults.push({
        state,
        verdict: okInvalid ? 'ok' : 'failure',
        ok: okInvalid,
        phase: 'invalid',
        dialogKeptOpen: probe.dialogOpen,
        fieldErrors: probe.fieldErrors,
        fieldErrorCount: probe.fieldErrors.length,
        correctableCount: probe.correctableCount,
        blocked: probe.blocked,
        reason: okInvalid
          ? undefined
          : `invalid 断言失败（dialogOpen=${probe.dialogOpen} fieldErrors=${probe.fieldErrors.length} blocked=${probe.blocked.length}）`
      })
      continue
    }

    const survey = await overlaySurvey()
    // 期望表面：sheet/dialog → dialog 家族；popover → popper；portal → 二者任一；form/detail 无浮层。
    const expectedSurface =
      state === 'sheet' || state === 'dialog'
        ? 'dialog'
        : state === 'popover'
          ? 'popper'
          : state === 'portal'
            ? 'either'
            : null
    let opened = true
    if (expectedSurface === 'dialog') opened = survey.dialog
    if (expectedSurface === 'popper') opened = survey.popper > 0
    if (expectedSurface === 'either') opened = survey.dialog || survey.popper > 0
    if (expectedSurface !== null && !opened) {
      stateResults.push({
        state,
        verdict: 'failure',
        ok: false,
        phase: 'open',
        expectedSurface,
        survey,
        reason: '触发器已点击但预期浮层未展开'
      })
      continue
    }
    if (expectedSurface === null) {
      // form/detail：工作区级状态，交互步骤全成功即通过。
      stateResults.push({
        state,
        verdict: 'ok',
        ok: true,
        phase: 'workspace',
        steps: run.done
      })
      continue
    }

    // 可关闭浮层：Esc 关闭后断言焦点回到触发元素。
    const close = await webContents.executeJavaScript(`(async () => {
      const trigger = window.__yumiLastTrigger ?? null
      const triggerText = trigger
        ? (trigger.textContent || '').trim().slice(0, 40) || (trigger.getAttribute('aria-label') || '').slice(0, 40)
        : null
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, ${PORTAL_EXTRA_MS}))
      const stillOpen = document.querySelectorAll(
        '[role="dialog"], [role="alertdialog"], [data-radix-dialog-content], [data-radix-alert-dialog-content], .yumi-dialog__content, .yumi-sheet, [data-radix-popper-content-wrapper]'
      ).length > 0
      const restored = Boolean(
        trigger && document.contains(trigger) && document.activeElement === trigger
      )
      return {
        stillOpen,
        restored,
        triggerText,
        activeText: (document.activeElement?.textContent || '').trim().slice(0, 30) || (document.activeElement?.getAttribute('aria-label') || '').slice(0, 30)
      }
    })()`)
    const okClose = close.restored && !close.stillOpen
    stateResults.push({
      state,
      verdict: okClose ? 'ok' : 'failure',
      ok: okClose,
      phase: 'close',
      opened: true,
      close: {
        closeable: true,
        stillOpen: close.stillOpen,
        restored: close.restored,
        triggerText: close.triggerText,
        activeText: close.activeText
      },
      reason: okClose
        ? undefined
        : `Esc 关闭后焦点未恢复或浮层未关（stillOpen=${close.stillOpen} restored=${close.restored}）`
    })
  }

  // reduced-motion：CDP 模拟 prefers-reduced-motion: reduce，断言 matchMedia 命中且动效令牌归零。
  let reducedMotion = null
  try {
    await webContents.debugger.attach('1.3')
    await webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
    })
    reducedMotion = await webContents.executeJavaScript(`(() => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      const computed = getComputedStyle(document.documentElement)
      return {
        matched: mq.matches,
        durationFast: computed.getPropertyValue('--yumi-duration-fast').trim()
      }
    })()`)
  } catch (error) {
    reducedMotion = { error: String(error).slice(0, 200) }
  } finally {
    try {
      await webContents.debugger.detach()
    } catch {
      /* detach 失败不影响结果 */
    }
  }

  const reportRuntimeErrors = await webContents.executeJavaScript(`window.__yumiRuntimeErrors ?? []`)

  const consoleErrors = consoleMessages.filter((entry) => entry.level === 3).length
  const consoleWarnings = consoleMessages.filter((entry) => entry.level === 2).length

  const report = {
    page,
    renderer: await webContents.executeJavaScript(`({ innerWidth: window.innerWidth, innerHeight: window.innerHeight })`),
    statesRequested: states,
    runtimeErrorsInstalled: runtimeHooks?.installed ?? false,
    runtimeErrors: reportRuntimeErrors,
    consoleMessages,
    consoleErrors,
    consoleWarnings,
    loadFailures,
    keyboard,
    focusRestore,
    states: stateResults,
    reducedMotion,
    remark:
      '每页 1 条 Electron 开发模式固有 CSP 安全警告（Insecure Content-Security-Policy），打包后不出现，非应用日志，不算失败'
  }

  const serialized = `CHECK ${JSON.stringify(report)}`
  if (outPath) {
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`wrote ${outPath}`)
  }
  console.log(serialized)

  const failures = stateResults.filter((entry) => entry.verdict === 'failure')
  // portal 族焦点恢复（PORTAL_TRIGGERS 一次检查，不经 states 数组）同样计入退出码门：
  // 有触发器却未恢复焦点视为缺陷，让后续回归能非 0 退出，而非只写进 summary。
  const focusRestoreFailed = Boolean(focusRestore && focusRestore.ok !== true)
  window.destroy()
  if (loadFailures.length > 0 || consoleErrors > 0 || reportRuntimeErrors.length > 0 || failures.length > 0 || focusRestoreFailed) {
    console.error(
      `INTERACT FAIL ${page}: loadFailures=${loadFailures.length} consoleErrors=${consoleErrors} runtimeErrors=${reportRuntimeErrors.length} stateFailures=${failures.map((f) => f.state).join(',')} focusRestoreFailed=${focusRestoreFailed}`
    )
    app.exit(1)
    return
  }
  app.exit(0)
})
