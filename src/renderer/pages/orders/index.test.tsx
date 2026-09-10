/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installDomInteractionPolyfills } from '../../test/dom'
import { OrdersPage } from './index'

const mocks = vi.hoisted(() => {
  const selectedOrder = {
    id: 'order-1',
    code: 'YD-001',
    customerSnapshot: { name: '小满' },
    expectedShipDate: null,
    amount: { currentAmountCents: 10000, adjustmentsCents: 0 },
    funds: { outstandingCents: 0, netReceivedCents: 10000 },
    items: [
      {
        id: 'item-strawberry',
        quantity: 100,
        unitPriceCents: 100,
        productSnapshot: { name: '草莓捏捏' }
      },
      { id: 'item-cream', quantity: 80, unitPriceCents: 100, productSnapshot: { name: '奶油捏捏' } }
    ]
  }
  return {
    createShipment: vi.fn().mockResolvedValue({ id: 'shipment-new' }),
    exportOrderTable: vi.fn().mockResolvedValue({ savedPath: '/tmp/订单表.xlsx' }),
    exportOrderDocuments: vi.fn().mockResolvedValue({ savedPath: '/tmp/订单与发货单.xlsx' }),
    exportShippingList: vi.fn().mockResolvedValue({ savedPath: '/tmp/发货清单.xlsx' }),
    quickCustomer: {
      id: 'customer-new',
      name: '新客户',
      contact: '王女士',
      defaultAddress: null,
      notes: null,
      enabled: true,
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z'
    },
    quickProduct: {
      id: 'product-new',
      name: '新商品',
      code: null,
      category: null,
      basePriceCents: 1880,
      materialCostCents: 0,
      packagingCostCents: 0,
      accessoryCostCents: 0,
      replacementBagCostCents: 0,
      internalEdgeCostCents: 0,
      standardMakingMinutes: 0,
      makingCommissionCents: 0,
      makingGlueCostCents: 0,
      imageAttachmentId: null,
      notes: null,
      enabled: true,
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z'
    },
    quickCreateCustomer: vi.fn(),
    quickCreateProduct: vi.fn(),
    selectOrder: vi.fn().mockResolvedValue(undefined),
    orders: [
      {
        id: 'order-1',
        code: 'YD-001',
        customerName: '小满',
        currentAmountCents: 10000,
        outstandingCents: 0,
        updatedAt: '2026-09-08T10:00:00.000Z'
      }
    ],
    selectedOrder,
    shipments: [
      {
        id: 'shipment-old',
        orderId: 'order-1',
        shippedOn: '2026-09-07',
        carrier: '顺丰',
        trackingNumber: 'SF001',
        note: null,
        items: [{ id: 'shipment-item-1', orderItemId: 'item-strawberry', quantity: 30 }],
        createdAt: '2026-09-07T10:00:00.000Z',
        updatedAt: '2026-09-07T10:00:00.000Z'
      }
    ],
    createOrder: vi.fn(),
    customers: [
      {
        id: 'customer-old',
        name: '已有客户',
        contact: null,
        defaultAddress: null,
        notes: null,
        enabled: true,
        createdAt: '2026-09-08T10:00:00.000Z',
        updatedAt: '2026-09-08T10:00:00.000Z'
      }
    ],
    products: [
      {
        id: 'product-old',
        name: '已有商品',
        code: null,
        category: null,
        basePriceCents: 1000,
        materialCostCents: 0,
        packagingCostCents: 0,
        accessoryCostCents: 0,
        replacementBagCostCents: 0,
        internalEdgeCostCents: 0,
        standardMakingMinutes: 0,
        makingCommissionCents: 0,
        makingGlueCostCents: 0,
        imageAttachmentId: null,
        notes: null,
        enabled: true,
        createdAt: '2026-09-08T10:00:00.000Z',
        updatedAt: '2026-09-08T10:00:00.000Z'
      }
    ],
    changeContent: vi.fn(),
    recordFund: vi.fn(),
    correctFund: vi.fn(),
    pickFundProof: vi.fn(),
    discardPreparedFundProof: vi.fn(),
    getFundProof: vi.fn(),
    attachFundProof: vi.fn(),
    openFundProof: vi.fn()
  }
})

