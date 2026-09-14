import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./components.css', import.meta.url), 'utf8')

function rule(selector: string, source = css) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'))
  if (!match) throw new Error(`未找到 ${selector} 规则`)
  return match[1]
}

function mediaRule(maxWidth: number, selector: string) {
  const media = new RegExp(`@media\\s*\\(max-width:\\s*${maxWidth}px\\)\\s*\\{`, 'g')
  let match: RegExpExecArray | null

  while ((match = media.exec(css))) {
    const bodyStart = css.indexOf('{', match.index)
    let depth = 0
    let bodyEnd = -1
    for (let index = bodyStart; index < css.length; index += 1) {
      if (css[index] === '{') depth += 1
      if (css[index] === '}') depth -= 1
      if (depth === 0) {
        bodyEnd = index
        break
      }
    }
    if (bodyEnd < 0) throw new Error(`max-width: ${maxWidth}px 媒体查询缺少结束括号`)

    const body = css.slice(bodyStart + 1, bodyEnd)
    try {
      return rule(selector, body)
    } catch {
      media.lastIndex = bodyEnd + 1
    }
  }

  throw new Error(`未找到 max-width: ${maxWidth}px 下的 ${selector} 规则`)
}

describe('共享页头布局契约', () => {
  it('桌面端以统一 token 维持导航、标题和业务动作之间的紧凑层级', () => {
    expect(rule('.yumi-page-header')).toMatch(/gap:\s*var\(--yumi-space-4\)/)
    expect(rule('.yumi-page-header__leading')).toMatch(/flex:\s*1\s+1\s+auto/)
    expect(rule('.yumi-page-header__navigation')).toMatch(/min-height:\s*28px/)
    expect(rule('.yumi-page-header__actions')).toMatch(/max-width:\s*100%/)
  })

  it('窄屏将页头动作移到独立行，避免标题和按钮互相挤压或变形', () => {
    expect(mediaRule(820, '.yumi-page-header')).toMatch(/flex-direction:\s*column/)
    expect(mediaRule(820, '.yumi-page-header__leading')).toMatch(/width:\s*100%/)
    expect(mediaRule(820, '.yumi-page-header__actions')).toMatch(/width:\s*100%/)
    expect(mediaRule(820, '.yumi-page-actions')).toMatch(/justify-content:\s*flex-start/)
  })

  it('手机端让编号元数据在标题下换行，而不是压缩标题或操作', () => {
    expect(mediaRule(640, '.yumi-page-header__meta')).toMatch(/flex-basis:\s*100%/)
    expect(mediaRule(640, '.yumi-page-header__title')).toMatch(/font-size:\s*22px/)
  })
})
