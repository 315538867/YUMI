/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import {
  cleanup,
  fireEvent,
  render as renderBase,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YumiNotificationProvider } from '../../components/ui'
const render = (ui: Parameters<typeof renderBase>[0]) =>
  renderBase(<YumiNotificationProvider>{ui}</YumiNotificationProvider>)
import type { V2Product } from '@shared/contracts/index'
import { installDomInteractionPolyfills } from '../../test/dom'
import { ProductsPage } from './index'

const productFixture: V2Product = {
  id: 'product-1',
  name: '羊毛杯垫',
  code: 'SP0007',
  basePriceCents: 10_800,
  packagingCostCents: 200,
  accessoryCostCents: 100,
  replacementBagCostCents: 0,
  edgeConsumableCostCents: 0,
  fixedCostCents: 120,
  unitWeightMilligrams: 20_000,
  standardMakingMinutes: 30,
  expectedFluffingBaggingMinutes: 10,
  expectedEdgeSewingMinutes: 8,
  expectedPackingMinutes: 5,
  makingCommissionCents: 2_000,
  fluffingBaggingCommissionCents: 888,
  edgeSewingCommissionCents: 0,
  moldCount: 20,
  outputPerMoldPerBatch: 1,
  maxBatchesPerDay: 2,
  dailyCapacity: 40,
  enabled: true,
  imageAttachmentId: null,
  notes: null,
  createdAt: '2026-09-09T00:00:00.000Z',
  updatedAt: '2026-09-09T00:00:00.000Z'
}

const mocks = vi.hoisted(() => ({
  products: [] as V2Product[],
  loading: false,
  loadError: null as string | null,
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  getExpectedProfit: vi.fn(),
  settings: null as {
    materialPriceMicroYuanPerGram: number
    orderReservedDays: number
    fluffingBaggingExpectedHourlyWageCents: number
    edgeSewingExpectedHourlyWageCents: number
    packingExpectedHourlyWageCents: number
    updatedAt: string | null
  } | null,
  settingsLoading: false,
  settingsError: null as string | null
}))

vi.mock('../../composables/use-products', () => ({
  useProducts: () => mocks
}))
vi.mock('../../composables/use-studio-settings', () => ({
  useStudioSettings: () => mocks
}))
vi.mock('../../composables/use-product-inventory', () => ({
  useProductInventory: () => ({
    summary: { stages: { made: 0, fluffing_bagging_done: 0, edge_sewing_done: 0, packed: 0 } },
    events: [],
    loading: false,
    loadError: null,
    reload: vi.fn(),
    recordOpening: vi.fn(),
    adjust: vi.fn(),
    allocateToOrder: vi.fn(),
    loadAllocatableOrderItems: vi.fn(async () => [])
  })
}))

installDomInteractionPolyfills()
afterEach(() => {
  cleanup()
  mocks.products = []
  mocks.getExpectedProfit.mockReset()
  mocks.getExpectedProfit.mockResolvedValue(null)
  mocks.settings = {
    materialPriceMicroYuanPerGram: 3_400,
    orderReservedDays: 2,
    fluffingBaggingExpectedHourlyWageCents: 0,
    edgeSewingExpectedHourlyWageCents: 0,
    packingExpectedHourlyWageCents: 0,
    updatedAt: '2026-09-08T00:00:00.000Z'
  }
})

