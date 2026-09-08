import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type YumiButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

type YumiButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: YumiButtonVariant
  loading?: boolean
  children: ReactNode
}

export const YumiButton = forwardRef<HTMLButtonElement, YumiButtonProps>(function YumiButton(
  { children, className, disabled, loading = false, type = 'button', variant = 'secondary', ...props },
  ref
) {
  return (
    <button
      {...props}
      ref={ref}
      className={['yumi-button', `yumi-button--${variant}`, className].filter(Boolean).join(' ')}
      data-loading={loading || undefined}
      data-variant={variant}
      disabled={disabled || loading}
      type={type}
    >
      {loading ? <span aria-hidden="true" className="yumi-button__spinner" /> : null}
      {children}
    </button>
  )
})

type YumiIconButtonProps = Omit<YumiButtonProps, 'children'> & {
  label: string
  children: ReactNode
}

export const YumiIconButton = forwardRef<HTMLButtonElement, YumiIconButtonProps>(function YumiIconButton(
  { className, label, ...props },
  ref
) {
  return (
    <YumiButton
      {...props}
      ref={ref}
      aria-label={label}
      className={['yumi-button--icon', className].filter(Boolean).join(' ')}
    />
  )
})
