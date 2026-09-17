import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const measurements = JSON.parse(
  readFileSync(
    new URL(
      '../../../../openspec/changes/archive/2026-09-17-rebuild-yumi-ui-system/baselines/viewport-measurements.json',
      import.meta.url
    ),
    'utf8'
  )
) as {
  measurements: Array<{
    label: string
    outerRequested: { width: number; height: number }
    contentBounds: { width: number; height: number }
    renderer: {
      innerWidth: number
      innerHeight: number
      outerWidth: number
      outerHeight: number
      devicePixelRatio: number
    }
  }>
}

const mainSource = readFileSync(new URL('../../../main/index.ts', import.meta.url), 'utf8')

describe('验收窗口与 renderer viewport 对齐', () => {
  it('四档验收尺寸的 renderer viewport 等于窗口外层尺寸', () => {
    expect(measurements.measurements.map((entry) => entry.label)).toEqual([
      'min',
      'standard',
      'default',
      'wide'
    ])

    for (const { label, outerRequested, contentBounds, renderer } of measurements.measurements) {
      expect(renderer.innerWidth, `${label} 的 viewport 宽度`).toBe(outerRequested.width)
      expect(renderer.innerHeight, `${label} 的 viewport 高度`).toBe(outerRequested.height)
      expect(contentBounds.width, `${label} 的内容区宽度`).toBe(outerRequested.width)
      expect(contentBounds.height, `${label} 的内容区高度`).toBe(outerRequested.height)
    }
  })

  it('四档验收尺寸都不小于窗口下限', () => {
    const minWidth = 1100
    const minHeight = 720
    for (const { label, outerRequested } of measurements.measurements) {
      expect(outerRequested.width, `${label} 宽度不得低于窗口下限`).toBeGreaterThanOrEqual(minWidth)
      expect(outerRequested.height, `${label} 高度不得低于窗口下限`).toBeGreaterThanOrEqual(
        minHeight
      )
    }
  })

  it('主进程窗口保持让「外层尺寸等于 viewport」成立的契约', () => {
    // hiddenInset 把标题栏并入内容区，因此 macOS 上不会扣掉标题栏高度；
    // 一旦改成默认 titleBarStyle，上面记录的 viewport 映射就会失效。
    expect(mainSource).toMatch(/titleBarStyle:\s*'hiddenInset'/)
    expect(mainSource).not.toMatch(/useContentSize:\s*true/)

    const requested = /new BrowserWindow\(\{([\s\S]*?)\n\s*\}\)/.exec(mainSource)?.[1] ?? ''
    const numberOption = (name: string) =>
      Number(new RegExp(`${name}:\\s*(\\d+)`).exec(requested)?.[1] ?? NaN)

    expect(numberOption('width'), '默认窗口宽度').toBe(1440)
    expect(numberOption('height'), '默认窗口高度').toBe(920)
    expect(numberOption('minWidth'), '窗口最小宽度').toBe(1100)
    expect(numberOption('minHeight'), '窗口最小高度').toBe(720)
  })
})
