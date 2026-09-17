import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeViolations } from '../test/ui-baseline/violations'

/**
 * P1 任务 3.5-3.8 已迁移的 Primitives 类前缀。
 * 与全局棘轮不同，本门禁直接断言这些选择器下零裸值/零覆盖/零悬空令牌，
 * 即使被登记进 style-violations.json 也禁止——已迁移层立即清零并锁定。
 */
const MIGRATED_PRIMITIVES = [
  'yumi-action-menu',
  'yumi-button',
  'yumi-checkbox',
  'yumi-date-popover',
  'yumi-field',
  'yumi-form-message',
  'yumi-input',
  'yumi-month-grid',
  'yumi-primary-tabs',
  'yumi-segmented-tabs',
  'yumi-select',
  'yumi-status-tag',
  'yumi-textarea'
]

const primitivesCss = readFileSync(new URL('./primitives.css', import.meta.url), 'utf8')
const onPrimitive = (selector: string) =>
  MIGRATED_PRIMITIVES.some((prefix) => selector.startsWith(`.${prefix}`))

describe('P1 · 已迁移 Primitives 严格门禁（任务 3.10）', () => {
  it('门禁清单全部命中实际样式类，防止清单失效', () => {
    for (const prefix of MIGRATED_PRIMITIVES) {
      expect(primitivesCss, `未找到 .${prefix} 样式规则，清单可能过时`).toContain(`.${prefix}`)
    }
  })

  it('已迁移 Primitives 选择器下零裸值、零内部覆盖、零悬空令牌（登记进基线也不允许）', () => {
    const primitivesViolations = computeViolations().filter((violation) =>
      onPrimitive(violation.selector)
    )
    const format = (violation: { selector: string; detail: string; category: string }) =>
      `${violation.selector} [${violation.category}] {${violation.detail}}`

    expect(
      primitivesViolations,
      '已迁移 Primitives 出现违规：' + primitivesViolations.map(format).join('\n')
    ).toEqual([])
  })

  it('全仓库共享组件内部覆盖清零（patterns 层不得覆盖已迁移组件内部 class）', () => {
    const overrides = computeViolations().filter(
      (violation) => violation.category === 'shared-class-override'
    )
    expect(overrides).toEqual([])
  })

  it('全仓库悬空令牌引用清零', () => {
    const dangling = computeViolations().filter(
      (violation) => violation.category === 'dangling-token-reference'
    )
    expect(dangling).toEqual([])
  })

  it('全仓库旧 class 残留清零', () => {
    const legacy = computeViolations().filter(
      (violation) => violation.category === 'legacy-class-in-source'
    )
    expect(legacy).toEqual([])
  })
})
