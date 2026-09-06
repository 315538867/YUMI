export function isNumericDraft(value: string, allowDecimal: boolean) {
  return allowDecimal ? /^\d*(?:\.\d*)?$/.test(value) : /^\d*$/.test(value)
}

export function parseNumericDraft(value: string) {
  if (value === '') return 0
  if (value === '.') return null

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
