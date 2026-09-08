import type { ReactNode } from 'react'

type YumiPageHeaderProps = {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}

export function YumiPageHeader({ actions, description, title }: YumiPageHeaderProps) {
  return (
    <header className="yumi-page-header">
      <div className="yumi-page-header__content">
        <h1 className="yumi-page-header__title">{title}</h1>
        {description ? <p className="yumi-page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="yumi-page-header__actions">{actions}</div> : null}
    </header>
  )
}

type YumiSectionProps = {
  children: ReactNode
  description?: ReactNode
  title?: ReactNode
}

export function YumiSection({ children, description, title }: YumiSectionProps) {
  return (
    <section className="yumi-section">
      {title ? <h2 className="yumi-section__heading">{title}</h2> : null}
      {description ? <p className="yumi-section__description">{description}</p> : null}
      {children}
    </section>
  )
}
