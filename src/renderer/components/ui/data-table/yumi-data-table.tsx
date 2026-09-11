import type { ReactNode } from 'react'

export type YumiDataTableColumn<Row> = {
  align?: 'left' | 'right'
  key: string
  label: ReactNode
  render(row: Row): ReactNode
}

type YumiDataTableProps<Row> = {
  /** 让页面将表格作为具名业务记录主体暴露给辅助技术。 */
  ariaLabel: string
  columns: YumiDataTableColumn<Row>[]
  emptyText?: string
  getRowKey(row: Row, index: number): string
  rows: Row[]
}

export function YumiDataTable<Row>({ ariaLabel, columns, emptyText = '暂无数据', getRowKey, rows }: YumiDataTableProps<Row>) {
  return (
    <div className="yumi-data-table-wrap">
      <table aria-label={ariaLabel} className="yumi-data-table">
        <thead>
          <tr>{columns.map((column) => <th className={column.align === 'right' ? 'yumi-data-table__right' : undefined} key={column.key} scope="col">{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr key={getRowKey(row, index)}>
              {columns.map((column) => <td className={column.align === 'right' ? 'yumi-data-table__right' : undefined} key={column.key}>{column.render(row)}</td>)}
            </tr>
          )) : <tr><td className="yumi-data-table__empty" colSpan={columns.length}><span aria-live="polite" role="status">{emptyText}</span></td></tr>}
        </tbody>
      </table>
    </div>
  )
}
