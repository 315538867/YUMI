import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const tokensCss = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 读取 tokens.css 中首次出现的令牌定义（:root 内的单一事实来源）。 */
function rootValue(name: string): string {
  const match = tokensCss.match(new RegExp(`^\\s*${escapeRegExp(name)}\\s*:\\s*([^;]+);`, 'm'))
  if (!match) throw new Error(`未找到令牌 ${name}`)
  return match[1].trim()
}

/** 提取 `[data-density='…']` 层级块的声明体。 */
function densityBlock(density: string): string {
  const match = tokensCss.match(
    new RegExp(`\\[data-density=['"]${density}['"]\\]\\s*\\{([^}]*)\\}`, 'm')
  )
  if (!match) throw new Error(`未找到 [data-density='${density}'] 密度块`)
  return match[1]
}

const blockValue = (block: string, name: string): string | undefined =>
  block.match(new RegExp(`${escapeRegExp(name)}\\s*:\\s*([^;]+);`))?.[1]?.trim()

/** 沿 var() 链解析到最终长度数值（px）。 */
function resolveLength(expression: string): number {
  const reference = expression.match(/^var\((--yumi-[\w-]+)\)$/)
  const next = reference ? rootValue(reference[1]) : expression
  const px = next.match(/^(-?\d+(?:\.\d+)?)px$/)
  if (!px) throw new Error(`无法解析为长度：${expression}`)
  return Number(px[1])
}

const SEMANTIC_ALIASES = [
  '--yumi-control-height',
  '--yumi-field-gap',
  '--yumi-section-gap',
  '--yumi-panel-padding',
  '--yumi-overlay-padding'
] as const

describe('P1 · 三档密度语义映射（任务 3.1）', () => {
  it('exists 舒适档原始尺度 --yumi-size-control-comfortable，且被舒适档消费', () => {
    expect(rootValue('--yumi-size-control-comfortable')).toBe('40px')
    expect(densityBlock('comfortable')).toMatch(/var\(--yumi-size-control-comfortable\)/)
  })

  it('compact/standard/comfortable 三档各自覆盖全部语义别名', () => {
    for (const density of ['compact', 'standard', 'comfortable']) {
      const block = densityBlock(density)
      for (const alias of SEMANTIC_ALIASES) {
        expect(blockValue(block, alias), `${density} 档缺少 ${alias}`).toBeTruthy()
      }
    }
  })

  it('密度块内的别名赋值必须 var() 引用基础尺度，不写裸长度', () => {
    for (const density of ['compact', 'standard', 'comfortable']) {
      for (const alias of SEMANTIC_ALIASES) {
        const value = blockValue(densityBlock(density), alias)
        expect(value, `${density} 档 ${alias} 应为 var() 引用`).toMatch(
          /^var\(--yumi-(?:size|space)-/
        )
      }
    }
  })

  it('标准档与 :root 默认值一致，控件高度随密度单调紧凑化（32 < 36 < 40）', () => {
    for (const alias of SEMANTIC_ALIASES) {
      expect(blockValue(densityBlock('standard'), alias)).toBe(rootValue(alias))
    }
    const control = {
      compact: resolveLength(blockValue(densityBlock('compact'), '--yumi-control-height')!),
      standard: resolveLength(blockValue(densityBlock('standard'), '--yumi-control-height')!),
      comfortable: resolveLength(blockValue(densityBlock('comfortable'), '--yumi-control-height')!)
    }
    expect(control.compact).toBeLessThan(control.standard)
    expect(control.standard).toBeLessThan(control.comfortable)
    expect(control.compact).toBe(32)
    expect(control.standard).toBe(36)
    expect(control.comfortable).toBe(40)
  })

  it('间距类语义别名随密度单调变化：紧凑最小、舒适最大', () => {
    for (const alias of [
      '--yumi-field-gap',
      '--yumi-section-gap',
      '--yumi-panel-padding',
      '--yumi-overlay-padding'
    ]) {
      const values = {
        compact: resolveLength(blockValue(densityBlock('compact'), alias)!),
        standard: resolveLength(blockValue(densityBlock('standard'), alias)!),
        comfortable: resolveLength(blockValue(densityBlock('comfortable'), alias)!)
      }
      expect(values.compact, `${alias} 紧凑档应最小`).toBeLessThan(values.standard)
      expect(values.standard, `${alias} 标准档应居中`).toBeLessThan(values.comfortable)
    }
  })

  it('密度块不得重新定义基础尺度：尺寸/间距/字号原始尺度保持单一事实来源', () => {
    for (const density of ['compact', 'standard', 'comfortable']) {
      const block = densityBlock(density)
      for (const match of block.matchAll(/(--yumi-(?:size|space|font)-[\w-]+)\s*:/g)) {
        expect(match[1], `${density} 档不得定义基础尺度 ${match[1]}`).toBeUndefined()
      }
    }
  })
})
