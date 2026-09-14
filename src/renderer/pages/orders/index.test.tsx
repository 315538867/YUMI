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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { YumiNotificationProvider } from '../../components/ui'
const render = (ui: Parameters<typeof renderBase>[0]) =>
  renderBase(<YumiNotificationProvider>{ui}</YumiNotificationProvider>)
import { installDomInteractionPolyfills } from '../../test/dom'
import { OrdersPage } from './index'

const mocks = vi.hoisted(() => {
  const selectedOrder = {
    id: 'order-1',
    code: 'YD-001',
    customerSnapshot: { name: '小满' },
    expectedShipDate: '2026-09-26',
    productionDeadline: '2026-09-24',
    reservedDays: 2,
    amount: { currentAmountCents: 10000, adjustmentsCents: 0 },
    funds: { outstandingCents: 0, netReceivedCents: 10000 },
    items: [
      {
        id: 'item-strawberry',
        productId: 'product-old',
        quantity: 100,
        unitPriceCents: 100,
        productSnapshot: { name: '草莓捏捏' }
      },
      {
        id: 'item-cream',
        productId: 'product-old',
        quantity: 80,
        unitPriceCents: 100,
        productSnapshot: { name: '奶油捏捏' }
      }
    ]
  }
  return {
    createShipment: vi.fn().mockResolvedValue({ id: 'shipment-new' }),
    voidShipment: vi.fn().mockResolvedValue({ id: 'shipment-old', status: 'voided' }),
    exportOrderTable: vi.fn().mockResolvedValue({ savedPath: '/tmp/订单表.xlsx' }),
    exportShippingList: vi.fn().mockResolvedValue({ savedPath: '/tmp/发货清单.xlsx' }),
    getShippingListPreview: vi.fn().mockResolvedValue({
      orderCode: 'YD-001',
      customerName: '小满',
      customerContact: '王女士',
      customerAddress: '上海市静安区',
      generatedAt: '2026-09-07T10:00:00.000Z',
      shippedOn: '2026-09-07',
      carrier: '顺丰',
      trackingNumber: 'SF001',
      items: [
        {
          productName: '草莓捏捏',
          orderedQuantity: 100,
          thisShipmentQuantity: 30,
          notes: '礼盒装'
        }
      ]
    }),
    getOrderBusiness: vi.fn().mockResolvedValue({
      rows: [],
      totalCurrentAmountCents: 0,
      totalNetReceivedCents: 0,
      totalOutstandingCents: 0,
      totalProductCostCents: 0,
      totalAfterSalesCostCents: 0,
      totalKnownAccountingCostCents: 0,
      totalKnownMarginCents: 0
    }),
    getOrderSchedule: vi.fn().mockResolvedValue({
      assignments: [
        {
          id: 'assignment-1',
          workerId: 'worker-1',
          assignedOn: '2026-09-10',
          processType: 'making',
          status: 'scheduled',
          note: null,
          tasks: [
            {
              id: 'task-1',
              workAssignmentId: 'assignment-1',
              orderItemId: 'item-strawberry',
              processType: 'making',
              sourceType: 'normal_production',
              plannedQuantity: 20,
              plannedMinutes: 60,
              extraMinutes: 0,
              scheduledMinutes: 60,
              status: 'pending',
              hourlyWageCents: null,
              pieceRateCents: null,
              glueCostCents: null,
              gluePriceMicroYuanPerGram: null,
              glueWeightMilligrams: null,
              rateSnapshot: null,
              note: null,
              createdAt: '2026-09-10T08:00:00.000Z',
              updatedAt: '2026-09-10T08:00:00.000Z'
            }
          ],
          createdAt: '2026-09-10T08:00:00.000Z',
          updatedAt: '2026-09-10T08:00:00.000Z'
        }
      ],
      workers: [
        {
          id: 'worker-1',
          name: '阿橘',
          role: '兼职',
          enabled: true,
          createdAt: '2026-09-01T08:00:00.000Z',
          updatedAt: '2026-09-01T08:00:00.000Z'
        }
      ]
    }),
    getOrderBusinessDetail: vi.fn().mockResolvedValue({
      summary: {
        orderId: 'order-1',
        orderCode: 'YD-001',
        customerName: '小满',
        currentAmountCents: 10000,
        netReceivedCents: 10000,
        outstandingCents: 0,
        productCostCents: 1800,
        afterSalesCostCents: 400,
        knownAccountingCostCents: 2200,
        knownMarginCents: 7800
      },
      orderDiscountCents: 0,
      adjustmentsCents: 0,
      items: [
        {
          orderItemId: 'item-strawberry',
          productName: '草莓捏捏',
          quantity: 100,
          orderRevenueCents: 6000,
          productCostCents: 1000,
          knownGrossMarginCents: 5000,
          knownGrossMarginRateBasisPoints: 8333
        },
        {
          orderItemId: 'item-cream',
          productName: '奶油捏捏',
          quantity: 80,
          orderRevenueCents: 4000,
          productCostCents: 800,
          knownGrossMarginCents: 3200,
          knownGrossMarginRateBasisPoints: 8000
        }
      ]
    }),
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
        itemCount: 2,
        totalQuantity: 180,
        shippedQuantity: 30,
        createdAt: '2026-09-07T10:00:00.000Z',
        expectedShipDate: '2026-09-12',
        currentAmountCents: 10000,
        outstandingCents: 0,
        updatedAt: '2026-09-08T10:00:00.000Z'
      }
    ],
    selectedOrder,
    funds: [],
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
    funds: mocks.funds,
    contentChanges: [],
    shipments: mocks.shipments,
    fulfillmentItems: [
      {
        orderItemId: 'item-strawberry',
        orderId: 'order-1',
        confirmedQuantity: 100,
        stages: { making: 70, fluffingBagging: 0, packing: 0, readyToShip: 0, shipped: 30 },
        events: []
      },
      {
        orderItemId: 'item-cream',
        orderId: 'order-1',
        confirmedQuantity: 80,
        stages: { making: 80, fluffingBagging: 0, packing: 0, readyToShip: 0, shipped: 0 },
        events: []
      }
    ],
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
    voidShipment: mocks.voidShipment,
    exportOrderTable: mocks.exportOrderTable,
    exportShippingList: mocks.exportShippingList,
    getShippingListPreview: mocks.getShippingListPreview,
    getOrderBusiness: mocks.getOrderBusiness,
    getOrderSchedule: mocks.getOrderSchedule,
    getOrderBusinessDetail: mocks.getOrderBusinessDetail
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

beforeEach(() => {
  Object.defineProperty(window, 'yumiV2', {
    configurable: true,
    value: { reports: { getOrderBusiness: mocks.getOrderBusiness } }
  })
  mocks.getOrderBusiness.mockClear()
  mocks.getOrderSchedule.mockClear()
  mocks.getShippingListPreview.mockClear()
})
afterEach(() => {
  cleanup()
  mocks.createOrder.mockClear()
  mocks.changeContent.mockClear()
  mocks.createShipment.mockClear()
  mocks.voidShipment.mockClear()
  mocks.recordFund.mockClear()
  mocks.correctFund.mockClear()
  mocks.selectOrder.mockClear()
  mocks.quickCreateCustomer.mockClear()
  mocks.quickCreateProduct.mockClear()
  mocks.exportOrderTable.mockClear()
  mocks.exportShippingList.mockClear()
  mocks.funds = []
})

describe('订单列表信息架构', () => {
  it('以筛选工具条和固定列业务表呈现订单，并展示资金与排班进度', () => {
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '订单' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: '搜索订单' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: '资金状态筛选' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: '交付排班筛选' })).toBeVisible()
    expect(screen.getByText('共 1 张订单')).toBeVisible()
    expect(screen.getByRole('columnheader', { name: '订单号 / 客户' })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: '订单金额' })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: '资金状态' })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: '排班进度' })).toBeVisible()
    expect(screen.getByText('已发 30 / 180 件')).toBeVisible()
    expect(screen.getByRole('button', { name: '查看详情' })).toBeVisible()
  })

  it('将资金状态与交付排班作为订单工具条中的两个独立筛选槽位', () => {
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    const toolbar = screen.getByRole('toolbar', { name: '订单列表工具' })
    const controls = toolbar.querySelector('.yumi-list-toolbar__controls')
    const search = toolbar.querySelector('.yumi-list-toolbar__search')
    const filters = toolbar.querySelectorAll('.yumi-list-toolbar__filter')
    const count = toolbar.querySelector('.yumi-list-toolbar__count')

    expect(controls).not.toBeNull()
    expect(search).not.toBeNull()
    expect(filters).toHaveLength(2)
    expect(controls).toContainElement(search as HTMLElement)
    expect(controls).toContainElement(filters[0] as HTMLElement)
    expect(controls).toContainElement(filters[1] as HTMLElement)
    expect(
      within(filters[0] as HTMLElement).getByRole('combobox', { name: '资金状态筛选' })
    ).toBeVisible()
    expect(
      within(filters[1] as HTMLElement).getByRole('combobox', { name: '交付排班筛选' })
    ).toBeVisible()
    expect(count).not.toBeNull()
    expect(controls).not.toContainElement(count as HTMLElement)
  })

  it('订单为空时仍保留工具条、统计与首次使用空状态', () => {
    const originalOrders = mocks.orders
    mocks.orders = []

    try {
      render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

      const toolbar = screen.getByRole('toolbar', { name: '订单列表工具' })
      expect(within(toolbar).getByText('共 0 张订单')).toBeVisible()
      expect(screen.getByRole('status', { name: '首次使用' })).toBeVisible()
      expect(screen.getByText('还没有订单')).toBeVisible()
      expect(screen.queryByRole('table', { name: '订单列表' })).not.toBeInTheDocument()
    } finally {
      mocks.orders = originalOrders
    }
  })

  it('从订单列表以抽屉新建订单，背景列表保持作为上下文', () => {
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '新建订单' }))

    const sheet = screen.getByRole('dialog', { name: '新建订单' })
    expect(screen.getByRole('heading', { name: '订单', hidden: true })).toBeInTheDocument()
    expect(document.querySelector('.yumi-order-list-surface')).not.toBeNull()
    expect(within(sheet).getByText(/客户、商品、订单优惠和本次成交条件会冻结/)).toBeVisible()
    expect(within(sheet).getByRole('combobox', { name: '客户' })).toBeVisible()
    expect(within(sheet).getByRole('textbox', { name: '订单优惠（元）' })).toBeVisible()
    expect(within(sheet).getByText('定制服务')).toBeVisible()
    expect(within(sheet).getByRole('button', { name: '取消' })).toBeVisible()
    expect(within(sheet).getByRole('button', { name: '保存并进入详情' })).toBeVisible()
  })

  it('按订单号或客户筛选列表，避免在业务表中保留无关行', () => {
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)
    const search = screen.getByRole('textbox', { name: '搜索订单' })

    fireEvent.change(search, { target: { value: '不存在的订单' } })
    expect(screen.getByText('没有符合筛选条件的订单。')).toBeVisible()

    fireEvent.change(search, { target: { value: '小满' } })
    expect(screen.getByText('YD-001')).toBeVisible()
  })
})

