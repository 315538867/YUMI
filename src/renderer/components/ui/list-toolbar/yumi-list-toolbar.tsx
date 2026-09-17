import { Children, Fragment, isValidElement, type ReactNode } from 'react'

type YumiListToolbarProps = {
  /** 对工具条内的检索、筛选与统计提供可访问名称。 */
  ariaLabel: string
  /** 当前筛选结果的统计。 */
  countLabel?: ReactNode
  /** 状态、日期或范围等筛选控件。 */
  filters?: ReactNode
  /** 关键字检索控件。 */
  search?: ReactNode
}

export type { YumiListToolbarProps }

function flattenToolbarItems(node: ReactNode): ReactNode[] {
  return Children.toArray(node).flatMap((child) => {
    if (isValidElement(child) && child.type === Fragment) {
      return flattenToolbarItems((child.props as { children?: ReactNode }).children)
    }
    return [child]
  })
}

/**
 * 列表页的统一工具条。
 *
 * 页面级动作由 YumiPageHeader 承担；此处只承载影响当前记录集的检索、筛选和结果统计。
 */
export function YumiListToolbar({ ariaLabel, countLabel, filters, search }: YumiListToolbarProps) {
  const filterItems = filters ? flattenToolbarItems(filters) : []

  return (
    <div aria-label={ariaLabel} className="yumi-list-toolbar" role="toolbar">
      {search || filters ? (
        <div className="yumi-list-toolbar__controls">
          {search ? <div className="yumi-list-toolbar__search">{search}</div> : null}
          {filterItems.length > 0 ? (
            <div className="yumi-list-toolbar__filters">
              {filterItems.map((filter, index) => (
                <div className="yumi-list-toolbar__filter" key={index}>
                  {filter}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {countLabel ? (
        <span aria-live="polite" className="yumi-list-toolbar__count">
          {countLabel}
        </span>
      ) : null}
    </div>
  )
}
