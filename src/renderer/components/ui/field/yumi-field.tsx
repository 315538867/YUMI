import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'

export type YumiFieldLabelProps = {
  children: ReactNode
  htmlFor?: string
  hint?: string
  required?: boolean
}

export function YumiFieldLabel({ children, hint, htmlFor, required = false }: YumiFieldLabelProps) {
  return (
    <label className="yumi-field__label" htmlFor={htmlFor}>
      {children}
      {required ? <span aria-hidden="true" className="yumi-field__required">*</span> : null}
      {hint ? <span className="yumi-field__hint">{hint}</span> : null}
    </label>
  )
}

type SharedFieldProps = { error?: string }

export type YumiTextFieldProps = InputHTMLAttributes<HTMLInputElement> & SharedFieldProps

export const YumiTextField = forwardRef<HTMLInputElement, YumiTextFieldProps>(function YumiTextField(
  { className, error, ...props },
  ref
) {
  return (
    <input
      {...props}
      ref={ref}
      aria-invalid={Boolean(error) || props['aria-invalid']}
      className={['yumi-input', className].filter(Boolean).join(' ')}
    />
  )
})

export type YumiNumberFieldProps = Omit<YumiTextFieldProps, 'inputMode' | 'type'> & {
  allowDecimal?: boolean
}

export const YumiNumberField = forwardRef<HTMLInputElement, YumiNumberFieldProps>(function YumiNumberField(
  { allowDecimal = false, ...props },
  ref
) {
  return <YumiTextField {...props} ref={ref} inputMode={allowDecimal ? 'decimal' : 'numeric'} type="text" />
})

export type YumiTextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & SharedFieldProps

export const YumiTextArea = forwardRef<HTMLTextAreaElement, YumiTextAreaProps>(function YumiTextArea(
  { className, error, ...props },
  ref
) {
  return (
    <textarea
      {...props}
      ref={ref}
      aria-invalid={Boolean(error) || props['aria-invalid']}
      className={['yumi-textarea', className].filter(Boolean).join(' ')}
    />
  )
})

export type YumiFieldProps = {
  children: ReactNode
  error?: string
  hint?: string
}

export function YumiField({ children, error, hint }: YumiFieldProps) {
  return (
    <div className="yumi-field">
      {children}
      {error ? <span className="yumi-field__error">{error}</span> : hint ? <span className="yumi-field__hint">{hint}</span> : null}
    </div>
  )
}