vi.mock('../../composables/use-orders', () => ({
  buildShipmentItemAvailability: () => [
    {
      orderItemId: 'item-strawberry',
      confirmedQuantity: 100,
      shippedQuantity: 30,
      remainingQuantity: 70,
      availableQuantity: 18
    },
    {
      orderItemId: 'item-cream',
      confirmedQuantity: 80,
      shippedQuantity: 0,
      remainingQuantity: 80,
      availableQuantity: 80
    }
  ],
  useOrders: () => ({
    orders: mocks.orders,
    customers: mocks.customers,
    products: mocks.products,
    loading: false,
    loadError: null,
    selectedOrder: mocks.selectedOrder,
    funds: [],
    contentChanges: [],
    shipments: mocks.shipments,
    fulfillmentItems: [],
    selectOrder: mocks.selectOrder,
    createOrder: mocks.createOrder,
    changeContent: mocks.changeContent,
    recordFund: mocks.recordFund,
    correctFund: mocks.correctFund,
    pickFundProof: mocks.pickFundProof,
    discardPreparedFundProof: mocks.discardPreparedFundProof,
    getFundProof: mocks.getFundProof,
    attachFundProof: mocks.attachFundProof,
    openFundProof: mocks.openFundProof,
    createShipment: mocks.createShipment,
    exportOrderTable: mocks.exportOrderTable,
    exportOrderDocuments: mocks.exportOrderDocuments,
    exportShippingList: mocks.exportShippingList
  })
}))

vi.mock('../../composables/use-customers', () => ({
  useCustomers: () => ({
    createCustomer: mocks.quickCreateCustomer
  })
}))

vi.mock('../../composables/use-products', () => ({
  useProducts: () => ({
    createProduct: mocks.quickCreateProduct
  })
}))


vi.mock('../../composables/use-studio-settings', () => ({
  useStudioSettings: () => ({
    settings: { gluePriceMicroYuanPerGram: 3_400, orderReservedDays: 2, updatedAt: null },
    loading: false,
    loadError: null,
    reload: vi.fn(),
    update: vi.fn()
  })
}))

vi.mock('../../composables/use-finance', () => ({
  useFinance: () => ({
    listAfterSalesCases: vi.fn(),
    createAfterSalesCase: vi.fn(),
    updateAfterSalesCase: vi.fn(),
    linkAfterSalesCharge: vi.fn()
  })
}))

installDomInteractionPolyfills()
afterEach(() => {
  cleanup()
  mocks.createOrder.mockClear()
  mocks.createShipment.mockClear()
  mocks.selectOrder.mockClear()
  mocks.quickCreateCustomer.mockClear()
  mocks.quickCreateProduct.mockClear()
  mocks.exportOrderTable.mockClear()
  mocks.exportOrderDocuments.mockClear()
  mocks.exportShippingList.mockClear()
})

