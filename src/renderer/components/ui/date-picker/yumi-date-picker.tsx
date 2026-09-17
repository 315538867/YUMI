import * as Popover from '@radix-ui/react-popover'
import { DayPicker, type DateRange } from '@daypicker/react'
import { zhCN } from '@daypicker/react/locale'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode
} from 'react'
import { useDensity } from '../../patterns/density'
import { YumiButton } from '../button/yumi-button'
import {
  useYumiFieldAccessibility,
  type YumiFieldAccessibilityProps
} from '../field/yumi-field-accessibility'
import {
  formatIsoDate,
  formatIsoMonth,
  isValidDateRange,
  parseIsoDate,
  parseIsoMonth,
  startOfToday,
  type YumiDateRangeValue
} from './iso-date'

export type { YumiDateRangeValue } from './iso-date'

type DateTriggerProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'value'> &
  YumiFieldAccessibilityProps & {
    children: ReactNode
    placeholder: string
    value?: string | null
  }

const DateTrigger = forwardRef<HTMLButtonElement, DateTriggerProps>(function DateTrigger(
  {
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    children,
    className,
    disabled,
    placeholder,
    value,
    ...triggerProps
  },
  ref
) {
  const fieldAccessibility = useYumiFieldAccessibility({
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy
  })

  return (
    <button
      {...triggerProps}
      ref={ref}
      {...fieldAccessibility}
      aria-label={ariaLabel}
      className={['yumi-select__trigger', 'yumi-date-trigger', className].filter(Boolean).join(' ')}
      data-placeholder={value ? undefined : true}
      disabled={disabled}
      type="button"
    >
      <span>{children || placeholder}</span>
      <CalendarDays aria-hidden="true" size={16} />
    </button>
  )
})

function CalendarFooter({ onClear }: { onClear?: () => void }) {
  return onClear ? (
    <div className="yumi-date-popover__footer">
      <YumiButton onClick={onClear} variant="ghost">
        <X aria-hidden="true" size={15} />
        清除
      </YumiButton>
    </div>
  ) : null
}

function openOnKeyboard(event: KeyboardEvent<HTMLButtonElement>, onOpen: () => void) {
  if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onOpen()
  }
}

function BaseCalendar({ children }: { children: ReactNode }) {
  return <div className="yumi-date-popover__calendar">{children}</div>
}

type YumiDatePickerProps = YumiFieldAccessibilityProps & {
  className?: string
  disabled?: boolean
  onValueChange(value: string): void
  placeholder?: string
  value?: string | null
}

