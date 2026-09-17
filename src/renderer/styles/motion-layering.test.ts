import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const tokensCss = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8')
const componentsCss = `${readFileSync(resolve(__dirname, 'primitives.css'), 'utf8')}\n${readFileSync(
  resolve(__dirname, 'composites.css'),
  'utf8'
)}`
const patternsCss = readFileSync(resolve(__dirname, 'patterns.css'), 'utf8')
const baseCss = readFileSync(resolve(__dirname, 'base.css'), 'utf8')

const tokenNames = [...tokensCss.matchAll(/(--yumi-[\w-]+)\s*:/g)].map((match) => match[1])

const tokenValue = (token: string) =>
  tokensCss
    .match(
      new RegExp(`^\\s*${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*([^;]+);`, 'm')
    )?.[1]
    ?.trim()

describe('P1 · 动效与层级令牌（任务 2.2）', () => {
  it('动效尺度齐备：过渡时长与缓动曲线以令牌输出', () => {
    expect(
      tokenNames.some((name) => name.startsWith('--yumi-duration-')),
      '缺时长尺度'
    ).toBe(true)
    expect(
      tokenNames.some((name) => name.startsWith('--yumi-easing-')),
      '缺缓动尺度'
    ).toBe(true)
    expect(tokenValue('--yumi-duration-fast')).toMatch(/^\d+(?:ms|s)$/)
    expect(tokenValue('--yumi-easing-standard')).toMatch(/^(?:ease|linear|cubic-bezier)/)
  })

  it('命名层级令牌覆盖页面、sticky、菜单/弹出层、遮罩、对话框/抽屉与通知六类层', () => {
    for (const layer of [
      '--yumi-z-page',
      '--yumi-z-sticky',
      '--yumi-z-menu',
      '--yumi-z-overlay',
      '--yumi-z-dialog',
      '--yumi-z-toast'
    ]) {
      expect(tokenNames, `${layer} 层级令牌缺失`).toContain(layer)
    }
  })

  it('层级保持稳定前后关系，通知位于最上且页面内容不会越过遮罩与对话框', () => {
    const z = (name: string) => Number(tokenValue(name))
    expect(z('--yumi-z-page')).toBeLessThan(z('--yumi-z-sticky'))
    expect(z('--yumi-z-sticky')).toBeLessThan(z('--yumi-z-overlay'))
    expect(z('--yumi-z-overlay')).toBeLessThan(z('--yumi-z-dialog'))
    expect(z('--yumi-z-dialog')).toBeLessThan(z('--yumi-z-menu'))
    expect(z('--yumi-z-menu')).toBeLessThan(z('--yumi-z-toast'))
  })

  it('reduced-motion 契约：系统偏好开启时把状态过渡缩短到近乎即时', () => {
    const block = baseCss.match(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/
    )?.[1]
    expect(block, 'Foundations 缺少 prefers-reduced-motion 减速块').toBeTruthy()
    expect(block).toMatch(/--yumi-duration-fast\s*:\s*0ms/)
  })

  it('组件与页面样式通过令牌消费层级与动效，不残留裸 z-index 与裸时长', () => {
    for (const css of [componentsCss, patternsCss]) {
      expect(css).not.toMatch(/z-index:\s*\d+/)
      expect(css).not.toMatch(/\d+ms/)
    }
  })
})
