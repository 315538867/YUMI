import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const baseCss = readFileSync(resolve(__dirname, 'base.css'), 'utf8')

/** 取出 `@layer foundations { ... }` 块体，按花括号配平。 */
function foundationsBlock(css: string): string | null {
  const marker = '@layer foundations'
  const start = css.indexOf(marker)
  if (start === -1) return null
  const open = css.indexOf('{', start)
  if (open === -1) return null
  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    else if (css[index] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, index)
    }
  }
  return null
}

describe('P1 · base 迁入 Foundations（任务 2.5）', () => {
  it('base.css 顶层以 @layer foundations 承载全部基础规则', () => {
    const block = foundationsBlock(baseCss)
    expect(block, 'base.css 缺少 @layer foundations 块').toBeTruthy()
    expect(block).toContain(':root')
    expect(block).toContain('box-sizing: border-box')
    expect(block).toContain('body')
    expect(block).toContain('::selection')
  })

  it('页面背景契约：根与 body 使用 --yumi-canvas，不写裸色值', () => {
    const block = foundationsBlock(baseCss) ?? ''
    expect(block).toMatch(/background:\s*var\(--yumi-canvas\)/)
    expect(block).not.toMatch(/background:\s*#[0-9a-f]{3,8}\b/i)
  })

  it('字体契约：字体族与字号、行高统一走令牌，不残留裸字号', () => {
    const block = foundationsBlock(baseCss) ?? ''
    expect(block).toMatch(/font-family:\s*var\(--yumi-font-sans\)/)
    expect(block).toMatch(/font-size:\s*var\(--yumi-font-size-md\)/)
    expect(block).toMatch(/line-height:\s*var\(--yumi-line-height-normal\)/)
    expect(block).not.toMatch(/font-size:\s*\d+px/)
    expect(block).not.toMatch(/line-height:\s*\d[\d.]*/)
  })

  it('焦点轮廓契约：可聚焦元素统一使用 --yumi-focus-ring', () => {
    const block = foundationsBlock(baseCss) ?? ''
    expect(block).toMatch(/:focus-visible/)
    expect(block).toMatch(/box-shadow:\s*var\(--yumi-focus-ring\)/)
  })

  it('数字对齐契约：全库金额与数据使用 tabular-nums', () => {
    const block = foundationsBlock(baseCss) ?? ''
    expect(block).toContain('font-variant-numeric: tabular-nums')
  })

  it('reduced-motion 契约随迁入 Foundations：系统偏好开启时状态过渡缩短到近乎即时', () => {
    const block = foundationsBlock(baseCss) ?? ''
    expect(block).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*--yumi-duration-fast\s*:\s*0ms/
    )
  })
})
