import type { ReactNode } from 'react'

export type YumiFormMessageTone = 'error' | 'hint'

export function YumiFormMessage({
  children,
  className,
  id,
  tone = 'hint'
}: {
  children: ReactNode
  className?: string
  id?: string
  tone?: YumiFormMessageTone
}) {
  const isError = tone === 'error'

  return (
    <p
      className={['yumi-form-message', `yumi-form-message--${tone}`, className]
        .filter(Boolean)
        .join(' ')}
      id={id}
      role={isError ? 'alert' : undefined}
    >
      {children}
    </p>
  )
}
