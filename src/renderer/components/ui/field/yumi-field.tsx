import { Check } from 'lucide-react'
import {
  Children,
  forwardRef,
  isValidElement,
  useContext,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes
} from 'react'
import { YumiFormMessage } from '../form-message'
import { YumiFieldContext, useYumiFieldAccessibility } from './yumi-field-accessibility'

export type YumiFieldLabelProps = {
  children: ReactNode
  htmlFor?: string
  hint?: string
  required?: boolean
}

export function YumiFieldLabel({ children, hint, htmlFor, required = false }: YumiFieldLabelProps) {
  const field = useContext(YumiFieldContext)

  return (
    <label className="yumi-field__label" htmlFor={htmlFor} id={field?.labelId}>
      {children}
      {required ? (
        <span aria-hidden="true" className="yumi-field__required">
          *
        </span>
      ) : null}
      {hint ? <span className="yumi-field__label-hint">{hint}</span> : null}
    </label>
  )
}

type SharedFieldProps = { error?: string }

export type YumiTextFieldProps = InputHTMLAttributes<HTMLInputElement> & SharedFieldProps

export const YumiTextField = forwardRef<HTMLInputElement, YumiTextFieldProps>(
  function YumiTextField({ className, error, ...props }, ref) {
    const fieldAccessibility = useYumiFieldAccessibility(props)

    return (
      <input
        {...props}
        ref={ref}
        {...fieldAccessibility}
        aria-invalid={Boolean(error) || fieldAccessibility['aria-invalid']}
        className={['yumi-input', className].filter(Boolean).join(' ')}
      />
    )
  }
)

export type YumiCheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  children: ReactNode
}

export const YumiCheckbox = forwardRef<HTMLInputElement, YumiCheckboxProps>(function YumiCheckbox(
  { children, className, ...props },
  ref
) {
  return (
    <label className={['yumi-checkbox', className].filter(Boolean).join(' ')}>
      <input {...props} ref={ref} className="yumi-checkbox__input" type="checkbox" />
      <span aria-hidden="true" className="yumi-checkbox__control">
        <Check className="yumi-checkbox__check" size={13} />
      </span>
      <span className="yumi-checkbox__label">{children}</span>
    </label>
  )
})

export type YumiNumberFieldProps = Omit<YumiTextFieldProps, 'inputMode' | 'type'> & {
  allowDecimal?: boolean
}

export const YumiNumberField = forwardRef<HTMLInputElement, YumiNumberFieldProps>(
  function YumiNumberField({ allowDecimal = false, ...props }, ref) {
    return (
      <YumiTextField
        {...props}
        ref={ref}
        inputMode={allowDecimal ? 'decimal' : 'numeric'}
        type="text"
      />
    )
  }
)

export type YumiTextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & SharedFieldProps

export const YumiTextArea = forwardRef<HTMLTextAreaElement, YumiTextAreaProps>(
  function YumiTextArea({ className, error, ...props }, ref) {
    const fieldAccessibility = useYumiFieldAccessibility(props)

    return (
      <textarea
        {...props}
        ref={ref}
        {...fieldAccessibility}
        aria-invalid={Boolean(error) || fieldAccessibility['aria-invalid']}
        className={['yumi-textarea', className].filter(Boolean).join(' ')}
      />
    )
  }
)

export type YumiFieldProps = {
  children: ReactNode
  error?: string
  hint?: string
}

export function YumiField({ children, error, hint }: YumiFieldProps) {
  const fieldLabelId = useId()
  const fieldDescriptionId = useId()
  const hasDirectLabel = Children.toArray(children).some(
    (child) => isValidElement(child) && child.type === YumiFieldLabel
  )
  const description = error ?? hint
  const fieldContext: YumiFieldContextValue = {
    descriptionId: description ? fieldDescriptionId : undefined,
    invalid: Boolean(error),
    labelId: hasDirectLabel ? fieldLabelId : undefined
  }

  return (
    <YumiFieldContext.Provider value={fieldContext}>
      <div className="yumi-field">
        {children}
        <YumiFormMessage
          className={description ? undefined : 'yumi-form-message--reserved'}
          id={description ? fieldDescriptionId : undefined}
          tone={error ? 'error' : 'hint'}
        >
          {description ?? ''}
        </YumiFormMessage>
      </div>
    </YumiFieldContext.Provider>
  )
}
