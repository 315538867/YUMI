import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./components.css', import.meta.url), 'utf8')

function rule(selector: string, source = css) {
  const blocks = source.matchAll(/(?:^|\n)\s*([^{}]+?)\s*\{([^{}]*)\}/g)
  for (const block of blocks) {
    const selectors = block[1]
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    if (selectors.includes(selector)) return block[2]
  }
  throw new Error(`未找到 ${selector} 规则`)
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

describe('共享列表工具栏布局契约', () => {
  it('桌面端搜索占剩余空间、筛选项固定可读宽度、统计独立不收缩', () => {
    expect(rule('.yumi-list-toolbar')).toMatch(/flex-wrap:\s*nowrap/)
    expect(rule('.yumi-list-toolbar__search')).toMatch(/flex:\s*1\s+1\s+280px/)
    expect(rule('.yumi-list-toolbar__filter')).toMatch(/flex:\s*0\s+0\s+184px/)
    expect(rule('.yumi-list-toolbar__count')).toMatch(/margin-left:\s*auto/)
    expect(rule('.yumi-list-toolbar__count')).toMatch(/white-space:\s*nowrap/)
  })

  it('1024px 以下才允许折行，640px 以下转为全宽单列', () => {
    expect(mediaRule(1023, '.yumi-list-toolbar')).toMatch(/flex-wrap:\s*wrap/)
    expect(mediaRule(1023, '.yumi-list-toolbar__filters')).toMatch(/flex-wrap:\s*wrap/)
    expect(mediaRule(640, '.yumi-list-toolbar__search')).toMatch(/flex-basis:\s*100%/)
    expect(mediaRule(640, '.yumi-list-toolbar__filters')).toMatch(/flex-basis:\s*100%/)
  })

  it('窄屏统计独立成行，不与被压缩的筛选控件抢宽度', () => {
    expect(mediaRule(820, '.yumi-list-toolbar__count')).toMatch(/width:\s*100%/)
    expect(mediaRule(820, '.yumi-list-toolbar__count')).toMatch(/margin-left:\s*0/)
  })
})
