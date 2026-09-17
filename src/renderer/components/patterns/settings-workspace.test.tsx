/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SettingsWorkspace } from './settings-workspace'

afterEach(cleanup)

describe('P2 · Settings Workspace 结构（任务 5.8）', () => {
  const header = { title: '设置' }

  it('以唯一 settings-workspace 模式根发出标准密度，导航与内容按固定顺序排列', () => {
    const { container } = render(
      <SettingsWorkspace
        header={header}
        navigation={
          <nav aria-label="设置导航">
            <button type="button">工作室参数</button>
            <button type="button">通知</button>
          </nav>
        }
      >
        <section>设置视图内容</section>
      </SettingsWorkspace>
    )
    const root = container.querySelector('[data-page-pattern]')
    expect(root).toHaveAttribute('data-page-pattern', 'settings-workspace')
    expect(root).toHaveAttribute('data-density', 'standard')
    expect(container.querySelectorAll('[data-page-pattern]').length).toBe(1)

    const headerEl = container.querySelector('.yumi-page-header')
    const navEl = container.querySelector('.yumi-settings-workspace__nav')
    const contentEl = container.querySelector('.yumi-settings-workspace__content')
    expect(headerEl).not.toBeNull()
    expect(navEl).toHaveTextContent('工作室参数')
    expect(navEl).toHaveTextContent('通知')
    expect(contentEl).toHaveTextContent('设置视图内容')

    const relation = headerEl!.compareDocumentPosition(navEl!)
    expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const navToContent = navEl!.compareDocumentPosition(contentEl!)
    expect(navToContent & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('两级导航可由页面在导航区域传入一级分类与二级条目', () => {
    const { container } = render(
      <SettingsWorkspace
        header={header}
        navigation={
          <nav aria-label="设置导航">
            <section aria-label="一级分类">
              <button type="button">资料库</button>
            </section>
            <section aria-label="二级条目">
              <button type="button">商品资料</button>
            </section>
          </nav>
        }
      >
        <section>设置视图内容</section>
      </SettingsWorkspace>
    )
    const navEl = container.querySelector('.yumi-settings-workspace__nav')
    expect(navEl!.querySelector('[aria-label="一级分类"]')).toHaveTextContent('资料库')
    expect(navEl!.querySelector('[aria-label="二级条目"]')).toHaveTextContent('商品资料')
  })

  it('读取与编辑两种模式共用同一内容区域结构', () => {
    const navigation = (
      <nav aria-label="设置导航">
        <button type="button">通知</button>
      </nav>
    )
    const { container, rerender } = render(
      <SettingsWorkspace header={header} navigation={navigation}>
        <section>读取视图</section>
      </SettingsWorkspace>
    )
    const content = container.querySelector('.yumi-settings-workspace__content')
    expect(content).toHaveTextContent('读取视图')
    expect(content).not.toHaveTextContent('编辑视图')

    rerender(
      <SettingsWorkspace header={header} navigation={navigation}>
        <section>编辑视图</section>
      </SettingsWorkspace>
    )
    expect(container.querySelector('.yumi-settings-workspace__content')).toHaveTextContent(
      '编辑视图'
    )
    expect(container.querySelector('.yumi-settings-workspace__content')).not.toHaveTextContent(
      '读取视图'
    )
  })
})
