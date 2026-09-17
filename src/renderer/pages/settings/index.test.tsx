/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YumiNotificationProvider } from '../../components/ui'
import { installDomInteractionPolyfills } from '../../test/dom'
import { SettingsPage } from './index'

const mocks = vi.hoisted(() => ({
  finance: {
    advancePayers: [] as Array<{
      id: string
      name: string
      note: string | null
      enabled: boolean
      createdAt: string
      updatedAt: string
    }>,
    categories: [] as Array<{
      id: string
      direction: 'income' | 'expense'
      name: string
      enabled: boolean
      createdAt: string
      updatedAt: string
    }>,
    createAdvancePayer: vi.fn(),
    createCategory: vi.fn(),
    deleteAdvancePayer: vi.fn(),
    deleteCategory: vi.fn(),
    loadError: null as string | null,
    loading: false,
    updateAdvancePayer: vi.fn(),
    updateCategory: vi.fn()
  },
  studio: {
    loadError: null as string | null,
    loading: false,
    settings: {
      materialPriceMicroYuanPerGram: 3_400,
      orderReservedDays: 2,
      fluffingBaggingExpectedHourlyWageCents: 0,
      edgeSewingExpectedHourlyWageCents: 0,
      packingExpectedHourlyWageCents: 0,
      updatedAt: '2026-09-08T00:00:00.000Z'
    },
    update: vi.fn()
  },
  backup: {
    backups: [] as Array<{ id: string; createdAt: string }>,
    busy: false,
    createBackup: vi.fn(async () => {}),
    error: null as string | null,
    loading: false,
    restoreBackup: vi.fn(async () => ({}))
  }
}))

vi.mock('../../composables/use-studio-settings', () => ({
  useStudioSettings: () => mocks.studio
}))
vi.mock('../../composables/use-finance', () => ({
  useFinance: () => mocks.finance
}))
vi.mock('../../composables/use-backups', () => ({
  useBackups: () => mocks.backup
}))

installDomInteractionPolyfills()
const renderSettings = () =>
  render(
    <YumiNotificationProvider>
      <SettingsPage />
    </YumiNotificationProvider>
  )
afterEach(() => {
  cleanup()
  mocks.finance.categories = []
  mocks.finance.advancePayers = []
  mocks.studio.settings = {
    materialPriceMicroYuanPerGram: 3_400,
    orderReservedDays: 2,
    fluffingBaggingExpectedHourlyWageCents: 0,
    edgeSewingExpectedHourlyWageCents: 0,
    packingExpectedHourlyWageCents: 0,
    updatedAt: '2026-09-08T00:00:00.000Z'
  }
  mocks.studio.update.mockReset()
  mocks.finance.createCategory.mockReset()
  mocks.backup.createBackup.mockReset()
})

