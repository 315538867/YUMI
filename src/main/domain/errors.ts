export { DomainValidationError } from '@shared/errors'

import { DomainValidationError } from '@shared/errors'

export function requirePositive(value: number, name: string, allowZero = false): void {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new DomainValidationError(`${name}必须是${allowZero ? '非负' : '正'}数`)
  }
}
