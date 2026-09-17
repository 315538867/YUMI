import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const tokensCss = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
const mainIndex = readFileSync(new URL('../../main/index.ts', import.meta.url), 'utf8')

/** 解析 tokens.css 中的令牌值，`var()` 引用继续追踪其指向的定义。 */
function tokenValue(name: string, css: string = tokensCss): string {
  const match = css.match(new RegExp(`^\\s*${name}\\s*:\\s*([^;]+);`, 'm'))
  if (!match) throw new Error(`未找到令牌 ${name}`)
  const value = match[1].trim()
  const reference = value.match(/^var\((--yumi-[\w-]+)\)$/)
  return reference ? tokenValue(reference[1], css) : value
}

describe('Electron 窗口背景与 renderer canvas 同步', () => {
  // 主进程无法读取 CSS 自定义属性，backgroundColor 是 renderer 就绪前唯一呈现的底色；
  // 若与 --yumi-canvas 不一致，冷启动窗口将与画布出现肉眼可见的落色差异。
  it('BrowserWindow.backgroundColor 等于 --yumi-canvas 解析值', () => {
    const background = mainIndex.match(/backgroundColor:\s*'([^']+)'/)
    expect(background, 'src/main/index.ts 必须显式声明 backgroundColor').not.toBeNull()
    expect(background![1].toLowerCase()).toBe(tokenValue('--yumi-canvas').toLowerCase())
  })

  it('--yumi-canvas 必须由基础色板映射（禁止直写裸值）', () => {
    const canvas = tokensCss.match(/^\s*--yumi-canvas:\s*([^;]+);/m)
    expect(canvas?.[1].trim()).toMatch(/^var\(--yumi-palette-[\w-]+\)$/)
  })
})
