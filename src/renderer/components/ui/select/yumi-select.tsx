import * as Popover from '@radix-ui/react-popover'
import * as Select from '@radix-ui/react-select'
import { Check, ChevronDown, Plus, Search } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import {
  useYumiFieldAccessibility,
  type YumiFieldAccessibilityProps
} from '../field/yumi-field-accessibility'

export type YumiSelectOption = {
  disabled?: boolean
  label: ReactNode
  searchText?: string
  value: string
}

type SharedSelectProps = YumiFieldAccessibilityProps & {
  className?: string
  disabled?: boolean
  options: YumiSelectOption[]
  placeholder?: string
  value?: string
  onValueChange(value: string): void
}

export function YumiSelect({
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  className,
  disabled = false,
  onValueChange,
  options,
  placeholder = '请选择',
  value
}: SharedSelectProps) {
  const fieldAccessibility = useYumiFieldAccessibility({
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy
  })

  return (
    <Select.Root disabled={disabled} onValueChange={onValueChange} value={value}>
      <Select.Trigger
        {...fieldAccessibility}
        aria-label={ariaLabel}
        className={['yumi-select__trigger', className].filter(Boolean).join(' ')}
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon>
          <ChevronDown aria-hidden="true" size={16} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="yumi-select__content" position="popper" sideOffset={6}>
          <Select.Viewport className="yumi-select__viewport">
            {options.map((option) => (
              <Select.Item
                className="yumi-select__item"
                disabled={option.disabled}
                key={option.value}
                value={option.value}
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className="yumi-select__item-indicator">
                  <Check aria-hidden="true" size={15} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

type YumiSearchSelectProps = SharedSelectProps & {
  createLabel?(query: string): string
  emptyText?: string
  onCreate?(query: string): void
}

export function YumiSearchSelect({
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  className,
  createLabel = (query) => `新建“${query}”`,
  disabled = false,
  emptyText = '没有匹配结果',
  onCreate,
  onValueChange,
  options,
  placeholder = '搜索或选择',
  value
}: YumiSearchSelectProps) {
  const fieldAccessibility = useYumiFieldAccessibility({
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy
  })
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = options.find((option) => option.value === value)
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!normalizedQuery) return options
    return options.filter((option) =>
      `${option.label}${option.searchText ?? ''}`.toLocaleLowerCase().includes(normalizedQuery)
    )
  }, [options, query])

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) setQuery('')
  }

  return (
    <Popover.Root onOpenChange={handleOpenChange} open={open}>
      <Popover.Trigger asChild>
        <button
          {...fieldAccessibility}
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="listbox"
          className={['yumi-select__trigger', className].filter(Boolean).join(' ')}
          data-placeholder={selected ? undefined : true}
          disabled={disabled}
          role="combobox"
          type="button"
        >
          <span>{selected?.label ?? placeholder}</span>
          <ChevronDown aria-hidden="true" size={16} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" className="yumi-select__search-content" sideOffset={6}>
          <div className="yumi-select__search-wrap">
            <Search aria-hidden="true" size={16} />
            <input
              aria-label={ariaLabel ? `搜索${ariaLabel}` : '搜索选项'}
              autoFocus
              className="yumi-select__search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
              value={query}
            />
          </div>
          <div
            aria-label={ariaLabel ? `${ariaLabel}选项` : '选项列表'}
            className="yumi-select__options"
            role="listbox"
          >
            {filteredOptions.map((option) => (
              <button
                aria-selected={option.value === value}
                className="yumi-select__option"
                disabled={option.disabled}
                key={option.value}
                onClick={() => {
                  onValueChange(option.value)
                  setOpen(false)
                }}
                role="option"
                type="button"
              >
                {option.label}
                {option.value === value ? <Check aria-hidden="true" size={15} /> : null}
              </button>
            ))}
            {filteredOptions.length === 0 ? (
              <p className="yumi-select__empty">{emptyText}</p>
            ) : null}
          </div>
          {onCreate && query.trim() ? (
            <button
              aria-label={createLabel(query.trim())}
              className="yumi-select__create"
              onClick={() => {
                onCreate(query.trim())
                setOpen(false)
              }}
              type="button"
            >
              <Plus aria-hidden="true" size={16} />
              {createLabel(query.trim())}
            </button>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
