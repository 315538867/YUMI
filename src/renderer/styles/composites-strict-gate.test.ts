import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeViolations } from '../test/ui-baseline/violations'

/**
 * P1 任务 4.4-4.6 已迁移的 Composites 前缀。
 * 与全局棘轮不同，本门禁直接断言这些选择器下零裸值/零覆盖/零悬空令牌，
 * 即使被登记进 style-violations.json 也禁止——已迁移复合体立即清零并锁定。
 */
const MIGRATED_COMPOSITES = [
  'yumi-data-table',
  'yumi-detail-list',
  'yumi-metric-strip',
  'yumi-dialog',
  'yumi-sheet',
  'yumi-list-surface',
  'yumi-list-toolbar',
  'yumi-record-action-bar'
]

const compositesCss = readFileSync(new URL('./composites.css', import.meta.url), 'utf8')
const onComposite = (selector: string) =>
  MIGRATED_COMPOSITES.some((prefix) => selector.startsWith(`.${prefix}`))

describe('P1 · 已迁移 Composites 严格门禁（任务 4.9）', () => {
  it('门禁清单全部命中实际样式类，防止清单失效', () => {
    for (const prefix of MIGRATED_COMPOSITES) {
      expect(compositesCss, `未找到 .${prefix} 样式规则，清单可能过时`).toContain(`.${prefix}`)
    }
  })

  it('已迁移 Composites 选择器下零裸值、零内部覆盖、零悬空令牌（登记进基线也不允许）', () => {
    const compositesViolations = computeViolations().filter((violation) =>
      onComposite(violation.selector)
    )
    const format = (violation: { selector: string; detail: string; category: string }) =>
      `${violation.selector} [${violation.category}] {${violation.detail}}`

    expect(
      compositesViolations,
      '已迁移 Composites 出现违规：' + compositesViolations.map(format).join('\n')
    ).toEqual([])
  })
})
