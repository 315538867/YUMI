/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YumiConfirmDialog } from './yumi-dialog'
import { YumiSheet } from '../sheet/yumi-sheet'

afterEach(cleanup)

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
