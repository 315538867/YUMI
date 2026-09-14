const PRODUCT_CODE_PATTERN = /^SP(\d+)$/

/** 商品编码由系统分配：取现有 SP 序号最大值加一，不复用已删除号段。 */
export function createNextProductCode(existingCodes: string[]): string {
  let maxNumber = 0
  for (const code of existingCodes) {
    const matched = PRODUCT_CODE_PATTERN.exec(code.trim())
    if (!matched) continue
    const value = Number(matched[1])
    if (Number.isSafeInteger(value) && value > maxNumber) maxNumber = value
  }
  return `SP${String(maxNumber + 1).padStart(4, '0')}`
}
