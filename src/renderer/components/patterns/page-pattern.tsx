import { createContext, useContext, type ReactNode } from 'react'
import { DensityContext, type Density } from './density'

export type PagePattern =
  | 'list-page'
  | 'detail-page'
  | 'form-workspace'
  | 'dashboard-overview'
  | 'review-workspace'
  | 'calendar-workspace'
  | 'settings-workspace'

export const PAGE_PATTERNS: readonly PagePattern[] = [
  'list-page',
  'detail-page',
  'form-workspace',
  'dashboard-overview',
  'review-workspace',
  'calendar-workspace',
  'settings-workspace'
]

/** 规格 5.3：列表/审核/日历默认紧凑，详情/总览/设置/表单默认标准。 */
export const DEFAULT_PATTERN_DENSITY: Record<PagePattern, Density> = {
  'list-page': 'compact',
  'review-workspace': 'compact',
  'calendar-workspace': 'compact',
  'detail-page': 'standard',
  'dashboard-overview': 'standard',
  'settings-workspace': 'standard',
  'form-workspace': 'standard'
}

const PatternContext = createContext<PagePattern | null>(null)

export const usePagePattern = (): PagePattern | null => useContext(PatternContext)

export function PatternRoot({
  pattern,
  density,
  className,
  children
}: {
  pattern: PagePattern
  /** 仅规格列明的长流程/高风险任务变体可由模式根统一指定 comfortable。 */
  density?: Density
  /** 页面容器类，例如既有页面表面的 .yumi-page；不参与模式标识与密度所有权。 */
  className?: string
  children: ReactNode
}) {
  const parentPattern = useContext(PatternContext)
  if (parentPattern !== null) {
    throw new Error(`PatternRoot 不允许嵌套：${pattern} 位于 ${parentPattern} 内部`)
  }
  const resolvedDensity = density ?? DEFAULT_PATTERN_DENSITY[pattern]
  return (
    <PatternContext.Provider value={pattern}>
      <DensityContext.Provider value={resolvedDensity}>
        <div className={className} data-page-pattern={pattern} data-density={resolvedDensity}>
          {children}
        </div>
      </DensityContext.Provider>
    </PatternContext.Provider>
  )
}
