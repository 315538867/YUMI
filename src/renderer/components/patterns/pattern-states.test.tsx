/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { CalendarWorkspace } from './calendar-workspace'
import { DashboardOverview } from './dashboard-overview'
import { DetailPage } from './detail-page'
import { FormWorkspace } from './form-workspace'
import { ListPage } from './list-page'
import { ReviewWorkspace } from './review-workspace'
import { SettingsWorkspace } from './settings-workspace'
import { YumiEmptyState } from '../ui/empty-state/yumi-empty-state'

afterEach(cleanup)

const LONG_TEXT = '这是一个用于验证页面模式在长中文文案下结构保持稳定的超长示例文案，'.repeat(8)

type PatternCase = {
  name: string
  pattern: string
  /** 内容区域选择器：各模式承载业务内容的主体区域。 */
  contentSelector: string
  render: (child: ReactNode) => ReactNode
}

const cases: PatternCase[] = [
  {
    name: 'ListPage',
    pattern: 'list-page',
    contentSelector: '.yumi-list-surface',
    render: (child) => (
      <ListPage header={{ title: '订单' }} toolbar={{ ariaLabel: '订单工具条' }}>
        {child}
      </ListPage>
    )
  },
  {
    name: 'DetailPage',
    pattern: 'detail-page',
    contentSelector: '.yumi-detail-page__body',
    render: (child) => <DetailPage header={{ title: '订单详情' }}>{child}</DetailPage>
  },
  {
    name: 'FormWorkspace',
    pattern: 'form-workspace',
    contentSelector: '.yumi-split-layout__main',
    render: (child) => (
      <FormWorkspace actions={<button type="submit">保存</button>} header={{ title: '新建' }}>
        {child}
      </FormWorkspace>
    )
  },
  {
    name: 'DashboardOverview',
    pattern: 'dashboard-overview',
    contentSelector: '.yumi-dashboard-overview__details',
    render: (child) => (
      <DashboardOverview
        header={{ title: '经营工作台' }}
        metrics={{ ariaLabel: '经营摘要', items: [{ label: '营收', value: '¥1' }] }}
      >
        {child}
      </DashboardOverview>
    )
  },
  {
    name: 'ReviewWorkspace',
    pattern: 'review-workspace',
    contentSelector: '.yumi-review-workspace__processing',
    render: (child) => (
      <ReviewWorkspace header={{ title: '待核算' }} queue={<section>队列</section>}>
        {child}
      </ReviewWorkspace>
    )
  },
  {
    name: 'CalendarWorkspace',
    pattern: 'calendar-workspace',
    contentSelector: '.yumi-calendar-workspace__grid',
    render: (child) => <CalendarWorkspace header={{ title: '排班' }}>{child}</CalendarWorkspace>
  },
  {
    name: 'SettingsWorkspace',
    pattern: 'settings-workspace',
    contentSelector: '.yumi-settings-workspace__content',
    render: (child) => (
      <SettingsWorkspace header={{ title: '设置' }} navigation={<nav aria-label="设置导航" />}>
        {child}
      </SettingsWorkspace>
    )
  }
]

const emptyScenarios = [
  { scenario: 'loading', title: '正在加载' },
  { scenario: 'first-use', title: '首次使用' },
  { scenario: 'filter', title: '筛选无结果' },
  { scenario: 'prerequisite', title: '缺少前置资料' }
] as const

describe('P2 · 七种 Pattern 内容状态矩阵（任务 5.9）', () => {
  it.each(cases.map(({ name }) => [name]))(
    '%s：加载/首空/筛选无结果/前置缺失四类空态落在内容区域',
    (name) => {
      const entry = cases.find((item) => item.name === name)!
      for (const { scenario, title } of emptyScenarios) {
        const { container } = render(
          <>{entry.render(<YumiEmptyState scenario={scenario} title={title} />)}</>
        )
        const region = container.querySelector(entry.contentSelector)
        const empty = region!.querySelector('.yumi-empty-state')
        expect(empty, `${entry.pattern} ${scenario} 空态未落入内容区域`).not.toBeNull()
        expect(empty).toHaveAttribute('data-scenario', scenario)
        expect(empty).toHaveAttribute('role', 'status')
        if (scenario === 'loading') {
          expect(empty).toHaveAttribute('aria-busy', 'true')
        }
        expect(empty).toHaveTextContent(title)
      }
    }
  )

  it.each(cases.map(({ name }) => [name]))('%s：页面级错误与恢复动作不被内容区域吞掉', (name) => {
    const entry = cases.find((item) => item.name === name)!
    const { getByRole, container } = render(
      <>{entry.render(<div role="alert">数据加载失败，请重试</div>)}</>
    )
    const region = container.querySelector(entry.contentSelector)
    expect(region!.querySelector('[role="alert"]')).toHaveTextContent('数据加载失败，请重试')
    expect(getByRole('alert')).toHaveTextContent('数据加载失败，请重试')
  })

  it.each(cases.map(({ name }) => [name]))('%s：长中文文案完整保留，不截断不换容器', (name) => {
    const entry = cases.find((item) => item.name === name)!
    const { container } = render(<>{entry.render(<p>{LONG_TEXT}</p>)}</>)
    const region = container.querySelector(entry.contentSelector)
    expect(region).toHaveTextContent(LONG_TEXT)
  })

  it('CalendarWorkspace：长内容限定在局部滚动区域内，页面根不产生第二滚动容器', () => {
    const { container } = render(
      <CalendarWorkspace header={{ title: '排班' }}>
        <p>{LONG_TEXT}</p>
      </CalendarWorkspace>
    )
    const scroll = container.querySelector('.yumi-calendar-workspace__scroll')
    expect(scroll).not.toBeNull()
    expect(scroll!.querySelector('.yumi-calendar-workspace__grid')).toHaveTextContent(LONG_TEXT)
    const root = container.querySelector('[data-page-pattern]')
    expect(root!.children.length).toBeGreaterThanOrEqual(2)
  })
})
