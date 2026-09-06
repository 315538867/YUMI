import { describe, expect, it } from 'vitest'
import { isNumericDraft, parseNumericDraft } from './numeric-draft'

describe('数字输入草稿', () => {
  it('允许小数输入过程中的中间状态，保留小数点后的零', () => {
    expect(isNumericDraft('0.', true)).toBe(true)
    expect(isNumericDraft('0.0', true)).toBe(true)
    expect(isNumericDraft('0.005', true)).toBe(true)
    expect(isNumericDraft('.5', true)).toBe(true)
  })

  it('拒绝非数字字符及整数输入中的小数点', () => {
    expect(isNumericDraft('0..5', true)).toBe(false)
    expect(isNumericDraft('12a', true)).toBe(false)
    expect(isNumericDraft('1.5', false)).toBe(false)
  })

  it('仅将可提交的草稿转换为数值，空值按零处理', () => {
    expect(parseNumericDraft('')).toBe(0)
    expect(parseNumericDraft('0.005')).toBe(0.005)
    expect(parseNumericDraft('0.')).toBe(0)
    expect(parseNumericDraft('.')).toBeNull()
  })
})