describe('订单分批发货交互', () => {
  it('在独立抽屉中按商品当前可发数校验，并允许订单未发完时登记一批多商品', async () => {
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /YD-001/ }))
    fireEvent.click(await screen.findByRole('button', { name: '履约' }))
    expect(screen.getByText(/历史批次只读/)).toBeVisible()
    expect(screen.getByText('2026-09-07 · 顺丰')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '新增发货' }))
    expect(screen.getByRole('dialog', { name: '登记分批发货' })).toBeInTheDocument()
    expect(screen.getByText('当前可发 18')).toBeVisible()
    expect(screen.getByText('当前可发 80')).toBeVisible()

    fireEvent.change(screen.getByRole('textbox', { name: '草莓捏捏 本次发货数量' }), {
      target: { value: '19' }
    })
    fireEvent.click(screen.getByRole('button', { name: '确认登记发货' }))
    expect(await screen.findByText('草莓捏捏 本批最多可发 18 件')).toBeVisible()
    expect(mocks.createShipment).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('textbox', { name: '草莓捏捏 本次发货数量' }), {
      target: { value: '12' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: '奶油捏捏 本次发货数量' }), {
      target: { value: '5' }
    })
    fireEvent.click(screen.getByRole('button', { name: '确认登记发货' }))

    await waitFor(() =>
      expect(mocks.createShipment).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({
          items: [
            { orderItemId: 'item-strawberry', quantity: 12 },
            { orderItemId: 'item-cream', quantity: 5 }
          ]
        })
      )
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '登记分批发货' })).not.toBeInTheDocument()
    )
  })

  it('从订单详情按当前订单导出独立与合并单据', async () => {
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /YD-001/ }))

    fireEvent.click(await screen.findByRole('button', { name: '导出订单表' }))
    await waitFor(() => expect(mocks.exportOrderTable).toHaveBeenCalledWith('order-1'))

    fireEvent.click(screen.getByRole('button', { name: '导出发货清单' }))
    await waitFor(() => expect(mocks.exportShippingList).toHaveBeenCalledWith('order-1', undefined))

    fireEvent.click(screen.getByRole('button', { name: '合并导出' }))
    await waitFor(() => expect(mocks.exportOrderDocuments).toHaveBeenCalledWith('order-1', undefined))
    expect(screen.getByText(/已导出订单表与发货清单/)).toBeVisible()
  })

  it('登记收款时可选择凭证，并将附件关联到资金流水', async () => {
    mocks.pickFundProof.mockResolvedValueOnce({
      id: 'proof-1', originalName: '定金凭证.png', storageKey: 'proof-1.png',
      mimeType: 'image/png', sizeBytes: 128, createdAt: '2026-09-09T08:00:00.000Z'
    })
    mocks.recordFund.mockResolvedValueOnce({ id: 'fund-new' })
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /YD-001/ }))
    fireEvent.click(await screen.findByRole('button', { name: '资金' }))
    fireEvent.click(screen.getByRole('button', { name: '选择收款凭证' }))

    await waitFor(() => expect(mocks.pickFundProof).toHaveBeenCalledTimes(1))
    expect(screen.getByText('已选择：定金凭证.png')).toBeVisible()
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: '登记资金' }))

    await waitFor(() => expect(mocks.recordFund).toHaveBeenCalledWith('order-1', expect.objectContaining({
      businessType: 'payment', amountCents: 5_000, attachmentId: 'proof-1'
    })))
  })

  it('新建订单默认带入预留天数，并允许按订单调整', async () => {
    mocks.createOrder.mockResolvedValueOnce(mocks.selectedOrder)
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '新建订单' }))
    expect(screen.getByRole('textbox', { name: '预留制作天数' })).toHaveValue('2')
    fireEvent.change(screen.getByRole('textbox', { name: '预留制作天数' }), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('combobox', { name: '客户' }))
    fireEvent.click(screen.getByRole('option', { name: '已有客户' }))
    fireEvent.click(screen.getByRole('button', { name: '创建订单' }))

    await waitFor(() => expect(mocks.createOrder).toHaveBeenCalledWith(expect.objectContaining({ reservedDays: 3 })))
  })

  it('取消快捷建档时保留订单草稿', () => {
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '新建订单' }))
    fireEvent.change(screen.getByRole('textbox', { name: '订单优惠（元）' }), {
      target: { value: '188' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: '订单备注' }), {
      target: { value: '保留中的草稿' }
    })
    fireEvent.click(screen.getByRole('combobox', { name: '客户' }))
    fireEvent.change(screen.getByRole('textbox', { name: '搜索客户' }), {
      target: { value: '新客户' }
    })
    fireEvent.click(screen.getByRole('button', { name: '新建“新客户”' }))

    expect(screen.getByRole('dialog', { name: '新建客户' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(screen.queryByRole('dialog', { name: '新建客户' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '订单优惠（元）' })).toHaveValue('188')
    expect(screen.getByRole('textbox', { name: '订单备注' })).toHaveValue('保留中的草稿')
  })

  it('创建客户后立即回填当前订单草稿', async () => {
    mocks.quickCreateCustomer.mockResolvedValueOnce(mocks.quickCustomer)
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '新建订单' }))
    fireEvent.click(screen.getByRole('combobox', { name: '客户' }))
    fireEvent.change(screen.getByRole('textbox', { name: '搜索客户' }), {
      target: { value: '新客户' }
    })
    fireEvent.click(screen.getByRole('button', { name: '新建“新客户”' }))
    fireEvent.change(screen.getByRole('textbox', { name: '联系人' }), {
      target: { value: '王女士' }
    })
    fireEvent.click(screen.getByRole('button', { name: '创建并选中客户' }))

    await waitFor(() =>
      expect(mocks.quickCreateCustomer).toHaveBeenCalledWith({
        name: '新客户',
        contact: '王女士',
        defaultAddress: null,
        notes: null
      })
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '新建客户' })).not.toBeInTheDocument()
    )
    expect(screen.getByRole('combobox', { name: '客户' })).toHaveTextContent('新客户')
  }, 45_000)

  it('商品快捷建档保存失败时保留已填写内容', async () => {
    mocks.quickCreateProduct.mockRejectedValueOnce(new Error('商品保存失败'))
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '新建订单' }))
    fireEvent.change(screen.getByRole('textbox', { name: '订单优惠（元）' }), {
      target: { value: '188' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: '订单备注' }), {
      target: { value: '保存失败后的草稿' }
    })
    fireEvent.click(screen.getByRole('combobox', { name: '第 1 行商品' }))
    fireEvent.change(screen.getByRole('textbox', { name: '搜索第 1 行商品' }), {
      target: { value: '新商品' }
    })
    fireEvent.click(screen.getByRole('button', { name: '新建“新商品”' }))
    fireEvent.change(screen.getByRole('textbox', { name: '基础售价（元）' }), {
      target: { value: '18.8' }
    })
    fireEvent.click(screen.getByRole('button', { name: '创建并选中商品' }))

    await waitFor(() => expect(mocks.quickCreateProduct).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('alert')).toHaveTextContent('商品保存失败')
    expect(screen.getByRole('dialog', { name: '新建商品' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '商品名称' })).toHaveValue('新商品')
    expect(screen.getByRole('textbox', { name: '基础售价（元）' })).toHaveValue('18.8')
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog', { name: '新建商品' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '订单优惠（元）' })).toHaveValue('188')
    expect(screen.getByRole('textbox', { name: '订单备注' })).toHaveValue('保存失败后的草稿')
  }, 45_000)

  it('创建商品后立即回填当前订单草稿且保留已填订单信息', async () => {
    mocks.quickCreateProduct.mockResolvedValueOnce(mocks.quickProduct)
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '新建订单' }))
    fireEvent.change(screen.getByRole('textbox', { name: '订单优惠（元）' }), {
      target: { value: '188' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: '订单备注' }), {
      target: { value: '保留中的草稿' }
    })
    fireEvent.click(screen.getByRole('combobox', { name: '第 1 行商品' }))
    fireEvent.change(screen.getByRole('textbox', { name: '搜索第 1 行商品' }), {
      target: { value: '新商品' }
    })
    fireEvent.click(screen.getByRole('button', { name: '新建“新商品”' }))
    fireEvent.change(screen.getByRole('textbox', { name: '基础售价（元）' }), {
      target: { value: '18.8' }
    })
    fireEvent.click(screen.getByRole('button', { name: '创建并选中商品' }))

    await waitFor(() =>
      expect(mocks.quickCreateProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '新商品',
          basePriceCents: 1880
        })
      )
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '新建商品' })).not.toBeInTheDocument()
    )
    expect(screen.getByRole('combobox', { name: '第 1 行商品' })).toHaveTextContent('新商品')
    expect(screen.getByRole('textbox', { name: '第 1 行单价' })).toHaveValue('18.80')
    expect(screen.getByRole('textbox', { name: '订单优惠（元）' })).toHaveValue('188')
    expect(screen.getByRole('textbox', { name: '订单备注' })).toHaveValue('保留中的草稿')
  }, 45_000)
})

describe('订单前置资料引导', () => {
  it('缺少客户或商品时说明前置资料，并将负责人带到对应的建档入口', () => {
    const originalOrders = mocks.orders
    const originalCustomers = mocks.customers
    const originalProducts = mocks.products
    mocks.orders = []
    mocks.customers = []
    mocks.products = []
    const onNavigateToBaseData = vi.fn()

    try {
      render(<OrdersPage onNavigateToBaseData={onNavigateToBaseData} />)

      expect(screen.getByRole('status', { name: '缺少前置资料' })).toBeVisible()
      expect(screen.getByText('先完成基础资料')).toBeVisible()
      fireEvent.click(screen.getByRole('button', { name: '先建立客户' }))
      expect(onNavigateToBaseData).toHaveBeenCalledWith('customers')
      fireEvent.click(screen.getByRole('button', { name: '建立商品' }))
      expect(onNavigateToBaseData).toHaveBeenCalledWith('products')
    } finally {
      mocks.orders = originalOrders
      mocks.customers = originalCustomers
      mocks.products = originalProducts
    }
  })
})
