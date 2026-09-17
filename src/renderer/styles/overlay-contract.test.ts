import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const compositesCss = readFileSync(new URL('./composites.css', import.meta.url), 'utf8')
const baseCss = readFileSync(new URL('./base.css', import.meta.url), 'utf8')

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function ruleOf(source: string, selector: string) {
  const match = source.match(new RegExp(`(?:^|\\n)${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`))
  if (!match) throw new Error(`未找到规则 ${selector}`)
  return match[1]
}

describe('P1 · 浮层族契约（任务 4.5）', () => {
  it('对话框与通知的标题、说明字号与行高消费排版令牌', () => {
    const dialogTitle = ruleOf(compositesCss, '.yumi-dialog__title')
    expect(dialogTitle).toMatch(/font-size:\s*var\(--yumi-font-size-[\w-]+\)/)
    expect(dialogTitle).toMatch(/line-height:\s*var\(--yumi-line-height-[\w-]+\)/)

    const dialogDescription = ruleOf(compositesCss, '.yumi-dialog__description')
    expect(dialogDescription).toMatch(/font-size:\s*var\(--yumi-font-size-sm\)/)
    expect(dialogDescription).toMatch(/line-height:\s*var\(--yumi-line-height-normal\)/)

    const notification = ruleOf(compositesCss, '.yumi-notification')
    expect(notification).toMatch(/font-size:\s*var\(--yumi-font-size-sm\)/)
    expect(notification).toMatch(/line-height:\s*var\(--yumi-line-height-normal\)/)
  })

  it('浮层头部关闭按钮与通知内边距消费间距令牌而非裸值', () => {
    const headerButton = ruleOf(
      compositesCss,
      '.yumi-dialog__header .yumi-button,\n.yumi-sheet__header .yumi-button'
    )
    expect(headerButton).toMatch(/padding:\s*var\(--yumi-space-1-5\)/)

    const notification = ruleOf(compositesCss, '.yumi-notification')
    expect(notification).toMatch(/padding:\s*var\(--yumi-space-2-5\)[^;]*var\(--yumi-space-3-5\)/)
  })

  it('浮层族不声明不受 reduced-motion 控制的裸动效时长', () => {
    const overlayFamily = [
      ruleOf(compositesCss, '.yumi-dialog__overlay'),
      ruleOf(compositesCss, '.yumi-dialog__content'),
      ruleOf(compositesCss, '.yumi-sheet'),
      ruleOf(compositesCss, '.yumi-notification')
    ].join('\n')
    expect(overlayFamily).not.toMatch(/(?:animation|transition)\s*:[^;]*\d+(?:ms|s)\b/)
    expect(overlayFamily).not.toMatch(/\d+ms/)

    const motionBlock = baseCss.match(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/
    )?.[1]
    expect(motionBlock, 'Foundations 缺少 prefers-reduced-motion 减速块').toMatch(
      /--yumi-duration-fast\s*:\s*0ms/
    )
  })
})
