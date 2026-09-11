import type { ReactNode } from 'react'

export type YumiFormMessageTone = 'error' | 'hint'

export function YumiFormMessage({
  children,
  id,
  tone = 'hint'
}: {
  children: ReactNode
  id?: string
  tone?: YumiFormMessageTone
}) {
  const isError = tone === 'error'

  return (
    <p
      id={id}
      className={`yumi-form-message yumi-form-message--${tone}`}
      role={isError ? 'alert' : undefined}
    >
      {children}
    </p>
  )
}
