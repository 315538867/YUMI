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
  // 抽屉是 z-index 81，因此这里必须注入真实样式表来验证日期浮层在其之上。
  beforeAll(() => {
    const style = document.createElement('style')
    style.textContent = readFileSync(
      resolve(process.cwd(), 'src/renderer/styles/components.css'),
      'utf8'
    )
    document.head.appendChild(style)
  })

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
    expect(wrapper.style.zIndex).toBe('90')

    const day = document.querySelector('.rdp-day_button:not([disabled])') as HTMLButtonElement
    fireEvent.click(day)
    expect(screen.getByTestId('picked').textContent).not.toBe('')
  })
})
