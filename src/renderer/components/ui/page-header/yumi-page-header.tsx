import type { ReactNode } from 'react'
import { YumiActionMenu, type YumiActionMenuItem } from '../action-menu/yumi-action-menu'
import { YumiButton } from '../button/yumi-button'

export type YumiPageNavigation = {
  ariaLabel: string
  label: ReactNode
  onClick: () => void | Promise<void>
  disabled?: boolean
}

type YumiPageHeaderProps = {
  title: ReactNode
  /** 标题旁的次级实体信息，例如订单编号；不与客户、状态等主信息争夺页头层级。 */
  meta?: ReactNode
  description?: ReactNode
  /** 返回上级等导航动作独立于业务动作组，固定出现在页头左侧。 */
  navigation?: YumiPageNavigation
  /**
   * 页头动作必须经过共享层级编排，避免业务页面在右上角自由堆叠按钮。
   * 区块内的实体/记录操作仍应使用 YumiSection.actions。
   */
  actions?: YumiPageActionsProps
}

export type { YumiPageHeaderProps }

type YumiPageActionMenu = {
  ariaLabel: string
  disabled?: boolean
  items: YumiActionMenuItem[]
  triggerLabel?: ReactNode
}

type YumiPageButtonAction = {
  label: ReactNode
  onClick: () => void | Promise<void>
  disabled?: boolean
  loading?: boolean
}

/** 页面唯一主操作由共享层生成，避免页面传入多个或非 primary 的动作节点。 */
export type YumiPagePrimaryAction = YumiPageButtonAction

/**
 * 页面可见的辅助操作；默认是标准次级按钮，返回上级等导航操作可显式使用 ghost。
 * 其他低频操作应移动到 menu，避免业务页面自由堆叠按钮。
 */
export type YumiPageVisibleAction = YumiPageButtonAction & {
  variant?: 'secondary' | 'ghost'
}

export type YumiPageActionsProps = {
  /** 为页面动作组提供可访问名称，便于区分同页多个动作区域。 */
  ariaLabel: string
  /** 与当前页面状态相关的只读信息，例如状态标签；不承载可提交操作。 */
  context?: ReactNode
  /** 可见的辅助操作（刷新、导出、返回等），按顺序由共享层生成次级按钮；低频操作应收纳到 menu。 */
  visibleActions?: YumiPageVisibleAction[]
  /** 低频同级页面操作，统一收纳到“更多操作”。 */
  menu?: YumiPageActionMenu
  /** 页面唯一主操作，例如新建或编辑；统一渲染为 primary 按钮。 */
  primaryAction?: YumiPagePrimaryAction
}

/**
 * 固定页面右侧操作层级：上下文信息、可见辅助操作、低频更多操作、唯一主操作。
 * 业务页面不应再自行按任意顺序拼接页头按钮。
 */
export function YumiPageActions({
  ariaLabel,
  context,
  menu,
  primaryAction,
  visibleActions = []
}: YumiPageActionsProps) {
  return (
    <div aria-label={ariaLabel} className="yumi-page-actions" role="group">
      {context ? <div className="yumi-page-actions__context">{context}</div> : null}
      {visibleActions.map((action, index) => (
        <div className="yumi-page-actions__secondary" key={`${String(action.label)}-${index}`}>
          <YumiButton
            disabled={action.disabled}
            loading={action.loading}
            onClick={action.onClick}
            variant={action.variant ?? 'secondary'}
          >
            {action.label}
          </YumiButton>
        </div>
      ))}
      {menu ? (
        <YumiActionMenu
          aria-label={menu.ariaLabel}
          disabled={menu.disabled}
          items={menu.items}
          triggerLabel={menu.triggerLabel}
        />
      ) : null}
      {primaryAction ? (
        <div className="yumi-page-actions__primary">
          <YumiButton
            disabled={primaryAction.disabled}
            loading={primaryAction.loading}
            onClick={primaryAction.onClick}
            variant="primary"
          >
            {primaryAction.label}
          </YumiButton>
        </div>
      ) : null}
    </div>
  )
}

