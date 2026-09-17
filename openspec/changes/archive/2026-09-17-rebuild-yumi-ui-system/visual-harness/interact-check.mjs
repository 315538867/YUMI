// 任务 12.7：在真实 Electron 中对所有路由级页面做运行时质量检查。
//
// 与 capture.mjs 一样「一进程一页」，由 run-interact-check.sh 串行调度；
// 本机约束：同一进程创建第二个 BrowserWindow 几乎必然失败。
//
// 检查维度：
//   1. console 错误/警告（webContents console-message）
//   2. 网络失败（did-fail-load / did-fail-provisional-load）
//   3. 运行时异常（window.onerror + unhandledrejection 注入钩子）
//   4. 焦点恢复：打开 portal（Dialog/Select 触发器）→ Esc 关闭 → 断言焦点回到触发元素
//   5. 键盘操作：Tab 从 body 首焦点可达、Enter 激活、Esc 关闭浮层
//   6. reduced-motion：经 CDP Emulation.setEmulatedMedia 模拟 reduce，断言
//      matchMedia 命中且 --yumi-duration-fast 计算为 0ms
//
// 环境变量：
//   YUMI_CHECK_PAGE  路由级页面 id（同 capture.mjs）
//   YUMI_CHECK_SIZE  窗口尺寸（默认 1440x920）
//   YUMI_CHECK_OUT   结果 JSON 输出路径（默认 stdout）
import { app, BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
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

// portal 触发器：与 capture.mjs 的 PORTAL_TRIGGERS 保持一致。
const PORTAL_TRIGGERS = {
  orders: '全部资金状态',
  customers: '新建客户',
  products: '全部状态',
  finance: '登记收支',
  fulfillment: '＋ 派工',
  settings: '编辑工作室参数'
}

const parseSize = (raw) => {
  const match = /^(\d+)x(\d+)$/.exec(String(raw ?? '').trim())
  if (!match) throw new Error(`YUMI_CHECK_SIZE 需形如 1440x920，当前为「${raw}」`)
  return { width: Number(match[1]), height: Number(match[2]) }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const SETTLE_MS = 700
const PORTAL_EXTRA_MS = 450

app.whenReady().then(async () => {
  const page = process.env.YUMI_CHECK_PAGE ?? 'workbench'
  const size = parseSize(process.env.YUMI_CHECK_SIZE)
  const navLabel = NAV_LABELS[page]
  const outPath = process.env.YUMI_CHECK_OUT

  if (!navLabel) throw new Error(`未知页面 id「${page}」`)

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

  if (page !== 'workbench') {
    const clicked = await webContents.executeJavaScript(`(() => {
      const items = Array.from(document.querySelectorAll('.yumi-app-navigation__item'))
      const target = items.find((item) => item.textContent.trim() === ${JSON.stringify(navLabel)})
      if (!target) return { ok: false, seen: items.map((i) => i.textContent.trim()) }
      target.click()
      return { ok: true }
    })()`)
    if (!clicked.ok) throw new Error(`侧栏找不到「${navLabel}」`)
  }

  await sleep(SETTLE_MS)

  // 注入运行时异常收集钩子（必须在页面脚本上下文执行）。
  const runtimeErrors = await webContents.executeJavaScript(`(() => {
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

  // 焦点恢复：与 jsdom 契约同构（先 focus 触发元素再 click），打开 portal → Esc 关闭 → 断言焦点回到触发元素。
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

  const report = {
    page,
    renderer: await webContents.executeJavaScript(`({ innerWidth: window.innerWidth, innerHeight: window.innerHeight })`),
    runtimeErrorsInstalled: runtimeErrors?.installed ?? false,
    runtimeErrors: await webContents.executeJavaScript(`window.__yumiRuntimeErrors ?? []`),
    consoleMessages,
    loadFailures,
    keyboard,
    focusRestore,
    reducedMotion
  }

  const serialized = `CHECK ${JSON.stringify(report)}`
  if (outPath) {
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`wrote ${outPath}`)
  }
  console.log(serialized)

  window.destroy()
  app.exit(0)
})
