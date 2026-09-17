/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { installDomInteractionPolyfills } from '../../../test/dom'
import { YumiDatePicker } from './yumi-date-picker'

installDomInteractionPolyfills()
afterEach(cleanup)

describe('P1 · DayPicker vendor 层样式在渲染中生效（任务 2.4）', () => {
  // 镜像唯一入口的加载形态：第三方样式进 vendor 层（jsdom 不支持 @layer，直接注入），
  // 本地共享样式保持无层覆盖，验证迁移后日历仍同时获得 vendor 基础样式与本地主题覆盖。
  beforeAll(() => {
    const vendor = document.createElement('style')
    vendor.textContent = readFileSync(
      resolve(process.cwd(), 'node_modules/@daypicker/react/dist/style.css'),
      'utf8'
    )
    document.head.appendChild(vendor)
    const local = document.createElement('style')
    local.textContent = readFileSync(
      resolve(process.cwd(), 'src/renderer/styles/primitives.css'),
      'utf8'
    )
    document.head.appendChild(local)
  })

  it('打开日期浮层后，vendor 规则与本地覆盖同时作用于日历', async () => {
    render(<YumiDatePicker aria-label="付款日期" onValueChange={vi.fn()} value="2026-09-08" />)
    fireEvent.click(screen.getByRole('button', { name: '付款日期' }))

    await waitFor(() =>
      expect(document.querySelector('.rdp-day_button:not([disabled])')).not.toBeNull()
    )

    const dayCell = document.querySelector('.rdp-day') as HTMLElement
    const root = document.querySelector('.rdp-root') as HTMLElement
    expect(dayCell).not.toBeNull()
    expect(root).not.toBeNull()

    // vendor 规则：日格按第三方样式居中
    expect(getComputedStyle(dayCell).textAlign).toBe('center')
    // 本地主题覆盖（.yumi-date-popover .rdp-root）仍胜过 vendor 基础规则；
    // 3.7 迁移后字体走令牌，jsdom 不解析 var()，返回指定值 var(--yumi-font-size-sm)
    expect(getComputedStyle(root).fontSize).toBe('var(--yumi-font-size-sm)')
  })
})
