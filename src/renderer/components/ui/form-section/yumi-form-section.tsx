import { useId, type ReactNode } from 'react'

type YumiFormSectionProps = {
  children: ReactNode
  className?: string
  description?: ReactNode
  title: ReactNode
}

/**
 * 详情与编辑表单中的资料分组。
 *
 * 固定三级标题、说明与相邻分组分隔规则，避免领域页面沿用特定模块名称的私有样式。
 */
export function YumiFormSection({ children, className, description, title }: YumiFormSectionProps) {
  const headingId = useId()

  return (
    <section
      aria-labelledby={headingId}
      className={['yumi-form-section', className].filter(Boolean).join(' ')}
    >
      <div className="yumi-form-section__heading-content">
        <h3 className="yumi-form-section__heading" id={headingId}>
          {title}
        </h3>
        {description ? <p className="yumi-form-section__description">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}