describe('订单详情概览信息架构', () => {
  it('概览只保留订单主体、全宽关键指标、商品表和排班概览，不重复发货记录', async () => {
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }))

    expect(await screen.findByRole('button', { name: '导出订单表' })).toBeVisible()
    expect(screen.getByRole('button', { name: '返回订单列表' })).toBeVisible()
    expect(screen.getByRole('navigation', { name: '订单详情导航' })).toBeVisible()
    expect(
      within(screen.getByRole('group', { name: '订单详情页面动作' })).queryByRole('button', {
        name: '返回订单列表'
      })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发货汇总' })).toBeVisible()
    expect(screen.getByRole('button', { name: '编辑订单' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '订单详情' })).toBeVisible()
    expect(screen.getByText('订单编号 · YD-001')).toBeVisible()
    expect(
      screen.getByText('预计 2026-09-26 发货 · 制作截止 2026-09-24 · 预留制作 2 天')
    ).toBeVisible()
    const orderSubject = screen.getByRole('region', { name: '订单主体信息' })
    expect(within(orderSubject).getByRole('heading', { name: '小满' })).toBeVisible()
    expect(within(orderSubject).getByText('订单号')).toBeVisible()
    expect(within(orderSubject).getByText('YD-001')).toBeVisible()
    expect(within(orderSubject).getByText('联系人')).toBeVisible()
    expect(within(orderSubject).getByText('交付安排')).toBeVisible()
    expect(screen.getByRole('table', { name: '订单商品列表' })).toBeVisible()
    expect(screen.getByText('商品合计')).toBeVisible()
    expect(screen.getByText('确认订单内容；变更仅通过右上角“编辑订单”进入编辑态。')).toBeVisible()
    expect(screen.getByRole('button', { name: '查看排班明细' })).toBeVisible()
    expect(screen.getByText('制作')).toBeVisible()
    expect(screen.getByText('捏毛装袋')).toBeVisible()
    expect(screen.getByText('打包')).toBeVisible()
    expect(screen.getByText('待发货')).toBeVisible()
    const orderMetrics = screen.getByRole('region', { name: '订单关键指标' })
    expect(within(orderMetrics).getByText('订单金额')).toBeVisible()
    expect(within(orderMetrics).getByText('累计收款')).toBeVisible()
    expect(within(orderMetrics).getByText('待收款')).toBeVisible()
    expect(within(orderMetrics).getByText('发货进度')).toBeVisible()
    expect(
      within(screen.getByRole('navigation', { name: '订单详情工作视图' }))
        .getAllByRole('button')
        .map((button) => button.textContent)
    ).toEqual(['概览', '排班', '发货', '资金', '盈利', '售后'])
    expect(screen.queryByRole('table', { name: '最近发货记录' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: '发货批次列表' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '查看全部发货' })).not.toBeInTheDocument()
    expect(screen.queryByText('订单档案')).not.toBeInTheDocument()
    expect(document.querySelector('.yumi-order-archive-grid')).not.toBeInTheDocument()
    expect(document.querySelector('.yumi-order-archive')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '发货' }))
    expect(await screen.findByRole('table', { name: '发货批次列表' })).toBeVisible()
    expect(screen.getByRole('button', { name: '查看发货清单' })).toBeVisible()
    expect(screen.getByRole('button', { name: '导出本批清单' })).toBeVisible()
    expect(screen.getByRole('button', { name: '作废批次' })).toBeVisible()
    expect(screen.getByText('顺丰 · SF001')).toBeVisible()

    fireEvent.click(
      within(screen.getByRole('navigation', { name: '订单详情导航' })).getByRole('button', {
        name: '返回订单列表'
      })
    )
    expect(screen.getByRole('heading', { level: 1, name: '订单' })).toBeVisible()
  })
})

