/** @vitest-environment jsdom */

import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { parseNumericDraft } from './numeric-draft'
import { NumericTextField } from './numeric-text-field'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  root = null
  container = null
})

function DecimalInputHarness() {
  const [value, setValue] = useState(0)

  return createElement(NumericTextField, {
    allowDecimal: true,
    onValueChange: (draft) => {
      const parsed = parseNumericDraft(draft)
      if (parsed !== null) setValue(parsed)
    },
    value
  })
}

function enterValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('NumericTextField', () => {
  it('在数值状态已被更新为零后，仍保留小数点及其后的零', async () => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    await act(async () => root?.render(createElement(DecimalInputHarness)))
    const input = container.querySelector('input')
    expect(input).not.toBeNull()

    await act(async () => {
      input?.focus()
      enterValue(input!, '0.')
    })
    expect(input?.value).toBe('0.')

    await act(async () => enterValue(input!, '0.0'))
    expect(input?.value).toBe('0.0')
  })
})
