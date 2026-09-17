import type { ReactNode } from 'react'

type YumiGridProps = {
  children: ReactNode
  /** 每列最小宽度（px），空间不足时自动换列。 */
  minColumnWidth?: number
}

export function YumiGrid({ children, minColumnWidth = 220 }: YumiGridProps) {
  return (
    <div
      className="yumi-grid"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))` }}
    >
      {children}
    </div>
  )
}
