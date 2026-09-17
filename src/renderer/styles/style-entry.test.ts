import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(__dirname, 'index.css'), 'utf8')

describe('P1 · 唯一样式入口固定层顺序（任务 2.3）', () => {
  it('index.css 以 @layer 语句声明 reset/vendor/foundations/primitives/composites/patterns/domains/utilities 固定顺序', () => {
    const statement = css.match(/@layer\s+([^;{]+);/)?.[1]
    expect(statement, 'index.css 缺少 @layer 顺序语句').toBeTruthy()
    const layers = (statement ?? '').split(',').map((name) => name.trim())
    expect(layers).toEqual([
      'reset',
      'vendor',
      'foundations',
      'primitives',
      'composites',
      'patterns',
      'domains',
      'utilities'
    ])
  })

  it('层级顺序语句位于文件顶部并先于导入与规则，保证固定覆盖顺序不被旁路', () => {
    const firstNonComment = css.replace(/\/\*[\s\S]*?\*\//g, '').trimStart()
    expect(firstNonComment.startsWith('@layer')).toBe(true)
  })
})

describe('P1 · 第三方样式进入 vendor 层（任务 2.4）', () => {
  it('index.css 在层级顺序语句之后通过 @import layer(vendor) 引入 DayPicker 样式', () => {
    expect(css).toMatch(
      /@layer\s+reset,\s*vendor,\s*foundations,\s*primitives,\s*composites,\s*patterns,\s*domains,\s*utilities\s*;(?:\s*\/\*[\s\S]*?\*\/)?\s*@import\s+['"]@daypicker\/react\/style\.css['"]\s+layer\(vendor\)\s*;/
    )
  })

  it('main.tsx 不再独立导入第三方样式，第三方样式统一由唯一入口的 vendor 层加载', () => {
    const main = readFileSync(resolve(__dirname, '../main.tsx'), 'utf8')
    expect(main).not.toContain('@daypicker/react/style.css')
    expect(main).toContain("'./styles/index.css'")
  })
})

describe('P1 · 本地样式由唯一入口聚合（任务 2.7）', () => {
  it('index.css 按 tokens/base/primitives/composites/patterns 顺序 @import 全部本地样式', () => {
    const imports = [
      ...css.matchAll(
        /@import\s+['"]\.\/(tokens|base|primitives|composites|patterns)\.css['"]\s*(?:layer\([\w-]+\))?\s*;/g
      )
    ].map((match) => match[1])
    expect(imports).toEqual(['tokens', 'base', 'primitives', 'composites', 'patterns'])
  })

  it('组件样式按层落位：primitives/composites/patterns 分别以 layer(primitives)/layer(composites)/layer(patterns) 载入', () => {
    expect(css).toMatch(/@import\s+['"]\.\/primitives\.css['"]\s+layer\(primitives\)\s*;/)
    expect(css).toMatch(/@import\s+['"]\.\/composites\.css['"]\s+layer\(composites\)\s*;/)
    expect(css).toMatch(/@import\s+['"]\.\/patterns\.css['"]\s+layer\(patterns\)\s*;/)
  })

  it('tokens 必须显式 layer(foundations) 入层：无层优先级会压过 base 的 reduced-motion 覆盖（12.7 终验回归）', () => {
    expect(css).toMatch(/@import\s+['"]\.\/tokens\.css['"]\s+layer\(foundations\)\s*;/)
    expect(css).toMatch(/@import\s+['"]\.\/base\.css['"]\s*;/)
  })

  it('main.tsx 不再独立导入本地样式，只保留 index.css 一个样式入口', () => {
    const main = readFileSync(resolve(__dirname, '../main.tsx'), 'utf8')
    expect(main).toContain("'./styles/index.css'")
    expect(main).not.toContain("'./styles/tokens.css'")
    expect(main).not.toContain("'./styles/base.css'")
    expect(main).not.toContain("'./styles/components.css'")
    expect(main).not.toContain("'./styles/primitives.css'")
    expect(main).not.toContain("'./styles/composites.css'")
    expect(main).not.toContain("'./styles/pages.css'")
  })
})
