// 测量单个验收窗口实际对应的 renderer viewport。
//
// 运行方式（必须带 --no-sandbox 与 YUMI_PROBE_SIZE）：
//   YUMI_PROBE_SIZE=1100x720 node_modules/.bin/electron --no-sandbox \
//     openspec/changes/rebuild-yumi-ui-system/scripts/probe-viewport.mjs
//
// 本机 Electron 的 renderer 进程偶发 Mach port rendezvous bootstrap 失败（窗口 ERR_FAILED），
// 且一个进程内创建第二个 BrowserWindow 几乎必然失败；因此这里一个进程只测一档尺寸，
// 由调用方（run-viewport-probe.sh）负责三档尺寸与失败重试。
import { app, BrowserWindow, screen } from 'electron'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

app.commandLine.appendSwitch('no-sandbox')

const parseSize = () => {
  const raw = process.env.YUMI_PROBE_SIZE ?? ''
  const match = /^(\d+)x(\d+)$/.exec(raw.trim())
  if (!match) {
    throw new Error(`YUMI_PROBE_SIZE 需形如 1100x720，当前为「${raw}」`)
  }
  return { width: Number(match[1]), height: Number(match[2]) }
}

const FRAME = { titleBarStyle: 'hiddenInset', useContentSize: false }

const METRICS = `({
  innerWidth: window.innerWidth,
  innerHeight: window.innerHeight,
  outerWidth: window.outerWidth,
  outerHeight: window.outerHeight,
  devicePixelRatio: window.devicePixelRatio
})`

const probeDir = mkdtempSync(join(tmpdir(), 'yumi-viewport-probe-'))
const probeFile = join(probeDir, 'probe.html')
writeFileSync(
  probeFile,
  '<!doctype html><meta charset="utf-8"><title>probe</title><body style="margin:0">probe</body>'
)

app.whenReady().then(async () => {
  const { width, height } = parseSize()
  const display = screen.getPrimaryDisplay()
  const window = new BrowserWindow({
    width,
    height,
    show: false,
    ...FRAME,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })

  await window.loadFile(probeFile)
  const renderer = await window.webContents.executeJavaScript(METRICS)
  const contentBounds = window.getContentBounds()

  console.log(
    JSON.stringify(
      {
        platform: process.platform,
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        primaryDisplay: {
          size: display.size,
          workAreaSize: display.workAreaSize,
          scaleFactor: display.scaleFactor
        },
        outerRequested: { width, height },
        contentBounds,
        renderer
      },
      null,
      2
    )
  )

  window.destroy()
  app.exit(0)
})