export function YumiPageHeader({
  actions,
  description,
  meta,
  navigation,
  title
}: YumiPageHeaderProps) {
  return (
    <header className="yumi-page-header">
      <div className="yumi-page-header__leading">
        {navigation ? (
          <nav aria-label={navigation.ariaLabel} className="yumi-page-header__navigation">
            <YumiButton
              aria-label={String(navigation.label)}
              disabled={navigation.disabled}
              onClick={navigation.onClick}
              variant="ghost"
            >
              ← {navigation.label}
            </YumiButton>
          </nav>
        ) : null}
        <div className="yumi-page-header__content">
          <div className="yumi-page-header__title-row">
            <h1 className="yumi-page-header__title">{title}</h1>
            {meta ? <span className="yumi-page-header__meta">{meta}</span> : null}
          </div>
          {description ? <p className="yumi-page-header__description">{description}</p> : null}
        </div>
      </div>
      {actions ? (
        <div className="yumi-page-header__actions">
          <YumiPageActions {...actions} />
        </div>
      ) : null}
    </header>
  )
}

type YumiSectionProps = {
  children: ReactNode
  /** 复杂交互区块可提供地标名称；纯内容区块无需重复标记为 region。 */
  ariaLabel?: string
  /** 业务区块只能附加领域样式，标题与操作布局仍由 YumiSection 统一提供。 */
  className?: string
  description?: ReactNode
  title?: ReactNode
  /** 仅作用于当前内容区的操作；页面级操作仍应放在 YumiPageHeader。 */
  actions?: ReactNode
  /** 区块级摘要状态或统计信息；不承担提交操作。 */
  status?: ReactNode
}

type YumiRecordSummaryProps = {
  /** 摘要承载的是当前实体的经营状态，复杂详情可作为具名区域供辅助技术快速定位。 */
  ariaLabel?: string
  /** 仅用于附加领域样式；卡片、标题、状态与指标的布局由共享组件统一保证。 */
  className?: string
  children: ReactNode
  description?: ReactNode
  status?: ReactNode
  title: ReactNode
}

/**
 * 实体详情中的经营摘要骨架：标题/说明与状态处于同一头部，指标以整行承接。
 * 只承载当前实体的经营状态汇总（通常配合 YumiMetricStrip），不重复完整 Tab 内容；
 * 不得放入表格、明细列表或身份属性（身份由 YumiEntitySummary 表达）。
 */
export function YumiRecordSummary({
  ariaLabel,
  children,
  className,
  description,
  status,
  title
}: YumiRecordSummaryProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={['yumi-record-summary', className].filter(Boolean).join(' ')}
    >
      <div className="yumi-record-summary__header">
        <div className="yumi-record-summary__heading-content">
          <h2 className="yumi-record-summary__heading">{title}</h2>
          {description ? <p className="yumi-record-summary__description">{description}</p> : null}
        </div>
        {status ? <div className="yumi-record-summary__status">{status}</div> : null}
      </div>
      <div className="yumi-record-summary__metrics">{children}</div>
    </section>
  )
}

type YumiSectionHeaderProps = {
  title?: ReactNode
  description?: ReactNode
  /** 仅作用于当前内容区的操作；页面级操作仍应放在 YumiPageHeader。 */
  actions?: ReactNode
  /** 区块级摘要状态或统计信息；不承担提交操作。 */
  status?: ReactNode
}

/**
 * 区块头部共享复合组件：标题与说明居左，状态在前、操作在后固定居右。
 * 容器、顺序与间距由本组件统一控制，业务方不得注入 class 或无语义包装调整内部布局。
 */
export function YumiSectionHeader({ actions, description, status, title }: YumiSectionHeaderProps) {
  const heading = (
    <div className="yumi-section__heading-content">
      {title ? <h2 className="yumi-section__heading">{title}</h2> : null}
      {description ? <p className="yumi-section__description">{description}</p> : null}
    </div>
  )

  const hasHeaderMeta = Boolean(actions || status)

  if (!hasHeaderMeta) {
    return heading
  }

  return (
    <div className="yumi-section__header">
      {heading}
      <div className="yumi-section__meta">
        {status ? <div className="yumi-section__status">{status}</div> : null}
        {actions ? <div className="yumi-section__actions">{actions}</div> : null}
      </div>
    </div>
  )
}

export function YumiSection({
  actions,
  ariaLabel,
  children,
  className,
  description,
  status,
  title
}: YumiSectionProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={['yumi-section', className].filter(Boolean).join(' ')}
    >
      <YumiSectionHeader
        actions={actions}
        description={description}
        status={status}
        title={title}
      />
      {children}
    </section>
  )
}
