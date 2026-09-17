/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YumiConfirmDialog, YumiDialog } from './yumi-dialog'
import { YumiSheet } from '../sheet/yumi-sheet'

afterEach(cleanup)

const overlay = () => document.querySelector('.yumi-dialog__overlay') as HTMLElement

// Radix 的 pointerdown 监听与焦点恢复都挂在 setTimeout(0) 上，jsdom 下先冲掉宏任务再交互/断言。
const flushMacrotask = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)))

describe('YUMI 浮层', () => {
  it('危险确认弹窗在明确确认前不执行操作', () => {
    const onConfirm = vi.fn()
    render(
      <YumiConfirmDialog
        confirmLabel="删除订单"
        onConfirm={onConfirm}
        onOpenChange={vi.fn()}
        open
        title="确认删除？"
      />
    )

    expect(onConfirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '删除订单' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('有未保存内容的抽屉关闭时先请求放弃确认', () => {
    const onOpenChange = vi.fn()
    render(
      <YumiSheet dirty onOpenChange={onOpenChange} open title="编辑客户">
        内容
      </YumiSheet>
    )

    fireEvent.click(screen.getByRole('button', { name: '关闭编辑客户' }))
    expect(screen.getByText('放弃未保存的修改？')).toBeVisible()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)

    fireEvent.click(screen.getByRole('button', { name: '放弃修改' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('浮层关闭语义', () => {
  it('对话框按 Esc 关闭并通知调用方', () => {
    const onOpenChange = vi.fn()
    render(
      <YumiDialog onOpenChange={onOpenChange} open title="编辑备注">
        内容
      </YumiDialog>
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('对话框点击遮罩关闭并通知调用方', async () => {
    const onOpenChange = vi.fn()
    render(
      <YumiDialog onOpenChange={onOpenChange} open title="编辑备注">
        内容
      </YumiDialog>
    )

    await flushMacrotask()
    fireEvent.pointerDown(overlay())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('无未保存内容的抽屉按 Esc 关闭', () => {
    const onOpenChange = vi.fn()
    render(
      <YumiSheet onOpenChange={onOpenChange} open title="登记发货">
        内容
      </YumiSheet>
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('有未保存内容的抽屉按 Esc 不关闭也不弹放弃确认', () => {
    const onOpenChange = vi.fn()
    render(
      <YumiSheet dirty onOpenChange={onOpenChange} open title="编辑客户">
        内容
      </YumiSheet>
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.queryByText('放弃未保存的修改？')).not.toBeInTheDocument()
  })

  it('有未保存内容的抽屉点击遮罩不关闭', async () => {
    const onOpenChange = vi.fn()
    render(
      <YumiSheet dirty onOpenChange={onOpenChange} open title="编辑客户">
        内容
      </YumiSheet>
    )

    await flushMacrotask()
    fireEvent.pointerDown(overlay())
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('无未保存内容的抽屉点击遮罩关闭', async () => {
    const onOpenChange = vi.fn()
    render(
      <YumiSheet onOpenChange={onOpenChange} open title="登记发货">
        内容
      </YumiSheet>
    )

    await flushMacrotask()
    fireEvent.pointerDown(overlay())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('浮层焦点恢复', () => {
  it('对话框关闭后焦点恢复到触发元素', async () => {
    function Controller({ children }: { children: ReactNode }) {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>打开对话框</button>
          <YumiDialog onOpenChange={setOpen} open={open} title="编辑备注">
            {children}
          </YumiDialog>
        </>
      )
    }
    render(<Controller>内容</Controller>)
    const trigger = screen.getByRole('button', { name: '打开对话框' })
    trigger.focus()
    fireEvent.click(trigger)
    await screen.findByRole('dialog', { name: '编辑备注' })

    fireEvent.click(screen.getByRole('button', { name: '关闭编辑备注' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '编辑备注' })).not.toBeInTheDocument()
    )
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
