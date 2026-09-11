/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YumiPrimaryTabs, YumiSegmentedTabs } from './yumi-tabs'

afterEach(cleanup)

describe('YUMI 标签层级', () => {
  it('以不同的语义和样式标记主标签与次级分段控件', () => {
    const onPrimaryChange = vi.fn()
    const onSecondaryChange = vi.fn()
    render(
      <>
        <YumiPrimaryTabs
          ariaLabel="设置区域"
          items={[
            { id: 'studio', label: '工作室参数' },
            { id: 'finance', label: '财务资料' }
          ]}
          onValueChange={onPrimaryChange}
          value="finance"
        />
        <YumiSegmentedTabs
          ariaLabel="财务资料类型"
          items={[
            { id: 'income', label: '收入类目' },
            { id: 'expense', label: '支出类目' }
          ]}
          onValueChange={onSecondaryChange}
          value="income"
        />
      </>
    )

    const primary = screen.getByRole('navigation', { name: '设置区域' })
    const secondary = screen.getByRole('navigation', { name: '财务资料类型' })
    expect(primary).toHaveClass('yumi-primary-tabs')
    expect(secondary).toHaveClass('yumi-segmented-tabs')
    expect(screen.getByRole('button', { name: '财务资料' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: '收入类目' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: '工作室参数' }))
    fireEvent.click(screen.getByRole('button', { name: '支出类目' }))
    expect(onPrimaryChange).toHaveBeenCalledWith('studio')
    expect(onSecondaryChange).toHaveBeenCalledWith('expense')
  })

  it('以方向键和 Home/End 在同一层标签间切换，并跳过禁用项', () => {
    const onPrimaryChange = vi.fn()
    const onSecondaryChange = vi.fn()

    render(
      <>
        <YumiPrimaryTabs
          ariaLabel="订单详情区域"
          items={[
            { id: 'overview', label: '概览' },
            { disabled: true, id: 'shipping', label: '发货' },
            { id: 'finance', label: '资金' }
          ]}
          onValueChange={onPrimaryChange}
          value="overview"
        />
        <YumiSegmentedTabs
          ariaLabel="排班阶段"
          items={[
            { id: 'pending', label: '待排' },
            { disabled: true, id: 'paused', label: '暂停' },
            { id: 'scheduled', label: '已排' }
          ]}
          onValueChange={onSecondaryChange}
          value="pending"
        />
      </>
    )

    const overview = screen.getByRole('button', { name: '概览' })
    const finance = screen.getByRole('button', { name: '资金' })
    const pending = screen.getByRole('button', { name: '待排' })
    const scheduled = screen.getByRole('button', { name: '已排' })

    overview.focus()
    fireEvent.keyDown(overview, { key: 'ArrowDown' })
    expect(onPrimaryChange).toHaveBeenLastCalledWith('finance')
    expect(finance).toHaveFocus()

    fireEvent.keyDown(finance, { key: 'Home' })
    expect(onPrimaryChange).toHaveBeenLastCalledWith('overview')
    expect(overview).toHaveFocus()

    pending.focus()
    fireEvent.keyDown(pending, { key: 'End' })
    expect(onSecondaryChange).toHaveBeenLastCalledWith('scheduled')
    expect(scheduled).toHaveFocus()

    fireEvent.keyDown(scheduled, { key: 'ArrowUp' })
    expect(onSecondaryChange).toHaveBeenLastCalledWith('pending')
    expect(pending).toHaveFocus()
  })

  it('同层只有一个可用项时不触发重复切换', () => {
    const onValueChange = vi.fn()

    render(
      <YumiPrimaryTabs
        ariaLabel="单一工作视图"
        items={[
          { id: 'overview', label: '概览' },
          { disabled: true, id: 'archived', label: '归档' }
        ]}
        onValueChange={onValueChange}
        value="overview"
      />
    )

    const overview = screen.getByRole('button', { name: '概览' })
    overview.focus()
    fireEvent.keyDown(overview, { key: 'ArrowRight' })

    expect(onValueChange).not.toHaveBeenCalled()
    expect(overview).toHaveFocus()
  })

})
