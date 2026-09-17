import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./composites.css', import.meta.url), 'utf8')

function rule(selector: string, source = css) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'))
  if (!match) throw new Error(`未找到 ${selector} 规则`)
  return match[1]
}

describe('共享页头布局契约', () => {
  it('桌面端以统一 token 维持导航、标题和业务动作之间的紧凑层级', () => {
    expect(rule('.yumi-page-header')).toMatch(/gap:\s*var\(--yumi-space-4\)/)
    expect(rule('.yumi-page-header__leading')).toMatch(/flex:\s*1\s+1\s+auto/)
    expect(rule('.yumi-page-header__navigation')).toMatch(/min-height:\s*28px/)
    expect(rule('.yumi-page-header__actions')).toMatch(/max-width:\s*100%/)
  })

  it('窄宽度下动作区与标题行可自身折行，不依赖私有断点压缩标题或操作', () => {
    expect(rule('.yumi-page-header__actions')).toMatch(/flex-wrap:\s*wrap/)
    expect(rule('.yumi-page-header__actions')).toMatch(/max-width:\s*100%/)
    expect(rule('.yumi-page-header__title-row')).toMatch(/flex-wrap:\s*wrap/)
    expect(rule('.yumi-page-header__meta')).toMatch(/overflow-wrap:\s*anywhere/)
  })
})
