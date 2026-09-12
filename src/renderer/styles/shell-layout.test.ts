import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pagesCss = readFileSync(new URL('./pages.css', import.meta.url), 'utf8')
const baseCss = readFileSync(new URL('./base.css', import.meta.url), 'utf8')

function rule(selector: string, css = pagesCss) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'm'))
  if (!match) throw new Error(`未找到 ${selector} 规则`)
  return match[1]
}

describe('桌面壳层滚动边界', () => {
  it('锁定窗口滚动，让侧栏与顶部命令栏固定在壳层内', () => {
    expect(baseCss).toMatch(/html,\s*body,\s*#root\s*\{[^}]*height:\s*100%[^}]*overflow:\s*hidden/s)
    expect(rule('.yumi-app-shell')).toMatch(/height:\s*100dvh/)
    expect(rule('.yumi-app-shell')).toMatch(/overflow:\s*hidden/)
    expect(rule('.yumi-app-workspace')).toMatch(/grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)/)
  })

  it('只允许导航和右侧内容在各自容器内滚动', () => {
    expect(rule('.yumi-app-sidebar')).toMatch(/overflow:\s*hidden/)
    expect(rule('.yumi-app-navigation')).toMatch(/overflow-y:\s*auto/)
    expect(rule('.yumi-app-content')).toMatch(/overflow-y:\s*auto/)
  })

  it('导航分组按内容高度排列，不把剩余高度撑成巨大菜单间距', () => {
    expect(rule('.yumi-app-navigation')).toMatch(/align-content:\s*start/)
  })

  it('业务页面使用统一的圆角工作区表面承接设计稿视觉基线', () => {
    expect(pagesCss).toMatch(/\.yumi-page\s*\{[^}]*border-radius:\s*22px/s)
    expect(pagesCss).toMatch(/\.yumi-page\s*\{[^}]*background:\s*var\(--yumi-surface-raised\)/s)
    expect(pagesCss).toMatch(/\.yumi-page\s*\{[^}]*box-shadow:\s*var\(--yumi-shadow-sm\)/s)
  })
})
