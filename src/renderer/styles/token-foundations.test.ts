import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8')

const tokenNames = [...css.matchAll(/(--yumi-[\w-]+)\s*:/g)].map((match) => match[1])

const tokenValue = (token: string) => {
  const match = css.match(
    new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*([^;]+);`)
  )
  return match?.[1]?.trim()
}

describe('P1 · 令牌基础尺度与语义别名（任务 2.1）', () => {
  it('六类基础尺度齐备：色板、排版、间距、尺寸、圆角、阴影', () => {
    const scales = {
      色板: tokenNames.some((name) => name.startsWith('--yumi-palette-')),
      字号: tokenNames.some((name) => name.startsWith('--yumi-font-size-')),
      行高: tokenNames.some((name) => name.startsWith('--yumi-line-height-')),
      字重: tokenNames.some((name) => name.startsWith('--yumi-font-weight-')),
      间距: tokenNames.some((name) => name.startsWith('--yumi-space-')),
      尺寸: tokenNames.some((name) => name.startsWith('--yumi-size-')),
      圆角: tokenNames.some((name) => name.startsWith('--yumi-radius-')),
      阴影: tokenNames.some((name) => name.startsWith('--yumi-shadow-'))
    }
    expect(scales, JSON.stringify(scales)).toEqual({
      色板: true,
      字号: true,
      行高: true,
      字重: true,
      间距: true,
      尺寸: true,
      圆角: true,
      阴影: true
    })
  })

  it('语义别名清单齐备：控制件高度、字段间距、区块间距、面板内边距、浮层内边距', () => {
    for (const alias of [
      '--yumi-control-height',
      '--yumi-field-gap',
      '--yumi-section-gap',
      '--yumi-panel-padding',
      '--yumi-overlay-padding'
    ]) {
      expect(tokenNames, `${alias} 语义别名缺失`).toContain(alias)
    }
  })

  it('语义别名通过 var() 引用基础尺度，不直接写裸长度', () => {
    for (const alias of [
      '--yumi-control-height',
      '--yumi-field-gap',
      '--yumi-section-gap',
      '--yumi-panel-padding',
      '--yumi-overlay-padding'
    ]) {
      expect(tokenValue(alias), `${alias} 应为 var() 引用`).toMatch(/^var\(--yumi-/)
    }
  })

  it('尺寸尺度被语义别名消费，不出现新的悬空令牌', () => {
    const sizeTokens = tokenNames.filter((name) => name.startsWith('--yumi-size-'))
    expect(sizeTokens.length).toBeGreaterThan(0)
    for (const scale of sizeTokens) {
      expect(css, `${scale} 未被任何语义别名引用`).toMatch(new RegExp(`var\\(${scale}\\)`))
    }
  })
})
