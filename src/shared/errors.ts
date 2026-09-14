/** 领域校验错误：主进程服务与共享公式统一用它表达可展示的输入错误。 */
export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainValidationError'
  }
}
