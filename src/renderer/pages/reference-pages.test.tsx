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
import { YumiNotificationProvider } from '../components/ui'
const render = (ui: Parameters<typeof renderBase>[0]) =>
  renderBase(<YumiNotificationProvider>{ui}</YumiNotificationProvider>)
import type { V2Product } from '@shared/contracts/index'
import { installDomInteractionPolyfills } from '../test/dom'
import { CustomersPage } from './customers'
import { ProductsPage } from './products'
import { SettingsPage } from './settings'
import { WorkersPage } from './workers'

const mocks = vi.hoisted(() => ({
  customers: {
    createCustomer: vi.fn(),
    customers: [] as Array<{
      id: string
      name: string
      contact: string | null
      defaultAddress: string | null
      notes: string | null
      enabled: boolean
      createdAt: string
      updatedAt: string
    }>,
    getCustomerOrderInsights: vi.fn(),
    loadError: null as string | null,
    loading: false,
    updateCustomer: vi.fn()
  },
  products: {
    createProduct: vi.fn(),
    loadError: null as string | null,
    loading: false,
    products: [] as V2Product[],
    updateProduct: vi.fn()
  },
  studio: {
    loadError: null as string | null,
    loading: false,
    settings: {
      gluePriceMicroYuanPerGram: 3_400,
      orderReservedDays: 2,
      updatedAt: '2026-09-08T00:00:00.000Z'
    } as {
      gluePriceMicroYuanPerGram: number
      orderReservedDays: number
      updatedAt: string | null
    } | null,
    update: vi.fn()
  },
  backup: {
    create: vi.fn(async () => ({})),
    list: vi.fn(async () => []),
    restore: vi.fn(async () => ({}))
  },
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
  }
}))

vi.mock('../composables/use-customers', () => ({
  useCustomers: () => mocks.customers
}))
vi.mock('../composables/use-finance', () => ({
  useFinance: () => mocks.finance
}))
vi.mock('../composables/use-products', () => ({
  useProducts: () => mocks.products
}))
vi.mock('../composables/use-studio-settings', () => ({
  useStudioSettings: () => mocks.studio
}))

installDomInteractionPolyfills()
Object.assign(window, { yumiV2: { backup: mocks.backup } })
afterEach(() => {
  cleanup()
  mocks.customers.customers = []
  mocks.customers.createCustomer.mockReset()
  mocks.customers.getCustomerOrderInsights.mockReset()
  mocks.customers.getCustomerOrderInsights.mockResolvedValue(null)
  mocks.customers.updateCustomer.mockReset()
  mocks.products.products = []
  mocks.products.createProduct.mockReset()
  mocks.products.updateProduct.mockReset()
  mocks.studio.settings = {
    gluePriceMicroYuanPerGram: 3_400,
    orderReservedDays: 2,
    updatedAt: '2026-09-08T00:00:00.000Z'
  }
  mocks.studio.update.mockReset()
  mocks.backup.create.mockReset()
  mocks.backup.list.mockReset()
  mocks.backup.restore.mockReset()
  mocks.backup.create.mockResolvedValue({})
  mocks.backup.list.mockResolvedValue([])
  mocks.backup.restore.mockResolvedValue({})
  mocks.finance.categories = []
  mocks.finance.advancePayers = []
  mocks.finance.createCategory.mockReset()
  mocks.finance.updateCategory.mockReset()
  mocks.finance.deleteCategory.mockReset()
  mocks.finance.createAdvancePayer.mockReset()
  mocks.finance.updateAdvancePayer.mockReset()
  mocks.finance.deleteAdvancePayer.mockReset()
})