describe('订单排班信息架构', () => {
  it('按设计图先展示四段阶段摘要，再展示本订单任务并可进入真实排班工作区', async () => {
    const onNavigate = vi.fn()
    render(<OrdersPage onNavigate={onNavigate} onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }))
    fireEvent.click(await screen.findByRole('button', { name: '排班' }))

    expect(await screen.findByText('待排班')).toBeVisible()
    expect(screen.getAllByText('制作中').length).toBeGreaterThan(0)
    expect(screen.getByText('待质检')).toBeVisible()
    expect(screen.getByText('已完成')).toBeVisible()
    expect(mocks.getOrderSchedule).toHaveBeenCalledWith(['item-strawberry', 'item-cream'])
    expect(screen.getByRole('heading', { name: '本订单任务' })).toBeVisible()
    expect(screen.getByRole('table', { name: '本订单任务列表' })).toBeVisible()
    expect(screen.getByText('阿橘')).toBeVisible()
    expect(screen.getAllByText('待派工').length).toBeGreaterThan(0)
    expect(screen.getAllByText('制作中').length).toBeGreaterThan(0)
    expect(screen.getByText('每个阶段独立进入任务处理；派工与质检在排班工作区完成。')).toBeVisible()
    expect(screen.getByText(/已发货部分不再进入排班/)).toBeVisible()
    expect(screen.getByText('已进入制作阶段')).toBeVisible()
    expect(screen.getByText('当前无待确认结果')).toBeVisible()
    expect(screen.getByText(/已完成发货/)).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '进入排班工作区' }))
    expect(onNavigate).toHaveBeenCalledWith({
      view: 'fulfillment',
      orderId: 'order-1',
      focus: 'queue'
    })
  })
})

