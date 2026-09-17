import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./primitives.css', import.meta.url), 'utf8')
const layoutDir = join(__dirname, '..', 'components', 'ui', 'layout')

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function ruleOf(selector: string) {
  const match = css.match(new RegExp(`(?:^|\\n)${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`))
  if (!match) throw new Error(`未找到规则 ${selector}`)
  return match[1]
}

describe('P1 · 布局原语契约（任务 4.7）', () => {
  it('每个原语容器都允许子内容收缩换行，长文案不会撑破布局（min-width: 0）', () => {
    for (const selector of [
      '.yumi-page-stack',
      '.yumi-cluster',
      '.yumi-grid',
      '.yumi-split-layout',
      '.yumi-scroll-area'
    ]) {
      expect(ruleOf(selector), `${selector} 缺少 min-width: 0`).toMatch(/min-width:\s*0/)
    }
    const mainAside = ruleOf('.yumi-split-layout__main,\n.yumi-split-layout__aside')
    expect(mainAside, '主从分栏内容区缺少 min-width: 0').toMatch(/min-width:\s*0/)
  })

  it('滚动区在容器内局部滚动，页面骨架与网格保持零横向溢出', () => {
    expect(ruleOf('.yumi-scroll-area')).toMatch(/overflow:\s*auto/)
    expect(ruleOf('.yumi-page-stack')).toMatch(/min-width:\s*0/)
    expect(ruleOf('.yumi-grid')).toMatch(/min-width:\s*0/)
  })

  it('网格按最小列宽自动换列，不绑定固定列数或业务列几何', () => {
    const grid = ruleOf('.yumi-grid')
    expect(grid).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(/)
    expect(grid).toMatch(/gap:\s*var\(--yumi-section-gap\)/)
  })

  it('控件簇按内容宽度紧凑排列并允许换行，不拉伸填满', () => {
    const cluster = ruleOf('.yumi-cluster')
    expect(cluster).toMatch(/flex-wrap:\s*wrap/)
    expect(cluster).toMatch(/gap:\s*var\(--yumi-space-2\)/)
    expect(cluster).not.toMatch(/flex-grow|flex:\s*1\b/)
  })

  it('固定操作条抬升到 sticky 层并消费密度内边距', () => {
    const actions = ruleOf('.yumi-sticky-actions')
    expect(actions).toMatch(/position:\s*sticky/)
    expect(actions).toMatch(/z-index:\s*var\(--yumi-z-sticky\)/)
    expect(actions).toMatch(/padding:\s*var\(--yumi-panel-padding\)/)
    expect(actions).toMatch(/gap:\s*var\(--yumi-space-2\)/)
  })

  it('布局原语源码不包含业务数据请求，注释之外不含业务文案', () => {
    const sources = readdirSync(layoutDir).filter(
      (file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx')
    )
    expect(sources.length).toBeGreaterThanOrEqual(7)
    for (const file of sources) {
      const source = readFileSync(join(layoutDir, file), 'utf8')
      expect(source, `${file} 不得发起数据请求`).not.toMatch(
        /fetch\(|\baxios\b|from ['"]@shared\/|ipcRenderer|\.query\(|\.mutate\(/
      )
      const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      expect(withoutComments, `${file} 注释之外不得包含业务文案`).not.toMatch(/[\u4e00-\u9fa5]/)
    }
  })
})
