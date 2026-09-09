/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installDomInteractionPolyfills } from '../test/dom'
import { CustomersPage } from './customers'
import { SettingsPage } from './settings'
import { WorkersPage } from './workers'

const mocks = vi.hoisted(() => ({
  customers: {
    createCustomer: vi.fn(),
    customers: [] as Array<{ id: string; name: string; contact: string | null; defaultAddress: string | null; notes: string | null; enabled: boolean; createdAt: string; updatedAt: string }>,
    loadError: null as string | null,
    loading: false,
    updateCustomer: vi.fn()
  },
  studio: {
    loadError: null as string | null,
    loading: false,
    settings: { gluePriceMicroYuanPerGram: 3_400, updatedAt: '2026-09-08T00:00:00.000Z' } as { gluePriceMicroYuanPerGram: number; updatedAt: string | null } | null,
    update: vi.fn()
  },
  backup: {
    create: vi.fn(async () => ({})),
    list: vi.fn(async () => []),
    restore: vi.fn(async () => ({}))
  },
  finance: {
    advancePayers: [] as Array<{ id: string; name: string; note: string | null; enabled: boolean; createdAt: string; updatedAt: string }>,
    categories: [] as Array<{ id: string; direction: 'income' | 'expense'; name: string; enabled: boolean; createdAt: string; updatedAt: string }>,
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
vi.mock('../composables/use-studio-settings', () => ({
  useStudioSettings: () => mocks.studio
}))

installDomInteractionPolyfills()
Object.assign(window, { yumiV2: { backup: mocks.backup } })
afterEach(() => {
  cleanup()
  mocks.customers.customers = []
  mocks.customers.createCustomer.mockReset()
  mocks.customers.updateCustomer.mockReset()
  mocks.studio.settings = { gluePriceMicroYuanPerGram: 3_400, updatedAt: '2026-09-08T00:00:00.000Z' }
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

  it('新建客户保存失败时在抽屉中保留错误反馈', async () => {
    mocks.customers.createCustomer.mockRejectedValueOnce(new Error('客户名称已存在'))
    render(<CustomersPage />)

    expect(screen.queryByRole('button', { name: '建立首个客户' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '新建客户' }))
    const dialog = screen.getByRole('dialog', { name: '新建客户' })
    fireEvent.change(within(dialog).getByLabelText(/客户名称/), { target: { value: '木木工作室' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '创建客户' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('客户名称已存在')
  })

  it('点击既有客户后才进入编辑抽屉，保留客户快照说明', () => {
    mocks.customers.customers = [{
      id: 'customer-1', name: '木木工作室', contact: '王女士', defaultAddress: '上海市静安区', notes: null, enabled: true,
      createdAt: '2026-09-08T00:00:00.000Z', updatedAt: '2026-09-08T00:00:00.000Z'
    }]
    render(<CustomersPage />)

    expect(screen.getByText(/订单会保留当时的客户快照。/)).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /木木工作室/ }))

    expect(screen.getByRole('dialog', { name: '编辑客户：木木工作室' })).toBeVisible()
    expect(screen.getByLabelText('默认收货地址')).toHaveValue('上海市静安区')
  })

  it('被财务流水引用的资料删除失败时保留当前资料，并明确反馈负责人', async () => {
    mocks.finance.categories = [{
      id: 'income-used', direction: 'income', name: '定金收入', enabled: true,
      createdAt: '2026-09-08T00:00:00.000Z', updatedAt: '2026-09-08T00:00:00.000Z'
    }]
    mocks.finance.deleteCategory.mockRejectedValueOnce(new Error('该类目已被财务流水引用，不能删除'))
    render(<SettingsPage />)

    fireEvent.click(screen.getByRole('button', { name: '财务资料' }))
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('如果资料已被财务流水引用，系统会保留原有数据并拒绝删除。')
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => expect(mocks.finance.deleteCategory).toHaveBeenCalledWith('income-used'))
    expect(await screen.findByRole('alert')).toHaveTextContent('该类目已被财务流水引用，不能删除')
    expect(screen.getByText('定金收入')).toBeVisible()
  })
})

describe('YUMI 人员时薪与动态设置', () => {
  it('人员默认只展示列表，新增和调整时薪分别在抽屉中完成', async () => {
    const workers = [
      { id: 'worker-1', name: '小林', note: null, enabled: true, createdAt: '2026-09-08T00:00:00.000Z', updatedAt: '2026-09-08T00:00:00.000Z' },
      { id: 'worker-2', name: '小夏', note: '可做捏毛', enabled: true, createdAt: '2026-09-08T00:00:00.000Z', updatedAt: '2026-09-08T00:00:00.000Z' }
    ]
    const listWageHistory = vi.fn(async (workerId: string) => workerId === 'worker-2'
      ? [{ id: 'wage-2', workerId, effectiveOn: '2026-09-01', hourlyWageCents: 2500, createdAt: '2026-09-01T00:00:00.000Z' }]
      : [{ id: 'wage-1', workerId, effectiveOn: '2026-08-01', hourlyWageCents: 2200, createdAt: '2026-08-01T00:00:00.000Z' }]
    )
    render(<WorkersPage createWorker={vi.fn()} listWageHistory={listWageHistory} recordWageHistory={vi.fn()} workers={workers} />)

    expect(screen.getByRole('button', { name: '新增人员' })).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '首个时薪生效日期' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /小夏/ }))
    const profile = await screen.findByRole('dialog', { name: '人员资料：小夏' })
    await waitFor(() => expect(listWageHistory).toHaveBeenCalledWith('worker-2'))
    expect(within(profile).getByText('2026-09-01 · 25.00 / 小时')).toBeVisible()
    fireEvent.click(within(profile).getByRole('button', { name: '调整时薪' }))
    expect(within(profile).getByRole('button', { name: '时薪生效日期' })).toBeVisible()

    fireEvent.click(within(profile).getByRole('button', { name: '关闭人员资料：小夏' }))
    fireEvent.click(screen.getByRole('button', { name: '新增人员' }))
    const createSheet = screen.getByRole('dialog', { name: '新增兼职人员' })
    expect(within(createSheet).getByRole('button', { name: '首个时薪生效日期' })).toBeVisible()
  })

  it('设置以互斥模式进入财务资料，并按当前资料类型新建', async () => {
    mocks.finance.categories = [
      { id: 'income-1', direction: 'income', name: '定金收入', enabled: true, createdAt: '2026-09-08T00:00:00.000Z', updatedAt: '2026-09-08T00:00:00.000Z' },
      { id: 'expense-1', direction: 'expense', name: '工作室房租', enabled: true, createdAt: '2026-09-08T00:00:00.000Z', updatedAt: '2026-09-08T00:00:00.000Z' }
    ]
    mocks.finance.advancePayers = [
      { id: 'payer-1', name: '小林', note: '临时垫付', enabled: true, createdAt: '2026-09-08T00:00:00.000Z', updatedAt: '2026-09-08T00:00:00.000Z' }
    ]
    mocks.finance.createCategory.mockResolvedValue({})
    render(<SettingsPage />)

    expect(screen.getByRole('heading', { name: '工作室参数' })).toBeVisible()
    expect(screen.getByDisplayValue('0.0034')).toBeVisible()
    expect(screen.queryByText('定金收入')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: /元 \/ 克/ }), { target: { value: '0.0034' } })
    fireEvent.click(screen.getByRole('button', { name: '保存工作室参数' }))
    await waitFor(() => expect(mocks.studio.update).toHaveBeenCalledWith({ gluePriceMicroYuanPerGram: 3_400 }))
    expect(await screen.findByRole('status')).toHaveTextContent('已保存工作室参数')

    fireEvent.click(screen.getByRole('button', { name: '财务资料' }))
    expect(screen.getByRole('heading', { name: '财务资料' })).toBeVisible()
    expect(screen.getByRole('button', { name: '收入类目' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('定金收入')).toBeVisible()
    expect(screen.queryByText('工作室房租')).not.toBeInTheDocument()
    expect(screen.queryByText('小林')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '支出类目' }))
    expect(screen.getByRole('button', { name: '支出类目' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('工作室房租')).toBeVisible()
    expect(screen.queryByText('定金收入')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新增支出类目' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '收入类目' }))
    fireEvent.click(screen.getByRole('button', { name: '新增收入类目' }))
    const dialog = screen.getByRole('dialog', { name: '新增收入类目' })
    fireEvent.change(within(dialog).getByLabelText(/类目名称/), { target: { value: '尾款收入' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '创建类目' }))
    await waitFor(() => expect(mocks.finance.createCategory).toHaveBeenCalledWith({ direction: 'income', name: '尾款收入' }))

    fireEvent.click(screen.getByRole('button', { name: '私人垫付人' }))
    expect(screen.getByRole('button', { name: '私人垫付人' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('小林')).toBeVisible()
    expect(screen.queryByText('定金收入')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新增垫付人' })).toBeVisible()
  })

  it('数据保护只在确认后恢复，并在立即备份后刷新记录', async () => {
    const backup = {
      id: 'backup-1', backupPath: '/tmp/backup-1', createdAt: '2026-09-08T10:00:00.000Z',
      reason: 'manual' as const, applicationVersion: '2.0.0', attachmentCount: 3
    }
    mocks.backup.list.mockResolvedValue([backup])
    render(<SettingsPage />)

    fireEvent.click(screen.getByRole('button', { name: '数据保护' }))
    expect(await screen.findByText('完整数据备份')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '恢复' }))
    expect(screen.getByRole('alertdialog')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(mocks.backup.restore).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '立即备份' }))
    await waitFor(() => expect(mocks.backup.create).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mocks.backup.list).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: '恢复' }))
    fireEvent.click(screen.getByRole('button', { name: '恢复此备份' }))
    await waitFor(() => expect(mocks.backup.restore).toHaveBeenCalledWith({ backupPath: '/tmp/backup-1', confirmed: true }))
  })

})
