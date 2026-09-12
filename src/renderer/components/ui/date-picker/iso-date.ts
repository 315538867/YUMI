export type YumiDateRangeValue = { start: string; end: string }

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function formatIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseIsoDate(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day)
    return undefined
  return date
}

export function formatIsoMonth(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

export function parseIsoMonth(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return undefined
  const [year, month] = value.split('-').map(Number)
  if (month < 1 || month > 12) return undefined
  return new Date(year, month - 1, 1)
}

export function parseDateTimeParts(value?: string | null) {
  const [date = '', time = '00:00'] = value?.split('T') ?? []
  return { date, time: /^\d{2}:\d{2}$/.test(time) ? time : '00:00' }
}

export function isValidTime(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false
  const [hour, minute] = value.split(':').map(Number)
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
}

export function formatIsoDateTime(date: Date, time: string) {
  return `${formatIsoDate(date)}T${isValidTime(time) ? time : '00:00'}`
}

export function isValidDateRange(value: YumiDateRangeValue | null | undefined) {
  const start = parseIsoDate(value?.start)
  const end = parseIsoDate(value?.end)
  return Boolean(start && end && end.getTime() > start.getTime())
}

export function startOfToday() {
  const today = new Date()
  return new Date(today.getFullYear(), today.getMonth(), today.getDate())
}
