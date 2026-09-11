/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { YumiDataTable } from './yumi-data-table'

afterEach(cleanup)

describe('YumiDataTable', () => {
  it('将筛选后无记录状态作为具名实时反馈保留在表格内', () => {
    render(
      <YumiDataTable
        ariaLabel="客户历史订单"
        columns={[
          {
            key: 'orderCode',
            label: '订单编号',
            render: (row: { orderCode: string }) => row.orderCode
          }
        ]}
        emptyText="没有符合条件的历史订单。"
        getRowKey={(row) => row.orderCode}
        rows={[]}
      />
    )

    expect(screen.getByRole('table', { name: '客户历史订单' })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: '订单编号' })).toHaveAttribute('scope', 'col')
    expect(screen.getByRole('status')).toHaveTextContent('没有符合条件的历史订单。')
  })
})
