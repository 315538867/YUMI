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

describe('YumiSelect · 键盘契约（任务 3.7）', () => {
  it('Select 以 ArrowDown 键盘打开，Enter 键盘选择后焦点回归触发器', async () => {
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
    expect(screen.getByRole('option', { name: '客户 B' })).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('option', { name: '客户 B' }), { key: 'Enter' })
    expect(onValueChange).toHaveBeenCalledWith('customer-b')
    expect(trigger).toHaveFocus()
  })

  it('Select 以 Esc 关闭浮层并焦点回归触发器', () => {
    render(
      <YumiSelect
        aria-label="客户"
        onValueChange={vi.fn()}
        options={options}
        placeholder="选择客户"
      />
    )

    const trigger = screen.getByRole('combobox', { name: '客户' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: '客户 A' })).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('option', { name: '客户 A' }), { key: 'Escape' })
    expect(screen.queryByRole('option', { name: '客户 A' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('搜索选择以 ArrowDown 键盘打开并聚焦搜索输入', () => {
    render(
      <YumiSearchSelect
        aria-label="客户"
        onValueChange={vi.fn()}
        options={options}
        placeholder="搜索或选择客户"
      />
    )

    const trigger = screen.getByRole('combobox', { name: '客户' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    const search = screen.getByRole('textbox', { name: '搜索客户' })
    expect(search).toBeInTheDocument()
    expect(search).toHaveFocus()
  })

  it('搜索选择以 Esc 关闭并焦点回归触发器', () => {
    render(
      <YumiSearchSelect
        aria-label="客户"
        onValueChange={vi.fn()}
        options={options}
        placeholder="搜索或选择客户"
      />
    )

    const trigger = screen.getByRole('combobox', { name: '客户' })
    fireEvent.click(trigger)
    expect(screen.getByRole('textbox', { name: '搜索客户' })).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('textbox', { name: '搜索客户' }), { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: '搜索客户' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
