import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type StateValue = 'yes' | 'no' | 'na'
type StateName =
  | 'default'
  | 'hover'
  | 'active'
  | 'focus-visible'
  | 'disabled'
  | 'loading'
  | 'read-only'
  | 'invalid'

type StateCategory = { id: string; label: string; states: Record<StateName, StateValue> }
type StateMatrix = { states: StateName[]; categories: StateCategory[] }

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T

const matrix = readJson<StateMatrix>('./component-state-matrix.json')
const counts = readJson<{ counts: Record<string, number> }>(
  './component-state-matrix-counts.json'
).counts

const STATE_NAMES: StateName[] = [
  'default',
  'hover',
  'active',
  'focus-visible',
  'disabled',
  'loading',
  'read-only',
  'invalid'
]

/** 字段类组件承载用户输入，支持只读与非法态；其余类别二者均为 N/A。 */
const FIELD_CATEGORIES = new Set([
  'text-field',
  'numeric-text-field',
  'textarea',
  'checkbox',
  'select',
  'search-select',
  'date-picker',
  'month-picker',
  'time-field'
])

describe('P1 · 组件状态适用矩阵（任务 3.4）', () => {
  it('矩阵以固定状态清单覆盖按钮/菜单/选项卡/状态标签/字段/选择/日期/浮层全部组件类别', () => {
    expect(matrix.states).toEqual(STATE_NAMES)
    expect(matrix.categories.map((category) => category.id).sort()).toEqual(
      [
        'button',
        'icon-button',
        'action-menu',
        'primary-tabs',
        'segmented-tabs',
        'status-tag',
        'text-field',
        'numeric-text-field',
        'textarea',
        'checkbox',
        'select',
        'search-select',
        'date-picker',
        'month-picker',
        'time-field',
        'dialog',
        'sheet'
      ].sort()
    )
  })

  it('每个类别声明全部八类状态，取值仅限 yes/no/na', () => {
    for (const category of matrix.categories) {
      expect(Object.keys(category.states).sort(), `${category.id} 状态清单`).toEqual(
        [...STATE_NAMES].sort()
      )
      expect(category.label, `${category.id} 缺少中文标签`).toBeTruthy()
      for (const [state, value] of Object.entries(category.states)) {
        expect(['yes', 'no', 'na'], `${category.id}.${state} 取值`).toContain(value)
      }
    }
  })

  it('默认态适用于所有类别；可悬停类别必可按压', () => {
    for (const category of matrix.categories) {
      expect(category.states.default, `${category.id} 缺默认态`).toBe('yes')
      if (category.states.hover === 'yes') {
        expect(category.states.active, `${category.id} 可悬停必可按压`).toBe('yes')
      }
    }
  })

  it('字段类支持只读与非法态，非字段类的只读/非法为 N/A', () => {
    for (const category of matrix.categories) {
      if (FIELD_CATEGORIES.has(category.id)) {
        expect(['yes', 'no'], `${category.id} 字段类应明确只读态（不应为 N/A）`).toContain(
          category.states['read-only']
        )
        expect(category.states.invalid, `${category.id} 字段类应支持非法态`).toBe('yes')
      } else {
        expect(category.states['read-only'], `${category.id} 只读态应为 N/A`).toBe('na')
        expect(category.states.invalid, `${category.id} 非法态应为 N/A`).toBe('na')
      }
    }
  })

  it('计数反向棘轮：类别数及 yes/no/na 分布不得无提示缩减', () => {
    expect(matrix.categories.length, '类别数').toBe(counts.categories)
    const tally = { yes: 0, no: 0, na: 0 }
    for (const category of matrix.categories) {
      for (const value of Object.values(category.states)) {
        tally[value] += 1
      }
    }
    expect(tally.yes).toBe(counts.yes)
    expect(tally.no).toBe(counts.no)
    expect(tally.na).toBe(counts.na)
  })

  it('交互类别必须同时具备焦点可见与禁用态，保证键盘可达与失活语义', () => {
    for (const category of matrix.categories) {
      if (category.states.hover === 'yes' || category.states.active === 'yes') {
        expect(category.states['focus-visible'], `${category.id} 应声明焦点可见态`).toBe('yes')
        expect(category.states.disabled, `${category.id} 应声明禁用态`).toBe('yes')
      }
    }
  })
})