describe('订单盈利核算', () => {
  it('只读取后端订单经营报表行，并明确展示已知成本与未纳入口径', async () => {
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }))
    fireEvent.click(await screen.findByRole('button', { name: '盈利' }))

    const profitSummary = await screen.findByRole('region', { name: '订单盈利摘要' })
    expect(within(profitSummary).getByText('已知经营结余')).toBeVisible()
    expect(within(profitSummary).getByText('¥78.00')).toBeVisible()
    expect(mocks.getOrderBusinessDetail).toHaveBeenCalledWith('order-1')
    expect(screen.getByRole('heading', { name: '已知成本构成' })).toBeVisible()
    expect(screen.getByText('已知商品直接成本')).toBeVisible()
    expect(screen.getByText('人工及其他')).toBeVisible()
    expect(screen.getByText('待分摊')).toBeVisible()
    expect(screen.getByRole('table', { name: '商品盈利明细' })).toBeVisible()
    expect(screen.getByText('草莓捏捏')).toBeVisible()
    expect(screen.getByText('83.3%')).toBeVisible()
    expect(screen.getByText(/订单级优惠与金额调整不在商品行分摊/)).toBeVisible()
    expect(screen.getByText(/运费、兼职时薪、制作与捏毛装袋提成/)).toBeVisible()
  })
})

