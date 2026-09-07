import { useEffect, useMemo, useState } from 'react'
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek
} from 'date-fns'
import { Badge, Button, Dialog, Flex, Heading, Table, Text, TextField } from '@radix-ui/themes'
import {
  ArchiveRestore,
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  LayoutDashboard,
  Package,
  Plus,
  Search,
  Settings,
  Users
} from 'lucide-react'
import type {
  AttachmentSummary,
  AuditLogSummary,
  BackupSummary,
  LocalDataActivity,
  CustomerProfile,
  CostSettings,
  DashboardSummary,
  OrderCreateInput,
  OrderCostDetail,
  OrderDetail,
  OrderSummary,
  OrderUpdateInput,
  OrderProfitReport,
  OrderShipmentSummary,
  ShipmentDetail,
  ProductCostPreview,
  ProductCreateInput,
  ProductDetail,
  ProductSummary,
  ProductUpdateInput,
  ProductionStatus,
  ProductionScheduleStatus,
  ScheduleRiskCode,
  ShiftDetail,
  ShiftPreviewResult,
  ShiftStatus,
  ShiftSummary,
  WorkerDetail,
  WorkerSettlementReport,
  CapacityRiskReport,
  MonthlyProductionWeightReport,
  WorkerSummary,
  WorkerUpdateInput
} from '@shared/contracts'
import {
  getFinancialStatusPresentation,
  getProductionStatusPresentation,
  getShiftStatusPresentation,
  knownProductionStatuses,
  knownShiftStatuses
} from '../status-display'
import { parseNumericDraft } from './numeric-draft'
import { NumericTextField } from './numeric-text-field'
import { calculateDraftTotals, getErrorMessage, getWeekDates } from './workspace-utils'
import { getAvailableShiftTaskItems, type ShiftTaskOption } from './shift-task-options'

type View = 'overview' | 'orders' | 'schedule' | 'products' | 'workers' | 'reports' | 'settings'
type DetailTarget = { kind: 'order' | 'worker' | 'shift'; id: string }

const navigation: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: '概览', icon: LayoutDashboard },
  { id: 'orders', label: '订单', icon: CircleDollarSign },
  { id: 'schedule', label: '排班', icon: CalendarDays },
  { id: 'products', label: '商品', icon: Package },
  { id: 'workers', label: '兼职人员', icon: Users },
  { id: 'reports', label: '报表', icon: Search },
  { id: 'settings', label: '设置与备份', icon: Settings }
]

const money = (cents: number) =>
  new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(cents / 100)

const centsFromDraft = (value: string) => {
  const numericValue = parseNumericDraft(value)
  return numericValue === null ? null : Math.round(numericValue * 100)
}

const milliYuanFromDraft = (value: string) => {
  const numericValue = parseNumericDraft(value)
  return numericValue === null ? null : Math.round(numericValue * 1000)
}

const schedulingStatusPresentation: Record<
  ProductionScheduleStatus,
  { label: string; color: 'gray' | 'amber' | 'blue' | 'orange' | 'green' }
> = {
  pending_schedule: { label: '待排产', color: 'gray' },
  partially_scheduled: { label: '部分已排', color: 'blue' },
  fully_scheduled: { label: '已排满', color: 'green' },
  pending_replenishment: { label: '待补排', color: 'orange' },
  production_completed: { label: '制作完成', color: 'green' }
}

function getSchedulingStatusPresentation(status: ProductionScheduleStatus) {
  return schedulingStatusPresentation[status]
}

function ProductionProgressText({
  qualifiedQuantity,
  scheduledQuantity,
  unplannedQuantity
}: {
  qualifiedQuantity: number
  scheduledQuantity: number
  unplannedQuantity: number
}) {
  return (
    <Text as="div" size="1" color="gray" className="production-progress">
      合格 {qualifiedQuantity} · 已排 {scheduledQuantity} · 未排 {unplannedQuantity}
    </Text>
  )
}

function Stat({
  label,
  value,
  tone = 'default'
}: {
  label: string
  value: string | number
  tone?: 'default' | 'warning' | 'danger'
}) {
  return (
    <div className={`stat ${tone}`}>
      <Text size="2" color="gray">
        {label}
      </Text>
      <Heading size="6">{value}</Heading>
    </div>
  )
}

export function App() {
  const [view, setView] = useState<View>('overview')
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null)
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [workers, setWorkers] = useState<WorkerSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [newProductOpen, setNewProductOpen] = useState(false)
  const [newWorkerOpen, setNewWorkerOpen] = useState(false)
  const [newOrderOpen, setNewOrderOpen] = useState(false)
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null)

  const reload = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [dashboardData, productData, orderData, workerData] = await Promise.all([
        window.yumi.dashboard.get(),
        window.yumi.products.list(),
        window.yumi.orders.list(),
        window.yumi.workers.list()
      ])
      setDashboard(dashboardData)
      setProducts(productData)
      setOrders(orderData)
      setWorkers(workerData)
    } catch (reason) {
      setLoadError(getErrorMessage(reason, '本地数据读取失败，请重试。'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void reload()
  }, [])

  const title = useMemo(() => {
    if (detailTarget?.kind === 'order') return '订单详情'
    if (detailTarget?.kind === 'worker') return '兼职人员详情'
    if (detailTarget?.kind === 'shift') return '排班详情'
    return navigation.find((item) => item.id === view)?.label ?? ''
  }, [detailTarget, view])
  const openDetail = (kind: DetailTarget['kind'], id: string) => {
    setView(kind === 'order' ? 'orders' : kind === 'worker' ? 'workers' : 'schedule')
    setDetailTarget({ kind, id })
  }
  const addLabel = detailTarget
    ? ''
    : view === 'products'
      ? '新建商品'
      : view === 'workers'
        ? '新增兼职人员'
        : view === 'orders'
          ? '新建订单'
          : ''
  const onAdd = () => {
    if (view === 'products') setNewProductOpen(true)
    if (view === 'workers') setNewWorkerOpen(true)
    if (view === 'orders') setNewOrderOpen(true)
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">Y</span>
          <span>
            YUMI <em>STUDIO</em>
          </span>
        </div>
        <nav>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={view === id ? 'nav-item active' : 'nav-item'}
              aria-current={view === id ? 'page' : undefined}
              onClick={() => {
                setView(id)
                setDetailTarget(null)
              }}
              type="button"
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Text size="1" color="gray">
            本机离线数据
          </Text>
          <Badge color="green" variant="soft">
            已保护
          </Badge>
        </div>
      </aside>
      <section className="workspace">
        <header className="command-bar">
          <div>
            <Heading size="5">{title}</Heading>
            <Text size="2" color="gray">
              YUMI 捏捏工作室 · 本地管理工作台
            </Text>
          </div>
          <Flex gap="3" align="center">
            <div aria-label="搜索功能暂未启用" className="search" role="search">
              <Search size={16} />
              <Text size="2" color="gray">
                搜索订单、商品或客户
              </Text>
              <kbd>⌘ K</kbd>
            </div>
            {addLabel && (
              <Button onClick={onAdd}>
                <Plus size={16} />
                {addLabel}
              </Button>
            )}
          </Flex>
        </header>
        <section className="content">
          {loading ? (
            <div aria-live="polite" className="state-message">
              <Text color="gray">正在读取本地数据…</Text>
            </div>
          ) : loadError ? (
            <div aria-live="assertive" className="state-message error-state" role="alert">
              <Text color="red">{loadError}</Text>
              <Button onClick={() => void reload()} variant="soft">
                重试读取
              </Button>
            </div>
          ) : detailTarget?.kind === 'order' ? (
            <OrderDetailWorkspace
              orderId={detailTarget.id}
              products={products}
              onBack={() => setDetailTarget(null)}
              onInspectShift={(shiftId) => openDetail('shift', shiftId)}
              onChanged={reload}
            />
          ) : detailTarget?.kind === 'worker' ? (
            <WorkerDetailWorkspace
              workerId={detailTarget.id}
              onBack={() => setDetailTarget(null)}
              onDataChanged={reload}
              onInspectOrder={(orderId) => openDetail('order', orderId)}
              onInspectShift={(shiftId) => openDetail('shift', shiftId)}
            />
          ) : detailTarget?.kind === 'shift' ? (
            <ShiftDetailWorkspace
              shiftId={detailTarget.id}
              orders={orders}
              onBack={() => setDetailTarget(null)}
              onDataChanged={reload}
            />
          ) : (
            <ViewContent
              view={view}
              dashboard={dashboard!}
              products={products}
              orders={orders}
              workers={workers}
              onInspectOrder={(orderId) => openDetail('order', orderId)}
              onInspectWorker={(workerId) => openDetail('worker', workerId)}
              onInspectShift={(shiftId) => openDetail('shift', shiftId)}
              onNavigate={setView}
              onDataChanged={reload}
            />
          )}
        </section>
      </section>
      <ProductDialog open={newProductOpen} onOpenChange={setNewProductOpen} onDone={reload} />
      <WorkerDialog open={newWorkerOpen} onOpenChange={setNewWorkerOpen} onDone={reload} />
      <OrderDialog
        open={newOrderOpen}
        onOpenChange={setNewOrderOpen}
        products={products}
        onDone={reload}
      />
    </main>
  )
}

function ViewContent({
  view,
  dashboard,
  products,
  orders,
  workers,
  onInspectOrder,
  onInspectWorker,
  onInspectShift,
  onNavigate,
  onDataChanged
}: {
  view: View
  dashboard: DashboardSummary
  products: ProductSummary[]
  orders: OrderSummary[]
  workers: WorkerSummary[]
  onInspectOrder(orderId: string): void
  onInspectWorker(workerId: string): void
  onInspectShift(shiftId: string): void
  onNavigate(view: View): void
  onDataChanged(): Promise<void>
}) {
  if (view === 'overview')
    return (
      <Overview
        dashboard={dashboard}
        orders={orders}
        onInspectOrder={onInspectOrder}
        onNavigate={onNavigate}
      />
    )
  if (view === 'products') return <Products products={products} onDataChanged={onDataChanged} />
  if (view === 'orders') return <Orders orders={orders} onInspectOrder={onInspectOrder} />
  if (view === 'workers') return <Workers workers={workers} onInspectWorker={onInspectWorker} />
  if (view === 'schedule')
    return (
      <Schedule
        workers={workers}
        orders={orders}
        products={products}
        onDataChanged={onDataChanged}
        onInspectShift={onInspectShift}
      />
    )
  if (view === 'reports') return <Reports dashboard={dashboard} />
  return <SettingsWorkspace onDataChanged={onDataChanged} />
}