describe('P3 · 设置工作台根契约（任务 7.1）', () => {
  it('以唯一 settings-workspace 模式根发出标准密度', () => {
    const { container } = renderSettings()
    const root = container.querySelector('[data-page-pattern]')
    expect(root).toHaveAttribute('data-page-pattern', 'settings-workspace')
    expect(root).toHaveAttribute('data-density', 'standard')
    expect(container.querySelectorAll('[data-page-pattern]').length).toBe(1)
  })

  it('设置仅以主导航和内容区表达当前上下文，不重复输出当前 Tab 标题', async () => {
    renderSettings()
    const root = document.querySelector('[data-page-pattern="settings-workspace"]')!
    const navigation = within(root).getByRole('navigation', { name: '设置区域' })
    expect(
      within(navigation).getByRole('button', { name: '工作室参数' })
    ).toHaveAttribute('aria-current', 'page')
    expect(within(root).queryByRole('heading', { name: '工作室参数' })).not.toBeInTheDocument()
  })

  it('页头、导航区、内容区按固定顺序排列', () => {
    const { container } = renderSettings()
    const header = screen.getByRole('heading', { level: 1, name: '设置' }).closest('header')
    const navEl = container.querySelector<HTMLElement>('.yumi-settings-workspace__nav')
    const contentEl = container.querySelector<HTMLElement>('.yumi-settings-workspace__content')
    expect(header).not.toBeNull()
    expect(navEl).not.toBeNull()
    expect(contentEl).not.toBeNull()

    expect(header!.compareDocumentPosition(navEl!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      navEl!.compareDocumentPosition(contentEl!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('导航区承载设置区域主 Tab，财务资料的分段 Tab 位于内容区内而非导航区', () => {
    const { container } = renderSettings()
    const navEl = container.querySelector<HTMLElement>('.yumi-settings-workspace__nav')
    const contentEl = container.querySelector<HTMLElement>('.yumi-settings-workspace__content')
    expect(within(navEl!).getByRole('navigation', { name: '设置区域' })).toBeVisible()
    for (const label of ['工作室参数', '计算公式', '财务资料', '数据保护']) {
      expect(within(navEl!).getByRole('button', { name: label })).toBeInTheDocument()
    }

    fireEvent.click(within(navEl!).getByRole('button', { name: '财务资料' }))
    expect(within(contentEl!).getByRole('navigation', { name: '财务资料类型' })).toBeVisible()
    expect(navEl!.querySelector('[aria-label="财务资料类型"]')).toBeNull()
  })

  it('四个设置视图的内容都落入内容区', () => {
    const { container } = renderSettings()
    const contentEl = () =>
      container.querySelector<HTMLElement>('.yumi-settings-workspace__content')

    expect(within(contentEl()!).getByRole('region', { name: '当前工作室参数' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '计算公式' }))
    expect(within(contentEl()!).getByRole('table', { name: '系统计算公式' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '财务资料' }))
    expect(within(contentEl()!).getByText('暂无收入类目')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '数据保护' }))
    expect(within(contentEl()!).getByText('还没有备份')).toBeVisible()
  })
})

describe('P3 · 设置读取/编辑切换与保存反馈（任务 7.2）', () => {
  it('读取参数后可在 Sheet 中编辑并保存，成功后经状态通知反馈并关闭', async () => {
    mocks.studio.update.mockResolvedValue({})
    renderSettings()

    expect(screen.getByText('0.0034 元 / 克')).toBeVisible()
    expect(screen.getByText('2 天')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '编辑工作室参数' }))
    const sheet = screen.getByRole('dialog', { name: '编辑工作室参数' })
    expect(within(sheet).getByDisplayValue('0.0034')).toBeVisible()
    fireEvent.change(
      within(sheet).getByRole('textbox', { name: '缝边预计基准时薪（元 / 小时）' }),
      {
        target: { value: '36' }
      }
    )
    fireEvent.click(within(sheet).getByRole('button', { name: '保存工作室参数' }))

    await waitFor(() =>
      expect(mocks.studio.update).toHaveBeenCalledWith({
        materialPriceMicroYuanPerGram: 3_400,
        orderReservedDays: 2,
        fluffingBaggingExpectedHourlyWageCents: 0,
        edgeSewingExpectedHourlyWageCents: 3_600,
        packingExpectedHourlyWageCents: 0
      })
    )
    expect(await screen.findByRole('status')).toHaveTextContent('已保存工作室参数')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '编辑工作室参数' })).not.toBeInTheDocument()
    )
  })

  it('失败保存保留弹层并驱动状态通知反馈', async () => {
    mocks.studio.update.mockRejectedValueOnce(new Error('保存失败，请重试'))
    renderSettings()

    fireEvent.click(screen.getByRole('button', { name: '编辑工作室参数' }))
    fireEvent.click(screen.getByRole('button', { name: '保存工作室参数' }))

    expect(await screen.findByRole('alert', { hidden: true })).toHaveTextContent('保存失败，请重试')
    expect(screen.getByRole('dialog', { name: '编辑工作室参数' })).toBeVisible()
  })
})