describe('P3 · 商品 Pattern 根契约（任务 11.1）', () => {
  it('列表态只渲染一个 List Page 根，页头、工具条与记录区按模式层级呈现', () => {
    mocks.products = [productFixture]
    render(<ProductsPage />)

    const roots = document.querySelectorAll('[data-page-pattern]')
    expect(roots).toHaveLength(1)
    const root = roots[0] as HTMLElement
    expect(root).toHaveAttribute('data-page-pattern', 'list-page')
    expect(root).toHaveAttribute('data-density', 'compact')
    expect(within(root).getByRole('heading', { name: '商品' })).toBeVisible()
    expect(within(root).getByRole('toolbar', { name: '商品列表工具' })).toBeVisible()
    expect(within(root).getByRole('table', { name: '商品列表' })).toBeVisible()
    expect(document.querySelector('.yumi-page-header__actions')).not.toBeNull()
  })

  it('新建态独占 Form Workspace 根，返回导航在页头、存活动作在粘性动作区、盈利预览在侧栏', () => {
    render(<ProductsPage />)

    fireEvent.click(screen.getByRole('button', { name: '新建商品' }))

    const roots = document.querySelectorAll('[data-page-pattern]')
    expect(roots).toHaveLength(1)
    const root = roots[0] as HTMLElement
    expect(root).toHaveAttribute('data-page-pattern', 'form-workspace')
    expect(root).toHaveAttribute('data-density', 'standard')
    expect(within(root).getByRole('navigation', { name: '返回商品列表' })).toBeVisible()
    expect(within(root).getByRole('button', { name: '返回商品列表' })).toBeVisible()
    expect(root.querySelector('form#product-workspace-form')).not.toBeNull()

    const sticky = root.querySelector('.yumi-sticky-actions') as HTMLElement
    expect(sticky).not.toBeNull()
    expect(within(sticky).getByRole('button', { name: '创建商品' })).toBeVisible()

    const aside = root.querySelector('.yumi-split-layout__aside') as HTMLElement
    expect(aside).not.toBeNull()
    expect(within(aside).getByText('预计盈利预览')).toBeVisible()
    expect(within(aside).getByText('默认售价')).toBeVisible()
  })

  it('详情态独占 Detail Page 根，页头、Tab 与当前区块按模式层级呈现', async () => {
    mocks.products = [productFixture]
    render(<ProductsPage />)

    fireEvent.click(screen.getByRole('button', { name: '查看商品资料：羊毛杯垫' }))

    const roots = document.querySelectorAll('[data-page-pattern]')
    expect(roots).toHaveLength(1)
    const root = roots[0] as HTMLElement
    expect(root).toHaveAttribute('data-page-pattern', 'detail-page')
    expect(root).toHaveAttribute('data-density', 'standard')
    expect(within(root).getByRole('heading', { name: '羊毛杯垫' })).toBeVisible()
    expect(within(root).getByRole('button', { name: '返回商品列表' })).toBeVisible()

    const tabs = within(root).getByRole('navigation', { name: '商品详情标签' })
    const body = root.querySelector('.yumi-detail-page__body') as HTMLElement
    expect(body).not.toBeNull()
    expect(within(tabs).getByRole('button', { name: '商品概览' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(within(body).getByText('商品名称')).toBeVisible()

    fireEvent.click(within(tabs).getByRole('button', { name: '成本与预计盈利' }))
    await waitFor(() => expect(mocks.getExpectedProfit).toHaveBeenCalledWith('product-1'))
    expect(await within(body).findByText('预计单件利润')).toBeVisible()

    fireEvent.click(within(tabs).getByRole('button', { name: '制作产能' }))
    expect(await within(body).findByText('日产能')).toBeVisible()
    expect(within(body).getByText('40 件/日')).toBeVisible()

    fireEvent.click(within(tabs).getByRole('button', { name: '存量' }))
    expect(await within(body).findByText('已制作，待捏毛装袋')).toBeVisible()
    expect(within(body).getByText('暂无商品存量流水')).toBeVisible()
  })

  it('列表/新建/详情/编辑切换始终只有一个页面模式根', async () => {
    mocks.products = [productFixture]
    render(<ProductsPage />)

    fireEvent.click(screen.getByRole('button', { name: '新建商品' }))
    expect(document.querySelectorAll('[data-page-pattern]')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '创建商品' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '返回商品列表' }))
    expect(document.querySelectorAll('[data-page-pattern]')).toHaveLength(1)
    expect(document.querySelector('[data-page-pattern]')).toHaveAttribute(
      'data-page-pattern',
      'list-page'
    )

    fireEvent.click(screen.getByRole('button', { name: '查看商品资料：羊毛杯垫' }))
    await screen.findByRole('heading', { name: '羊毛杯垫' })
    expect(document.querySelectorAll('[data-page-pattern]')).toHaveLength(1)
    expect(document.querySelector('[data-page-pattern]')).toHaveAttribute(
      'data-page-pattern',
      'detail-page'
    )

    fireEvent.click(screen.getByRole('button', { name: '编辑商品' }))
    expect(document.querySelectorAll('[data-page-pattern]')).toHaveLength(1)
    const editRoot = document.querySelector('[data-page-pattern]') as HTMLElement
    expect(editRoot).toHaveAttribute('data-page-pattern', 'form-workspace')
    expect(within(editRoot).getByRole('button', { name: '保存商品' })).toBeVisible()
    expect(screen.getByLabelText('制作提成（元/件）')).toHaveValue('20.00')
  })
})

describe('P3 · 商品列表详情与表单工作区信息层级（Task 3）', () => {
  it('商品创建页在较窄桌面压缩预览而不逐字断开，操作条覆盖自身底部区域', () => {
    render(<ProductsPage />)
    fireEvent.click(screen.getByRole('button', { name: '新建商品' }))
    const root = document.querySelector('[data-page-pattern="form-workspace"]')!
    expect(root.querySelector('.yumi-form-workspace__content')).not.toBeNull()
    expect(root.querySelector('.yumi-sticky-actions')).toHaveAttribute(
      'data-layout-surface',
      'fixed'
    )
  })

  it('商品创建工作区把保存动作固定在内容区之外的粘性操作条，筛选只在列表工具栏', () => {
    render(<ProductsPage />)
    fireEvent.click(screen.getByRole('button', { name: '新建商品' }))

    const root = document.querySelector('[data-page-pattern="form-workspace"]') as HTMLElement
    const content = root.querySelector('.yumi-form-workspace__content') as HTMLElement
    const sticky = root.querySelector('.yumi-sticky-actions') as HTMLElement
    const form = root.querySelector('form#product-workspace-form') as HTMLElement
    expect(content).not.toBeNull()
    expect(sticky).not.toBeNull()
    expect(content.contains(sticky)).toBe(false)
    expect(form.querySelectorAll('button').length).toBe(0)
    expect(within(sticky).getByRole('button', { name: '创建商品' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '返回商品列表' }))
    const listRoot = document.querySelector('[data-page-pattern="list-page"]') as HTMLElement
    expect(
      (listRoot.querySelector('.yumi-page-header') as HTMLElement).querySelectorAll(
        '[role="combobox"]'
      ).length
    ).toBe(0)
    expect(
      within(listRoot.querySelector('.yumi-list-toolbar') as HTMLElement).getByRole('combobox', {
        name: '商品状态筛选'
      })
    ).toBeVisible()
  })

  it('商品详情页头、Tab 与各区块标题互不重复，标题只承担单个上下文', async () => {
    mocks.products = [productFixture]
    render(<ProductsPage />)
    fireEvent.click(screen.getByRole('button', { name: '查看商品资料：羊毛杯垫' }))
    await screen.findByRole('heading', { name: '羊毛杯垫' })

    const root = document.querySelector('[data-page-pattern="detail-page"]') as HTMLElement
    const headerTitle = (
      root.querySelector('.yumi-page-header h1') as HTMLElement
    ).textContent!.trim()
    const tabs = within(root).getByRole('navigation', { name: '商品详情标签' })
    const tabLabels = Array.from(within(tabs).getAllByRole('button')).map(
      (button) => button.textContent!.trim()
    )
    expect(tabLabels, '存量 Tab 不再与区块标题「商品存量」同名').toContain('存量')

    for (const tab of tabLabels) {
      fireEvent.click(within(tabs).getByRole('button', { name: tab }))
      const body = root.querySelector('.yumi-detail-page__body') as HTMLElement
      if (tab === '成本与预计盈利') {
        await within(body).findByText('预计单件利润')
      }
      const sectionTitles = Array.from(body.querySelectorAll('h2')).map(
        (heading) => heading.textContent!.trim()
      )
      for (const section of sectionTitles) {
        expect(section, `区块标题「${section}」重复当前 Tab「${tab}」`).not.toBe(tab)
        expect(
          section,
          `区块标题「${section}」重复页头标题「${headerTitle}」`
        ).not.toBe(headerTitle)
      }
    }
  })

  it('商品创建页保留长中文标签与极端金额，预览与表单各居其位', () => {
    render(<ProductsPage />)
    fireEvent.click(screen.getByRole('button', { name: '新建商品' }))

    const root = document.querySelector('[data-page-pattern="form-workspace"]') as HTMLElement
    const form = within(root.querySelector('form#product-workspace-form') as HTMLElement)
    expect(form.getByText('预计单件制作时长（分钟）')).toBeVisible()
    expect(form.getByText('预计单件捏毛装袋时长（分钟）')).toBeVisible()
    expect(form.getByText('预计单件打包发货时长（分钟）')).toBeVisible()
    fireEvent.change(form.getByLabelText('默认销售单价（元）'), {
      target: { value: '9999999999.99' }
    })

    const aside = root.querySelector('.yumi-split-layout__aside') as HTMLElement
    expect(aside).not.toBeNull()
    expect(within(aside).getByText('预计盈利预览')).toBeVisible()
    expect(
      within(aside).getAllByText('¥9999999999.99').length,
      '极端金额至少同时出现在默认售价与利润预览中'
    ).toBeGreaterThan(0)
  })
})
