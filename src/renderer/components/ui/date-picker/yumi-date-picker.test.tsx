/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { installDomInteractionPolyfills } from '../../../test/dom'
import { YumiSheet } from '../sheet/yumi-sheet'
import { YumiDatePicker, YumiMonthPicker } from './yumi-date-picker'

installDomInteractionPolyfills()
afterEach(cleanup)

describe('YUMI 日期选择', () => {
  it('日期与月份触发器均能展开自定义浮层', () => {
    render(
      <>
        <YumiDatePicker aria-label="付款日期" onValueChange={vi.fn()} value="2026-09-08" />
        <YumiMonthPicker aria-label="统计月份" onValueChange={vi.fn()} value="2026-09" />
      </>
    )

    fireEvent.click(screen.getByRole('button', { name: '付款日期' }))
    expect(screen.getByText('清除')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '统计月份' }))
    expect(screen.getByRole('button', { name: '一月' })).toBeVisible()
  })
})

describe('日期选择器在模态抽屉内', () => {
  // Radix Popper 会把浮层内容的 computed z-index 复制到固定定位的包裹层上；
  // jsdom 不会解析 CSS 自定义属性，因此这里注入真实样式表并按令牌解析层级，
  // 验证日期浮层的菜单层级列于抽屉层级之上。
  beforeAll(() => {
    const style = document.createElement('style')
    style.textContent =
      readFileSync(resolve(process.cwd(), 'src/renderer/styles/primitives.css'), 'utf8') +
      '\n' +
      readFileSync(resolve(process.cwd(), 'src/renderer/styles/composites.css'), 'utf8')
    document.head.appendChild(style)
  })

  const layerValue = (token: string) => {
    const tokensSource = readFileSync(
      resolve(process.cwd(), 'src/renderer/styles/tokens.css'),
      'utf8'
    )
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return Number(tokensSource.match(new RegExp(`^\\s*${escaped}\\s*:\\s*(\\d+);`, 'm'))?.[1])
  }
  const resolveLayer = (declared: string) =>
    Number(declared.replace(/var\((--yumi-[\w-]+)\)/, (_, token) => String(layerValue(token))))

  function SheetHarness() {
    const [value, setValue] = useState('')
    return (
      <YumiSheet open onOpenChange={() => {}} title="测试抽屉">
        <YumiDatePicker aria-label="付款日期" onValueChange={setValue} value={value} />
        <span data-testid="picked">{value}</span>
      </YumiSheet>
    )
  }

  it('日期浮层位于抽屉之上（z-index 90），并可直接选中日期', async () => {
    render(<SheetHarness />)
    fireEvent.click(screen.getByRole('button', { name: '付款日期' }))

    await waitFor(() =>
      expect(document.querySelector('[data-radix-popper-content-wrapper]')).not.toBeNull()
    )
    const wrapper = document.querySelector('[data-radix-popper-content-wrapper]') as HTMLElement
    expect(resolveLayer(wrapper.style.zIndex)).toBe(layerValue('--yumi-z-menu'))
    expect(layerValue('--yumi-z-menu')).toBeGreaterThan(layerValue('--yumi-z-dialog'))

    const day = document.querySelector('.rdp-day_button:not([disabled])') as HTMLButtonElement
    fireEvent.click(day)
    expect(screen.getByTestId('picked').textContent).not.toBe('')
  })
})

describe('YUMI 日期选择 · 键盘契约（任务 3.7）', () => {
  it('日期选择器以 ArrowDown 键盘打开', () => {
    render(<YumiDatePicker aria-label="付款日期" onValueChange={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: '付款日期' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    expect(screen.getByText('清除')).toBeVisible()
  })

  it('月份选择器以 ArrowDown 键盘打开', () => {
    render(<YumiMonthPicker aria-label="统计月份" onValueChange={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: '统计月份' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    expect(screen.getByRole('button', { name: '一月' })).toBeVisible()
  })

  it('日期选择器以 Esc 关闭并焦点回归触发器', () => {
    render(<YumiDatePicker aria-label="付款日期" onValueChange={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: '付款日期' })
    fireEvent.click(trigger)
    expect(screen.getByText('清除')).toBeVisible()

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByText('清除')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
