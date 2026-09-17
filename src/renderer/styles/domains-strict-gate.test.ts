import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeViolations } from '../test/ui-baseline/violations'

/**
 * P3 已迁移的页面 Domain 前缀（曾由 pages.css 页面域样式持有）。
 * 迁移后的页面由 Pattern 组件 + 共享复合体承接，不再持有自有页面域样式；
 * pages.css 已整体清空迁移并删除，样式只由唯一入口按层加载（12.1）。
 * 与全局棘轮不同，本门禁直接断言这些前缀下零裸值/零内部覆盖/零悬空令牌，
 * 已迁移域立即清零并锁定。
 * 后续家族（9.6/10.5/11.6）按同模式扩展前缀。
 */
const MIGRATED_DOMAINS = [
  'yumi-report',
  'yumi-financial-overview',
  'yumi-settings',
  'yumi-order',
  'yumi-worker-week',
  'yumi-work-time-review',
  'yumi-work-assignments',
  'yumi-workbench',
  'yumi-finance',
  'yumi-settlement',
  'yumi-workers',
  'yumi-customer',
  'yumi-product'
]

/** 迁移期间删除的旧页面域私有类，全样式库不得再残留。 */
const LEGACY_PAGE_CLASSES = [
  'yumi-report-page',
  'yumi-report-controls',
  'yumi-reports-workspace',
  'yumi-library-workspace',
  'yumi-settings-panel__title',
  'yumi-settings-panel__intro',
  'yumi-settings-panel__value',
  'yumi-settings-panel__actions',
  'yumi-settings-category-grid',
  'yumi-settings-section-actions',
  'yumi-order-detail-stack',
  'yumi-order-list-surface',
  'yumi-order-key-brief',
  'fulfillment-workspace',
  'yumi-workbench-page',
  'yumi-finance-workspace',
  'yumi-settlements-workspace',
  'yumi-customer-detail-workspace',
  'yumi-reference-workspace',
  'yumi-product-workspace',
  'yumi-product-editor-section'
]

const styleDir = new URL('.', import.meta.url)
const allStylesCss = readdirSync(styleDir)
  .filter((file) => file.endsWith('.css'))
  .sort()
  .map((file) => readFileSync(new URL(file, styleDir), 'utf8'))
  .join('\n')
const onDomain = (selector: string) =>
  MIGRATED_DOMAINS.some((prefix) => selector.startsWith(`.${prefix}`))