describe('订单新建与内容变更金额', () => {
  it('新建订单将订单优惠纳入草稿金额预览，并以分写入创建金额链路', async () => {
    mocks.createOrder.mockResolvedValueOnce(mocks.selectedOrder)
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '新建订单' }))
    fireEvent.click(screen.getByRole('combobox', { name: '客户' }))
    fireEvent.click(screen.getByRole('option', { name: '已有客户' }))
    fireEvent.change(screen.getByRole('textbox', { name: '订单优惠（元）' }), {
      target: { value: '2.50' }
    })

    const preview = screen.getByRole('region', { name: '订单金额预览' })
    expect(preview).toHaveTextContent('商品与缝边小计')
    expect(preview).toHaveTextContent('订单优惠')
    expect(preview).toHaveTextContent('预计订单金额')
    expect(preview).toHaveTextContent('¥7.50')

    fireEvent.click(screen.getByRole('button', { name: '保存并进入详情' }))
    await waitFor(() =>
      expect(mocks.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          orderDiscountCents: 250,
          items: [
            expect.objectContaining({
              itemDiscountCents: 0,
              quantity: 1,
              unitPriceCents: 1000
            })
          ]
        })
      )
    )
  })

  it('编辑订单将订单优惠纳入内容变更金额链路', async () => {
    mocks.changeContent.mockResolvedValueOnce(undefined)
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }))
    expect(await screen.findByRole('button', { name: '返回订单列表' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '编辑订单' }))
    const editor = await screen.findByRole('dialog', { name: '编辑订单' })
    fireEvent.change(within(editor).getByRole('textbox', { name: '变更说明' }), {
      target: { value: '更新订单优惠' }
    })
    fireEvent.change(within(editor).getByRole('textbox', { name: '订单优惠（元）' }), {
      target: { value: '12.34' }
    })
    expect(within(editor).getByRole('region', { name: '订单金额预览' })).toHaveTextContent(
      '¥167.66'
    )

    fireEvent.click(within(editor).getByRole('button', { name: '保存内容变更' }))
    await waitFor(() =>
      expect(mocks.changeContent).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({
          description: '更新订单优惠',
          orderDiscountCents: 1234
        })
      )
    )
  })
})

