import { describe, expect, it } from 'vitest'
import { computeViolations, type Violation } from './violations'

const format = (violation: Violation) =>
  `${violation.file}:${violation.line} [${violation.category}] ${violation.selector || '—'} {${violation.detail}}`

describe('P3 · 样式静态违规严格门禁（任务 12.2）', () => {
  it('全部样式文件零裸值、零私有断点、零内部覆盖、零旧 class、零悬空与未消费令牌', () => {
    const violations = computeViolations()
    expect(
      violations,
      '样式违规必须清零（裸值改用令牌、断点收敛为 1279/1440、未消费令牌接上消费方）：\n' +
        violations.map(format).join('\n')
    ).toEqual([])
  })
})
