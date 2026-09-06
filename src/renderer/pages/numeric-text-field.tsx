import { TextField } from '@radix-ui/themes'
import { useEffect, useState, type ComponentProps } from 'react'
import { isNumericDraft } from './numeric-draft'

type NumericTextFieldProps = Omit<
  ComponentProps<typeof TextField.Root>,
  'inputMode' | 'onBlur' | 'onChange' | 'onFocus' | 'type' | 'value'
> & {
  value: number | string
  onValueChange(value: string): void
  allowDecimal?: boolean
}

/**
 * 以字符串草稿保留数字的输入过程，避免把“0.”、“0.0”提前转换为数值后丢失。
 */
export function NumericTextField({
  allowDecimal = false,
  onValueChange,
  value,
  ...props
}: NumericTextFieldProps) {
  const formattedValue = String(value)
  const [draft, setDraft] = useState(formattedValue)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDraft(formattedValue)
  }, [focused, formattedValue])

  return (
    <TextField.Root
      {...props}
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      onBlur={() => {
        setFocused(false)
        if (draft === '.' || draft === '') setDraft(formattedValue)
      }}
      onChange={(event) => {
        const nextValue = event.target.value
        if (!isNumericDraft(nextValue, allowDecimal)) return

        setDraft(nextValue)
        onValueChange(nextValue)
      }}
      onFocus={() => setFocused(true)}
      type="text"
      value={draft}
    />
  )
}
