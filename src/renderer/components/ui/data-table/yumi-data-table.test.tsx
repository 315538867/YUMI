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

  it('为金额列提供紧凑密度和明确的右对齐数字单元格', () => {
    render(
      <YumiDataTable
        ariaLabel="订单资金流水"
        columns={[
          {
            key: 'business',
            label: '业务类型',
            render: (row: { business: string; amount: string }) => row.business
          },
          {
            align: 'right',
            key: 'amount',
            label: '金额',
            render: (row: { business: string; amount: string }) => row.amount
          }
        ]}
        density="compact"
        getRowKey={(row) => row.business}
        rows={[{ amount: '¥3,000.00', business: '收款' }]}
      />
    )

    const table = screen.getByRole('table', { name: '订单资金流水' })
    expect(table.closest('.yumi-data-table-wrap')).toHaveClass('yumi-data-table-wrap--compact')
    expect(screen.getByRole('columnheader', { name: '金额' })).toHaveClass(
      'yumi-data-table__right',
      'yumi-data-table__numeric'
    )
    expect(screen.getByText('¥3,000.00')).toHaveClass(
      'yumi-data-table__right',
      'yumi-data-table__numeric'
    )
  })
})
