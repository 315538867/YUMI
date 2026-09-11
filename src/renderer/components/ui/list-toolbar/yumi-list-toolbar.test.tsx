/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { YumiListToolbar } from './yumi-list-toolbar'

afterEach(cleanup)

describe('YumiListToolbar', () => {
  it('将检索、筛选和结果统计固定在同一列表工具条中', () => {
    render(
      <YumiListToolbar
        ariaLabel="客户列表工具"
        countLabel="共 2 位客户"
        filters={<button type="button">全部状态</button>}
        search={<input aria-label="搜索客户" />}
      />
    )

    expect(screen.getByRole('toolbar', { name: '客户列表工具' })).toHaveClass('yumi-list-toolbar')
    expect(screen.getByRole('textbox', { name: '搜索客户' })).toBeVisible()
    expect(screen.getByRole('button', { name: '全部状态' })).toBeVisible()
    expect(screen.getByText('共 2 位客户')).toBeVisible()
  })
})