export function YumiDatePicker({
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  className,
  disabled = false,
  onValueChange,
  placeholder = '选择日期',
  value
}: YumiDatePickerProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const escapeCloseRef = useRef(false)
  const selected = parseIsoDate(value)

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen && escapeCloseRef.current) {
      escapeCloseRef.current = false
      triggerRef.current?.focus()
    }
  }

  return (
    <Popover.Root onOpenChange={handleOpenChange} open={open}>
      <Popover.Trigger asChild>
        <DateTrigger
          ref={triggerRef}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          className={className}
          disabled={disabled}
          onKeyDown={(event) => openOnKeyboard(event, () => setOpen(true))}
          placeholder={placeholder}
          value={value}
        >
          {selected ? selected.toLocaleDateString('zh-CN') : null}
        </DateTrigger>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          className="yumi-date-popover"
          data-density={useDensity()}
          onEscapeKeyDown={() => {
            escapeCloseRef.current = true
          }}
          sideOffset={6}
        >
          <BaseCalendar>
            <DayPicker
              fixedWeeks
              locale={zhCN}
              mode="single"
              onSelect={(date) => {
                if (!date) return
                onValueChange(formatIsoDate(date))
                setOpen(false)
              }}
              selected={selected}
              showOutsideDays
              weekStartsOn={1}
            />
          </BaseCalendar>
          <CalendarFooter
            onClear={() => {
              onValueChange('')
              setOpen(false)
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

type YumiMonthPickerProps = YumiFieldAccessibilityProps & {
  className?: string
  disabled?: boolean
  onValueChange(value: string): void
  placeholder?: string
  value?: string | null
}

const monthLabels = [
  '一月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '十一月',
  '十二月'
]

export function YumiMonthPicker({
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  className,
  disabled = false,
  onValueChange,
  placeholder = '选择月份',
  value
}: YumiMonthPickerProps) {
  const selected = parseIsoMonth(value)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const escapeCloseRef = useRef(false)
  const [year, setYear] = useState(selected?.getFullYear() ?? new Date().getFullYear())

  useEffect(() => {
    if (open) setYear((selected ?? new Date()).getFullYear())
  }, [open, selected])

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen && escapeCloseRef.current) {
      escapeCloseRef.current = false
      triggerRef.current?.focus()
    }
  }

  return (
    <Popover.Root onOpenChange={handleOpenChange} open={open}>
      <Popover.Trigger asChild>
        <DateTrigger
          ref={triggerRef}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          className={className}
          disabled={disabled}
          onKeyDown={(event) => openOnKeyboard(event, () => setOpen(true))}
          placeholder={placeholder}
          value={value}
        >
          {selected
            ? `${selected.getFullYear()}年${String(selected.getMonth() + 1).padStart(2, '0')}月`
            : null}
        </DateTrigger>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          className="yumi-date-popover yumi-date-popover--month"
          data-density={useDensity()}
          onEscapeKeyDown={() => {
            escapeCloseRef.current = true
          }}
          sideOffset={6}
        >
          <div className="yumi-date-popover__caption">
            <YumiButton
              aria-label="上一年"
              onClick={() => setYear((current) => current - 1)}
              variant="ghost"
            >
              <ChevronLeft aria-hidden="true" size={16} />
            </YumiButton>
            <strong>{year} 年</strong>
            <YumiButton
              aria-label="下一年"
              onClick={() => setYear((current) => current + 1)}
              variant="ghost"
            >
              <ChevronRight aria-hidden="true" size={16} />
            </YumiButton>
          </div>
          <div className="yumi-month-grid">
            {monthLabels.map((label, index) => {
              const nextValue = formatIsoMonth(new Date(year, index, 1))
              return (
                <button
                  aria-pressed={nextValue === value}
                  className="yumi-month-grid__item"
                  key={label}
                  onClick={() => {
                    onValueChange(nextValue)
                    setOpen(false)
                  }}
                  type="button"
                >
                  {label}
                </button>
              )
            })}
          </div>
          <CalendarFooter
            onClear={() => {
              onValueChange('')
              setOpen(false)
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

type YumiDateRangePickerProps = YumiFieldAccessibilityProps & {
  className?: string
  disabled?: boolean
  onValueChange(value: YumiDateRangeValue | null): void
  placeholder?: string
  value?: YumiDateRangeValue | null
}

function toDayPickerRange(value?: YumiDateRangeValue | null): DateRange | undefined {
  const from = parseIsoDate(value?.start)
  const to = parseIsoDate(value?.end)
  return from && to ? { from, to } : undefined
}

function formatRangeLabel(value: YumiDateRangeValue | null | undefined) {
  const start = parseIsoDate(value?.start)
  const end = parseIsoDate(value?.end)
  if (!start || !end) return ''
  return `${start.toLocaleDateString('zh-CN')} 至 ${end.toLocaleDateString('zh-CN')}`
}

function getQuickRanges() {
  const today = startOfToday()
  const dayOfWeek = today.getDay() || 7
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - dayOfWeek + 1)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  const previousMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const previousMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
  return [
    { label: '本周', value: { end: formatIsoDate(weekEnd), start: formatIsoDate(weekStart) } },
    { label: '本月', value: { end: formatIsoDate(monthEnd), start: formatIsoDate(monthStart) } },
    {
      label: '上月',
      value: { end: formatIsoDate(previousMonthEnd), start: formatIsoDate(previousMonthStart) }
    }
  ]
}

export function YumiDateRangePicker({
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  className,
  disabled = false,
  onValueChange,
  placeholder = '选择日期范围',
  value = null
}: YumiDateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const escapeCloseRef = useRef(false)
  const [draft, setDraft] = useState<DateRange | undefined>(toDayPickerRange(value))
  const [rangeError, setRangeError] = useState('')

  useEffect(() => setDraft(toDayPickerRange(value)), [value])

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setRangeError('')
      if (escapeCloseRef.current) {
        escapeCloseRef.current = false
        triggerRef.current?.focus()
      }
    }
  }

  const commit = (range: DateRange | undefined) => {
    if (!range?.from || !range.to) return
    const nextValue = { end: formatIsoDate(range.to), start: formatIsoDate(range.from) }
    if (!isValidDateRange(nextValue)) {
      setRangeError('结束日期需要晚于开始日期')
      return
    }
    setRangeError('')
    onValueChange(nextValue)
    setOpen(false)
  }

  return (
    <Popover.Root onOpenChange={handleOpenChange} open={open}>
      <Popover.Trigger asChild>
        <DateTrigger
          ref={triggerRef}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          className={className}
          disabled={disabled}
          onKeyDown={(event) => openOnKeyboard(event, () => setOpen(true))}
          placeholder={placeholder}
          value={formatRangeLabel(value)}
        >
          {formatRangeLabel(value)}
        </DateTrigger>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          className="yumi-date-popover yumi-date-popover--range"
          data-density={useDensity()}
          onEscapeKeyDown={() => {
            escapeCloseRef.current = true
          }}
          sideOffset={6}
        >
          <div className="yumi-date-popover__quick-ranges">
            {getQuickRanges().map((quickRange) => (
              <YumiButton
                key={quickRange.label}
                onClick={() => {
                  onValueChange(quickRange.value)
                  setOpen(false)
                }}
                variant="ghost"
              >
                {quickRange.label}
              </YumiButton>
            ))}
          </div>
          <BaseCalendar>
            <DayPicker
              fixedWeeks
              locale={zhCN}
              mode="range"
              numberOfMonths={2}
              onSelect={(range) => {
                setDraft(range)
                commit(range)
              }}
              selected={draft}
              showOutsideDays
              weekStartsOn={1}
            />
          </BaseCalendar>
          {rangeError ? <p className="yumi-date-popover__error">{rangeError}</p> : null}
          <CalendarFooter
            onClear={() => {
              setDraft(undefined)
              onValueChange(null)
              setOpen(false)
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
