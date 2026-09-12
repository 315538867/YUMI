import type { ReactNode } from 'react'
import { YumiDetailList, type YumiDetailListItem } from '../detail-list/yumi-detail-list'

type YumiDocumentPreviewProps = {
  ariaLabel: string
  children: ReactNode
  className?: string
  description?: ReactNode
  facts?: readonly YumiDetailListItem[]
  title: ReactNode
}

/**
 * 导出前只读单据预览。正文内容由业务页面提供，抬头与冻结事实的结构统一。
 */
export function YumiDocumentPreview({
  ariaLabel,
  children,
  className,
  description,
  facts = [],
  title
}: YumiDocumentPreviewProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={['yumi-document-preview', className].filter(Boolean).join(' ')}
    >
      <div className="yumi-document-preview__header">
        <h2 className="yumi-document-preview__title">{title}</h2>
        {description ? <p className="yumi-document-preview__description">{description}</p> : null}
      </div>
      {facts.length ? (
        <YumiDetailList
          ariaLabel={`${ariaLabel}事实`}
          className="yumi-document-preview__facts"
          columns={2}
          items={facts}
        />
      ) : null}
      <div className="yumi-document-preview__content">{children}</div>
    </section>
  )
}