describe('P3 · 已迁移页面 Domain 严格门禁（任务 6.4/7.4/8.6/9.6/10.5）', () => {
  it('pages.css 已清空迁移并删除，旧页面域私有类在全样式库清零（12.1）', () => {
    expect(existsSync(new URL('./pages.css', import.meta.url)), 'pages.css 应已删除').toBe(false)
    for (const legacy of LEGACY_PAGE_CLASSES) {
      expect(allStylesCss, `样式库仍残留旧页面域类 ${legacy}`).not.toContain(legacy)
    }
  })

  it('已迁移域选择器下零裸值、零内部覆盖、零悬空令牌（登记进基线也不允许）', () => {
    const domainViolations = computeViolations().filter((violation) => onDomain(violation.selector))
    const format = (violation: { selector: string; detail: string; category: string }) =>
      `${violation.selector} [${violation.category}] {${violation.detail}}`

    expect(
      domainViolations,
      '已迁移域出现违规：' + domainViolations.map(format).join('\n')
    ).toEqual([])
  })

  it('报表页不残留旧 JSX 布局类，由模式与共享复合体承接', () => {
    const source = readFileSync(new URL('../pages/reports/index.tsx', import.meta.url), 'utf8')
    expect(source).toContain('DashboardOverview')
    expect(source).not.toContain('yumi-report-page')
    expect(source).not.toContain('yumi-report-controls')
    expect(source).not.toContain('yumi-reports-workspace')
  })

  it('设置页不残留旧 JSX 布局类或旧工作区包装，由 SettingsWorkspace 承接', () => {
    const source = readFileSync(new URL('../pages/settings/index.tsx', import.meta.url), 'utf8')
    expect(source).toContain('SettingsWorkspace')
    expect(source).not.toContain('yumi-library-workspace')
    expect(source).not.toContain('yumi-settings-panel__title')
    expect(source).not.toContain('yumi-settings-panel__intro')
    expect(source).not.toContain('yumi-settings-panel__value')
    expect(source).not.toContain('yumi-settings-panel__actions')
    expect(source).not.toContain('yumi-settings-category-grid')
    expect(source).not.toContain('yumi-settings-section-actions')
  })

  it('订单页由 ListPage/FormWorkspace/DetailPage 承接，不残留旧布局类', () => {
    const source = readFileSync(new URL('../pages/orders/index.tsx', import.meta.url), 'utf8')
    expect(source).toContain('DetailPage')
    expect(source).toContain('FormWorkspace')
    expect(source).toContain('ListPage')
    expect(source).not.toContain('yumi-order-detail-stack')
    expect(source).not.toContain('yumi-order-list-surface')
    expect(source).not.toContain('yumi-order-key-brief')
  })

  it('排班页由 CalendarWorkspace/ReviewWorkspace 承接，不残留旧工作区包装', () => {
    const source = readFileSync(new URL('../pages/fulfillment/index.tsx', import.meta.url), 'utf8')
    expect(source).toContain('CalendarWorkspace')
    expect(source).toContain('ReviewWorkspace')
    expect(source).not.toContain('fulfillment-workspace')
    expect(source).not.toContain('订单视角')
  })

  it('工作台页由 DashboardOverview 承接，不残留旧页面包装', () => {
    const source = readFileSync(new URL('../pages/workbench/index.tsx', import.meta.url), 'utf8')
    expect(source).toContain('DashboardOverview')
    expect(source).not.toContain('yumi-workbench-page')
  })

  it('财务页由 DashboardOverview/ListPage 承接，不残留旧工作区包装', () => {
    const source = readFileSync(new URL('../pages/finance/index.tsx', import.meta.url), 'utf8')
    expect(source).toContain('DashboardOverview')
    expect(source).toContain('ListPage')
    expect(source).not.toContain('yumi-finance-workspace')
  })

  it('工资页由 ListPage/DetailPage 承接，不残留旧结算工作区包装', () => {
    const source = readFileSync(new URL('../pages/settlements/index.tsx', import.meta.url), 'utf8')
    expect(source).toContain('ListPage')
    expect(source).toContain('DetailPage')
    expect(source).not.toContain('yumi-settlements-workspace')
  })

  it('人员页收敛为嵌入式区块，不再自渲染页面头', () => {
    const source = readFileSync(new URL('../pages/workers/index.tsx', import.meta.url), 'utf8')
    expect(source).toContain('YumiSection')
    expect(source).not.toContain('YumiPageHeader')
  })

  it('客户页由 ListPage/DetailPage 承接，详情不再持有私有工作区包装类', () => {
    const source = readFileSync(new URL('../pages/customers/index.tsx', import.meta.url), 'utf8')
    expect(source).toContain('ListPage')
    expect(source).toContain('DetailPage')
    expect(source).not.toContain('yumi-customer-detail-workspace')
    expect(source).not.toContain('yumi-reference-workspace')
  })

  it('商品页由 ListPage/FormWorkspace/DetailPage 承接，不残留旧全页工作区包装', () => {
    const source = readFileSync(new URL('../pages/products/index.tsx', import.meta.url), 'utf8')
    expect(source).toContain('ListPage')
    expect(source).toContain('FormWorkspace')
    expect(source).toContain('DetailPage')
    expect(source).not.toContain('yumi-product-workspace')
    expect(source).not.toContain('yumi-reference-workspace')
    expect(source).not.toContain('yumi-product-editor-section')
  })
})
