import { useState, type FormEvent } from 'react'
import type {
  V2Product,
  V2ProductStage,
  V2ProductStageInventoryEvent
} from '@shared/contracts/index'
import { getErrorMessage, today } from '../../composables/v2-utils'
import {
  useProductInventory,
  type AllocatableOrderItem
} from '../../composables/use-product-inventory'
import {
  YumiButton,
  YumiDataTable,
  YumiDialog,
  YumiDetailList,
  YumiEmptyState,
  YumiField,
  YumiFieldLabel,
  YumiFormMessage,
  YumiNumberField,
  YumiSection,
  YumiSelect,
  YumiTextArea,
  YumiTextField,
  useYumiNotificationMessage
} from '../ui'

const productStageLabels: Record<V2ProductStage, string> = {
  made: '已制作，待捏毛装袋',
  fluffing_bagging_done: '已捏毛装袋，未缝边',
  edge_sewing_done: '已缝边，待打包发货',
  packed: '已打包，待发货'
}

const productStageOptions = (Object.keys(productStageLabels) as V2ProductStage[]).map((stage) => ({
  label: productStageLabels[stage],
  value: stage
}))

const sourceTypeLabels: Record<V2ProductStageInventoryEvent['sourceType'], string> = {
  opening: '历史存量',
  order_allocation: '投入订单',
  manager_adjustment: '负责人调整'
}

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`
}

/**
 * 商品详情「商品存量」标签：阶段余额、期初重录、负责人调整、投入订单与最近流水。
 */
export function ProductInventoryPanel({ product }: { product: V2Product }) {
  const {
    summary,
    events,
    loading,
    loadError,
    recordOpening,
    adjust,
    allocateToOrder,
    loadAllocatableOrderItems
  } = useProductInventory(product.id)
  const [openingOpen, setOpeningOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [allocateOpen, setAllocateOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [openingStage, setOpeningStage] = useState<V2ProductStage>('made')
  const [openingQuantity, setOpeningQuantity] = useState('0')
  const [openingDate, setOpeningDate] = useState(today())
  const [openingNote, setOpeningNote] = useState('')
  const [adjustStage, setAdjustStage] = useState<V2ProductStage>('made')
  const [adjustDelta, setAdjustDelta] = useState('0')
  const [adjustDate, setAdjustDate] = useState(today())
  const [adjustNote, setAdjustNote] = useState('')
  const [allocateOptions, setAllocateOptions] = useState<AllocatableOrderItem[]>([])
  const [allocateItemId, setAllocateItemId] = useState('')
  const [allocateStage, setAllocateStage] = useState<V2ProductStage>('made')
  const [allocateQuantity, setAllocateQuantity] = useState('0')
  const [allocateDate, setAllocateDate] = useState(today())
  useYumiNotificationMessage(loadError)

  const stages = summary?.stages ?? {
    made: 0,
    fluffing_bagging_done: 0,
    edge_sewing_done: 0,
    packed: 0
  }

  const openAllocate = async () => {
    setActionError(null)
    setAllocateOpen(true)
    try {
      const options = await loadAllocatableOrderItems(product.id)
      setAllocateOptions(options)
      setAllocateItemId(options[0]?.orderItemId ?? '')
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  const submitOpening = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setActionError(null)
    try {
      await recordOpening({
        productId: product.id,
        stage: openingStage,
        quantity: Number(openingQuantity) || 0,
        occurredOn: openingDate,
        note: openingNote || null
      })
      setOpeningOpen(false)
      setOpeningQuantity('0')
      setOpeningNote('')
    } catch (submitError) {
      setActionError(getErrorMessage(submitError))
    } finally {
      setBusy(false)
    }
  }

  const submitAdjust = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setActionError(null)
    try {
      await adjust({
        productId: product.id,
        stage: adjustStage,
        quantityDelta: Number(adjustDelta) || 0,
        occurredOn: adjustDate,
        note: adjustNote
      })
      setAdjustOpen(false)
      setAdjustDelta('0')
      setAdjustNote('')
    } catch (submitError) {
      setActionError(getErrorMessage(submitError))
    } finally {
      setBusy(false)
    }
  }

  const submitAllocate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setActionError(null)
    try {
      await allocateToOrder({
        productId: product.id,
        stage: allocateStage,
        orderItemId: allocateItemId,
        quantity: Number(allocateQuantity) || 0,
        occurredOn: allocateDate
      })
      setAllocateOpen(false)
      setAllocateQuantity('0')
    } catch (submitError) {
      setActionError(getErrorMessage(submitError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <YumiSection
        actions={
          <div className="yumi-record-action-bar">
            <YumiButton onClick={() => setOpeningOpen(true)} variant="secondary">
              录入历史存量
            </YumiButton>
            <YumiButton onClick={() => setAdjustOpen(true)} variant="secondary">
              负责人调整
            </YumiButton>
            <YumiButton onClick={() => void openAllocate()} variant="primary">
              投入订单
            </YumiButton>
          </div>
        }
        description="商品存量按物理加工阶段记录；余额来自流水汇总，任一阶段都不能为负。"
        title="商品存量"
      >
        {loading ? (
          <YumiEmptyState
            description="正在读取商品存量，请稍候。"
            scenario="loading"
            title="商品存量加载中"
          />
        ) : (
          <YumiDetailList
            ariaLabel="商品阶段存量余额"
            items={[
              { label: productStageLabels.made, value: `${stages.made} 件` },
              {
                label: productStageLabels.fluffing_bagging_done,
                value: `${stages.fluffing_bagging_done} 件`
              },
              {
                label: productStageLabels.edge_sewing_done,
                value: `${stages.edge_sewing_done} 件`
              },
              { label: productStageLabels.packed, value: `${stages.packed} 件` }
            ]}
          />
        )}
      </YumiSection>
      <YumiSection
        description="每次期初录入、负责人调整和投入订单都会留下不可覆盖的流水。"
        title="最近存量流水"
      >
        {events.length ? (
          <YumiDataTable
            ariaLabel="商品存量流水"
            columns={[
              { key: 'occurredOn', label: '发生日期', render: (event) => event.occurredOn },
              {
                key: 'stage',
                label: '阶段',
                render: (event) => productStageLabels[event.stage]
              },
              {
                key: 'delta',
                label: '数量变化',
                align: 'right',
                render: (event) => formatDelta(event.quantityDelta)
              },
              {
                key: 'source',
                label: '来源',
                render: (event) => sourceTypeLabels[event.sourceType]
              },
              { key: 'note', label: '备注', render: (event) => event.note || '—' }
            ]}
            getRowKey={(event) => event.id}
            rows={events}
          />
        ) : (
          <YumiEmptyState
            description="录入历史存量或投入订单后，这里会显示可追溯流水。"
            scenario="first-use"
            title="暂无商品存量流水"
          />
        )}
      </YumiSection>

      <YumiDialog
        description="只登记阶段、数量、发生日期和备注；不会生成历史任务或工资。"
        footer={
          <>
            <YumiButton onClick={() => setOpeningOpen(false)} variant="ghost">
              取消
            </YumiButton>
            <YumiButton form="product-opening-form" loading={busy} type="submit" variant="primary">
              保存历史存量
            </YumiButton>
          </>
        }
        onOpenChange={setOpeningOpen}
        open={openingOpen}
        title={`录入历史存量：${product.name}`}
      >
        <form id="product-opening-form" onSubmit={submitOpening}>
          <YumiField>
            <YumiFieldLabel htmlFor="inventory-opening-stage">阶段</YumiFieldLabel>
            <YumiSelect
              aria-label="阶段"
              onValueChange={(value) => setOpeningStage(value as V2ProductStage)}
              options={productStageOptions}
              value={openingStage}
            />
          </YumiField>
          <YumiField>
            <YumiFieldLabel htmlFor="inventory-opening-quantity" required>
              数量（件）
            </YumiFieldLabel>
            <YumiNumberField
              id="inventory-opening-quantity"
              onChange={(event) => setOpeningQuantity(event.target.value)}
              required
              value={openingQuantity}
            />
          </YumiField>
          <YumiField>
            <YumiFieldLabel htmlFor="inventory-opening-date">发生日期</YumiFieldLabel>
            <YumiTextField
              id="inventory-opening-date"
              onChange={(event) => setOpeningDate(event.target.value)}
              value={openingDate}
            />
          </YumiField>
          <YumiField>
            <YumiFieldLabel htmlFor="inventory-opening-note">备注</YumiFieldLabel>
            <YumiTextArea
              id="inventory-opening-note"
              onChange={(event) => setOpeningNote(event.target.value)}
              value={openingNote}
            />
          </YumiField>
          {actionError ? <YumiFormMessage tone="error">{actionError}</YumiFormMessage> : null}
        </form>
      </YumiDialog>

      <YumiDialog
        description="负责人在盘点或校正时增减阶段数量；减少后余额不能为负。"
        footer={
          <>
            <YumiButton onClick={() => setAdjustOpen(false)} variant="ghost">
              取消
            </YumiButton>
            <YumiButton
              form="product-inventory-adjust-form"
              loading={busy}
              type="submit"
              variant="primary"
            >
              保存调整
            </YumiButton>
          </>
        }
        onOpenChange={setAdjustOpen}
        open={adjustOpen}
        title={`负责人调整：${product.name}`}
      >
        <form id="product-inventory-adjust-form" onSubmit={submitAdjust}>
          <YumiField>
            <YumiFieldLabel htmlFor="inventory-adjust-stage">阶段</YumiFieldLabel>
            <YumiSelect
              aria-label="阶段"
              onValueChange={(value) => setAdjustStage(value as V2ProductStage)}
              options={productStageOptions}
              value={adjustStage}
            />
          </YumiField>
          <YumiField hint="正数为增加、负数为减少。">
            <YumiFieldLabel htmlFor="inventory-adjust-delta" required>
              调整数量（件）
            </YumiFieldLabel>
            <YumiNumberField
              allowDecimal={false}
              id="inventory-adjust-delta"
              onChange={(event) => setAdjustDelta(event.target.value)}
              required
              value={adjustDelta}
            />
          </YumiField>
          <YumiField>
            <YumiFieldLabel htmlFor="inventory-adjust-date">发生日期</YumiFieldLabel>
            <YumiTextField
              id="inventory-adjust-date"
              onChange={(event) => setAdjustDate(event.target.value)}
              value={adjustDate}
            />
          </YumiField>
          <YumiField>
            <YumiFieldLabel htmlFor="inventory-adjust-note" required>
              调整原因
            </YumiFieldLabel>
            <YumiTextArea
              id="inventory-adjust-note"
              onChange={(event) => setAdjustNote(event.target.value)}
              required
              value={adjustNote}
            />
          </YumiField>
          {actionError ? <YumiFormMessage tone="error">{actionError}</YumiFormMessage> : null}
        </form>
      </YumiDialog>

      <YumiDialog
        description="投入订单会同时扣减商品存量并增加订单履约数量；任一步失败都不写入。"
        footer={
          <>
            <YumiButton onClick={() => setAllocateOpen(false)} variant="ghost">
              取消
            </YumiButton>
            <YumiButton
              form="product-inventory-allocate-form"
              loading={busy}
              type="submit"
              variant="primary"
            >
              确认投入
            </YumiButton>
          </>
        }
        onOpenChange={setAllocateOpen}
        open={allocateOpen}
        title={`投入订单：${product.name}`}
      >
        {allocateOptions.length ? (
          <form id="product-inventory-allocate-form" onSubmit={submitAllocate}>
            <YumiField>
              <YumiFieldLabel htmlFor="inventory-allocate-item" required>
                订单商品
              </YumiFieldLabel>
              <YumiSelect
                aria-label="订单商品"
                onValueChange={setAllocateItemId}
                options={allocateOptions.map((option) => ({
                  value: option.orderItemId,
                  label: `${option.orderCode} · ${option.customerName} · ${option.quantity} 件${
                    option.edgeEnabled ? ` · 缝边 ${option.edgeQuantity} 件` : ' · 未缝边'
                  }`
                }))}
                value={allocateItemId}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel htmlFor="inventory-allocate-stage">投入使用的商品阶段</YumiFieldLabel>
              <YumiSelect
                aria-label="投入使用的商品阶段"
                onValueChange={(value) => setAllocateStage(value as V2ProductStage)}
                options={productStageOptions}
                value={allocateStage}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel htmlFor="inventory-allocate-quantity" required>
                投入数量（件）
              </YumiFieldLabel>
              <YumiNumberField
                id="inventory-allocate-quantity"
                onChange={(event) => setAllocateQuantity(event.target.value)}
                required
                value={allocateQuantity}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel htmlFor="inventory-allocate-date">发生日期</YumiFieldLabel>
              <YumiTextField
                id="inventory-allocate-date"
                onChange={(event) => setAllocateDate(event.target.value)}
                value={allocateDate}
              />
            </YumiField>
            {actionError ? <YumiFormMessage tone="error">{actionError}</YumiFormMessage> : null}
          </form>
        ) : (
          <YumiFormMessage tone="hint">
            还没有包含该商品的订单商品。请先在订单中创建同商品明细，再回来投入存量。
          </YumiFormMessage>
        )}
      </YumiDialog>
    </>
  )
}
