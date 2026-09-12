/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installDomInteractionPolyfills } from '../../../test/dom'
import { YumiSearchSelect, YumiSelect } from './yumi-select'

installDomInteractionPolyfills()
afterEach(cleanup)

const options = [
  { label: '客户 A', value: 'customer-a' },
  { label: '客户 B', value: 'customer-b' }
]

describe('YumiSelect', () => {
  it('支持键盘选择并将焦点回归到触发器', () => {
    const onValueChange = vi.fn()
    render(
      <YumiSelect
        aria-label="客户"
        onValueChange={onValueChange}
        options={options}
        placeholder="选择客户"
      />
    )

    const trigger = screen.getByRole('combobox', { name: '客户' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('option', { name: '客户 A' }), { key: 'Enter' })

    expect(onValueChange).toHaveBeenCalledWith('customer-a')
    expect(trigger).toHaveFocus()
  })

  it('搜索选择可筛选并提供可选新建动作', () => {
    const onCreate = vi.fn()
    render(
      <YumiSearchSelect
        aria-label="客户"
        emptyText="没有匹配的客户"
        onCreate={onCreate}
        onValueChange={vi.fn()}
        options={options}
        placeholder="搜索或选择客户"
      />
    )

    fireEvent.click(screen.getByRole('combobox', { name: '客户' }))
    fireEvent.change(screen.getByRole('textbox', { name: '搜索客户' }), {
      target: { value: '新客户' }
    })

    expect(screen.getByText('没有匹配的客户')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '新建“新客户”' }))
    expect(onCreate).toHaveBeenCalledWith('新客户')
  })
})