function Overview({
  dashboard,
  orders,
  onInspectOrder,
  onNavigate
}: {
  dashboard: DashboardSummary
  orders: OrderSummary[]
  onInspectOrder(orderId: string): void
  onNavigate(view: View): void
}) {
  const outstandingOrders = orders.filter((order) => order.outstandingCents > 0)
  const upcomingOrders = orders.filter(
    (order) => order.productionStatus !== 'completed' && order.productionStatus !== 'cancelled'
  )
  const queues = [
    {
      label: '待收款',
      description: '需要继续跟进收款的订单',
      value: `${dashboard.outstandingOrderCount} 笔 · ${money(dashboard.outstandingCents)}`,
      tone: 'warning',
      action: () => onNavigate('orders')
    },
    {
      label: '临近发货',
      description: '未来 7 天内需要发货',
      value: `${dashboard.upcomingOrderCount} 笔订单`,
      tone: 'warning',
      action: () => onNavigate('orders')
    },
    {
      label: '待补排',
      description: '缺勤、请假或取消留下的制作量',
      value: `${dashboard.rescheduleTaskCount} 个待补数量`,
      tone: 'danger',
      action: () => onNavigate('schedule')
    },
    {
      label: '排班风险',
      description: '已经保存风险确认的班次',
      value: `${dashboard.riskShiftCount} 个班次`,
      tone: dashboard.riskShiftCount ? 'danger' : 'default',
      action: () => onNavigate('schedule')
    }
  ] as const

  return (
    <>
      <div className="stat-grid">
        <Stat label="待收款订单" value={dashboard.outstandingOrderCount} />
        <Stat label="待收金额" value={money(dashboard.outstandingCents)} tone="warning" />
        <Stat label="7 天内待发货" value={dashboard.upcomingOrderCount} tone="warning" />
        <Stat label="需补排任务" value={dashboard.rescheduleTaskCount} tone="danger" />
      </div>
      <div className="panel">
        <Flex justify="between" align="center" mb="4">
          <div>
            <Heading size="4">工作队列</Heading>
            <Text size="2" color="gray">
              从这里进入订单或日历，处理今天需要关注的事项。
            </Text>
          </div>
          <Badge variant="soft">本地实时汇总</Badge>
        </Flex>
        <div className="queue-list">
          {queues.map((queue) => (
            <button
              className={`queue-item ${queue.tone}`}
              key={queue.label}
              onClick={queue.action}
              type="button"
            >
              <span className="queue-copy">
                <Text weight="medium">{queue.label}</Text>
                <Text as="span" size="1" color="gray">
                  {queue.description}
                </Text>
              </span>
              <span className="queue-value">{queue.value}</span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      </div>
      <div className="panel">
        <Flex justify="between" align="center" mb="4">
          <div>
            <Heading size="4">待处理订单</Heading>
            <Text size="2" color="gray">
              优先显示待收款和未完成订单，单击行打开订单检查器。
            </Text>
          </div>
          <Button variant="ghost" onClick={() => onNavigate('orders')}>
            查看全部 <ChevronRight size={16} />
          </Button>
        </Flex>
        <OrdersTable
          orders={
            outstandingOrders.length > 0
              ? outstandingOrders.slice(0, 6)
              : upcomingOrders.slice(0, 6)
          }
          onInspectOrder={onInspectOrder}
        />
        {orders.length === 0 && <Empty text="当前没有待处理订单。" />}
      </div>
    </>
  )
}
function Products({
  products,
  onDataChanged
}: {
  products: ProductSummary[]
  onDataChanged(): Promise<void>
}) {
  const [inspectingProductId, setInspectingProductId] = useState<string | null>(null)

  return (
    <>
      <div className="panel">
        <Flex justify="between" mb="4">
          <div>
            <Heading size="4">商品种类</Heading>
            <Text size="2" color="gray">
              单击商品维护售价、缝边、成本参数与模具日产能。
            </Text>
          </div>
          <Badge variant="soft">{products.length} 个商品</Badge>
        </Flex>
        <Table.Root variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>商品</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>分类</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>售价</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>缝边/个</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>标准工时</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>日产能</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {products.map((product) => (
              <Table.Row
                aria-label={`打开商品 ${product.name}`}
                className="selectable-row"
                key={product.id}
                onClick={() => setInspectingProductId(product.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setInspectingProductId(product.id)
                  }
                }}
                tabIndex={0}
              >
                <Table.Cell>
                  <Text weight="medium">{product.name}</Text>
                  <Text size="1" color="gray">
                    {product.code || '未设编码'}
                  </Text>
                </Table.Cell>
                <Table.Cell>{product.category || '未分类'}</Table.Cell>
                <Table.Cell>{money(product.basePriceCents)}</Table.Cell>
                <Table.Cell>{money(product.edgePriceCents)}</Table.Cell>
                <Table.Cell>{product.standardMinutesPerUnit} 分钟/个</Table.Cell>
                <Table.Cell>
                  <Badge color={product.enabled ? 'green' : 'gray'}>
                    {product.dailyCapacity} 个/天
                  </Badge>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
        {products.length === 0 && (
          <Empty text="还没有商品。先建立商品和成本参数，才能创建订单与排班。" />
        )}
      </div>
      <ProductInspector
        productId={inspectingProductId}
        onOpenChange={(open) => {
          if (!open) setInspectingProductId(null)
        }}
        onDataChanged={onDataChanged}
      />
    </>
  )
}
function Orders({
  orders,
  onInspectOrder
}: {
  orders: OrderSummary[]
  onInspectOrder(orderId: string): void
}) {
  return (
    <div className="panel">
      <Flex justify="between" mb="4">
        <div>
          <Heading size="4">订单</Heading>
          <Text size="2" color="gray">
            一笔订单可包含多个商品，支持分次收款和退款。
          </Text>
        </div>
        <Badge variant="soft">{orders.length} 笔订单</Badge>
      </Flex>
      <OrdersTable orders={orders} onInspectOrder={onInspectOrder} />
      {orders.length === 0 && (
        <Empty text="还没有订单。建立商品后，可以录入客户、多个商品明细与预计发货日期。" />
      )}
    </div>
  )
}
function OrdersTable({
  orders,
  onInspectOrder
}: {
  orders: OrderSummary[]
  onInspectOrder(orderId: string): void
}) {
  return (
    <Table.Root variant="surface">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>订单号</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>客户</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>预计发货</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>制作截止</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>制作状态</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>排产进度</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>待收</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {orders.map((order) => (
          <Table.Row
            key={order.id}
            aria-label={`打开订单 ${order.code}`}
            className="selectable-row"
            onClick={() => onInspectOrder(order.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onInspectOrder(order.id)
              }
            }}
            tabIndex={0}
          >
            <Table.Cell>
              <Text weight="medium">{order.code}</Text>
            </Table.Cell>
            <Table.Cell>{order.customerName}</Table.Cell>
            <Table.Cell>{order.expectedShipDate}</Table.Cell>
            <Table.Cell>{order.productionDeadline}</Table.Cell>
            <Table.Cell>
              <Badge
                color={getProductionStatusPresentation(order.productionStatus).color}
                variant="soft"
              >
                {getProductionStatusPresentation(order.productionStatus).label}
              </Badge>
            </Table.Cell>
            <Table.Cell>
              <Badge
                color={getSchedulingStatusPresentation(order.schedulingStatus).color}
                variant="soft"
              >
                {getSchedulingStatusPresentation(order.schedulingStatus).label}
              </Badge>
              <ProductionProgressText {...order.progress} />
            </Table.Cell>
            <Table.Cell>{money(order.outstandingCents)}</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  )
}
function Workers({
  workers,
  onInspectWorker
}: {
  workers: WorkerSummary[]
  onInspectWorker(workerId: string): void
}) {
  return (
    <div className="panel">
      <Flex justify="between" mb="4">
        <div>
          <Heading size="4">兼职人员</Heading>
          <Text size="2" color="gray">
            维护人员资料、默认工作时间，并查看历史排班与制作结算。
          </Text>
        </div>
        <Badge variant="soft">{workers.filter((worker) => worker.active).length} 位在岗</Badge>
      </Flex>
      <Table.Root variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>人员</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>时薪</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>默认工作时间</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>状态</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {workers.map((worker) => (
            <Table.Row
              key={worker.id}
              aria-label={`打开兼职人员 ${worker.name}`}
              className="selectable-row"
              onClick={() => onInspectWorker(worker.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onInspectWorker(worker.id)
                }
              }}
              tabIndex={0}
            >
              <Table.Cell>
                <Text weight="medium">{worker.name}</Text>
              </Table.Cell>
              <Table.Cell>{money(worker.hourlyWageCents)}</Table.Cell>
              <Table.Cell>
                {worker.defaultWorkStart && worker.defaultWorkEnd
                  ? `${worker.defaultWorkStart} – ${worker.defaultWorkEnd}`
                  : '未设置'}
              </Table.Cell>
              <Table.Cell>
                <Badge color={worker.active ? 'green' : 'gray'}>
                  {worker.active ? '在岗' : '停用'}
                </Badge>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      {workers.length === 0 && (
        <Empty text="还没有兼职人员。创建人员后，可以按任务时长安排本次排班。" />
      )}
    </div>
  )
}

function formatWorkerMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`
}

function WorkerDetailWorkspace({
  workerId,
  onBack,
  onDataChanged,
  onInspectOrder,
  onInspectShift
}: {
  workerId: string
  onBack(): void
  onDataChanged(): Promise<void>
  onInspectOrder(orderId: string): void
  onInspectShift(shiftId: string): void
}) {
  const [worker, setWorker] = useState<WorkerDetail | null>(null)
  const [draft, setDraft] = useState<WorkerUpdateInput | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!workerId) {
      setWorker(null)
      setDraft(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    void window.yumi.workers
      .get(workerId)
      .then((result) => {
        if (cancelled) return
        setWorker(result)
        setDraft(
          result
            ? {
                id: result.id,
                name: result.name,
                phone: result.phone,
                hourlyWageCents: result.hourlyWageCents,
                defaultWorkStart: result.defaultWorkStart,
                defaultWorkEnd: result.defaultWorkEnd,
                active: result.active,
                effectiveFrom: new Date().toISOString().slice(0, 10)
              }
            : null
        )
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '人员详情读取失败。')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [workerId])

  const patchDraft = (patch: Partial<WorkerUpdateInput>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current))

  const save = async () => {
    if (!draft) return
    setSaving(true)
    setError('')
    try {
      const saved = await window.yumi.workers.update(draft)
      const detail = await window.yumi.workers.get(saved.id)
      setWorker(detail)
      setDraft(
        detail
          ? {
              id: detail.id,
              name: detail.name,
              phone: detail.phone,
              hourlyWageCents: detail.hourlyWageCents,
              defaultWorkStart: detail.defaultWorkStart,
              defaultWorkEnd: detail.defaultWorkEnd,
              active: detail.active,
              effectiveFrom: new Date().toISOString().slice(0, 10)
            }
          : null
      )
      await onDataChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '人员资料保存失败。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="detail-workspace">
      <div className="detail-workspace-toolbar">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={16} />
          返回兼职人员列表
        </Button>
      </div>
      {loading && <Text color="gray">正在读取人员资料…</Text>}
      {error && (
        <Text as="div" color="red" size="2" mt="3">
          {error}
        </Text>
      )}
      {worker && draft && (
        <div className="inspector-content">
          <div className="inspector-heading">
            <div>
              <Heading size="5">{worker.name}</Heading>
              <Text as="div" color="gray" size="2" mt="1">
                {worker.phone || '未填写联系电话'} · {worker.active ? '当前在岗' : '已停用'}
              </Text>
            </div>
            <Badge color={worker.active ? 'green' : 'gray'} variant="soft">
              {worker.active ? '在岗' : '停用'}
            </Badge>
          </div>

          <section className="form-section">
            <div className="section-title">
              <div>
                <Text weight="medium">人员资料与工作规则</Text>
                <Text as="div" color="gray" size="1">
                  修改时薪会新增一条生效记录，不会改写历史结算。
                </Text>
              </div>
              <label className="switch-label">
                <input
                  checked={draft.active}
                  onChange={(event) => patchDraft({ active: event.target.checked })}
                  type="checkbox"
                />
                <span>允许排班</span>
              </label>
            </div>
            <div className="field-grid three">
              <label>
                <Text as="div" size="2" mb="1">
                  姓名
                </Text>
                <TextField.Root
                  value={draft.name}
                  onChange={(event) => patchDraft({ name: event.target.value })}
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  联系电话
                </Text>
                <TextField.Root
                  value={draft.phone ?? ''}
                  onChange={(event) => patchDraft({ phone: event.target.value || null })}
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  时薪（元）
                </Text>
                <NumericTextField
                  allowDecimal
                  onValueChange={(value) => {
                    const hourlyWageCents = centsFromDraft(value)
                    if (hourlyWageCents !== null) patchDraft({ hourlyWageCents })
                  }}
                  value={draft.hourlyWageCents / 100}
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  默认上班开始
                </Text>
                <TextField.Root
                  type="time"
                  value={draft.defaultWorkStart ?? ''}
                  onChange={(event) => patchDraft({ defaultWorkStart: event.target.value || null })}
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  默认下班结束
                </Text>
                <TextField.Root
                  type="time"
                  value={draft.defaultWorkEnd ?? ''}
                  onChange={(event) => patchDraft({ defaultWorkEnd: event.target.value || null })}
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  时薪生效日期
                </Text>
                <TextField.Root
                  type="date"
                  value={draft.effectiveFrom}
                  onChange={(event) => patchDraft({ effectiveFrom: event.target.value })}
                />
              </label>
            </div>
          </section>

          <section className="inspector-kpis worker-kpis">
            <Stat label="实际工时" value={formatWorkerMinutes(worker.totalActualMinutes)} />
            <Stat label="合格数量" value={`${worker.totalQualifiedQuantity} 个`} />
            <Stat label="按件提成" value={money(worker.totalCommissionCostCents)} />
            <Stat
              label="缺勤 / 请假"
              value={`${worker.absenceCount} 次`}
              tone={worker.absenceCount ? 'warning' : 'default'}
            />
          </section>

          <section className="form-section">
            <div className="section-title">
              <Text weight="medium">时薪历史</Text>
              <Text size="1" color="gray">
                共 {worker.wageHistory.length} 条记录
              </Text>
            </div>
            <Table.Root variant="surface">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>生效日期</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>时薪</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>记录时间</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {worker.wageHistory.map((history) => (
                  <Table.Row key={history.id}>
                    <Table.Cell>{history.effectiveFrom}</Table.Cell>
                    <Table.Cell>{money(history.hourlyWageCents)}</Table.Cell>
                    <Table.Cell>{history.createdAt.slice(0, 16).replace('T', ' ')}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </section>

          <section className="form-section">
            <div className="section-title">
              <Text weight="medium">订单任务</Text>
              <Text size="1" color="gray">
                可从任务返回查看订单排产进度
              </Text>
            </div>
            {worker.orderTasks.length === 0 ? (
              <Empty text="还没有关联订单任务。" />
            ) : (
              <Table.Root variant="surface">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>日期</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>订单 / 商品</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>计划 / 合格</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>不合格 / 未完成</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>班次状态</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>操作</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {worker.orderTasks.map((task) => (
                    <Table.Row key={`${task.shiftId}-${task.orderItemId}`}>
                      <Table.Cell>{task.shiftDate}</Table.Cell>
                      <Table.Cell>
                        <Text weight="medium">{task.orderCode}</Text>
                        <Text as="div" size="1" color="gray">
                          {task.productName}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        {task.plannedQuantity} / {task.qualifiedQuantity}
                      </Table.Cell>
                      <Table.Cell>
                        {task.unqualifiedQuantity} / {task.unfinishedQuantity}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge
                          color={getShiftStatusPresentation(task.shiftStatus).color}
                          variant="soft"
                        >
                          {getShiftStatusPresentation(task.shiftStatus).label}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Flex gap="2">
                          <Button
                            size="1"
                            variant="soft"
                            onClick={() => onInspectOrder(task.orderId)}
                          >
                            查看订单
                          </Button>
                          <Button
                            size="1"
                            variant="soft"
                            onClick={() => onInspectShift(task.shiftId)}
                          >
                            查看班次
                          </Button>
                        </Flex>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            )}
          </section>

          <section className="form-section">
            <div className="section-title">
              <Text weight="medium">历史排班与制作结算</Text>
              <Text size="1" color="gray">
                按最近排班日期倒序
              </Text>
            </div>
            <Table.Root variant="surface">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>日期 / 排班时长</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>状态</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>任务</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>实际工时</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>合格数量</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>按件提成</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {worker.shifts.map((shift) => (
                  <Table.Row key={shift.id}>
                    <Table.Cell>
                      <Text weight="medium">{shift.shiftDate}</Text>
                      <Text as="div" size="1" color="gray">
                        基础 {shift.baseTaskMinutes} 分钟 · 额外 {shift.extraMinutes} 分钟 · 最终{' '}
                        {shift.totalMinutes} 分钟
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge color={getShiftStatusPresentation(shift.status).color} variant="soft">
                        {getShiftStatusPresentation(shift.status).label}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>{shift.taskCount} 项</Table.Cell>
                    <Table.Cell>{formatWorkerMinutes(shift.actualMinutes)}</Table.Cell>
                    <Table.Cell>{shift.qualifiedQuantity} 个</Table.Cell>
                    <Table.Cell>{money(shift.commissionCostCents)}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
            {worker.shifts.length === 0 && <Empty text="还没有历史排班记录。" />}
          </section>
        </div>
      )}
      <Flex gap="3" justify="end" mt="5">
        <Button variant="soft" color="gray" onClick={onBack}>
          返回兼职人员列表
        </Button>
        <Button disabled={!draft || saving} onClick={() => void save()}>
          {saving ? '保存中…' : '保存人员资料'}
        </Button>
      </Flex>
    </div>
  )
}

function Schedule({
  workers,
  orders,
  products,
  onDataChanged,
  onInspectShift
}: {
  workers: WorkerSummary[]
  orders: OrderSummary[]
  products: ProductSummary[]
  onDataChanged(): Promise<void>
  onInspectShift(shiftId: string): void
}) {
  const [anchorDate, setAnchorDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')
  const [shifts, setShifts] = useState<ShiftSummary[]>([])
  const [shiftDetails, setShiftDetails] = useState<Record<string, ShiftDetail>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [target, setTarget] = useState<{ worker: WorkerSummary; date: string } | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const weekDates = useMemo(() => getWeekDates(anchorDate), [anchorDate])
  const monthDates = useMemo(() => {
    const anchor = parseISO(anchorDate)
    const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 })
    const dates: string[] = []
    let cursor = start
    while (cursor <= end) {
      dates.push(format(cursor, 'yyyy-MM-dd'))
      cursor = addDays(cursor, 1)
    }
    return dates
  }, [anchorDate])
  const scheduleRange = viewMode === 'week' ? weekDates : monthDates
  const weekLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const nextShifts = await window.yumi.schedule.list(
          scheduleRange[0]!,
          scheduleRange[scheduleRange.length - 1]!
        )
        if (!cancelled) {
          setShifts(nextShifts)
          if (viewMode === 'month') {
            const details = await Promise.all(
              nextShifts.map((shift) => window.yumi.schedule.get(shift.id))
            )
            const nextDetails: Record<string, ShiftDetail> = {}
            details.forEach((detail) => {
              if (detail) nextDetails[detail.id] = detail
            })
            setShiftDetails(nextDetails)
          } else {
            setShiftDetails({})
          }
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '排班读取失败。')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [reloadToken, scheduleRange, viewMode])

  return (
    <div className="panel calendar">
      <Flex justify="between" mb="5" align="center">
        <div>
          <Heading size="4">{viewMode === 'week' ? '周历排班' : '月度产能风险'}</Heading>
          <Text size="2" color="gray">
            以任务时长安排本次排班；系统计算任务基础、额外预留和最终总时长，并提示模具日产能与交期风险。
          </Text>
        </div>
        <Flex gap="2" align="center">
          <Button
            size="1"
            variant={viewMode === 'week' ? 'solid' : 'soft'}
            onClick={() => setViewMode('week')}
          >
            周视图
          </Button>
          <Button
            size="1"
            variant={viewMode === 'month' ? 'solid' : 'soft'}
            onClick={() => setViewMode('month')}
          >
            月度风险
          </Button>
          <Button
            variant="soft"
            color="gray"
            onClick={() =>
              setAnchorDate(
                format(
                  viewMode === 'week'
                    ? addDays(parseISO(anchorDate), -7)
                    : addMonths(parseISO(anchorDate), -1),
                  'yyyy-MM-dd'
                )
              )
            }
          >
            上一{viewMode === 'week' ? '周' : '月'}
          </Button>
          <Button
            variant="soft"
            color="gray"
            onClick={() => setAnchorDate(format(new Date(), 'yyyy-MM-dd'))}
          >
            本{viewMode === 'week' ? '周' : '月'}
          </Button>
          <Button
            variant="soft"
            color="gray"
            onClick={() =>
              setAnchorDate(
                format(
                  viewMode === 'week'
                    ? addDays(parseISO(anchorDate), 7)
                    : addMonths(parseISO(anchorDate), 1),
                  'yyyy-MM-dd'
                )
              )
            }
          >
            下一{viewMode === 'week' ? '周' : '月'}
          </Button>
        </Flex>
      </Flex>
      {viewMode === 'week' ? (
        <div className="week-grid">
          <div className="time-axis">人员</div>
          {weekDates.map((date, index) => (
            <div className="day" key={date}>
              <Text as="div" size="1">
                {weekLabels[index]}
              </Text>
              <Text as="div" size="1" color="gray">
                {format(parseISO(date), 'MM/dd')}
              </Text>
            </div>
          ))}
          {workers.length === 0 ? (
            <div className="calendar-empty">
              <CalendarDays size={24} />
              <Text>创建兼职人员后，即可在此按日期安排制作任务。</Text>
            </div>
          ) : (
            workers.map((worker) => (
              <div className="worker-row" key={worker.id}>
                <div className="worker-label">
                  <Text weight="medium">{worker.name}</Text>
                  <Text as="div" size="1" color="gray">
                    {worker.active ? '可排班' : '已停用'}
                  </Text>
                </div>
                {weekDates.map((date) => {
                  const cellShifts = shifts
                    .filter((shift) => shift.workerId === worker.id && shift.shiftDate === date)
                    .sort((left, right) => left.id.localeCompare(right.id))
                  return (
                    <div className="slot" key={date}>
                      {cellShifts.map((shift) => (
                        <button
                          className={`shift-block ${shift.status}`}
                          key={shift.id}
                          onClick={() => onInspectShift(shift.id)}
                          title="打开排班详情"
                          type="button"
                        >
                          最终 {shift.totalMinutes} 分钟
                          <small>
                            基础 {shift.baseTaskMinutes} + 额外 {shift.extraMinutes} ·{' '}
                            {shift.taskCount} 项 · {getShiftStatusPresentation(shift.status).label}
                          </small>
                        </button>
                      ))}
                      {worker.active ? (
                        <button
                          className={
                            cellShifts.length === 0 ? 'slot-add-button empty' : 'slot-add-button'
                          }
                          onClick={() => setTarget({ worker, date })}
                          title="创建该日期的排班"
                          type="button"
                        >
                          {cellShifts.length === 0 ? '＋' : '＋ 添加'}
                        </button>
                      ) : (
                        <span className="slot-disabled">已停用</span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
      ) : (
        <MonthCapacityGrid
          anchorDate={anchorDate}
          dates={monthDates}
          shifts={shifts}
          shiftDetails={shiftDetails}
          products={products}
        />
      )}
      {loading && (
        <Text as="div" size="2" color="gray" mt="3">
          正在刷新排班…
        </Text>
      )}
      {error && (
        <Text as="div" size="2" color="red" mt="3">
          {error}
        </Text>
      )}
      <ShiftDialog
        target={target}
        orders={orders}
        onOpenChange={(open) => {
          if (!open) setTarget(null)
        }}
        onDone={async () => {
          setReloadToken((current) => current + 1)
          await onDataChanged()
        }}
      />
    </div>
  )
}
function MonthCapacityGrid({
  anchorDate,
  dates,
  shifts,
  shiftDetails,
  products
}: {
  anchorDate: string
  dates: string[]
  shifts: ShiftSummary[]
  shiftDetails: Record<string, ShiftDetail>
  products: ProductSummary[]
}) {
  const productById = new Map(products.map((product) => [product.id, product]))
  const summaries = dates.map((date) => {
    const dayShifts = shifts.filter((shift) => shift.shiftDate === date)
    const plannedByProduct = new Map<string, number>()
    dayShifts.forEach((shift) => {
      shiftDetails[shift.id]?.tasks.forEach((task) => {
        plannedByProduct.set(
          task.productId,
          (plannedByProduct.get(task.productId) ?? 0) + task.plannedQuantity
        )
      })
    })
    const risks = [...plannedByProduct.entries()].flatMap(([productId, planned]) => {
      const product = productById.get(productId)
      return product && planned > product.dailyCapacity
        ? [{ productName: product.name, planned, capacity: product.dailyCapacity }]
        : []
    })
    return {
      date,
      dayShifts,
      planned: [...plannedByProduct.values()].reduce((sum, value) => sum + value, 0),
      risks
    }
  })
  const currentMonth = anchorDate.slice(0, 7)
  const labels = ['一', '二', '三', '四', '五', '六', '日']
  return (
    <div className="month-capacity">
      <div className="month-weekdays">
        {labels.map((label) => (
          <span key={label}>周{label}</span>
        ))}
      </div>
      <div className="month-grid">
        {summaries.map((summary) => {
          const inMonth = summary.date.startsWith(currentMonth)
          return (
            <div className={`month-day ${inMonth ? '' : 'outside'}`} key={summary.date}>
              <Flex justify="between" align="center">
                <Text weight="medium">{format(parseISO(summary.date), 'd')}</Text>
                {summary.dayShifts.length > 0 && (
                  <Badge variant="soft">{summary.dayShifts.length} 班</Badge>
                )}
              </Flex>
              <Text as="div" size="1" color="gray">
                计划 {summary.planned} 个
              </Text>
              {summary.risks.length > 0 ? (
                <div className="month-risk-list">
                  {summary.risks.map((risk) => (
                    <Text key={risk.productName} size="1" color="red">
                      超载：{risk.productName} {risk.planned}/{risk.capacity}
                    </Text>
                  ))}
                </div>
              ) : (
                <Text as="div" size="1" color="gray">
                  模具容量正常
                </Text>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Reports({ dashboard }: { dashboard: DashboardSummary }) {
  const today = new Date()
  const [fromDate, setFromDate] = useState(format(startOfMonth(today), 'yyyy-MM-dd'))
  const [toDate, setToDate] = useState(format(endOfMonth(today), 'yyyy-MM-dd'))
  const [productionStatus, setProductionStatus] = useState<ProductionStatus | 'all'>('all')
  const [outstandingOnly, setOutstandingOnly] = useState(false)
  const [reportType, setReportType] = useState<'orders' | 'workers' | 'capacity' | 'production'>(
    'orders'
  )
  const [month, setMonth] = useState(format(today, 'yyyy-MM'))
  const [report, setReport] = useState<OrderProfitReport | null>(null)
  const [workerReport, setWorkerReport] = useState<WorkerSettlementReport | null>(null)
  const [capacityReport, setCapacityReport] = useState<CapacityRiskReport | null>(null)
  const [productionReport, setProductionReport] = useState<MonthlyProductionWeightReport | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const exportCurrentReport = async () => {
    setError('')
    if (reportType === 'production') return
    try {
      const result = await window.yumi.reports.export({
        kind: reportType,
        fromDate,
        toDate,
        productionStatus,
        outstandingOnly
      })
      if (result.savedPath) window.alert(`报表已导出到：${result.savedPath}`)
    } catch (reason) {
      setError(getErrorMessage(reason, '报表导出失败，请重试。'))
    }
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setReport(null)
    setWorkerReport(null)
    setCapacityReport(null)
    setProductionReport(null)
    const request =
      reportType === 'orders'
        ? window.yumi.reports.orderProfit({
            fromDate,
            toDate,
            productionStatus,
            outstandingOnly
          })
        : reportType === 'workers'
          ? window.yumi.reports.workerSettlement({ fromDate, toDate })
          : reportType === 'capacity'
            ? window.yumi.reports.capacityRisk({ fromDate, toDate })
            : window.yumi.reports.monthlyProductionWeight({ month })
    void request
      .then((data) => {
        if (!active) return
        if (reportType === 'orders') setReport(data as OrderProfitReport)
        else if (reportType === 'workers') setWorkerReport(data as WorkerSettlementReport)
        else if (reportType === 'capacity') setCapacityReport(data as CapacityRiskReport)
        else setProductionReport(data as MonthlyProductionWeightReport)
      })
      .catch((reason: unknown) => {
        if (active) setError(getErrorMessage(reason, '报表读取失败，请重试。'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [fromDate, toDate, month, productionStatus, outstandingOnly, refreshKey, reportType])

  return (
    <>
      <div className="stat-grid">
        <Stat label="待收金额" value={money(dashboard.outstandingCents)} tone="warning" />
        <Stat label="排班风险记录" value={dashboard.riskShiftCount} tone="danger" />
        <Stat label="待补排任务" value={dashboard.rescheduleTaskCount} tone="danger" />
        <Stat label="7 天交期关注" value={dashboard.upcomingOrderCount} tone="warning" />
      </div>
      <div className="panel report-panel">
        <Flex justify="between" align="start" gap="4" wrap="wrap" mb="4">
          <div>
            <Heading size="4">
              {reportType === 'orders'
                ? '订单资金与利润'
                : reportType === 'workers'
                  ? '兼职人员结算'
                  : reportType === 'capacity'
                    ? '商品成本与产能'
                    : '月度完成制作重量'}
            </Heading>
            <Text size="2" color="gray">
              {reportType === 'orders'
                ? '按预计发货日期查看应收、成本与利润，成本取订单创建时的商品与系统成本快照。'
                : reportType === 'workers'
                  ? '按排班日期汇总实际工时、合格完成数量、时薪成本、按件提成与缺勤。'
                  : reportType === 'capacity'
                    ? '查看商品单位成本、日期计划产能，并识别未完成订单的交期风险。'
                    : '按已完成排班的实际完成数量和订单商品重量快照汇总；合格与不合格均计入实际完成。'}
            </Text>
          </div>
          <Flex gap="2" align="center">
            <div className="report-tabs" role="tablist" aria-label="报表类型">
              <button
                className={reportType === 'orders' ? 'report-tab active' : 'report-tab'}
                onClick={() => setReportType('orders')}
                role="tab"
                aria-selected={reportType === 'orders'}
                type="button"
              >
                订单利润
              </button>
              <button
                className={reportType === 'workers' ? 'report-tab active' : 'report-tab'}
                onClick={() => setReportType('workers')}
                role="tab"
                aria-selected={reportType === 'workers'}
                type="button"
              >
                人员结算
              </button>
              <button
                className={reportType === 'capacity' ? 'report-tab active' : 'report-tab'}
                onClick={() => setReportType('capacity')}
                role="tab"
                aria-selected={reportType === 'capacity'}
                type="button"
              >
                产能风险
              </button>
              <button
                className={reportType === 'production' ? 'report-tab active' : 'report-tab'}
                onClick={() => setReportType('production')}
                role="tab"
                aria-selected={reportType === 'production'}
                type="button"
              >
                月度制作
              </button>
            </div>
            <Button
              variant="soft"
              onClick={() => void exportCurrentReport()}
              disabled={loading || reportType === 'production'}
            >
              导出 XLSX
            </Button>
            <Button
              variant="soft"
              onClick={() => setRefreshKey((value) => value + 1)}
              disabled={loading}
            >
              {loading ? '读取中…' : '刷新报表'}
            </Button>
          </Flex>
        </Flex>
        <div className="report-filters" aria-label="报表筛选条件">
          {reportType === 'production' ? (
            <label>
              <Text as="span" size="1" color="gray">
                统计月份
              </Text>
              <input
                className="report-control"
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
              />
            </label>
          ) : (
            <>
              <label>
                <Text as="span" size="1" color="gray">
                  {reportType === 'orders' ? '发货日期从' : '日期从'}
                </Text>
                <input
                  className="report-control"
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                />
              </label>
              <label>
                <Text as="span" size="1" color="gray">
                  {reportType === 'orders' ? '发货日期至' : '日期至'}
                </Text>
                <input
                  className="report-control"
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                />
              </label>
              {reportType === 'orders' && (
                <label>
                  <Text as="span" size="1" color="gray">
                    制作状态
                  </Text>
                  <select
                    className="report-control"
                    value={productionStatus}
                    onChange={(event) =>
                      setProductionStatus(event.target.value as ProductionStatus | 'all')
                    }
                  >
                    <option value="all">全部状态</option>
                    {knownProductionStatuses.map((status) => (
                      <option key={status} value={status}>
                        {getProductionStatusPresentation(status).label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {reportType === 'orders' && (
                <label className="report-checkbox">
                  <input
                    type="checkbox"
                    checked={outstandingOnly}
                    onChange={(event) => setOutstandingOnly(event.target.checked)}
                  />
                  <Text size="2">只看待收订单</Text>
                </label>
              )}
            </>
          )}
        </div>
        {loading ? (
          <div className="state-message">
            <Text color="gray">正在生成报表…</Text>
          </div>
        ) : error ? (
          <div className="state-message error-state" role="alert">
            <Text color="red">{error}</Text>
            <Button variant="soft" onClick={() => setRefreshKey((value) => value + 1)}>
              重试
            </Button>
          </div>
        ) : reportType === 'production' ? (
          !productionReport ? null : (
            <div
              className="report-totals monthly-production-totals"
              aria-label="月度完成制作重量汇总"
            >
              <Stat label="实际完成" value={`${productionReport.completedQuantity} 个`} />
              <Stat label="合格数量" value={`${productionReport.qualifiedQuantity} 个`} />
              <Stat
                label="不合格数量"
                value={`${productionReport.unqualifiedQuantity} 个`}
                tone="warning"
              />
              <Stat label="完成重量" value={`${productionReport.totalWeightGrams} g`} />
              <Stat label="完成重量（kg）" value={`${productionReport.totalWeightKilograms} kg`} />
            </div>
          )
        ) : reportType === 'orders' ? (
          !report || report.rows.length === 0 ? (
            <div className="state-message" role="status">
              <Text color="gray">当前筛选条件下没有订单。</Text>
            </div>
          ) : (
            <>
              <div className="report-totals" aria-label="报表汇总">
                <Stat label="订单数" value={report.totals.orderCount} />
                <Stat label="应收" value={money(report.totals.receivableCents)} />
                <Stat label="已收净额" value={money(report.totals.receivedNetCents)} />
                <Stat label="待收" value={money(report.totals.outstandingCents)} tone="warning" />
                <Stat label="预计利润" value={money(report.totals.estimatedProfitCents)} />
                <Stat label="实际利润" value={money(report.totals.actualProfitCents)} />
              </div>
              <div className="report-table-wrap">
                <Table.Root variant="surface" className="report-table">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell>订单</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>客户</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>预计发货</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>制作状态</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>财务状态</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>应收</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>已收净额</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>待收</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>预计成本</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>实际成本</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>预计利润</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>实际利润</Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {report.rows.map((row) => (
                      <Table.Row key={row.id}>
                        <Table.Cell>
                          <Text weight="medium">{row.code}</Text>
                        </Table.Cell>
                        <Table.Cell>{row.customerName}</Table.Cell>
                        <Table.Cell>{row.expectedShipDate}</Table.Cell>
                        <Table.Cell>
                          <Badge
                            color={getProductionStatusPresentation(row.productionStatus).color}
                            variant="soft"
                          >
                            {getProductionStatusPresentation(row.productionStatus).label}
                          </Badge>
                        </Table.Cell>
                        <Table.Cell>
                          <Badge
                            color={getFinancialStatusPresentation(row.financialStatus).color}
                            variant="soft"
                          >
                            {getFinancialStatusPresentation(row.financialStatus).label}
                          </Badge>
                        </Table.Cell>
                        <Table.Cell>{money(row.receivableCents)}</Table.Cell>
                        <Table.Cell>{money(row.receivedNetCents)}</Table.Cell>
                        <Table.Cell>{money(row.outstandingCents)}</Table.Cell>
                        <Table.Cell>{money(row.estimatedCostCents)}</Table.Cell>
                        <Table.Cell>{money(row.actualCostCents)}</Table.Cell>
                        <Table.Cell>{money(row.estimatedProfitCents)}</Table.Cell>
                        <Table.Cell>{money(row.actualProfitCents)}</Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </div>
            </>
          )
        ) : reportType === 'workers' ? (
          !workerReport || workerReport.rows.length === 0 ? (
            <div className="state-message" role="status">
              <Text color="gray">当前日期范围内没有人员结算记录。</Text>
            </div>
          ) : (
            <>
              <div className="report-totals" aria-label="人员结算汇总">
                <Stat label="人员数" value={workerReport.totals.workerCount} />
                <Stat label="实际工时" value={`${workerReport.totals.actualMinutes} 分钟`} />
                <Stat label="合格完成" value={`${workerReport.totals.qualifiedQuantity} 个`} />
                <Stat label="时薪成本" value={money(workerReport.totals.laborCostCents)} />
                <Stat label="按件提成" value={money(workerReport.totals.commissionCostCents)} />
                <Stat label="缺勤次数" value={workerReport.totals.absenceCount} tone="warning" />
              </div>
              <div className="report-table-wrap">
                <Table.Root variant="surface" className="report-table worker-report-table">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell>兼职人员</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>实际工时</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>合格完成</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>时薪成本</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>按件提成</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>缺勤次数</Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {workerReport.rows.map((row) => (
                      <Table.Row key={row.workerId}>
                        <Table.Cell>
                          <Text weight="medium">{row.workerName}</Text>
                        </Table.Cell>
                        <Table.Cell>{row.actualMinutes} 分钟</Table.Cell>
                        <Table.Cell>{row.qualifiedQuantity} 个</Table.Cell>
                        <Table.Cell>{money(row.laborCostCents)}</Table.Cell>
                        <Table.Cell>{money(row.commissionCostCents)}</Table.Cell>
                        <Table.Cell>{row.absenceCount}</Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </div>
            </>
          )
        ) : !capacityReport ||
          (capacityReport.products.length === 0 &&
            capacityReport.daily.length === 0 &&
            capacityReport.risks.length === 0) ? (
          <div className="state-message" role="status">
            <Text color="gray">当前日期范围内没有产能或风险记录。</Text>
          </div>
        ) : (
          <>
            <div className="report-section-title">
              <Heading size="3">商品成本与期间产量</Heading>
            </div>
            <div className="report-table-wrap">
              <Table.Root variant="surface" className="report-table">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>商品</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>预计单位成本</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>日产能</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>计划数量</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>合格完成</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {capacityReport.products.map((row) => (
                    <Table.Row key={row.productId}>
                      <Table.Cell>
                        <Text weight="medium">{row.productName}</Text>
                      </Table.Cell>
                      <Table.Cell>{money(row.estimatedCostPerUnitCents)}</Table.Cell>
                      <Table.Cell>{row.dailyCapacity} 个/天</Table.Cell>
                      <Table.Cell>{row.plannedQuantity} 个</Table.Cell>
                      <Table.Cell>{row.qualifiedQuantity} 个</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </div>
            <div className="report-section-title">
              <Heading size="3">每日计划与模具产能</Heading>
            </div>
            <div className="report-table-wrap">
              <Table.Root variant="surface" className="report-table">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>日期</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>商品</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>计划</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>合格完成</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>日产能</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>待补排</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {capacityReport.daily.map((row) => (
                    <Table.Row key={`${row.date}-${row.productId}`}>
                      <Table.Cell>{row.date}</Table.Cell>
                      <Table.Cell>{row.productName}</Table.Cell>
                      <Table.Cell>{row.plannedQuantity} 个</Table.Cell>
                      <Table.Cell>{row.qualifiedQuantity} 个</Table.Cell>
                      <Table.Cell>{row.dailyCapacity} 个</Table.Cell>
                      <Table.Cell>{row.pendingScheduleQuantity} 个</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </div>
            <div className="report-section-title">
              <Heading size="3">未完成订单交期风险</Heading>
            </div>
            {capacityReport.risks.length === 0 ? (
              <Text size="2" color="gray">
                当前日期范围内没有识别到交期风险。
              </Text>
            ) : (
              <div className="report-table-wrap">
                <Table.Root variant="surface" className="report-table">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell>订单</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>客户</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>预计发货</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>剩余数量</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>风险原因</Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {capacityReport.risks.map((row) => (
                      <Table.Row key={row.orderId}>
                        <Table.Cell>
                          <Text weight="medium">{row.orderCode}</Text>
                        </Table.Cell>
                        <Table.Cell>{row.customerName}</Table.Cell>
                        <Table.Cell>{row.expectedShipDate}</Table.Cell>
                        <Table.Cell>{row.remainingQuantity} 个</Table.Cell>
                        <Table.Cell>
                          <div className="risk-tags">
                            {row.riskReasons.map((reason) => (
                              <Badge key={reason} color="red" variant="soft">
                                {reason}
                              </Badge>
                            ))}
                          </div>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}

function SettingsWorkspace({ onDataChanged }: { onDataChanged(): Promise<void> }) {
  const [activity, setActivity] = useState<LocalDataActivity | null>(null)
  const [backups, setBackups] = useState<BackupSummary[]>([])
  const [audits, setAudits] = useState<AuditLogSummary[]>([])
  const [costSettings, setCostSettings] = useState<CostSettings | null>(null)
  const [selectedRestore, setSelectedRestore] = useState<BackupSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [savingCostSettings, setSavingCostSettings] = useState(false)
  const [loadingDemo, setLoadingDemo] = useState(false)
  const [error, setError] = useState('')

  const reload = async () => {
    setLoading(true)
    setError('')
    try {
      const [activityData, backupData, auditData, costSettingsData] = await Promise.all([
        window.yumi.backup.activity(),
        window.yumi.backup.list(),
        window.yumi.settings.listAuditLogs(),
        window.yumi.settings.getCost()
      ])
      setActivity(activityData)
      setBackups(backupData)
      setAudits(auditData.slice(0, 12))
      setCostSettings(costSettingsData)
    } catch (reason) {
      setError(getErrorMessage(reason, '设置与备份数据读取失败，请重试。'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const createBackup = async () => {
    setCreatingBackup(true)
    setError('')
    try {
      await window.yumi.backup.create()
      await reload()
    } catch (reason) {
      setError(getErrorMessage(reason, '创建备份失败，请稍后重试。'))
    } finally {
      setCreatingBackup(false)
    }
  }

  const patchCostSettings = (patch: Partial<CostSettings>) => {
    setCostSettings((current) => (current ? { ...current, ...patch } : current))
  }

  const saveCostSettings = async () => {
    if (!costSettings) return
    setSavingCostSettings(true)
    setError('')
    try {
      await window.yumi.settings.updateCost({
        gluePriceMilliYuanPerGram: costSettings.gluePriceMilliYuanPerGram,
        defaultHourlyWageCents: costSettings.defaultHourlyWageCents,
        effectiveFrom: costSettings.effectiveFrom || format(new Date(), 'yyyy-MM-dd')
      })
      await Promise.all([reload(), onDataChanged()])
    } catch (reason) {
      setError(getErrorMessage(reason, '系统成本设置保存失败，请重试。'))
    } finally {
      setSavingCostSettings(false)
    }
  }

  const loadDemoData = async () => {
    setLoadingDemo(true)
    setError('')
    try {
      await window.yumi.demo.load()
      await Promise.all([reload(), onDataChanged()])
    } catch (reason) {
      setError(getErrorMessage(reason, '演示数据加载失败，请稍后重试。'))
    } finally {
      setLoadingDemo(false)
    }
  }

  const chooseRestoreSource = async () => {
    setError('')
    try {
      const backup = await window.yumi.backup.chooseRestoreSource()
      if (backup) setSelectedRestore(backup)
    } catch (reason) {
      setError(getErrorMessage(reason, '所选备份无法使用。'))
    }
  }

  const restore = async () => {
    if (!selectedRestore) return
    setError('')
    try {
      await window.yumi.backup.restore({ backupPath: selectedRestore.backupPath, confirmed: true })
    } catch (reason) {
      setSelectedRestore(null)
      setError(getErrorMessage(reason, '恢复未完成，当前数据未被覆盖。'))
    }
  }

  const formatTime = (value: string) => format(parseISO(value), 'yyyy-MM-dd HH:mm')
  const operationLabels: Record<string, string> = {
    'backup.restored': '恢复本地备份',
    'payment.recorded': '登记收退款',
    'schedule.risk_confirmed': '确认排班风险',
    'shift.status_updated': '更新排班状态'
  }

  return (
    <div className="settings-workspace">
      <section className="settings-hero">
        <div className="settings-title">
          <ArchiveRestore size={21} />
          <div>
            <Heading size="4">本地数据与备份</Heading>
            <Text size="2" color="gray">
              数据仅保存在这台电脑。备份包含 SQLite 数据库、附件及版本校验信息。
            </Text>
          </div>
        </div>
        <Badge color="green" variant="soft">
          SQLite 本地存储
        </Badge>
      </section>

      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}

      <section className="settings-section">
        <Flex align="center" justify="between" mb="3" gap="3" wrap="wrap">
          <div>
            <Text weight="medium">系统成本设置</Text>
            <Text as="div" size="1" color="gray">
              商品和订单预计成本包含材料、包装、默认兼职时薪和按件提成；实际制作仍按兼职人员个人时薪结算。
            </Text>
          </div>
          <Button
            disabled={loading || !costSettings || savingCostSettings}
            onClick={() => void saveCostSettings()}
            size="2"
          >
            {savingCostSettings ? '保存中…' : '保存成本设置'}
          </Button>
        </Flex>
        {loading || !costSettings ? (
          <Empty text="正在读取系统成本设置…" />
        ) : (
          <div className="field-grid three">
            <label>
              <Text as="div" size="2" mb="1">
                胶水单价（元/克）
              </Text>
              <NumericTextField
                allowDecimal
                min="0"
                onValueChange={(value) => {
                  const gluePriceMilliYuanPerGram = milliYuanFromDraft(value)
                  if (gluePriceMilliYuanPerGram !== null)
                    patchCostSettings({ gluePriceMilliYuanPerGram })
                }}
                step="0.001"
                value={costSettings.gluePriceMilliYuanPerGram / 1000}
              />
            </label>
            <label>
              <Text as="div" size="2" mb="1">
                默认兼职时薪（元/小时）
              </Text>
              <NumericTextField
                allowDecimal
                min="0"
                onValueChange={(value) => {
                  const defaultHourlyWageCents = centsFromDraft(value)
                  if (defaultHourlyWageCents !== null) patchCostSettings({ defaultHourlyWageCents })
                }}
                step="0.01"
                value={costSettings.defaultHourlyWageCents / 100}
              />
            </label>
            <label>
              <Text as="div" size="2" mb="1">
                生效日期
              </Text>
              <TextField.Root
                onChange={(event) => patchCostSettings({ effectiveFrom: event.target.value })}
                type="date"
                value={costSettings.effectiveFrom || format(new Date(), 'yyyy-MM-dd')}
              />
            </label>
          </div>
        )}
      </section>

      <section className="settings-grid">
        <div className="settings-section">
          <Flex align="center" justify="between" mb="3">
            <div>
              <Text weight="medium">备份与恢复</Text>
              <Text as="div" size="1" color="gray">
                恢复前会自动保护当前数据，恢复后应用将重启。
              </Text>
            </div>
            <Button size="2" onClick={() => void createBackup()} disabled={creatingBackup}>
              {creatingBackup ? '正在备份…' : '立即备份'}
            </Button>
          </Flex>
          {loading ? (
            <Empty text="正在读取本地备份状态…" />
          ) : (
            <>
              <div className="activity-line">
                <span>最近备份</span>
                <strong>
                  {activity?.lastBackup ? formatTime(activity.lastBackup.createdAt) : '尚未创建'}
                </strong>
              </div>
              <div className="activity-line">
                <span>最近恢复</span>
                <strong>
                  {activity?.lastRestore ? formatTime(activity.lastRestore.restoredAt) : '暂无'}
                </strong>
              </div>
              <Button variant="soft" color="gray" onClick={() => void chooseRestoreSource()}>
                选择备份并恢复
              </Button>
              <div className="backup-list">
                {backups.slice(0, 5).map((backup) => (
                  <button
                    className="backup-row"
                    key={backup.id}
                    onClick={() => setSelectedRestore(backup)}
                    type="button"
                  >
                    <span>{formatTime(backup.createdAt)}</span>
                    <span>{backup.attachmentCount} 个附件</span>
                    <Badge
                      color={backup.reason === 'pre_restore' ? 'amber' : 'gray'}
                      variant="soft"
                    >
                      {backup.reason === 'pre_restore' ? '恢复前保护' : '手动备份'}
                    </Badge>
                  </button>
                ))}
                {!backups.length && <Empty text="尚无本地备份。" />}
              </div>
            </>
          )}
        </div>

        <div className="settings-section">
          <Text weight="medium">最近导出</Text>
          <Text as="div" size="1" color="gray" mt="1">
            导出仅生成业务报表，不会暴露数据库文件。
          </Text>
          <div className="export-status">
            {activity?.lastExport ? (
              <>
                <Badge color="blue" variant="soft">
                  {activity.lastExport.kind === 'orders'
                    ? '订单资金与利润'
                    : activity.lastExport.kind === 'workers'
                      ? '人员结算'
                      : '产能风险'}
                </Badge>
                <Text size="2">{formatTime(activity.lastExport.exportedAt)}</Text>
                <Text className="path-text" size="1" color="gray">
                  {activity.lastExport.savedPath}
                </Text>
              </>
            ) : (
              <Empty text="尚未导出业务报表。" />
            )}
          </div>
        </div>
      </section>

      <section className="settings-section demo-data-section">
        <div>
          <Text weight="medium">演示数据</Text>
          <Text as="div" size="1" color="gray" mt="1">
            在空白数据库中加载 2 个商品、2 笔订单、分次收退款、模具超载、缺勤待补排和实际制作记录。
          </Text>
        </div>
        <Button
          color="amber"
          variant="soft"
          onClick={() => void loadDemoData()}
          disabled={loadingDemo || loading}
        >
          {loadingDemo ? '正在加载…' : '加载演示数据'}
        </Button>
      </section>

      <section className="settings-section audit-section">
        <Flex align="center" justify="between" mb="3">
          <div>
            <Text weight="medium">关键操作审计</Text>
            <Text as="div" size="1" color="gray">
              展示收退款、排班风险、缺勤与数据恢复等关键变更。
            </Text>
          </div>
          <Button size="1" variant="soft" color="gray" onClick={() => void reload()}>
            刷新
          </Button>
        </Flex>
        {loading ? (
          <Empty text="正在读取审计记录…" />
        ) : audits.length ? (
          <Table.Root className="audit-table" size="1" variant="surface">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>时间</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>操作</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>对象</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>操作者</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {audits.map((audit) => (
                <Table.Row key={audit.id}>
                  <Table.Cell>{formatTime(audit.createdAt)}</Table.Cell>
                  <Table.Cell>{operationLabels[audit.action] ?? audit.action}</Table.Cell>
                  <Table.Cell>{audit.entityType}</Table.Cell>
                  <Table.Cell>{audit.actorName}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        ) : (
          <Empty text="暂无关键操作记录。" />
        )}
      </section>

      <Dialog.Root
        open={Boolean(selectedRestore)}
        onOpenChange={(open) => !open && setSelectedRestore(null)}
      >
        <Dialog.Content maxWidth="440px">
          <Dialog.Title>确认恢复备份</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            将恢复 {selectedRestore ? formatTime(selectedRestore.createdAt) : ''}{' '}
            的备份，并覆盖当前数据和附件。
            系统会先自动创建当前数据的保护备份，恢复成功后自动重启应用。
          </Dialog.Description>
          <Flex gap="3" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                取消
              </Button>
            </Dialog.Close>
            <Button color="red" onClick={() => void restore()}>
              确认并继续
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  )
}
function Empty({ text }: { text: string }) {
  return (
    <div aria-live="polite" className="empty" role="status">
      <Text color="gray">{text}</Text>
    </div>
  )
}
function ProductDialog({
  open,
  onOpenChange,
  onDone
}: {
  open: boolean
  onOpenChange(value: boolean): void
  onDone(): Promise<void>
}) {
  const emptyForm = () => ({
    name: '',
    code: '',
    category: '',
    basePrice: '',
    edgePrice: '0',
    weight: '0',
    lossRate: '0',
    standardMinutes: '0',
    packagingCost: '0',
    accessoryCost: '0',
    replacementBagCost: '0',
    fluffPackingCost: '0',
    edgeCost: '0',
    commission: '0',
    moldCount: '1',
    outputPerMoldPerBatch: '1',
    maxBatchesPerDay: '1',
    notes: ''
  })
  const [form, setForm] = useState(emptyForm)
  const [preview, setPreview] = useState<ProductCostPreview | null>(null)
  const [saving, setSaving] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [error, setError] = useState('')

  const patchForm = (patch: Partial<typeof form>) => {
    setForm((current) => ({ ...current, ...patch }))
    setPreview(null)
  }

  const buildInput = (): ProductCreateInput => {
    const numberValue = (
      value: string,
      label: string,
      options?: { integer?: boolean; positive?: boolean }
    ) => {
      const parsed = Number(value || 0)
      if (
        !Number.isFinite(parsed) ||
        parsed < 0 ||
        (options?.integer && !Number.isInteger(parsed))
      ) {
        throw new Error(`${label}必须是非负${options?.integer ? '整数' : '数值'}。`)
      }
      if (options?.positive && parsed <= 0) throw new Error(`${label}必须大于 0。`)
      return parsed
    }
    if (!form.name.trim()) throw new Error('商品名称不能为空。')
    const cents = (value: string, label: string) => Math.round(numberValue(value, label) * 100)
    const lossRate = numberValue(form.lossRate, '损耗率')
    if (lossRate >= 100) throw new Error('损耗率必须小于 100%。')
    return {
      name: form.name.trim(),
      code: form.code.trim() || null,
      category: form.category.trim() || null,
      basePriceCents: cents(form.basePrice, '基础售价'),
      edgePriceCents: cents(form.edgePrice, '缝边收费'),
      weightGrams: numberValue(form.weight, '单件重量'),
      lossRate: lossRate / 100,
      standardMinutesPerUnit: numberValue(form.standardMinutes, '标准制作时长'),
      packagingCostCents: cents(form.packagingCost, '包装成本'),
      accessoryCostCents: cents(form.accessoryCost, '配件费'),
      replacementBagCostCents: cents(form.replacementBagCost, '替换袋费用'),
      fluffPackingCostCents: cents(form.fluffPackingCost, '捏毛装袋费用'),
      edgeCostCents: cents(form.edgeCost, '缝边成本'),
      commissionCentsPerUnit: cents(form.commission, '固定提成'),
      moldCount: numberValue(form.moldCount, '模具数量', { integer: true, positive: true }),
      outputPerMoldPerBatch: numberValue(form.outputPerMoldPerBatch, '每模每批产出', {
        integer: true,
        positive: true
      }),
      maxBatchesPerDay: numberValue(form.maxBatchesPerDay, '每日批次数', {
        integer: true,
        positive: true
      }),
      notes: form.notes.trim() || null
    }
  }

  const previewCost = async () => {
    setCalculating(true)
    setError('')
    try {
      const input = buildInput()
      setPreview(
        await window.yumi.products.previewCost({
          ...input,
          quantity: 1,
          edgeEnabled: false,
          edgeQuantity: 0
        })
      )
    } catch (reason) {
      setError(getErrorMessage(reason, '成本预览失败。'))
    } finally {
      setCalculating(false)
    }
  }

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      await window.yumi.products.create(buildInput())
      await onDone()
      onOpenChange(false)
      setForm(emptyForm())
      setPreview(null)
    } catch (reason) {
      setError(getErrorMessage(reason, '商品保存失败。'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="920px" className="wide-dialog">
        <Dialog.Title>新建商品</Dialog.Title>
        <Dialog.Description size="2" mb="4">
          在同一张表单完成商品资料、制作参数和费用设置；所有费用为空时按 0 处理。
        </Dialog.Description>
        <div className="inspector-content">
          <section className="form-section">
            <Text weight="medium">商品基础资料</Text>
            <div className="field-grid three">
              <label>
                <Text as="div" size="2" mb="1">
                  商品名称
                </Text>
                <TextField.Root
                  value={form.name}
                  onChange={(event) => patchForm({ name: event.target.value })}
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  商品编码
                </Text>
                <TextField.Root
                  value={form.code}
                  onChange={(event) => patchForm({ code: event.target.value })}
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  分类
                </Text>
                <TextField.Root
                  value={form.category}
                  onChange={(event) => patchForm({ category: event.target.value })}
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  基础售价（元/个）
                </Text>
                <NumericTextField
                  allowDecimal
                  min="0"
                  step="0.01"
                  value={form.basePrice}
                  onValueChange={(value) => patchForm({ basePrice: value })}
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  缝边收费（元/个）
                </Text>
                <NumericTextField
                  allowDecimal
                  min="0"
                  step="0.01"
                  value={form.edgePrice}
                  onValueChange={(value) => patchForm({ edgePrice: value })}
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  单件重量（克）
                </Text>
                <NumericTextField
                  allowDecimal
                  min="0"
                  step="0.01"
                  value={form.weight}
                  onValueChange={(value) => patchForm({ weight: value })}
                />
              </label>
            </div>
          </section>
          <section className="form-section">
            <Text weight="medium">制作参数与费用</Text>
            <div className="field-grid three">
              <label>
                <Text as="div" size="2" mb="1">
                  标准制作时长（分钟/个）
                </Text>
                <NumericTextField
                  allowDecimal
                  min="0"
                  step="0.01"
                  value={form.standardMinutes}
                  onValueChange={(value) => patchForm({ standardMinutes: value })}
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  损耗率（%）
                </Text>
                <NumericTextField
                  allowDecimal
                  min="0"
                  max="99.99"
                  step="0.01"
                  value={form.lossRate}
                  onValueChange={(value) => patchForm({ lossRate: value })}
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  包装成本（元/个）
                </Text>
                <NumericTextField
                  allowDecimal
                  min="0"
                  step="0.01"
                  value={form.packagingCost}
                  onValueChange={(value) => patchForm({ packagingCost: value })}
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  配件费（元/个）
                </Text>
                <NumericTextField
                  allowDecimal
                  min="0"
                  step="0.01"
                  value={form.accessoryCost}
                  onValueChange={(value) => patchForm({ accessoryCost: value })}
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  替换袋费用（元/个）
                </Text>
                <NumericTextField
                  allowDecimal
                  min="0"
                  step="0.01"
                  value={form.replacementBagCost}
                  onValueChange={(value) => patchForm({ replacementBagCost: value })}
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  捏毛装袋（元/个）
                </Text>
                <NumericTextField
                  allowDecimal
                  min="0"
                  step="0.01"
                  value={form.fluffPackingCost}
                  onValueChange={(value) => patchForm({ fluffPackingCost: value })}
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  缝边成本（元/个）
                </Text>
                <NumericTextField
                  allowDecimal
                  min="0"
                  step="0.01"
                  value={form.edgeCost}
                  onValueChange={(value) => patchForm({ edgeCost: value })}
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  固定提成（元/合格个）
                </Text>
                <NumericTextField
                  allowDecimal
                  min="0"
                  step="0.01"
                  value={form.commission}
                  onValueChange={(value) => patchForm({ commission: value })}
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  模具数量
                </Text>
                <NumericTextField
                  min="1"
                  step="1"
                  value={form.moldCount}
                  onValueChange={(value) => patchForm({ moldCount: value })}
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  每模每批产出
                </Text>
                <NumericTextField
                  min="1"
                  step="1"
                  value={form.outputPerMoldPerBatch}
                  onValueChange={(value) => patchForm({ outputPerMoldPerBatch: value })}
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  每日批次数
                </Text>
                <NumericTextField
                  min="1"
                  step="1"
                  value={form.maxBatchesPerDay}
                  onValueChange={(value) => patchForm({ maxBatchesPerDay: value })}
                />
              </label>
            </div>
            <label className="notes-field">
              <Text as="div" size="2" mb="1">
                备注
              </Text>
              <textarea
                value={form.notes}
                onChange={(event) => patchForm({ notes: event.target.value })}
              />
            </label>
          </section>
          <section className="form-section cost-preview-panel">
            <Flex align="center" justify="between">
              <div>
                <Text weight="medium">单件成本预览</Text>
                <Text as="div" size="1" color="gray">
                  按当前填写的数据计算；人工成本按全局默认兼职时薪计算。
                </Text>
              </div>
              <Button
                size="1"
                variant="soft"
                disabled={calculating}
                onClick={() => void previewCost()}
              >
                {calculating ? '计算中…' : '预览单件成本'}
              </Button>
            </Flex>
            {preview && (
              <div className="cost-preview-grid">
                <div>
                  <Text as="div" size="1" color="gray">
                    包装成本
                  </Text>
                  <Text weight="medium">{money(preview.packagingCostCents)}</Text>
                </div>
                <div>
                  <Text as="div" size="1" color="gray">
                    配件费
                  </Text>
                  <Text weight="medium">{money(preview.accessoryCostCents)}</Text>
                </div>
                <div>
                  <Text as="div" size="1" color="gray">
                    替换袋费用
                  </Text>
                  <Text weight="medium">{money(preview.replacementBagCostCents)}</Text>
                </div>
                <div>
                  <Text as="div" size="1" color="gray">
                    默认兼职时薪
                  </Text>
                  <Text weight="medium">{money(preview.appliedHourlyWageCents)}/小时</Text>
                </div>
                <div>
                  <Text as="div" size="1" color="gray">
                    预计直接成本
                  </Text>
                  <Text weight="medium">{money(preview.totalCostCents)}</Text>
                </div>
              </div>
            )}
          </section>
        </div>
        {error && (
          <Text as="div" color="red" size="2" mt="3">
            {error}
          </Text>
        )}
        <Flex gap="3" mt="5" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              取消
            </Button>
          </Dialog.Close>
          <Button disabled={saving} onClick={() => void submit()}>
            {saving ? '保存中…' : '保存商品资料'}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}

function WorkerDialog({
  open,
  onOpenChange,
  onDone
}: {
  open: boolean
  onOpenChange(value: boolean): void
  onDone(): Promise<void>
}) {
  const [name, setName] = useState('')
  const [wage, setWage] = useState('')
  useEffect(() => {
    if (!open) return
    void window.yumi.settings
      .getCost()
      .then((settings) => setWage(String(settings.defaultHourlyWageCents / 100)))
  }, [open])
  const submit = async () => {
    await window.yumi.workers.create({ name, hourlyWageCents: Math.round(Number(wage) * 100) || 0 })
    await onDone()
    onOpenChange(false)
    setName('')
    setWage('')
  }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="440px">
        <Dialog.Title>新增兼职人员</Dialog.Title>
        <Dialog.Description size="2" mb="4">
          时薪将作为实际制作工时成本的计算基础。
        </Dialog.Description>
        <Flex direction="column" gap="3">
          <label>
            <Text as="div" size="2" mb="1">
              姓名
            </Text>
            <TextField.Root
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：小 A"
            />
          </label>
          <label>
            <Text as="div" size="2" mb="1">
              时薪（元）
            </Text>
            <NumericTextField
              allowDecimal
              onValueChange={setWage}
              placeholder="0.00"
              value={wage}
            />
          </label>
        </Flex>
        <Flex gap="3" mt="5" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              取消
            </Button>
          </Dialog.Close>
          <Button disabled={!name} onClick={() => void submit()}>
            保存人员
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}

type OrderDraftLine = {
  id: string
  itemId?: string
  productId: string
  quantity: string
  unitPrice: string
  edgeEnabled: boolean
  edgeQuantity: string
  edgePrice: string
  discount: string
}

function createOrderDraftLine(product?: ProductSummary): OrderDraftLine {
  return {
    id: crypto.randomUUID(),
    productId: product?.id ?? '',
    quantity: '1',
    unitPrice: product ? String(product.basePriceCents / 100) : '',
    edgeEnabled: false,
    edgeQuantity: '1',
    edgePrice: product ? String(product.edgePriceCents / 100) : '',
    discount: '0'
  }
}

function OrderDialog({
  open,
  onOpenChange,
  products,
  order,
  onDone
}: {
  open: boolean
  onOpenChange(value: boolean): void
  products: ProductSummary[]
  order?: OrderDetail | null
  onDone(): Promise<void>
}) {
  const availableProducts = useMemo(
    () =>
      products.filter(
        (product) => product.enabled || order?.items.some((item) => item.productId === product.id)
      ),
    [products, order]
  )
  const [customers, setCustomers] = useState<CustomerProfile[]>([])
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [contact, setContact] = useState('')
  const [address, setAddress] = useState('')
  const [expectedShipDate, setExpectedShipDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [reserveDays, setReserveDays] = useState('2')
  const [orderDiscount, setOrderDiscount] = useState('0')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<OrderDraftLine[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    const load = async () => {
      const [customerData, defaults] = await Promise.all([
        window.yumi.customers.list(),
        window.yumi.settings.getOrderDefaults()
      ])
      setCustomers(customerData)
      if (order) {
        setCustomerId(order.customer.id)
        setCustomerName(order.customer.name)
        setContact(order.customer.contact ?? '')
        setAddress(order.customer.defaultAddress ?? '')
        setExpectedShipDate(order.expectedShipDate)
        setReserveDays(String(order.reserveDays))
        setOrderDiscount(String(order.discountCents / 100))
        setNotes(order.notes ?? '')
        setLines(
          order.items.map((item) => ({
            id: crypto.randomUUID(),
            itemId: item.id,
            productId: item.productId,
            quantity: String(item.quantity),
            unitPrice: String(item.unitPriceCents / 100),
            edgeEnabled: item.edgeEnabled,
            edgeQuantity: String(item.edgeQuantity),
            edgePrice: String(item.edgePriceCents / 100),
            discount: String(item.discountCents / 100)
          }))
        )
      } else {
        setCustomerId('')
        setCustomerName('')
        setContact('')
        setAddress('')
        setExpectedShipDate(format(new Date(), 'yyyy-MM-dd'))
        setReserveDays(String(defaults.defaultReserveDays))
        setOrderDiscount('0')
        setNotes('')
        setLines([createOrderDraftLine(availableProducts[0])])
      }
      setError('')
    }
    void load().catch(() => setError('无法读取客户或订单默认配置。'))
  }, [open, availableProducts, order])

  const totals = calculateDraftTotals(
    lines.map((line) => ({
      quantity: Number(line.quantity) || 0,
      unitPriceCents: Math.round((Number(line.unitPrice) || 0) * 100),
      edgeEnabled: line.edgeEnabled,
      edgeQuantity: Number(line.edgeQuantity) || 0,
      edgePriceCents: Math.round((Number(line.edgePrice) || 0) * 100),
      discountCents: Math.round((Number(line.discount) || 0) * 100)
    })),
    Math.round((Number(orderDiscount) || 0) * 100)
  )

  const reset = () => {
    setCustomerId('')
    setCustomerName('')
    setContact('')
    setAddress('')
    setExpectedShipDate(format(new Date(), 'yyyy-MM-dd'))
    setReserveDays('2')
    setOrderDiscount('0')
    setNotes('')
    setLines([createOrderDraftLine(availableProducts[0])])
    setError('')
  }

  const chooseCustomer = (value: string) => {
    setCustomerId(value)
    const customer = customers.find((item) => item.id === value)
    if (!customer) return
    setCustomerName(customer.name)
    setContact(customer.contact ?? '')
    setAddress(customer.defaultAddress ?? '')
  }

  const selectedCustomer = customers.find((item) => item.id === customerId)
  const copyCustomerAddress = () => {
    if (selectedCustomer?.defaultAddress) setAddress(selectedCustomer.defaultAddress)
  }

  const updateLine = (id: string, patch: Partial<OrderDraftLine>) => {
    setLines((current) =>
      current.map((line) => {
        if (line.id !== id) return line
        const next = { ...line, ...patch }
        return { ...next, edgeQuantity: next.edgeEnabled ? next.quantity : '0' }
      })
    )
  }

  const changeProduct = (lineId: string, productId: string) => {
    const product = availableProducts.find((item) => item.id === productId)
    updateLine(lineId, {
      productId,
      unitPrice: product ? String(product.basePriceCents / 100) : '',
      edgePrice: product ? String(product.edgePriceCents / 100) : ''
    })
  }

  const submit = async () => {
    if (!customerName.trim()) {
      setError('请填写客户名称或先选择已有客户。')
      return
    }
    if (!expectedShipDate) {
      setError('请填写预计发货日期。')
      return
    }
    if (lines.length === 0 || lines.some((line) => !line.productId || Number(line.quantity) <= 0)) {
      setError('请至少保留一项数量大于 0 的商品。')
      return
    }
    setSaving(true)
    setError('')
    const input: OrderCreateInput = {
      customer: {
        id: customerId || undefined,
        name: customerName.trim(),
        contact: contact.trim() || null,
        defaultAddress: address.trim() || null
      },
      expectedShipDate,
      reserveDays: Number(reserveDays),
      discountCents: Math.round((Number(orderDiscount) || 0) * 100),
      notes: notes.trim() || null,
      items: lines.map((line) => ({
        id: line.itemId,
        productId: line.productId,
        quantity: Number(line.quantity),
        unitPriceCents: Math.round((Number(line.unitPrice) || 0) * 100),
        edgeEnabled: line.edgeEnabled,
        edgeQuantity: line.edgeEnabled ? Number(line.quantity) : 0,
        edgePriceCents: Math.round((Number(line.edgePrice) || 0) * 100),
        discountCents: Math.round((Number(line.discount) || 0) * 100)
      }))
    }
    try {
      if (order) {
        await window.yumi.orders.update({ ...input, id: order.id } satisfies OrderUpdateInput)
      } else {
        await window.yumi.orders.create(input)
      }
      await onDone()
      reset()
      onOpenChange(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '订单保存失败，请检查输入。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) reset()
        onOpenChange(value)
      }}
    >
      <Dialog.Content maxWidth="920px" className="wide-dialog">
        <Dialog.Title>{order ? `编辑订单 ${order.code}` : '新建订单'}</Dialog.Title>
        <Dialog.Description size="2" mb="4">
          一个订单可录入多个商品；缝边费用、明细改价和订单优惠均会保存为订单快照。
        </Dialog.Description>
        <div className="order-form">
          <section className="form-section customer-section">
            <div className="section-title">
              <Text weight="medium">客户与交期</Text>
              <Text size="1" color="gray">
                可以直接选择已有客户，也可快速建立新客户。
              </Text>
            </div>
            <div className="field-grid three">
              <label>
                <Text as="div" size="2" mb="1">
                  已有客户
                </Text>
                <select
                  className="desktop-select"
                  value={customerId}
                  onChange={(event) => chooseCustomer(event.target.value)}
                >
                  <option value="">新建客户</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                      {customer.contact ? ` · ${customer.contact}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  客户名称
                </Text>
                <TextField.Root
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="昵称或姓名"
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  联系方式
                </Text>
                <TextField.Root
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                  placeholder="微信 / 手机号"
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  预计发货
                </Text>
                <TextField.Root
                  type="date"
                  value={expectedShipDate}
                  onChange={(event) => setExpectedShipDate(event.target.value)}
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1">
                  预留时间（天）
                </Text>
                <NumericTextField
                  min="0"
                  value={reserveDays}
                  onValueChange={(value) => setReserveDays(value)}
                />
              </label>
              <label className="span-two">
                <Flex align="center" justify="between" mb="1">
                  <Text size="2">收货地址</Text>
                  {selectedCustomer?.defaultAddress && (
                    <Button size="1" variant="ghost" type="button" onClick={copyCustomerAddress}>
                      复制客户收货地址
                    </Button>
                  )}
                </Flex>
                <TextField.Root
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="可选"
                />
              </label>
            </div>
          </section>
          <section className="form-section">
            <Flex justify="between" align="center" mb="3">
              <div>
                <Text weight="medium">商品明细</Text>
                <Text as="div" size="1" color="gray">
                  订单保存后将固化当时的售价、缝边和成本参数。
                </Text>
              </div>
              <Button
                size="1"
                variant="soft"
                disabled={availableProducts.length === 0}
                onClick={() =>
                  setLines((current) => [...current, createOrderDraftLine(availableProducts[0])])
                }
              >
                <Plus size={14} /> 添加商品
              </Button>
            </Flex>
            {availableProducts.length === 0 ? (
              <Empty text="没有启用中的商品。请先在商品工作区创建并启用商品。" />
            ) : (
              <div className="order-lines">
                {lines.map((line, index) => (
                  <div className="order-line" key={line.id}>
                    <span className="line-index">{String(index + 1).padStart(2, '0')}</span>
                    <select
                      className="desktop-select product-choice"
                      value={line.productId}
                      onChange={(event) => changeProduct(line.id, event.target.value)}
                    >
                      {availableProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                    <label>
                      <Text as="div" size="1" color="gray">
                        数量
                      </Text>
                      <NumericTextField
                        min="1"
                        value={line.quantity}
                        onValueChange={(value) => updateLine(line.id, { quantity: value })}
                      />
                    </label>
                    <label>
                      <Text as="div" size="1" color="gray">
                        成交单价
                      </Text>
                      <NumericTextField
                        allowDecimal
                        min="0"
                        step="0.01"
                        value={line.unitPrice}
                        onValueChange={(value) => updateLine(line.id, { unitPrice: value })}
                      />
                    </label>
                    <label className="edge-toggle">
                      <Text as="div" size="1" color="gray">
                        缝边
                      </Text>
                      <input
                        type="checkbox"
                        checked={line.edgeEnabled}
                        onChange={(event) =>
                          updateLine(line.id, { edgeEnabled: event.target.checked })
                        }
                      />
                    </label>
                    <label>
                      <Text as="div" size="1" color="gray">
                        缝边数量
                      </Text>
                      <TextField.Root readOnly value={line.edgeEnabled ? line.quantity : '0'} />
                    </label>
                    <label>
                      <Text as="div" size="1" color="gray">
                        缝边单价
                      </Text>
                      <NumericTextField
                        allowDecimal
                        min="0"
                        step="0.01"
                        disabled={!line.edgeEnabled}
                        value={line.edgePrice}
                        onValueChange={(value) => updateLine(line.id, { edgePrice: value })}
                      />
                    </label>
                    <label>
                      <Text as="div" size="1" color="gray">
                        明细优惠
                      </Text>
                      <NumericTextField
                        allowDecimal
                        min="0"
                        step="0.01"
                        value={line.discount}
                        onValueChange={(value) => updateLine(line.id, { discount: value })}
                      />
                    </label>
                    <Button
                      size="1"
                      color="gray"
                      variant="ghost"
                      disabled={lines.length === 1}
                      onClick={() =>
                        setLines((current) => current.filter((item) => item.id !== line.id))
                      }
                    >
                      删除
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="order-summary-bar">
            <label>
              <Text as="div" size="2" mb="1">
                订单优惠（元）
              </Text>
              <NumericTextField
                allowDecimal
                min="0"
                step="0.01"
                value={orderDiscount}
                onValueChange={(value) => setOrderDiscount(value)}
              />
            </label>
            <div className="draft-amounts">
              <Text size="1" color="gray">
                商品及缝边 {money(totals.itemSubtotalCents)} · 明细优惠{' '}
                {money(totals.itemDiscountCents)}
              </Text>
              <Text weight="medium">应收 {money(totals.receivableCents)}</Text>
            </div>
          </section>
          <label>
            <Text as="div" size="2" mb="1">
              订单备注
            </Text>
            <TextField.Root
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="可选，例如颜色、附加要求或交付说明"
            />
          </label>
        </div>
        {error && (
          <Text as="div" size="2" color="red" mt="4">
            {error}
          </Text>
        )}
        <Flex gap="3" mt="5" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              取消
            </Button>
          </Dialog.Close>
          <Button disabled={saving || availableProducts.length === 0} onClick={() => void submit()}>
            {saving ? '正在保存…' : order ? '保存订单修改' : '保存订单'}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}

function OrderDetailWorkspace({
  orderId,
  products,
  onBack,
  onInspectShift,
  onChanged
}: {
  orderId: string
  products: ProductSummary[]
  onBack(): void
  onInspectShift(shiftId: string): void
  onChanged(): Promise<void>
}) {
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [paymentType, setPaymentType] = useState<'receipt' | 'refund'>('receipt')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('微信')
  const [paymentDate, setPaymentDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [paymentNote, setPaymentNote] = useState('')
  const [receiptAttachment, setReceiptAttachment] = useState<AttachmentSummary | null>(null)
  const [selectingReceipt, setSelectingReceipt] = useState(false)
  const [savingPayment, setSavingPayment] = useState(false)
  const [editing, setEditing] = useState(false)
  const [costDialogOpen, setCostDialogOpen] = useState(false)
  const [costDetail, setCostDetail] = useState<OrderCostDetail | null>(null)
  const [shipmentSummary, setShipmentSummary] = useState<OrderShipmentSummary[]>([])
  const [shipments, setShipments] = useState<ShipmentDetail[]>([])
  const [shipmentDate, setShipmentDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [shipmentNotes, setShipmentNotes] = useState('')
  const [shipmentQuantities, setShipmentQuantities] = useState<Record<string, string>>({})
  const [shipmentDialogOpen, setShipmentDialogOpen] = useState(false)
  const [savingShipment, setSavingShipment] = useState(false)
  const [exportingOrderSheet, setExportingOrderSheet] = useState(false)
  const [exportingShipmentManifestId, setExportingShipmentManifestId] = useState<string | null>(
    null
  )

  useEffect(() => {
    if (!orderId) {
      setOrder(null)
      return
    }
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [detail, summary, records] = await Promise.all([
          window.yumi.orders.get(orderId),
          window.yumi.orders.shipmentSummary(orderId),
          window.yumi.orders.listShipments(orderId)
        ])
        if (!detail) setError('订单不存在或已被删除。')
        setOrder(detail)
        setShipmentSummary(summary)
        setShipments(records)
        setShipmentDialogOpen(false)
        setShipmentQuantities({})
        setShipmentNotes('')
        setShipmentDate(format(new Date(), 'yyyy-MM-dd'))
      } catch (reason) {
        setError(getErrorMessage(reason, '订单详情读取失败。'))
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [orderId])

  const clearPendingReceipt = async () => {
    if (!receiptAttachment) return
    await window.yumi.attachments.delete(receiptAttachment.id)
    setReceiptAttachment(null)
  }

  const chooseReceipt = async () => {
    setSelectingReceipt(true)
    setError('')
    try {
      await clearPendingReceipt()
      const attachment = await window.yumi.attachments.chooseAndImport('payment_receipt')
      if (attachment) setReceiptAttachment(attachment)
    } catch (reason) {
      setError(getErrorMessage(reason, '收款凭证选择失败。'))
    } finally {
      setSelectingReceipt(false)
    }
  }

  const recordPayment = async () => {
    if (!order || Number(paymentAmount) <= 0) {
      setError('请输入大于 0 的金额。')
      return
    }
    setSavingPayment(true)
    setError('')
    try {
      const nextOrder = await window.yumi.orders.recordPayment({
        orderId: order.id,
        type: paymentType,
        amountCents: Math.round(Number(paymentAmount) * 100),
        paymentMethod: paymentMethod.trim() || '未填写',
        paidAt: paymentDate,
        note: paymentNote.trim() || null,
        receiptAttachmentId: receiptAttachment?.id ?? null
      })
      setOrder(nextOrder)
      setPaymentAmount('')
      setPaymentNote('')
      setReceiptAttachment(null)
      await onChanged()
    } catch (reason) {
      setError(getErrorMessage(reason, '收退款记录保存失败。'))
    } finally {
      setSavingPayment(false)
    }
  }

  const reloadShipmentData = async (activeOrderId: string) => {
    const [summary, records] = await Promise.all([
      window.yumi.orders.shipmentSummary(activeOrderId),
      window.yumi.orders.listShipments(activeOrderId)
    ])
    setShipmentSummary(summary)
    setShipments(records)
  }

  const openCostDetail = async () => {
    if (!order) return
    try {
      setCostDetail(await window.yumi.orders.costDetail(order.id))
      setCostDialogOpen(true)
    } catch (reason) {
      setError(getErrorMessage(reason, '订单成本详情读取失败。'))
    }
  }

  const resetShipmentDraft = () => {
    setShipmentDialogOpen(false)
    setShipmentDate(format(new Date(), 'yyyy-MM-dd'))
    setShipmentNotes('')
    setShipmentQuantities({})
  }

  const saveShipment = async () => {
    if (!order) return
    const quantities = order.items.map((item) => ({
      orderItemId: item.id,
      rawQuantity: shipmentQuantities[item.id] ?? ''
    }))
    if (quantities.some((item) => item.rawQuantity && !/^\d+$/.test(item.rawQuantity))) {
      setError('本次发货数量必须是非负整数。')
      return
    }
    const items = quantities
      .map((item) => ({ orderItemId: item.orderItemId, quantity: Number(item.rawQuantity || 0) }))
      .filter((item) => item.quantity > 0)
    if (items.length === 0) {
      setError('请至少填写一项本次发货数量。')
      return
    }
    setSavingShipment(true)
    setError('')
    try {
      await window.yumi.orders.createShipment({
        orderId: order.id,
        shippedAt: shipmentDate,
        notes: shipmentNotes.trim() || null,
        items
      })
      await reloadShipmentData(order.id)
      await onChanged()
      resetShipmentDraft()
    } catch (reason) {
      setError(getErrorMessage(reason, '发货记录保存失败。'))
    } finally {
      setSavingShipment(false)
    }
  }

  const exportOrderSheet = async () => {
    if (!order) return
    setExportingOrderSheet(true)
    setError('')
    try {
      const result = await window.yumi.orders.exportOrderSheet({ orderId: order.id })
      if (!result.savedPath) setError('已取消保存订单表。')
    } catch (reason) {
      setError(getErrorMessage(reason, '订单表导出失败，请重试。'))
    } finally {
      setExportingOrderSheet(false)
    }
  }

  const exportShipmentManifest = async (shipment: ShipmentDetail) => {
    if (!order) return
    setExportingShipmentManifestId(shipment.id)
    setError('')
    try {
      const result = await window.yumi.orders.exportShipmentManifest({
        orderId: order.id,
        shipmentId: shipment.id
      })
      if (!result.savedPath) setError('已取消保存发货清单。')
    } catch (reason) {
      setError(getErrorMessage(reason, '发货清单导出失败，请重试。'))
    } finally {
      setExportingShipmentManifestId(null)
    }
  }

  return (
    <div className="detail-workspace">
      <div className="detail-workspace-toolbar">
        <Button
          variant="ghost"
          onClick={() => {
            void clearPendingReceipt()
            onBack()
          }}
        >
          <ArrowLeft size={16} />
          返回订单列表
        </Button>
      </div>
      {loading && <Text color="gray">正在读取订单详情…</Text>}
      {!loading && order && (
        <div className="inspector-content">
          <div className="inspector-heading">
            <div>
              <Heading size="5">{order.code}</Heading>
              <Text size="2" color="gray">
                {order.customer.name} · 预计 {order.expectedShipDate} 发货 · 制作截止{' '}
                {order.productionDeadline}
              </Text>
            </div>
            <Flex gap="2" align="center">
              <Button size="1" variant="soft" onClick={() => setEditing(true)}>
                编辑订单
              </Button>
              <Badge
                color={getProductionStatusPresentation(order.productionStatus).color}
                variant="soft"
              >
                {getProductionStatusPresentation(order.productionStatus).label}
              </Badge>
              <Badge
                color={getSchedulingStatusPresentation(order.schedulingStatus).color}
                variant="soft"
              >
                {getSchedulingStatusPresentation(order.schedulingStatus).label}
              </Badge>
              <Badge color="amber" variant="soft">
                {getFinancialStatusPresentation(order.financial.status).label}
              </Badge>
            </Flex>
          </div>
          <Flex gap="2" justify="end">
            <Button
              size="1"
              variant="soft"
              disabled={exportingOrderSheet}
              onClick={() => void exportOrderSheet()}
            >
              {exportingOrderSheet ? '生成中…' : '生成订单表'}
            </Button>
            <Button size="1" variant="soft" onClick={() => void openCostDetail()}>
              查看成本详情
            </Button>
          </Flex>
          {order.notes?.trim() && (
            <section className="inspector-section order-notes">
              <Text weight="medium">订单备注</Text>
              <Text as="div" size="2" className="order-notes-content">
                {order.notes}
              </Text>
            </section>
          )}
          <div className="inspector-kpis">
            <div>
              <Text size="1" color="gray">
                应收
              </Text>
              <Text weight="medium">{money(order.financial.receivableCents)}</Text>
            </div>
            <div>
              <Text size="1" color="gray">
                已收净额
              </Text>
              <Text weight="medium">{money(order.financial.receivedNetCents)}</Text>
            </div>
            <div>
              <Text size="1" color="gray">
                待收
              </Text>
              <Text weight="medium">{money(order.financial.outstandingCents)}</Text>
            </div>
            <div>
              <Text size="1" color="gray">
                排产：合格 / 已排 / 未排
              </Text>
              <Text weight="medium">
                {order.progress.qualifiedQuantity} / {order.progress.scheduledQuantity} /{' '}
                {order.progress.unplannedQuantity}
              </Text>
            </div>
          </div>
          <section className="inspector-section">
            <Text weight="medium">商品明细与排产进度</Text>
            <div className="detail-list">
              {order.items.map((item) => (
                <div className="detail-line" key={item.id}>
                  <div>
                    <Text weight="medium">{item.productSnapshot.name}</Text>
                    <Text as="div" size="1" color="gray">
                      {item.quantity} 个 × {money(item.unitPriceCents)}
                      {item.edgeEnabled
                        ? ` · 缝边 ${item.edgeQuantity} 个 × ${money(item.edgePriceCents)}`
                        : ''}
                    </Text>
                    <ProductionProgressText {...item.progress} />
                  </div>
                  <Text>
                    {money(
                      item.unitPriceCents * item.quantity +
                        item.edgePriceCents * item.edgeQuantity -
                        item.discountCents
                    )}
                  </Text>
                </div>
              ))}
            </div>
          </section>
          <section className="inspector-section">
            <div className="section-title">
              <Text weight="medium">关联排班</Text>
              <Text size="1" color="gray">
                共 {order.relatedSchedules.length} 条任务记录
              </Text>
            </div>
            {order.relatedSchedules.length === 0 ? (
              <Empty text="尚未为该订单安排制作任务。" />
            ) : (
              <Table.Root variant="surface">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>日期</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>兼职人员</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>商品</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>计划 / 合格</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>不合格 / 未完成</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>状态</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>操作</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {order.relatedSchedules.map((schedule) => (
                    <Table.Row key={`${schedule.id}-${schedule.orderItemId}`}>
                      <Table.Cell>{schedule.shiftDate}</Table.Cell>
                      <Table.Cell>{schedule.workerName}</Table.Cell>
                      <Table.Cell>{schedule.productName}</Table.Cell>
                      <Table.Cell>
                        {schedule.plannedQuantity} / {schedule.qualifiedQuantity}
                      </Table.Cell>
                      <Table.Cell>
                        {schedule.unqualifiedQuantity} / {schedule.unfinishedQuantity}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge
                          color={getShiftStatusPresentation(schedule.status).color}
                          variant="soft"
                        >
                          {getShiftStatusPresentation(schedule.status).label}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Button size="1" variant="soft" onClick={() => onInspectShift(schedule.id)}>
                          查看班次
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            )}
          </section>
          <section className="inspector-section shipment-section">
            <Flex justify="between" align="center">
              <div>
                <Text weight="medium">发货清单</Text>
                <Text as="div" size="1" color="gray">
                  每次发货由用户填写本次数量；系统自动汇总累计已发和待发数量。
                </Text>
              </div>
              <Badge variant="soft">{shipments.length} 批</Badge>
            </Flex>
            <div className="shipment-summary-list">
              {order.items.map((item) => {
                const summary = shipmentSummary.find((entry) => entry.orderItemId === item.id)
                return (
                  <div className="shipment-summary-row" key={item.id}>
                    <Text weight="medium">{item.productSnapshot.name}</Text>
                    <Text size="2" color="gray">
                      订购 {summary?.orderedQuantity ?? item.quantity} · 累计已发{' '}
                      {summary?.shippedQuantity ?? 0} · 待发{' '}
                      {summary?.pendingQuantity ?? item.quantity}
                    </Text>
                  </div>
                )
              })}
            </div>
            <Flex justify="end" mt="3">
              <Button size="1" onClick={() => setShipmentDialogOpen(true)}>
                新增发货
              </Button>
            </Flex>
            <Dialog.Root open={shipmentDialogOpen} onOpenChange={setShipmentDialogOpen}>
              <Dialog.Content maxWidth="680px">
                <Dialog.Title>新增发货</Dialog.Title>
                <div className="shipment-entry-form">
                  <div className="shipment-quantity-grid">
                    {order.items.map((item) => (
                      <label key={item.id}>
                        <Text as="div" size="1" color="gray" mb="1">
                          {item.productSnapshot.name} · 本次发货数量
                        </Text>
                        <NumericTextField
                          min="0"
                          step="1"
                          value={shipmentQuantities[item.id] ?? ''}
                          onValueChange={(value) =>
                            setShipmentQuantities((current) => ({ ...current, [item.id]: value }))
                          }
                          placeholder="0"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="shipment-meta-grid">
                    <label>
                      <Text as="div" size="1" color="gray" mb="1">
                        发货日期
                      </Text>
                      <TextField.Root
                        type="date"
                        value={shipmentDate}
                        onChange={(event) => setShipmentDate(event.target.value)}
                      />
                    </label>
                    <label>
                      <Text as="div" size="1" color="gray" mb="1">
                        发货备注
                      </Text>
                      <TextField.Root
                        value={shipmentNotes}
                        onChange={(event) => setShipmentNotes(event.target.value)}
                        placeholder="可选"
                      />
                    </label>
                  </div>
                  <Flex gap="2" mt="4" justify="end">
                    <Button size="1" variant="soft" color="gray" onClick={resetShipmentDraft}>
                      取消
                    </Button>
                    <Button size="1" disabled={savingShipment} onClick={() => void saveShipment()}>
                      {savingShipment ? '保存中…' : '保存本次发货'}
                    </Button>
                  </Flex>
                </div>
              </Dialog.Content>
            </Dialog.Root>
            {shipments.length > 0 && (
              <div className="shipment-records">
                {shipments.map((shipment) => (
                  <div className="shipment-record" key={shipment.id}>
                    <div>
                      <Text weight="medium">{shipment.shippedAt}</Text>
                      <Text as="div" size="1" color="gray">
                        {shipment.items
                          .map((item) => `${item.productName} ${item.shipmentQuantity} 件`)
                          .join('；')}
                        {shipment.notes ? ` · ${shipment.notes}` : ''}
                      </Text>
                    </div>
                    <Flex gap="2">
                      <Button
                        size="1"
                        variant="soft"
                        disabled={exportingShipmentManifestId === shipment.id}
                        onClick={() => void exportShipmentManifest(shipment)}
                      >
                        {exportingShipmentManifestId === shipment.id ? '保存中…' : '保存发货清单'}
                      </Button>
                    </Flex>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="inspector-section payment-section">
            <Flex justify="between" align="center">
              <div>
                <Text weight="medium">收退款时间线</Text>
                <Text as="div" size="1" color="gray">
                  每次到账或退款都会单独保留记录。
                </Text>
              </div>
              <Badge variant="soft">{order.payments.length} 条</Badge>
            </Flex>
            <div className="payment-entry">
              <select
                className="desktop-select"
                value={paymentType}
                onChange={(event) => setPaymentType(event.target.value as 'receipt' | 'refund')}
              >
                <option value="receipt">收款</option>
                <option value="refund">退款</option>
              </select>
              <NumericTextField
                allowDecimal
                min="0.01"
                step="0.01"
                value={paymentAmount}
                onValueChange={(value) => setPaymentAmount(value)}
                placeholder="金额（元）"
              />
              <TextField.Root
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
                placeholder="方式"
              />
              <TextField.Root
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
              />
              <Button
                disabled={savingPayment || selectingReceipt}
                onClick={() => void chooseReceipt()}
                variant="soft"
              >
                {selectingReceipt
                  ? '导入中…'
                  : receiptAttachment
                    ? `凭证：${receiptAttachment.originalName}`
                    : '添加凭证'}
              </Button>
              {receiptAttachment && (
                <Button
                  color="gray"
                  disabled={savingPayment || selectingReceipt}
                  onClick={() => void clearPendingReceipt()}
                  variant="soft"
                >
                  移除
                </Button>
              )}
              <Button disabled={savingPayment} onClick={() => void recordPayment()}>
                {savingPayment ? '保存中…' : '追加记录'}
              </Button>
            </div>
            {order.payments.length === 0 ? (
              <Empty text="尚未记录收款或退款。" />
            ) : (
              <div className="payment-timeline">
                {order.payments.map((payment) => (
                  <div className="payment-row" key={payment.id}>
                    <Badge color={payment.type === 'receipt' ? 'green' : 'red'} variant="soft">
                      {payment.type === 'receipt' ? '收款' : '退款'}
                    </Badge>
                    <Text>{payment.paidAt}</Text>
                    <Text>{payment.paymentMethod}</Text>
                    <Text weight="medium">{money(payment.amountCents)}</Text>
                    <Text color="gray" size="1">
                      {payment.note || '—'}
                      {payment.receiptAttachmentId ? ' · 已附凭证' : ''}
                    </Text>
                  </div>
                ))}
              </div>
            )}
            <TextField.Root
              mt="2"
              value={paymentNote}
              onChange={(event) => setPaymentNote(event.target.value)}
              placeholder="本次收退款备注（可选）"
            />
          </section>
        </div>
      )}
      {error && (
        <Text as="div" size="2" color="red" mt="4">
          {error}
        </Text>
      )}
      <Flex mt="5" justify="end">
        <Button
          variant="soft"
          color="gray"
          onClick={() => {
            void clearPendingReceipt()
            onBack()
          }}
        >
          返回订单列表
        </Button>
      </Flex>
      {order && (
        <OrderDialog
          open={editing}
          onOpenChange={setEditing}
          products={products}
          order={order}
          onDone={async () => {
            await onChanged()
            const refreshed = await window.yumi.orders.get(order.id)
            if (refreshed) setOrder(refreshed)
          }}
        />
      )}
      <Dialog.Root open={costDialogOpen} onOpenChange={setCostDialogOpen}>
        <Dialog.Content maxWidth="760px">
          <Dialog.Title>订单成本详情</Dialog.Title>
          <Text as="div" size="1" color="gray" mb="3">
            预计人工按订单创建时默认时薪；实际人工为已完成排班的制作工时与预留时间，按当日兼职时薪计算。
          </Text>
          {costDetail?.items.map((item) => (
            <section className="inspector-section" key={item.orderItemId}>
              <Flex justify="between" align="center">
                <Text weight="medium">
                  {item.productName} × {item.quantity}
                </Text>
                <Text>
                  预计 {money(item.estimatedCostCents)} · 实际 {money(item.actualCostCents)}
                </Text>
              </Flex>
              <Text as="div" size="1" color="gray" mt="2">
                胶水 {money(item.glueCostCents)} · 包装 {money(item.packagingCostCents)} · 配件{' '}
                {money(item.accessoryCostCents)} · 替换袋 {money(item.replacementBagCostCents)} ·
                捏毛装袋 {money(item.fluffPackingCostCents)} · 缝边成本 {money(item.edgeCostCents)}{' '}
                · 提成 {money(item.commissionCostCents)}
              </Text>
              <Text as="div" size="1" color="gray">
                预计人工 {item.estimatedLaborMinutes} 分钟 {money(item.estimatedLaborCostCents)}
                ；实际人工 {item.actualLaborMinutes} 分钟 {money(item.actualLaborCostCents)}
              </Text>
            </section>
          ))}
          {costDetail && (
            <Flex justify="end" mt="4">
              <Text weight="bold">
                合计：预计 {money(costDetail.estimatedCostCents)} · 实际{' '}
                {money(costDetail.actualCostCents)}
              </Text>
            </Flex>
          )}
        </Dialog.Content>
      </Dialog.Root>
    </div>
  )
}

type ShiftDraftTask = {
  id: string
  orderItemId: string
  plannedQuantity: string
}

type SchedulableOrderItem = ShiftTaskOption

function ShiftDialog({
  target,
  shift,
  orders,
  onOpenChange,
  onDone
}: {
  target: { worker: WorkerSummary; date: string } | null
  shift?: ShiftDetail | null
  orders: OrderSummary[]
  onOpenChange(value: boolean): void
  onDone(): Promise<void>
}) {
  const [items, setItems] = useState<SchedulableOrderItem[]>([])
  const [extraMinutes, setExtraMinutes] = useState('0')
  const [tasks, setTasks] = useState<ShiftDraftTask[]>([])
  const [preview, setPreview] = useState<ShiftPreviewResult | null>(null)
  const [loadingItems, setLoadingItems] = useState(false)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const activeShift = shift ?? null
    if (!target && !activeShift) {
      setPreview(null)
      return
    }
    setExtraMinutes(String(activeShift?.extraMinutes ?? 0))
    setPreview(null)
    setError('')
    const load = async () => {
      setLoadingItems(true)
      try {
        const orderDetails = await Promise.all(
          orders
            .filter(
              (order) =>
                (order.productionStatus !== 'completed' &&
                  order.productionStatus !== 'cancelled') ||
                activeShift?.tasks.some((task) => task.orderId === order.id)
            )
            .map((order) => window.yumi.orders.get(order.id))
        )
        const nextItems = orderDetails.flatMap((order) =>
          order
            ? order.items.map((item) => ({
                id: item.id,
                orderId: order.id,
                productId: item.productId,
                label: `${order.code} · ${item.productSnapshot.name}（合格 ${item.progress.qualifiedQuantity} · 已排 ${item.progress.scheduledQuantity} · 未排 ${item.progress.unplannedQuantity}）`
              }))
            : []
        )
        setItems(nextItems)
        setTasks(
          activeShift
            ? activeShift.tasks.slice(0, 1).map((task) => ({
                id: crypto.randomUUID(),
                orderItemId: task.orderItemId,
                plannedQuantity: String(task.plannedQuantity)
              }))
            : nextItems[0]
              ? [{ id: crypto.randomUUID(), orderItemId: nextItems[0].id, plannedQuantity: '1' }]
              : []
        )
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '可排班订单读取失败。')
      } finally {
        setLoadingItems(false)
      }
    }
    void load()
  }, [target, shift, orders])

  const currentInput = {
    workerId: shift?.workerId ?? target?.worker.id ?? '',
    shiftDate: shift?.shiftDate ?? target?.date ?? '',
    extraMinutes: Number(extraMinutes),
    tasks: tasks.map((task) => ({
      orderItemId: task.orderItemId,
      plannedQuantity: Number(task.plannedQuantity)
    }))
  }

  const updateTask = (id: string, patch: Partial<ShiftDraftTask>) => {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, ...patch } : task)))
    setPreview(null)
  }

  const checkRisks = async () => {
    if (
      (!target && !shift) ||
      !Number.isInteger(Number(extraMinutes)) ||
      Number(extraMinutes) < 0 ||
      tasks.length === 0 ||
      tasks.some((task) => !task.orderItemId || Number(task.plannedQuantity) <= 0)
    ) {
      setError('请填写非负整数的本次额外增加分钟，并至少安排一项数量大于 0 的任务。')
      return
    }
    setChecking(true)
    setError('')
    try {
      setPreview(await window.yumi.schedule.preview(currentInput))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '排班检查失败。')
    } finally {
      setChecking(false)
    }
  }

  const save = async () => {
    if (!preview) {
      await checkRisks()
      return
    }
    setSaving(true)
    setError('')
    try {
      const input = {
        ...currentInput,
        confirmedWarningCodes: preview.risks.map((risk) => risk.code as ScheduleRiskCode)
      }
      if (shift) await window.yumi.schedule.update({ ...input, id: shift.id })
      else await window.yumi.schedule.save(input)
      await onDone()
      onOpenChange(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '排班保存失败。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open={Boolean(target || shift)} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="760px" className="wide-dialog">
        <Dialog.Title>{shift ? '编辑排班' : '创建排班'}</Dialog.Title>
        {(target || shift) && (
          <Dialog.Description size="2" mb="4">
            {shift
              ? `${shift.workerName} · ${shift.shiftDate}`
              : `${target!.worker.name} · ${target!.date}`}
            。 任务时长按标准时长计算；额外时间仅作用于本次整条排班。
          </Dialog.Description>
        )}
        <div className="shift-form">
          <label className="shift-extra-minutes">
            <Text as="div" size="2" mb="1">
              本次额外增加分钟
            </Text>
            <NumericTextField
              min="0"
              step="1"
              value={extraMinutes}
              onValueChange={(value) => {
                setExtraMinutes(value)
                setPreview(null)
              }}
              placeholder="例如 30"
            />
            <Text as="div" size="1" color="gray" mt="1">
              用于本次排班的准备、收尾或弹性时间，不会限制单个任务的实际完成时长。
            </Text>
          </label>
          <section className="form-section">
            <div className="section-title" style={{ marginBottom: 12 }}>
              <div>
                <Text weight="medium">本次制作任务</Text>
                <Text as="div" size="1" color="gray">
                  一次排班只能安排一个订单内的一种商品；预留时间会计入该商品的实际人工成本。
                </Text>
              </div>
            </div>
            {loadingItems && <Text color="gray">正在读取可排班订单…</Text>}
            {!loadingItems && items.length === 0 && <Empty text="没有可排班的未完成订单商品。" />}
            <div className="shift-tasks">
              {tasks.slice(0, 1).map((task) => (
                <div className="shift-task" key={task.id}>
                  <select
                    className="desktop-select"
                    value={task.orderItemId}
                    onChange={(event) => updateTask(task.id, { orderItemId: event.target.value })}
                  >
                    {getAvailableShiftTaskItems(items, tasks, task.id).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <NumericTextField
                    min="1"
                    step="1"
                    value={task.plannedQuantity}
                    onValueChange={(value) => updateTask(task.id, { plannedQuantity: value })}
                  />
                  <Text size="2" color="gray">
                    个
                  </Text>
                </div>
              ))}
            </div>
          </section>
          {preview && (
            <section className={`risk-preview ${preview.risks.length > 0 ? 'has-risk' : ''}`}>
              <Text weight="medium">本次时长汇总</Text>
              <div className="shift-duration-summary">
                <span>
                  任务基础时长 <strong>{preview.baseTaskMinutes} 分钟</strong>
                </span>
                <span>
                  额外增加 <strong>{preview.extraMinutes} 分钟</strong>
                </span>
                <span>
                  最终总时长 <strong>{preview.totalMinutes} 分钟</strong>
                </span>
              </div>
              {preview.taskBaseMinutes.map((task, index) => (
                <Text as="div" size="1" color="gray" key={task.orderItemId}>
                  任务 {index + 1} 基础时长：{task.baseMinutes} 分钟
                </Text>
              ))}
              {preview.taskProgress.map((task) => (
                <Text as="div" size="1" color="gray" key={`progress-${task.orderItemId}`}>
                  {task.productName}：当前合格 {task.progress.qualifiedQuantity} · 不合格{' '}
                  {task.progress.unqualifiedQuantity} · 已排 {task.progress.scheduledQuantity} ·
                  未排 {task.progress.unplannedQuantity}
                </Text>
              ))}
              {preview.risks.length > 0 && (
                <div className="risk-list">
                  {preview.risks.map((risk) => (
                    <Text key={risk.code} size="2">
                      · {risk.message}
                    </Text>
                  ))}
                </div>
              )}
            </section>
          )}
          {error && (
            <Text as="div" color="red" size="2">
              {error}
            </Text>
          )}
          <Flex justify="end" gap="3" mt="4">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                取消
              </Button>
            </Dialog.Close>
            <Button
              onClick={() => void (preview ? save() : checkRisks())}
              disabled={checking || saving || loadingItems}
            >
              {checking
                ? '计算中…'
                : saving
                  ? '保存中…'
                  : preview
                    ? '确认并保存'
                    : '校验并计算时长'}
            </Button>
          </Flex>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  )
}

function ShiftDetailWorkspace({
  shiftId,
  orders,
  onBack,
  onDataChanged
}: {
  shiftId: string
  orders: OrderSummary[]
  onBack(): void
  onDataChanged(): Promise<void>
}) {
  const [shift, setShift] = useState<ShiftDetail | null>(null)
  const [editing, setEditing] = useState(false)
  const [completionOpen, setCompletionOpen] = useState(false)
  const [completionDraft, setCompletionDraft] = useState<
    Record<string, { qualified: string; unqualified: string }>
  >({})
  const [loading, setLoading] = useState(false)
  const [savingStatus, setSavingStatus] = useState<ShiftStatus | null>(null)
  const [error, setError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    if (!shiftId) {
      setShift(null)
      setError('')
      return
    }
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const detail = await window.yumi.schedule.get(shiftId)
        if (!detail) throw new Error('排班不存在或已被删除。')
        if (!cancelled) setShift(detail)
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '排班详情读取失败。')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [refreshToken, shiftId])

  const refresh = async () => {
    setRefreshToken((current) => current + 1)
    await onDataChanged()
  }
  const openCompletion = () => {
    if (!shift) return
    setCompletionDraft(
      Object.fromEntries(
        shift.tasks.map((task) => [
          task.id,
          {
            qualified: String(task.qualifiedQuantity),
            unqualified: String(task.unqualifiedQuantity ?? 0)
          }
        ])
      )
    )
    setCompletionOpen(true)
  }
  const updateStatus = async (status: ShiftStatus) => {
    if (!shift || status === shift.status) return
    if (status === 'completed') {
      openCompletion()
      return
    }
    if (
      ['leave', 'absent', 'cancelled'].includes(status) &&
      !window.confirm(
        `${getShiftStatusPresentation(status).label}后，未完成计划将进入待补排队列并可能影响订单交期。是否继续？`
      )
    )
      return
    setSavingStatus(status)
    setError('')
    try {
      await window.yumi.schedule.updateStatus({ shiftId: shift.id, status })
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '排班状态更新失败。')
    } finally {
      setSavingStatus(null)
    }
  }
  const submitCompletion = async () => {
    if (!shift) return
    const completions = shift.tasks.map((task) => ({
      shiftTaskId: task.id,
      qualifiedQuantity: Number(completionDraft[task.id]?.qualified),
      unqualifiedQuantity: Number(completionDraft[task.id]?.unqualified)
    }))
    if (
      completions.some(
        (item) =>
          !Number.isInteger(item.qualifiedQuantity) ||
          !Number.isInteger(item.unqualifiedQuantity) ||
          item.qualifiedQuantity < 0 ||
          item.unqualifiedQuantity < 0
      )
    ) {
      setError('请为每项任务填写非负整数的合格数量与不合格数量。')
      return
    }
    setSavingStatus('completed')
    setError('')
    try {
      await window.yumi.schedule.updateStatus({
        shiftId: shift.id,
        status: 'completed',
        taskCompletions: completions
      })
      setCompletionOpen(false)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '完成数据保存失败。')
    } finally {
      setSavingStatus(null)
    }
  }

  return (
    <>
      <div className="detail-workspace">
        <div className="detail-workspace-toolbar">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft size={16} />
            返回排班列表
          </Button>
        </div>
        {loading && <Text color="gray">正在读取排班详情…</Text>}
        {error && (
          <Text as="div" color="red" size="2" mt="3">
            {error}
          </Text>
        )}
        {shift && (
          <div className="inspector-content">
            <div className="inspector-heading">
              <div>
                <Heading size="4">
                  {shift.workerName} · {shift.shiftDate}
                </Heading>
                <Text as="div" color="gray" size="2" mt="1">
                  基础 {shift.baseTaskMinutes} 分钟 · 额外 {shift.extraMinutes} 分钟 · 最终{' '}
                  {shift.totalMinutes} 分钟 · {shift.tasks.length} 项制作任务
                </Text>
              </div>
              <Flex gap="2" align="center">
                {shift.status === 'scheduled' && (
                  <Button size="1" variant="soft" onClick={() => setEditing(true)}>
                    编辑排班
                  </Button>
                )}
                <Badge color={getShiftStatusPresentation(shift.status).color} variant="soft">
                  {getShiftStatusPresentation(shift.status).label}
                </Badge>
              </Flex>
            </div>
            <section className="form-section shift-status-panel">
              <Flex justify="between" align="center" gap="4" wrap="wrap">
                <div>
                  <Text weight="medium">排班状态</Text>
                  <Text as="div" color="gray" size="1">
                    选择“已完成”后，需要为每项任务填写合格和不合格数量；工资结算与扣费暂不在此处理。
                  </Text>
                </div>
                <select
                  aria-label="更新排班状态"
                  className="desktop-select shift-status-select"
                  disabled={Boolean(savingStatus)}
                  onChange={(event) => void updateStatus(event.target.value as ShiftStatus)}
                  value={shift.status}
                >
                  {knownShiftStatuses.map((status) => (
                    <option key={status} value={status}>
                      标记为：{getShiftStatusPresentation(status).label}
                    </option>
                  ))}
                </select>
              </Flex>
            </section>
            {shift.confirmedRisks.length > 0 && (
              <section className="risk-preview has-risk">
                <Text weight="medium">保存时已确认的风险</Text>
                <div className="risk-list">
                  {shift.confirmedRisks.map((risk) => (
                    <Text key={risk} size="2">
                      · {risk}
                    </Text>
                  ))}
                </div>
              </section>
            )}
            <section className="inspector-section">
              <Flex justify="between" align="center">
                <div>
                  <Text weight="medium">制作任务与实际结果</Text>
                  <Text as="div" color="gray" size="1">
                    实际完成数量包含合格与不合格数量；本期不展示工资或不合格扣费结算。
                  </Text>
                </div>
                <Badge variant="soft">{shift.tasks.length} 项</Badge>
              </Flex>
              <div className="shift-inspector-tasks">
                {shift.tasks.map((task) => (
                  <article className="shift-inspector-task" key={task.id}>
                    <Text weight="medium">{task.productName}</Text>
                    <Text as="div" color="gray" size="1">
                      {task.orderCode} · 计划 {task.plannedQuantity} 个 · 基础 {task.baseMinutes}{' '}
                      分钟
                    </Text>
                    <div className="task-metrics">
                      <div>
                        <Text as="div" color="gray" size="1">
                          实际完成
                        </Text>
                        <Text weight="medium">
                          {task.completedQuantity === null
                            ? '未填写'
                            : `${task.completedQuantity} 个`}
                        </Text>
                      </div>
                      <div>
                        <Text as="div" color="gray" size="1">
                          合格 / 不合格
                        </Text>
                        <Text weight="medium">
                          {task.qualifiedQuantity} / {task.unqualifiedQuantity ?? 0}
                        </Text>
                      </div>
                      <div>
                        <Text as="div" color="gray" size="1">
                          待补排
                        </Text>
                        <Badge color={task.unfinishedQuantity > 0 ? 'red' : 'green'} variant="soft">
                          {task.unfinishedQuantity} 个
                        </Badge>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
        <Flex gap="3" justify="end" mt="5">
          <Button variant="soft" color="gray" onClick={onBack}>
            返回排班列表
          </Button>
        </Flex>
        {shift && (
          <ShiftDialog
            target={null}
            shift={editing ? shift : null}
            orders={orders}
            onOpenChange={setEditing}
            onDone={async () => {
              setEditing(false)
              await refresh()
            }}
          />
        )}
      </div>
      <Dialog.Root open={completionOpen} onOpenChange={setCompletionOpen}>
        <Dialog.Content maxWidth="680px">
          <Dialog.Title>填写实际完成数据</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            每项任务必须填写合格数量和不合格数量；实际完成数将自动相加。本期不计算工资与扣费。
          </Dialog.Description>
          <div className="completion-task-list">
            {shift?.tasks.map((task) => (
              <div className="completion-task" key={task.id}>
                <Text weight="medium">
                  {task.productName} · {task.orderCode}
                </Text>
                <Text size="1" color="gray">
                  计划 {task.plannedQuantity} 个
                </Text>
                <div className="field-grid two">
                  <label>
                    <Text as="div" size="1">
                      合格数量
                    </Text>
                    <NumericTextField
                      min="0"
                      step="1"
                      value={completionDraft[task.id]?.qualified ?? ''}
                      onValueChange={(value) =>
                        setCompletionDraft((current) => ({
                          ...current,
                          [task.id]: { ...current[task.id], qualified: value }
                        }))
                      }
                    />
                  </label>
                  <label>
                    <Text as="div" size="1">
                      不合格数量
                    </Text>
                    <NumericTextField
                      min="0"
                      step="1"
                      value={completionDraft[task.id]?.unqualified ?? ''}
                      onValueChange={(value) =>
                        setCompletionDraft((current) => ({
                          ...current,
                          [task.id]: { ...current[task.id], unqualified: value }
                        }))
                      }
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
          <Flex justify="end" gap="3" mt="4">
            <Button variant="soft" color="gray" onClick={() => setCompletionOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void submitCompletion()} disabled={savingStatus === 'completed'}>
              {savingStatus === 'completed' ? '保存中…' : '确认已完成'}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </>
  )
}

function toProductUpdateInput(product: ProductDetail): ProductUpdateInput {
  return {
    id: product.id,
    name: product.name,
    code: product.code,
    category: product.category,
    basePriceCents: product.basePriceCents,
    edgePriceCents: product.edgePriceCents,
    weightGrams: product.weightGrams,
    lossRate: product.lossRate,
    standardMinutesPerUnit: product.standardMinutesPerUnit,
    packagingCostCents: product.packagingCostCents,
    accessoryCostCents: product.accessoryCostCents,
    replacementBagCostCents: product.replacementBagCostCents,
    fluffPackingCostCents: product.fluffPackingCostCents,
    edgeCostCents: product.edgeCostCents,
    commissionCentsPerUnit: product.commissionCentsPerUnit,
    moldCount: product.moldCount,
    outputPerMoldPerBatch: product.outputPerMoldPerBatch,
    maxBatchesPerDay: product.maxBatchesPerDay,
    imagePath: product.imagePath,
    notes: product.notes,
    enabled: product.enabled
  }
}

function ProductInspector({
  productId,
  onOpenChange,
  onDataChanged
}: {
  productId: string | null
  onOpenChange(value: boolean): void
  onDataChanged(): Promise<void>
}) {
  const [draft, setDraft] = useState<ProductDetail | null>(null)
  const [preview, setPreview] = useState<ProductCostPreview | null>(null)
  const [previewQuantity, setPreviewQuantity] = useState('1')
  const [previewEdgeEnabled, setPreviewEdgeEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importingImage, setImportingImage] = useState(false)
  const [pendingImageAttachment, setPendingImageAttachment] = useState<AttachmentSummary | null>(
    null
  )
  const [error, setError] = useState('')

  const patchDraft = (patch: Partial<ProductDetail>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current))
    setPreview(null)
  }

  useEffect(() => {
    if (!productId) {
      setDraft(null)
      setPreview(null)
      setError('')
      return
    }
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const product = await window.yumi.products.get(productId)
        if (!product) throw new Error('商品不存在或已被删除。')
        if (!cancelled) {
          setDraft(product)
          setPreviewQuantity('1')
          setPreviewEdgeEnabled(false)
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '商品详情读取失败。')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [productId])

  const clearPendingImage = async () => {
    if (!pendingImageAttachment) return
    await window.yumi.attachments.delete(pendingImageAttachment.id)
    setPendingImageAttachment(null)
  }

  const chooseProductImage = async () => {
    setImportingImage(true)
    setError('')
    try {
      await clearPendingImage()
      const attachment = await window.yumi.attachments.chooseAndImport('product_image')
      if (!attachment) return
      setPendingImageAttachment(attachment)
      patchDraft({ imagePath: attachment.storagePath })
    } catch (reason) {
      setError(getErrorMessage(reason, '商品图片选择失败。'))
    } finally {
      setImportingImage(false)
    }
  }

  const removeProductImage = async () => {
    if (!window.confirm('确定移除当前商品图片吗？保存商品后将删除本地附件。')) return
    try {
      if (pendingImageAttachment) await clearPendingImage()
      patchDraft({ imagePath: null })
    } catch (reason) {
      setError(getErrorMessage(reason, '商品图片移除失败。'))
    }
  }

  const refreshPreview = async () => {
    if (!draft) return
    setCalculating(true)
    setError('')
    try {
      const result = await window.yumi.products.previewCost({
        ...toProductUpdateInput(draft),
        quantity: Number(previewQuantity),
        edgeEnabled: previewEdgeEnabled,
        edgeQuantity: previewEdgeEnabled ? Number(previewQuantity) : 0
      })
      setPreview(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '成本预估失败。')
    } finally {
      setCalculating(false)
    }
  }

  const save = async () => {
    if (!draft) return
    setSaving(true)
    setError('')
    try {
      const saved = await window.yumi.products.update(toProductUpdateInput(draft))
      setDraft(saved)
      setPreview(null)
      setPendingImageAttachment(null)
      await onDataChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '商品保存失败。')
    } finally {
      setSaving(false)
    }
  }

  const previewRevenue = preview
    ? Number(previewQuantity) * draft!.basePriceCents + preview.edgeRevenueCents
    : 0

  const handleOpenChange = (open: boolean) => {
    if (!open) void clearPendingImage()
    onOpenChange(open)
  }

  return (
    <Dialog.Root open={Boolean(productId)} onOpenChange={handleOpenChange}>
      <Dialog.Content maxWidth="920px" className="wide-dialog product-inspector-dialog">
        <Dialog.Title>商品资料与成本</Dialog.Title>
        {loading && <Text color="gray">正在读取商品资料…</Text>}
        {error && (
          <Text as="div" color="red" size="2" mt="3">
            {error}
          </Text>
        )}
        {draft && (
          <div className="inspector-content">
            <div className="inspector-heading">
              <div>
                <Heading size="4">{draft.name}</Heading>
                <Text as="div" color="gray" size="2" mt="1">
                  {draft.code || '未设编码'} · {draft.category || '未分类'}
                </Text>
              </div>
              <Badge color={draft.enabled ? 'green' : 'gray'} variant="soft">
                {draft.enabled ? '启用中' : '已停用'}
              </Badge>
            </div>

            <section className="form-section">
              <Flex justify="between" align="center" mb="3">
                <div>
                  <Text weight="medium">商品与售价</Text>
                  <Text as="div" color="gray" size="1">
                    停用后不可再被新订单选择，但既有订单快照不会受影响。
                  </Text>
                </div>
                <label className="switch-label">
                  <input
                    checked={draft.enabled}
                    onChange={(event) => patchDraft({ enabled: event.target.checked })}
                    type="checkbox"
                  />
                  <span>启用商品</span>
                </label>
              </Flex>
              <div className="field-grid three">
                <label>
                  <Text as="div" size="2" mb="1">
                    商品名称
                  </Text>
                  <TextField.Root
                    onChange={(event) => patchDraft({ name: event.target.value })}
                    value={draft.name}
                  />
                </label>
                <label>
                  <Text as="div" size="2" mb="1">
                    商品编码
                  </Text>
                  <TextField.Root
                    onChange={(event) => patchDraft({ code: event.target.value || null })}
                    value={draft.code ?? ''}
                  />
                </label>
                <label>
                  <Text as="div" size="2" mb="1">
                    分类
                  </Text>
                  <TextField.Root
                    onChange={(event) => patchDraft({ category: event.target.value || null })}
                    value={draft.category ?? ''}
                  />
                </label>
                <label>
                  <Text as="div" size="2" mb="1">
                    基础售价（元/个）
                  </Text>
                  <NumericTextField
                    allowDecimal
                    onValueChange={(value) => {
                      const basePriceCents = centsFromDraft(value)
                      if (basePriceCents !== null) patchDraft({ basePriceCents })
                    }}
                    value={draft.basePriceCents / 100}
                  />
                </label>
                <label>
                  <Text as="div" size="2" mb="1">
                    缝边收费（元/个）
                  </Text>
                  <NumericTextField
                    allowDecimal
                    onValueChange={(value) => {
                      const edgePriceCents = centsFromDraft(value)
                      if (edgePriceCents !== null) patchDraft({ edgePriceCents })
                    }}
                    value={draft.edgePriceCents / 100}
                  />
                </label>
                <label>
                  <Text as="div" size="2" mb="1">
                    商品图片（可选）
                  </Text>
                  <Flex gap="2">
                    <TextField.Root
                      readOnly
                      placeholder="未选择图片"
                      value={draft.imagePath ? '已选择本地受控图片' : ''}
                    />
                    <Button
                      disabled={importingImage || saving}
                      onClick={() => void chooseProductImage()}
                      size="1"
                      variant="soft"
                    >
                      {importingImage ? '导入中…' : '选择'}
                    </Button>
                    {draft.imagePath && (
                      <Button
                        color="gray"
                        disabled={importingImage || saving}
                        onClick={() => void removeProductImage()}
                        size="1"
                        variant="soft"
                      >
                        移除
                      </Button>
                    )}
                  </Flex>
                </label>
              </div>
            </section>

            <section className="form-section">
              <Text weight="medium">制作、成本与模具参数</Text>
              <div className="field-grid three" style={{ marginTop: 12 }}>
                <label>
                  <Text as="div" size="2" mb="1">
                    单件重量（克）
                  </Text>
                  <NumericTextField
                    allowDecimal
                    min="0"
                    onValueChange={(value) => {
                      const weightGrams = parseNumericDraft(value)
                      if (weightGrams !== null) patchDraft({ weightGrams })
                    }}
                    value={draft.weightGrams}
                  />
                </label>
                <label>
                  <Text as="div" size="2" mb="1">
                    损耗率（%）
                  </Text>
                  <NumericTextField
                    allowDecimal
                    min="0"
                    onValueChange={(value) => {
                      const lossRate = parseNumericDraft(value)
                      if (lossRate !== null) patchDraft({ lossRate: lossRate / 100 })
                    }}
                    step="0.1"
                    value={draft.lossRate * 100}
                  />
                </label>
                <label>
                  <Text as="div" size="2" mb="1">
                    标准制作时长（分钟/个）
                  </Text>
                  <NumericTextField
                    allowDecimal
                    min="0"
                    onValueChange={(value) => {
                      const standardMinutesPerUnit = parseNumericDraft(value)
                      if (standardMinutesPerUnit !== null) patchDraft({ standardMinutesPerUnit })
                    }}
                    value={draft.standardMinutesPerUnit}
                  />
                </label>
                <label>
                  <Text as="div" size="2" mb="1">
                    包装成本（元/个）
                  </Text>
                  <NumericTextField
                    allowDecimal
                    onValueChange={(value) => {
                      const packagingCostCents = centsFromDraft(value)
                      if (packagingCostCents !== null) patchDraft({ packagingCostCents })
                    }}
                    value={draft.packagingCostCents / 100}
                  />
                </label>
                <label>
                  <Text as="div" size="2" mb="1">
                    配件费（元/个）
                  </Text>
                  <NumericTextField
                    allowDecimal
                    min="0"
                    onValueChange={(value) => {
                      const accessoryCostCents = centsFromDraft(value)
                      if (accessoryCostCents !== null) patchDraft({ accessoryCostCents })
                    }}
                    value={draft.accessoryCostCents / 100}
                  />
                </label>
                <label>
                  <Text as="div" size="2" mb="1">
                    替换袋费用（元/个）
                  </Text>
                  <NumericTextField
                    allowDecimal
                    min="0"
                    onValueChange={(value) => {
                      const replacementBagCostCents = centsFromDraft(value)
                      if (replacementBagCostCents !== null) patchDraft({ replacementBagCostCents })
                    }}
                    value={draft.replacementBagCostCents / 100}
                  />
                </label>
                <label>
                  <Text as="div" size="2" mb="1">
                    捏毛装袋（元/个）
                  </Text>
                  <NumericTextField
                    allowDecimal
                    min="0"
                    onValueChange={(value) => {
                      const fluffPackingCostCents = centsFromDraft(value)
                      if (fluffPackingCostCents !== null) patchDraft({ fluffPackingCostCents })
                    }}
                    value={draft.fluffPackingCostCents / 100}
                  />
                </label>
                <label>
                  <Text as="div" size="2" mb="1">
                    缝边成本（元/个）
                  </Text>
                  <NumericTextField
                    allowDecimal
                    min="0"
                    onValueChange={(value) => {
                      const edgeCostCents = centsFromDraft(value)
                      if (edgeCostCents !== null) patchDraft({ edgeCostCents })
                    }}
                    value={draft.edgeCostCents / 100}
                  />
                </label>
                <label>
                  <Text as="div" size="2" mb="1">
                    固定提成（元/合格个）
                  </Text>
                  <NumericTextField
                    allowDecimal
                    onValueChange={(value) => {
                      const commissionCentsPerUnit = centsFromDraft(value)
                      if (commissionCentsPerUnit !== null) patchDraft({ commissionCentsPerUnit })
                    }}
                    value={draft.commissionCentsPerUnit / 100}
                  />
                </label>
                <label>
                  <Text as="div" size="2" mb="1">
                    模具数量
                  </Text>
                  <NumericTextField
                    min="1"
                    onValueChange={(value) => {
                      const moldCount = parseNumericDraft(value)
                      if (moldCount !== null) patchDraft({ moldCount })
                    }}
                    value={draft.moldCount}
                  />
                </label>
                <label>
                  <Text as="div" size="2" mb="1">
                    每模每批产出
                  </Text>
                  <NumericTextField
                    min="1"
                    onValueChange={(value) => {
                      const outputPerMoldPerBatch = parseNumericDraft(value)
                      if (outputPerMoldPerBatch !== null) patchDraft({ outputPerMoldPerBatch })
                    }}
                    value={draft.outputPerMoldPerBatch}
                  />
                </label>
                <label>
                  <Text as="div" size="2" mb="1">
                    每日批次数（手填）
                  </Text>
                  <NumericTextField
                    min="1"
                    onValueChange={(value) => {
                      const maxBatchesPerDay = parseNumericDraft(value)
                      if (maxBatchesPerDay !== null) patchDraft({ maxBatchesPerDay })
                    }}
                    value={draft.maxBatchesPerDay}
                  />
                </label>
              </div>
              <label className="notes-field">
                <Text as="div" size="2" mb="1">
                  备注
                </Text>
                <textarea
                  onChange={(event) => patchDraft({ notes: event.target.value || null })}
                  placeholder="记录款式、材料或制作注意事项"
                  value={draft.notes ?? ''}
                />
              </label>
            </section>

            <section className="form-section cost-preview-panel">
              <Flex justify="between" align="center" gap="3" wrap="wrap">
                <div>
                  <Text weight="medium">成本与日产能预估</Text>
                  <Text as="div" color="gray" size="1">
                    胶水、房租水电与人工均按当前系统成本设置计算；人工部分按全局默认兼职时薪计算。
                  </Text>
                </div>
                <Button
                  disabled={calculating}
                  onClick={() => void refreshPreview()}
                  size="1"
                  variant="soft"
                >
                  {calculating ? '计算中…' : '刷新预估'}
                </Button>
              </Flex>
              <div className="preview-inputs">
                <label>
                  <Text as="div" size="1" color="gray" mb="1">
                    预估数量
                  </Text>
                  <NumericTextField
                    min="1"
                    onValueChange={(value) => setPreviewQuantity(value)}
                    value={previewQuantity}
                  />
                </label>
                <label className="edge-preview-toggle">
                  <input
                    checked={previewEdgeEnabled}
                    onChange={(event) => setPreviewEdgeEnabled(event.target.checked)}
                    type="checkbox"
                  />
                  <span>计入缝边</span>
                </label>
                {previewEdgeEnabled && (
                  <label>
                    <Text as="div" size="1" color="gray" mb="1">
                      缝边数量
                    </Text>
                    <TextField.Root readOnly value={previewQuantity} />
                  </label>
                )}
              </div>
              {preview ? (
                <>
                  <div className="cost-preview-grid">
                    <div>
                      <Text as="div" color="gray" size="1">
                        胶水 {preview.glueGrams} 克
                      </Text>
                      <Text weight="medium">{money(preview.glueCostCents)}</Text>
                    </div>
                    <div>
                      <Text as="div" color="gray" size="1">
                        包装成本
                      </Text>
                      <Text weight="medium">{money(preview.packagingCostCents)}</Text>
                    </div>
                    <div>
                      <Text as="div" color="gray" size="1">
                        配件费
                      </Text>
                      <Text weight="medium">{money(preview.accessoryCostCents)}</Text>
                    </div>
                    <div>
                      <Text as="div" color="gray" size="1">
                        替换袋费用
                      </Text>
                      <Text weight="medium">{money(preview.replacementBagCostCents)}</Text>
                    </div>
                    <div>
                      <Text as="div" color="gray" size="1">
                        捏毛装袋
                      </Text>
                      <Text weight="medium">{money(preview.fluffPackingCostCents)}</Text>
                    </div>
                    <div>
                      <Text as="div" color="gray" size="1">
                        缝边成本
                      </Text>
                      <Text weight="medium">{money(preview.edgeCostCents)}</Text>
                    </div>
                    <div>
                      <Text as="div" color="gray" size="1">
                        默认兼职时薪
                      </Text>
                      <Text weight="medium">{money(preview.appliedHourlyWageCents)}/小时</Text>
                    </div>
                    <div>
                      <Text as="div" color="gray" size="1">
                        人工 {preview.laborMinutes} 分钟
                      </Text>
                      <Text weight="medium">{money(preview.laborCostCents)}</Text>
                    </div>
                    <div>
                      <Text as="div" color="gray" size="1">
                        按件提成
                      </Text>
                      <Text weight="medium">{money(preview.commissionCostCents)}</Text>
                    </div>
                    <div>
                      <Text as="div" color="gray" size="1">
                        缝边收入
                      </Text>
                      <Text weight="medium">{money(preview.edgeRevenueCents)}</Text>
                    </div>
                  </div>
                  <div className="cost-preview-total">
                    <div>
                      <Text color="gray" size="1">
                        预计成本
                      </Text>
                      <Heading size="4">{money(preview.totalCostCents)}</Heading>
                    </div>
                    <div>
                      <Text color="gray" size="1">
                        预计收入
                      </Text>
                      <Heading size="4">{money(previewRevenue)}</Heading>
                    </div>
                    <div>
                      <Text color="gray" size="1">
                        预估毛利
                      </Text>
                      <Heading size="4">{money(previewRevenue - preview.totalCostCents)}</Heading>
                    </div>
                    <div>
                      <Text color="gray" size="1">
                        每日模具产能
                      </Text>
                      <Heading size="4">{preview.dailyCapacity} 个</Heading>
                    </div>
                  </div>
                </>
              ) : (
                <Text as="div" color="gray" size="2" mt="3">
                  填写预估数量后，点击“刷新预估”查看包含全局默认兼职时薪的成本拆分和每日模具产能。
                </Text>
              )}
            </section>
          </div>
        )}
        <Flex gap="3" justify="end" mt="5">
          <Dialog.Close>
            <Button color="gray" variant="soft">
              关闭
            </Button>
          </Dialog.Close>
          <Button disabled={!draft || saving} onClick={() => void save()}>
            {saving ? '保存中…' : '保存商品资料'}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}
