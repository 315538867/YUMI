/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installDomInteractionPolyfills } from '../../../test/dom'
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