describe('YUMI 基础资料按需录入', () => {
  it('客户空状态复用页面唯一的新建入口，点击后才打开抽屉', () => {
    render(<CustomersPage />)

    expect(screen.getByRole('status', { name: '首次使用' })).toBeVisible()
    expect(screen.getByText('还没有客户资料')).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    expect(screen.queryByRole('button', { name: '建立首个客户' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '新建客户' }))
    expect(screen.getByRole('dialog', { name: '新建客户' })).toBeVisible()
  })

  it('新建客户保存失败时通过全局浮层反馈且不插入抽屉内容', async () => {
    mocks.customers.createCustomer.mockRejectedValueOnce(new Error('客户名称已存在'))
    render(<CustomersPage />)

    expect(screen.queryByRole('button', { name: '建立首个客户' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '新建客户' }))
    const dialog = screen.getByRole('dialog', { name: '新建客户' })
    fireEvent.change(within(dialog).getByLabelText(/客户名称/), { target: { value: '木木工作室' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '创建客户' }))

    const notification = await screen.findByRole('alert', { hidden: true })
    expect(notification).toHaveTextContent('客户名称已存在')
    expect(dialog).not.toContainElement(notification)
  })

  it('点击既有客户先查看资料与历史订单，主动点击编辑后才进入编辑抽屉', async () => {
    mocks.customers.customers = [
      {
        id: 'customer-1',
        name: '木木工作室',
        contact: '王女士',
        defaultAddress: '上海市静安区',
        notes: null,
        enabled: true,
        createdAt: '2026-09-08T00:00:00.000Z',
        updatedAt: '2026-09-08T00:00:00.000Z'
      }
    ]
    mocks.customers.getCustomerOrderInsights.mockResolvedValue({
      customerId: 'customer-1',
      customerName: '木木工作室',
      orderCount: 1,
      totalCurrentAmountCents: 12_800,
      totalNetReceivedCents: 8_000,
      totalOutstandingCents: 4_800,
      latestOrderDate: '2026-09-08',
      orders: [
        {
          orderId: 'order-1',
          orderCode: 'YUMI-001',
          createdAt: '2026-09-08T08:00:00.000Z',
          currentAmountCents: 12_800,
          netReceivedCents: 8_000,
          outstandingCents: 4_800,
          shipmentStatus: '未发货',
          orderStatus: '排班中'
        }
      ]
    })
    const onNavigate = vi.fn()
    render(<CustomersPage onNavigate={onNavigate} />)

    expect(screen.getByText(/订单会保留当时的客户快照。/)).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '查看客户资料：木木工作室' }))

    const detail = screen.getByRole('dialog', { name: '客户资料：木木工作室' })
    expect(within(detail).queryByLabelText('默认收货地址')).not.toBeInTheDocument()
    expect(await within(detail).findByText('YUMI-001')).toBeVisible()
    expect(within(detail).getByText('排班中 · 未发货')).toBeVisible()
    expect(within(detail).getAllByText('¥128.00')).toHaveLength(2)
    fireEvent.click(within(detail).getByRole('button', { name: '查看订单' }))
    expect(onNavigate).toHaveBeenCalledWith({
      view: 'orders',
      orderId: 'order-1',
      orderView: 'overview'
    })
    fireEvent.click(within(detail).getByRole('button', { name: '编辑客户' }))
    expect(screen.getByRole('dialog', { name: '编辑客户：木木工作室' })).toBeVisible()
    expect(screen.getByLabelText('默认收货地址')).toHaveValue('上海市静安区')
  })

  it('客户列表使用统一工具条，并支持关键字与状态筛选', async () => {
    mocks.customers.customers = [
      {
        id: 'customer-1',
        name: '木木工作室',
        contact: '王女士',
        defaultAddress: '上海市静安区',
        notes: null,
        enabled: true,
        createdAt: '2026-09-08T00:00:00.000Z',
        updatedAt: '2026-09-08T00:00:00.000Z'
      },
      {
        id: 'customer-2',
        name: '云朵工坊',
        contact: '李女士',
        defaultAddress: null,
        notes: '暂停接单',
        enabled: false,
        createdAt: '2026-09-07T00:00:00.000Z',
        updatedAt: '2026-09-07T00:00:00.000Z'
      }
    ]
    render(<CustomersPage />)

    expect(screen.getByRole('toolbar', { name: '客户列表工具' })).toBeVisible()
    expect(screen.getByRole('table', { name: '客户列表' })).toBeVisible()
    expect(screen.getByText('共 2 位客户')).toBeVisible()

    fireEvent.change(screen.getByRole('textbox', { name: '搜索客户' }), {
      target: { value: '云朵' }
    })
    expect(screen.getByText('云朵工坊')).toBeVisible()
    expect(screen.queryByText('木木工作室')).not.toBeInTheDocument()
    expect(screen.getByText('共 1 位客户')).toBeVisible()

    fireEvent.change(screen.getByRole('textbox', { name: '搜索客户' }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('combobox', { name: '客户状态筛选' }))
    fireEvent.click(await screen.findByRole('option', { name: '已停用' }))
    expect(screen.getByText('云朵工坊')).toBeVisible()
    expect(screen.queryByText('木木工作室')).not.toBeInTheDocument()
  })

  it('商品可维护材料损耗与模具日产能参数，并在列表中展示计算结果', () => {
    mocks.products.products = [
      {
        id: 'product-1',
        name: '羊毛杯垫',
        code: 'MAT-001',
        category: '杯垫',
        basePriceCents: 10_800,
        materialCostCents: 0,
        packagingCostCents: 200,
        accessoryCostCents: 100,
        replacementBagCostCents: 0,
        internalEdgeCostCents: 0,
        standardMakingMinutes: 30,
        makingCommissionCents: 2_000,
        makingGlueCostCents: 0,
        glueWeightMilligrams: 500,
        unitWeightMilligrams: 20_000,
        materialLossRateBasisPoints: 1_000,
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
    ]
    render(<ProductsPage />)

    expect(screen.getByRole('toolbar', { name: '商品列表工具' })).toBeVisible()
    expect(screen.getByRole('table', { name: '商品列表' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: '搜索商品' })).toBeVisible()
    expect(screen.getByText('40 件')).toBeVisible()
    expect(screen.getByText(/材料 20 克 · 损耗 10%/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '查看商品资料：羊毛杯垫' }))
    const detail = screen.getByRole('dialog', { name: '商品资料：羊毛杯垫' })
    expect(within(detail).queryByLabelText('单件材料重量（克）')).not.toBeInTheDocument()
    fireEvent.click(within(detail).getByRole('button', { name: '编辑商品' }))
    const editor = screen.getByRole('dialog', { name: '编辑商品：羊毛杯垫' })
    expect(editor).toBeVisible()
    fireEvent.click(within(editor).getByRole('button', { name: '取消' }))

    fireEvent.click(screen.getByRole('button', { name: '新建商品' }))
    const dialog = screen.getByRole('dialog', { name: '新建商品' })
    expect(within(dialog).getByLabelText('单件材料重量（克）')).toHaveValue('0')
    expect(within(dialog).getByLabelText('材料损耗率（%）')).toHaveValue('0')
    expect(within(dialog).getByLabelText('模具数量')).toHaveValue('0')
    expect(within(dialog).getByText('填写完整模具参数后计算')).toBeVisible()
  })

  it('被财务流水引用的资料删除失败时保留当前资料，并明确反馈负责人', async () => {
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
    mocks.finance.deleteCategory.mockRejectedValueOnce(
      new Error('该类目已被财务流水引用，不能删除')
    )
    render(<SettingsPage />)

    fireEvent.click(screen.getByRole('button', { name: '财务资料' }))
    fireEvent.click(screen.getByRole('button', { name: '删除定金收入' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      '如果资料已被财务流水引用，系统会保留原有数据并拒绝删除。'
    )
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => expect(mocks.finance.deleteCategory).toHaveBeenCalledWith('income-used'))
    expect(await screen.findByRole('alert', { hidden: true })).toHaveTextContent(
      '该类目已被财务流水引用，不能删除'
    )
    expect(screen.getByText('定金收入')).toBeVisible()
  })
})

