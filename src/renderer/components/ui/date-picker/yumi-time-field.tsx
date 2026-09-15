import type { ChangeEvent } from 'react'
import { YumiTextField } from '../field/yumi-field'

type YumiTimeFieldProps = {
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  'aria-label': string
  'aria-labelledby'?: string
  className?: string
  disabled?: boolean
  onValueChange(value: string): void
  placeholder?: string
  value: string
}

/** 分钟精度时间输入：受控文本字段（HH:MM），复用组件库文本样式避免原生时间控件。 */
export function YumiTimeField({
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  className,
  disabled = false,
  onValueChange,
  placeholder = 'HH:MM',
  value
}: YumiTimeFieldProps) {
  return (
    <YumiTextField
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={className}
      disabled={disabled}
      inputMode="numeric"
      onChange={(event: ChangeEvent<HTMLInputElement>) => onValueChange(event.target.value)}
      placeholder={placeholder}
      value={value}
    />
  )
}
