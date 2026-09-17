/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YumiRecordActionBar } from './yumi-record-action-bar'

afterEach(cleanup)

describe('YumiRecordActionBar', () => {
  it('展示全部具名记录操作，不折叠为更多菜单', () => {
    const preview = vi.fn()
    render(
      <YumiRecordActionBar
        actions={[
          { label: '查看发货清单', onClick: preview },
          { label: '导出本批清单', onClick: vi.fn(), variant: 'secondary' },
          { label: '作废批次', onClick: vi.fn(), variant: 'ghost' }
        ]}
        ariaLabel="批次操作"
      />
    )

    expect(screen.getByRole('group', { name: '批次操作' })).toBeVisible()
    expect(screen.getByRole('button', { name: '查看发货清单' })).toBeVisible()
    expect(screen.getByRole('button', { name: '导出本批清单' })).toBeVisible()
    expect(screen.getByRole('button', { name: '作废批次' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '更多' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '查看发货清单' }))
    expect(preview).toHaveBeenCalledOnce()
  })

  it('按传入顺序渲染全部具名记录操作并保持变体', () => {
    render(
      <YumiRecordActionBar
        actions={[
          { label: '查看发货清单', onClick: vi.fn(), variant: 'secondary' },
          { label: '导出本批清单', onClick: vi.fn(), variant: 'ghost' },
          { label: '作废批次', onClick: vi.fn() }
        ]}
        ariaLabel="批次操作"
      />
    )

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      '查看发货清单',
      '导出本批清单',
      '作废批次'
    ])
    expect(screen.getByRole('button', { name: '查看发货清单' })).toHaveAttribute(
      'data-variant',
      'secondary'
    )
    expect(screen.getByRole('button', { name: '导出本批清单' })).toHaveAttribute(
      'data-variant',
      'ghost'
    )
    expect(screen.getByRole('button', { name: '作废批次' })).toHaveAttribute(
      'data-variant',
      'ghost'
    )
  })
})