describe('YUMI 人员时薪与动态设置', () => {
  it('人员默认只展示列表，新增和调整时薪分别在抽屉中完成', async () => {
    const workers = [
      {
        id: 'worker-1',
        name: '小林',
        note: null,
        enabled: true,
        createdAt: '2026-09-08T00:00:00.000Z',
        updatedAt: '2026-09-08T00:00:00.000Z'
      },
      {
        id: 'worker-2',
        name: '小夏',
        note: '可做捏毛',
        enabled: true,
        createdAt: '2026-09-08T00:00:00.000Z',
        updatedAt: '2026-09-08T00:00:00.000Z'
      }
    ]
    const listWageHistory = vi.fn(async (workerId: string) =>
      workerId === 'worker-2'
        ? [
            {
              id: 'wage-2',
              workerId,
              effectiveOn: '2026-09-01',
              hourlyWageCents: 2500,
              createdAt: '2026-09-01T00:00:00.000Z'
            }
          ]
        : [
            {
              id: 'wage-1',
              workerId,
              effectiveOn: '2026-08-01',
              hourlyWageCents: 2200,
              createdAt: '2026-08-01T00:00:00.000Z'
            }
          ]
    )
    render(
      <WorkersPage
        createWorker={vi.fn()}
        listWageHistory={listWageHistory}
        recordWageHistory={vi.fn()}
        workers={workers}
      />
    )

    expect(screen.getByRole('button', { name: '新增人员' })).toBeVisible()
    expect(screen.getByRole('toolbar', { name: '兼职人员列表工具' })).toBeVisible()
    expect(screen.getByRole('table', { name: '兼职人员列表' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: '搜索兼职人员' })).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '首个时薪生效日期' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '查看人员资料：小夏' }))
    const profile = await screen.findByRole('dialog', { name: '人员资料：小夏' })
    await waitFor(() => expect(listWageHistory).toHaveBeenCalledWith('worker-2'))
    expect(within(profile).getByRole('region', { name: '兼职人员资料' })).toHaveClass(
      'yumi-detail-list'
    )
    expect(within(profile).getByRole('heading', { level: 2, name: '时薪历史' })).toBeVisible()
    expect(within(profile).getByRole('table', { name: '时薪历史记录' })).toBeVisible()
    expect(profile.querySelector('.yumi-profile-sheet')).not.toBeInTheDocument()
    expect(within(profile).getByRole('cell', { name: '2026-09-01' })).toBeVisible()
    expect(within(profile).getByRole('cell', { name: '25.00' })).toBeVisible()
    fireEvent.click(within(profile).getByRole('button', { name: '调整时薪' }))
    expect(within(profile).getByRole('button', { name: '时薪生效日期' })).toBeVisible()

    fireEvent.click(within(profile).getByRole('button', { name: '关闭人员资料：小夏' }))
    fireEvent.click(screen.getByRole('button', { name: '新增人员' }))
    const createSheet = screen.getByRole('dialog', { name: '新增兼职人员' })
    expect(within(createSheet).getByRole('button', { name: '首个时薪生效日期' })).toBeVisible()
  })

  it('设置以互斥模式进入财务资料，并按当前资料类型新建', async () => {
    mocks.finance.categories = [
      {
        id: 'income-1',
        direction: 'income',
        name: '定金收入',
        enabled: true,
        createdAt: '2026-09-08T00:00:00.000Z',
        updatedAt: '2026-09-08T00:00:00.000Z'
      },
      {
        id: 'expense-1',
        direction: 'expense',
        name: '工作室房租',
        enabled: true,
        createdAt: '2026-09-08T00:00:00.000Z',
        updatedAt: '2026-09-08T00:00:00.000Z'
      }
    ]
    mocks.finance.advancePayers = [
      {
        id: 'payer-1',
        name: '小林',
        note: '临时垫付',
        enabled: true,
        createdAt: '2026-09-08T00:00:00.000Z',
        updatedAt: '2026-09-08T00:00:00.000Z'
      }
    ]
    mocks.finance.createCategory.mockResolvedValue({})
    render(<SettingsPage />)

    expect(screen.getByRole('heading', { level: 1, name: '工作室参数' })).toBeVisible()
    expect(screen.getByText('0.0034 元 / 克')).toBeVisible()
    expect(screen.queryByText('定金收入')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '编辑工作室参数' }))
    const studioDialog = screen.getByRole('dialog', { name: '编辑工作室参数' })
    expect(within(studioDialog).getByDisplayValue('0.0034')).toBeVisible()
    fireEvent.change(within(studioDialog).getByRole('textbox', { name: /元 \/ 克/ }), {
      target: { value: '0.0034' }
    })
    fireEvent.click(within(studioDialog).getByRole('button', { name: '保存工作室参数' }))
    await waitFor(() =>
      expect(mocks.studio.update).toHaveBeenCalledWith({
        gluePriceMicroYuanPerGram: 3_400,
        orderReservedDays: 2
      })
    )
    expect(await screen.findByRole('status')).toHaveTextContent('已保存工作室参数')

    fireEvent.click(screen.getByRole('button', { name: '财务资料' }))
    expect(screen.getByRole('heading', { name: '财务资料' })).toBeVisible()
    expect(screen.getByRole('button', { name: '收入类目' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('region', { name: '收入类目记录区' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '收入类目' })).toBeVisible()
    expect(screen.getByRole('toolbar', { name: '收入类目列表工具' })).toBeVisible()
    expect(screen.getByRole('table', { name: '收入类目列表' })).toBeVisible()
    expect(screen.getByText('定金收入')).toBeVisible()
    expect(screen.queryByText('工作室房租')).not.toBeInTheDocument()
    expect(screen.queryByText('小林')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '支出类目' }))
    expect(screen.getByRole('button', { name: '支出类目' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('toolbar', { name: '支出类目列表工具' })).toBeVisible()
    expect(screen.getByRole('table', { name: '支出类目列表' })).toBeVisible()
    expect(screen.getByText('工作室房租')).toBeVisible()
    expect(screen.queryByText('定金收入')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新增支出类目' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '收入类目' }))
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

    fireEvent.click(screen.getByRole('button', { name: '私人垫付人' }))
    expect(screen.getByRole('button', { name: '私人垫付人' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('toolbar', { name: '私人垫付人列表工具' })).toBeVisible()
    expect(screen.getByRole('table', { name: '私人垫付人列表' })).toBeVisible()
    expect(screen.getByText('小林')).toBeVisible()
    expect(screen.queryByText('定金收入')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新增垫付人' })).toBeVisible()
  })

  it('数据保护只在确认后恢复，并在立即备份后刷新记录', async () => {
    const backup = {
      id: 'backup-1',
      backupPath: '/tmp/backup-1',
      createdAt: '2026-09-08T10:00:00.000Z',
      reason: 'manual' as const,
      applicationVersion: '2.0.0',
      attachmentCount: 3
    }
    mocks.backup.list.mockResolvedValue([backup])
    render(<SettingsPage />)

    fireEvent.click(screen.getByRole('button', { name: '数据保护' }))
    expect(await screen.findByRole('region', { name: '备份记录区' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '备份记录' })).toBeVisible()
    expect(screen.getByRole('toolbar', { name: '备份记录列表工具' })).toBeVisible()
    expect(screen.getByRole('table', { name: '备份记录列表' })).toBeVisible()
    expect(screen.getByText('手动备份')).toBeVisible()
    expect(screen.getByText('3 个附件 · 版本 2.0.0')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /恢复.*备份/ }))
    expect(screen.getByRole('alertdialog')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(mocks.backup.restore).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '立即备份' }))
    await waitFor(() => expect(mocks.backup.create).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mocks.backup.list).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: /恢复.*备份/ }))
    fireEvent.click(screen.getByRole('button', { name: '恢复此备份' }))
    await waitFor(() =>
      expect(mocks.backup.restore).toHaveBeenCalledWith({
        backupPath: '/tmp/backup-1',
        confirmed: true
      })
    )
  })
})