describe('P3 · 设置资源新增与数据保护入口（任务 7.2）', () => {
  it('新增收入类目经 Dialog 提交并携带方向与名称', async () => {
    mocks.finance.createCategory.mockResolvedValue({})
    renderSettings()

    fireEvent.click(screen.getByRole('button', { name: '财务资料' }))
    fireEvent.click(screen.getByRole('button', { name: '新增收入类目' }))
    const dialog = screen.getByRole('dialog', { name: '新增收入类目' })
    fireEvent.change(within(dialog).getByLabelText(/类目名称/), { target: { value: '尾款收入' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '创建类目' }))

    await waitFor(() =>
      expect(mocks.finance.createCategory).toHaveBeenCalledWith({
        direction: 'income',
        name: '尾款收入'
      })
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '新增收入类目' })).not.toBeInTheDocument()
    )
  })

  it('数据保护页提供立即备份入口并驱动备份创建', async () => {
    mocks.backup.createBackup.mockResolvedValue(undefined)
    renderSettings()

    fireEvent.click(screen.getByRole('button', { name: '数据保护' }))
    fireEvent.click(screen.getByRole('button', { name: '立即备份' }))

    await waitFor(() => expect(mocks.backup.createBackup).toHaveBeenCalledTimes(1))
  })
})

describe('P3 · 设置资源空态、反馈层级与弹层边界（任务 5）', () => {
  it('财务资料的空资源列表以空状态承载，并清楚说明如何建立', () => {
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: '财务资料' }))

    const empty = screen.getByRole('status', { name: '暂无内容' })
    expect(within(empty).getByText('暂无收入类目')).toBeVisible()
    expect(
      within(empty).getByText('建立收入类目后，财务登记时才可选择对应类目。')
    ).toBeVisible()
    expect(screen.queryByRole('table', { name: '收入类目列表' })).not.toBeInTheDocument()
  })

  it('表单内校验错误落在字段槽位，不上升为全局通知', async () => {
    renderSettings()

    fireEvent.click(screen.getByRole('button', { name: '编辑工作室参数' }))
    const sheet = screen.getByRole('dialog', { name: '编辑工作室参数' })
    fireEvent.change(
      within(sheet).getByRole('textbox', { name: '订单默认预留天数（天）' }),
      {
        target: { value: 'abc' }
      }
    )
    fireEvent.click(within(sheet).getByRole('button', { name: '保存工作室参数' }))

    expect(await within(sheet).findByText('订单默认预留天数必须是非负整数')).toBeVisible()
    expect(mocks.studio.update).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '编辑工作室参数' })).toBeVisible()
    const host = screen.getByLabelText('全局通知')
    expect(
      within(host).queryByText('订单默认预留天数必须是非负整数')
    ).not.toBeInTheDocument()
  })

  it('Sheet、Dialog 与 ConfirmDialog 是模式根外的 Portal 兄弟节点', () => {
    mocks.finance.categories = [
      {
        id: 'income-used',
        direction: 'income',
        name: '定金收入',
        enabled: true,
        createdAt: '2026-09-08T00:00:00.000Z',
        updatedAt: '2026-09-08T00:00:00.000Z'
      }
    ]
    renderSettings()
    const root = document.querySelector('[data-page-pattern="settings-workspace"]')!

    fireEvent.click(screen.getByRole('button', { name: '编辑工作室参数' }))
    const sheet = screen.getByRole('dialog', { name: '编辑工作室参数' })
    expect(root.contains(sheet)).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '关闭编辑工作室参数' }))

    fireEvent.click(screen.getByRole('button', { name: '财务资料' }))
    fireEvent.click(screen.getByRole('button', { name: '新增收入类目' }))
    const dialog = screen.getByRole('dialog', { name: '新增收入类目' })
    expect(root.contains(dialog)).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '关闭新增收入类目' }))

    fireEvent.click(screen.getByRole('button', { name: '删除定金收入' }))
    const confirm = screen.getByRole('alertdialog', { name: '删除基础资料？' })
    expect(root.contains(confirm)).toBe(false)
    expect(document.querySelectorAll('[data-page-pattern="settings-workspace"]')).toHaveLength(1)
  })
})