describe('订单分批发货交互', () => {
  it('在独立抽屉中按商品当前可发数校验，并允许订单未发完时登记一批多商品', async () => {
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }))
    fireEvent.click(await screen.findByRole('button', { name: '发货' }))
    expect(screen.getByText(/历史批次只读/)).toBeVisible()
    expect(screen.getByText('顺丰 · SF001')).toBeVisible()

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

  it('发货页以具名批次表展示记录，并将本批清单操作保留在批次行', async () => {
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }))
    fireEvent.click(await screen.findByRole('button', { name: '发货' }))

    const shipmentSummary = screen.getByRole('region', { name: '发货进度摘要' })
    expect(within(shipmentSummary).getByText('已发货批次')).toBeVisible()
    expect(within(shipmentSummary).getByText('已发 / 总数量')).toBeVisible()
    expect(within(shipmentSummary).getByText('待发数量')).toBeVisible()
    expect(within(shipmentSummary).getByText('最近发货')).toBeVisible()
    expect(within(shipmentSummary).getByText('1 笔')).toBeVisible()
    expect(within(shipmentSummary).getByText('30 / 180 件')).toBeVisible()
    expect(screen.getByRole('toolbar', { name: '发货批次列表工具' })).toHaveTextContent(
      '共 1 个批次'
    )
    expect(screen.getByText('发货记录')).toBeVisible()
    expect(screen.getByRole('note', { name: '快照说明' })).toHaveTextContent('发货清单快照')
    expect(screen.getByRole('table', { name: '发货批次列表' })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: '发货日期 / 物流' })).toBeVisible()
    expect(screen.getByText('草莓捏捏 × 30')).toBeVisible()
    expect(screen.getByRole('button', { name: '查看发货清单' })).toBeVisible()
    expect(screen.getByRole('button', { name: '导出本批清单' })).toBeVisible()
    expect(screen.getByRole('button', { name: '作废批次' })).toBeVisible()
  })

  it('发货记录为空时仍保留工具条、统计与具名空表状态', async () => {
    const originalShipments = mocks.shipments
    mocks.shipments = []

    try {
      render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

      fireEvent.click(screen.getByRole('button', { name: '查看详情' }))
      fireEvent.click(await screen.findByRole('button', { name: '发货' }))

      const toolbar = screen.getByRole('toolbar', { name: '发货批次列表工具' })
      expect(within(toolbar).getByText('共 0 个批次')).toBeVisible()
      expect(screen.getByRole('table', { name: '发货批次列表' })).toBeVisible()
      expect(screen.getByText('尚未登记发货批次。')).toBeVisible()
      expect(screen.queryByRole('button', { name: '查看发货清单' })).not.toBeInTheDocument()
    } finally {
      mocks.shipments = originalShipments
    }
  })

  it('按本批次打开只读发货清单快照，并在关闭后保留原发货列表', async () => {
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }))
    fireEvent.click(await screen.findByRole('button', { name: '发货' }))
    fireEvent.click(screen.getByRole('button', { name: '查看发货清单' }))

    expect(await screen.findByRole('dialog', { name: '发货清单' })).toBeVisible()
    expect(mocks.getShippingListPreview).toHaveBeenCalledWith('order-1', 'shipment-old')
    expect(screen.getByRole('region', { name: '发货清单预览' })).toBeVisible()
    expect(screen.getByRole('note', { name: '快照说明' })).toHaveTextContent(
      '后续资料变更不会影响本批'
    )
    expect(screen.getByRole('table', { name: '发货清单商品快照' })).toHaveTextContent('礼盒装')

    fireEvent.click(screen.getByRole('button', { name: '关闭发货清单' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '发货清单' })).not.toBeInTheDocument()
    )
    expect(screen.getByRole('table', { name: '发货批次列表' })).toBeVisible()
  })

  it('作废发货批次先展示影响说明，明确确认后才写入作废记录', async () => {
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }))
    fireEvent.click(await screen.findByRole('button', { name: '发货' }))
    fireEvent.click(screen.getByRole('button', { name: '作废批次' }))
    expect(screen.getByRole('dialog', { name: '作废发货批次' })).toBeVisible()

    fireEvent.change(screen.getByRole('textbox', { name: '作废原因' }), {
      target: { value: '物流信息录入错误' }
    })
    fireEvent.click(screen.getByRole('button', { name: '确认作废' }))

    expect(
      await screen.findByRole('alertdialog', { name: '确认作废发货批次？' })
    ).toHaveTextContent('会回退本批发货数量')
    expect(mocks.voidShipment).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '确认作废批次' }))
    await waitFor(() =>
      expect(mocks.voidShipment).toHaveBeenCalledWith('order-1', 'shipment-old', {
        voidedOn: expect.any(String),
        reason: '物流信息录入错误'
      })
    )
  })

  it('将订单级高频操作完整显示在详情页头，且不再收纳到更多操作', async () => {
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }))
    expect(await screen.findByRole('button', { name: '导出订单表' })).toBeVisible()
    expect(screen.getByText(/^订单编号 /)).toHaveClass('yumi-page-header__meta')
    expect(screen.getByRole('button', { name: '返回订单列表' })).toBeVisible()
    expect(screen.getByRole('button', { name: '发货汇总' })).toBeVisible()
    expect(screen.getByRole('button', { name: '编辑订单' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '更多操作' })).not.toBeInTheDocument()
  })

  it('切换六个详情 Tab 时保持同一页头、导航和右侧动作位置', async () => {
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }))
    expect(await screen.findByRole('heading', { name: '订单详情' })).toBeVisible()

    const header = screen.getByRole('banner')
    const workNavigation = screen.getByRole('navigation', { name: '订单详情工作视图' })
    const actionGroup = screen.getByRole('group', { name: '订单详情页面动作' })
    expect(
      header.compareDocumentPosition(workNavigation) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()

    for (const tab of ['概览', '排班', '发货', '资金', '盈利', '售后']) {
      fireEvent.click(screen.getByRole('button', { name: tab, exact: true }))
      expect(screen.getByRole('heading', { name: '订单详情' })).toBeVisible()
      expect(screen.getByRole('navigation', { name: '订单详情导航' })).toBeVisible()
      expect(screen.getByRole('button', { name: '返回订单列表' })).toBeVisible()
      expect(screen.getByRole('group', { name: '订单详情页面动作' })).toBe(actionGroup)
      expect(screen.getByRole('button', { name: '发货汇总' })).toBeVisible()
      expect(screen.getByRole('button', { name: '导出订单表' })).toBeVisible()
      expect(screen.getByRole('button', { name: '编辑订单' })).toBeVisible()
    }
  })

  it('订单详情页头、六个 Tab 与首个内容区按固定顺序排列', async () => {
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }))
    expect(await screen.findByRole('heading', { name: '订单详情' })).toBeVisible()

    const header = screen.getByRole('banner')
    const actionGroup = within(header).getByRole('group', { name: '订单详情页面动作' })
    const workNavigation = screen.getByRole('navigation', { name: '订单详情工作视图' })
    const firstSection = screen.getByRole('heading', { level: 2, name: '订单商品' })

    for (const tab of ['概览', '排班', '发货', '资金', '盈利', '售后']) {
      expect(within(workNavigation).getByRole('button', { name: tab, exact: true })).toBeVisible()
    }
    expect(within(workNavigation).getByRole('button', { name: '概览' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(actionGroup).toBeVisible()
    expect(
      header.compareDocumentPosition(workNavigation) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      workNavigation.compareDocumentPosition(firstSection) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('资金页默认展示流水，登记表单仅在操作抽屉中打开', async () => {
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }))
    fireEvent.click(await screen.findByRole('button', { name: '资金' }))

    expect(screen.getByRole('heading', { name: '资金记录' })).toBeVisible()
    expect(
      screen.getByText('收款、退款和调整按发生顺序留痕；不在订单摘要中重复填报。')
    ).toBeVisible()
    expect(screen.queryByRole('dialog', { name: '登记收款或退款' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '登记收款或退款' }))
    expect(screen.getByRole('dialog', { name: '登记收款或退款' })).toBeInTheDocument()
  })

  it('资金页以具名流水表展示记录，冲正只能从原流水行发起', async () => {
    mocks.funds = [
      {
        id: 'fund-payment',
        orderId: 'order-1',
        businessType: 'payment',
        amountCents: 3_000,
        occurredOn: '2026-09-09',
        paymentMethod: '银行转账',
        attachmentId: null,
        note: '首付款',
        direction: 'income',
        reversalOfEntryId: null,
        attachment: null,
        createdAt: '2026-09-09T09:00:00.000Z'
      }
    ]
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }))
    fireEvent.click(await screen.findByRole('button', { name: '资金' }))

    expect(screen.getByRole('toolbar', { name: '订单资金列表工具' })).toHaveTextContent(
      '共 1 笔流水'
    )
    expect(screen.getByRole('table', { name: '订单资金流水列表' })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: '业务类型 / 说明' })).toBeVisible()
    expect(screen.getByText('首付款')).toBeVisible()
    expect(screen.getByRole('button', { name: '更正' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '冲正并更正' })).not.toBeInTheDocument()
  })

  it('冲正资金流水先显示不可逆影响，确认后才生成冲正和替代记录', async () => {
    mocks.funds = [
      {
        id: 'fund-payment',
        orderId: 'order-1',
        businessType: 'payment',
        amountCents: 3_000,
        occurredOn: '2026-09-09',
        paymentMethod: '银行转账',
        attachmentId: null,
        note: '首付款',
        direction: 'income',
        reversalOfEntryId: null,
        attachment: null,
        createdAt: '2026-09-09T09:00:00.000Z'
      }
    ]
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }))
    fireEvent.click(await screen.findByRole('button', { name: '资金' }))
    fireEvent.click(screen.getByRole('button', { name: '更正' }))
    expect(screen.getByRole('dialog', { name: '冲正并更正' })).toBeVisible()

    fireEvent.click(screen.getByRole('combobox', { name: '原资金流水' }))
    fireEvent.click(screen.getByRole('option', { name: /payment · ¥30\.00 · 2026-09-09/ }))
    fireEvent.change(screen.getByRole('textbox', { name: '替代金额（元）' }), {
      target: { value: '20' }
    })
    fireEvent.click(screen.getByRole('button', { name: '冲正并更正' }))

    expect(await screen.findByRole('alertdialog', { name: '确认冲正并更正？' })).toHaveTextContent(
      '新增一条冲正记录和一条替代记录'
    )
    expect(mocks.correctFund).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '确认冲正并更正' }))
    await waitFor(() =>
      expect(mocks.correctFund).toHaveBeenCalledWith('order-1', {
        originalEntryId: 'fund-payment',
        reversalOccurredOn: expect.any(String),
        replacement: {
          businessType: 'payment',
          amountCents: 2_000,
          occurredOn: expect.any(String)
        }
      })
    )
  }, 45_000)
  it('登记收款或退款时可选择凭证，并将附件关联到资金流水', async () => {
    mocks.pickFundProof.mockResolvedValueOnce({
      id: 'proof-1',
      originalName: '定金凭证.png',
      storageKey: 'proof-1.png',
      mimeType: 'image/png',
      sizeBytes: 128,
      createdAt: '2026-09-09T08:00:00.000Z'
    })
    mocks.recordFund.mockResolvedValueOnce({ id: 'fund-new' })
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }))
    fireEvent.click(await screen.findByRole('button', { name: '资金' }))
    fireEvent.click(screen.getByRole('button', { name: '登记收款或退款' }))
    fireEvent.click(screen.getByRole('button', { name: '选择收款凭证' }))

    await waitFor(() => expect(mocks.pickFundProof).toHaveBeenCalledTimes(1))
    expect(screen.getByText('已选择：定金凭证.png')).toBeVisible()
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: '确认登记' }))

    await waitFor(() =>
      expect(mocks.recordFund).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({
          businessType: 'payment',
          amountCents: 5_000,
          attachmentId: 'proof-1'
        })
      )
    )
  })

  it('新建订单默认带入预留天数，并允许按订单调整', async () => {
    mocks.createOrder.mockResolvedValueOnce(mocks.selectedOrder)
    render(<OrdersPage onNavigateToBaseData={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '新建订单' }))
    expect(screen.getByRole('textbox', { name: '预留制作天数' })).toHaveValue('2')
    fireEvent.change(screen.getByRole('textbox', { name: '预留制作天数' }), {
      target: { value: '3' }
    })
    fireEvent.click(screen.getByRole('combobox', { name: '客户' }))
    fireEvent.click(screen.getByRole('option', { name: '已有客户' }))
    fireEvent.click(screen.getByRole('button', { name: '保存并进入详情' }))

    await waitFor(() =>
      expect(mocks.createOrder).toHaveBeenCalledWith(expect.objectContaining({ reservedDays: 3 }))
    )
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
    expect(await screen.findByRole('alert', { hidden: true })).toHaveTextContent('商品保存失败')
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
