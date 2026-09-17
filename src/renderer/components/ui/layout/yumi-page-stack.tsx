import type { ReactNode } from 'react'

type YumiPageStackProps = {
  children: ReactNode
}

/** 页面纵向骨架：按密度语义间距堆叠页头、区块与主工作区，自身不产生滚动。 */
export function YumiPageStack({ children }: YumiPageStackProps) {
  return <div className="yumi-page-stack">{children}</div>
}
