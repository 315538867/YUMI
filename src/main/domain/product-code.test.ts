import { describe, expect, it } from 'vitest'
import { createNextProductCode } from './product-code'

describe('商品编码生成', () => {
  it('从 SP0001 开始按最大序号递增并补足四位', () => {
    expect(createNextProductCode([])).toBe('SP0001')
    expect(createNextProductCode(['SP0001'])).toBe('SP0002')
    expect(createNextProductCode(['SP0009', 'SP0002'])).toBe('SP0010')
  })

  it('忽略非 SP 编码且不向前复用已删除号段', () => {
    expect(createNextProductCode(['LEGACY-A', 'sp0004', 'SP0003'])).toBe('SP0004')
  })

  it('超过四位时自然进位', () => {
    expect(createNextProductCode(['SP9999'])).toBe('SP10000')
  })
})
