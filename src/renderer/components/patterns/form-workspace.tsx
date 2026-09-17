import type { ReactNode } from 'react'
import { YumiSplitLayout } from '../ui/layout/yumi-split-layout'
import { YumiStickyActions } from '../ui/layout/yumi-sticky-actions'
import { YumiPageHeader, type YumiPageHeaderProps } from '../ui/page-header/yumi-page-header'
import { PatternRoot } from './page-pattern'
import type { Density } from './density'

export type YumiFormStep = {
  id: string
  label: ReactNode
}

type FormWorkspaceProps = {
  /** 页头：标题与页面级动作。 */
  header: YumiPageHeaderProps
  /** 多步录入的编号步骤指示；单步流程不传。 */
  steps?: {
    ariaLabel: string
    items: readonly YumiFormStep[]
    /** 当前步骤 id；步骤指示为只读进度，不承载步骤切换。 */
    value: string
  }
  /** 表单主区。 */
  children: ReactNode
  /** 可选预览/上下文侧栏。 */
  preview?: ReactNode
  /** 底部固定操作条：保存/提交/取消等。 */
  actions: ReactNode
  /** 仅规格列明的长流程/高风险任务变体可由模式根统一指定舒适密度。 */
  density?: Density
}

export function FormWorkspace({
  actions,
  children,
  density,
  header,
  preview,
  steps
}: FormWorkspaceProps) {
  return (
    <PatternRoot
      className="yumi-page yumi-form-workspace"
      density={density}
      pattern="form-workspace"
    >
      <YumiPageHeader {...header} />
      {steps ? (
        <ol aria-label={steps.ariaLabel} className="yumi-form-steps">
          {steps.items.map((step) => (
            <li aria-current={step.id === steps.value ? 'step' : undefined} key={step.id}>
              {step.label}
            </li>
          ))}
        </ol>
      ) : null}
      <YumiSplitLayout aside={preview}>{children}</YumiSplitLayout>
      <YumiStickyActions>{actions}</YumiStickyActions>
    </PatternRoot>
  )
}
