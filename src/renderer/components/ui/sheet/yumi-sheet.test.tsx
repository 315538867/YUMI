/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YumiSheet } from './yumi-sheet'

afterEach(cleanup)

describe('YumiSheet', () => {
  it('以舒适密度呈现可读抽屉，并在无未保存修改时直接关闭', () => {
    const onOpenChange = vi.fn()
    render(
      <YumiSheet density="comfortable" onOpenChange={onOpenChange} open title="登记发货">
        <p>发货表单主体</p>
      </YumiSheet>
    )

    const dialog = screen.getByRole('dialog', { name: '登记发货' })
    expect(dialog).toHaveClass('yumi-sheet', 'yumi-sheet--comfortable')
    expect(screen.getByText('发货表单主体')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '关闭登记发货' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
