import type { ReactNode } from 'react'

type YumiListSurfaceProps = {
  /** 列表业务容器的可访问名称；无名称时不生成空 aria-label。 */
  ariaLabel?: string
  children: ReactNode
  /** 仅用于领域级布局微调，不改变列表容器的统一视觉基线。 */
  className?: string
}

/**
 * 列表页的统一业务容器。
 *
 * 工具条、数据表与空状态应共同落在此容器内；页面只能通过 className 做局部布局适配，
 * 不应重新拼装边框、圆角、内边距或阴影。
 */
export function YumiListSurface({ ariaLabel, children, className }: YumiListSurfaceProps) {
  return (
    <div
      aria-label={ariaLabel}
      className={['yumi-list-surface', className].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  )
}
