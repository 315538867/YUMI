import { describe, expect, it } from 'vitest'
import {
  isTestFile,
  listSourceFiles,
  listStyleFiles,
  readSource
} from '../test/ui-baseline/source-scan'

const TOKENS_FILE = 'src/renderer/styles/tokens.css'
const tokensCss = readSource(TOKENS_FILE)
/** tokens.css 已定义的令牌名：局部重定义（如 reduced-motion 覆盖）不算新的领域固有尺寸。 */
const tokenDefinedNames = new Set(
  [...tokensCss.matchAll(/(--yumi-[\w-]+)\s*:/g)].map((match) => match[1])
)

/**
 * 领域固有尺寸窄范围 allowlist：共享尺度无法表达的、由业务固有几何驱动的局部变量。
 * 只接受「数量（无单位整数）」或「比例（%）」两种形态；通用间距/控件尺寸/颜色/断点
 * 一律由共享语义令牌承担，不得进入此清单。
 */
const ALLOWLIST = [
  { name: '--yumi-detail-column-count', value: /^\d+$/, note: '详情视图响应式列数' },
  { name: '--yumi-metric-count', value: /^\d+$/, note: '连续指标带动态列数' },
  { name: '--yumi-order-progress', value: /^\d+(?:\.\d+)?%$/, note: '订单完工进度' },
  { name: '--yumi-workbench-stage-ratio', value: /^\d+(?:\.\d+)?%$/, note: '工作台工序占比' }
] as const

type LocalDef = { file: string; line: number; name: string; value?: string }

function localDefinitions(): LocalDef[] {
  const found: LocalDef[] = []
  for (const file of listStyleFiles()) {
    if (file === TOKENS_FILE) continue
    readSource(file)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .forEach((text, index) => {
        for (const match of text.matchAll(/(--yumi-[\w-]+)\s*:\s*([^;]+);/g)) {
          if (tokenDefinedNames.has(match[1])) continue
          found.push({ file, line: index + 1, name: match[1], value: match[2].trim() })
        }
      })
  }
  for (const file of listSourceFiles()) {
    if (isTestFile(file)) continue
    readSource(file)
      .split('\n')
      .forEach((text, index) => {
        for (const match of text.matchAll(/['"`](--yumi-[\w-]+)['"`]\s*:/g)) {
          if (tokenDefinedNames.has(match[1])) continue
          found.push({ file, line: index + 1, name: match[1] })
        }
      })
  }
  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
}

describe('P1 · 领域固有尺寸窄范围 allowlist（任务 2.9）', () => {
  const allowlisted = new Map<string, (typeof ALLOWLIST)[number]>(
    ALLOWLIST.map((entry) => [entry.name, entry])
  )
  const found = localDefinitions()

  it('现状局部定义与 allowlist 完全对应：实例必须入清单、清单不得残留无定义条目', () => {
    for (const def of found) {
      expect(
        allowlisted.has(def.name),
        `${def.file}:${def.line} 定义了未批准的局部变量 ${def.name}，通用视觉值必须走共享令牌`
      ).toBe(true)
    }
    for (const entry of ALLOWLIST) {
      expect(
        found.some((def) => def.name === entry.name),
        `${entry.name} 已无任何定义，应从 allowlist 移除`
      ).toBe(true)
    }
  })

  it('allowlist 名称窄范围：只含业务固有「数量/比例」命名，不得携带通用视觉尺度词', () => {
    const genericTerm =
      /(?:^|-)(?:color|background|padding|gap|gutter|margin|spacing|height|size|radius|shadow|width|breakpoint)(?:-|$)/
    for (const entry of ALLOWLIST) {
      expect(entry.name, `${entry.name} 含有通用视觉尺度词`).not.toMatch(genericTerm)
    }
  })

  it('CSS 字面值必须匹配窄范围形态：无单位数量或百分比，px 长度与颜色一律拒绝', () => {
    for (const def of found.filter((entry) => entry.value !== undefined)) {
      const entry = allowlisted.get(def.name)
      expect(entry, `${def.name} 未入清单`).toBeTruthy()
      expect(
        def.value,
        `${def.file}:${def.line} 的值 ${def.value} 不属于 ${def.name} 的窄范围形态`
      ).toMatch(entry!.value)
    }
  })

  it('验证护栏不能接受通用颜色、间距、控件尺寸或页面断点伪装成领域固有尺寸', () => {
    for (const value of ['#f4f2ec', 'rgba(0, 0, 0, 0.5)', '12px', '36px', '720px', '1024px']) {
      expect(
        ALLOWLIST.some((entry) => entry.value.test(value)),
        `值 ${value} 不应通过任何窄范围形态`
      ).toBe(false)
    }
    for (const name of [
      '--yumi-card-padding',
      '--yumi-section-gap',
      '--yumi-control-size',
      '--yumi-table-row-height',
      '--yumi-page-breakpoint',
      '--yumi-primary-color'
    ]) {
      expect(allowlisted.has(name), `通用名称 ${name} 不得被 allowlist 接受`).toBe(false)
    }
  })
})
