import type { ReactNode } from 'react'

type YumiClusterProps = {
  children: ReactNode
}

/** 同权控件簇：按内容宽度紧凑排列并在空间不足时换行，不拉伸填满。 */
export function YumiCluster({ children }: YumiClusterProps) {
  return <div className="yumi-cluster">{children}</div>
}
