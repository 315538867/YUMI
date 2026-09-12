import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type {
  V2AfterSalesCase,
  V2AfterSalesStatus,
  V2OrderFund,
  V2Shipment
} from '@shared/contracts/index'
import { formatCents, getErrorMessage, today, yuanToCents } from '../../composables/v2-utils'
import {
  YumiButton,
  YumiDataTable,
  YumiConfirmDialog,
  YumiDatePicker,
  YumiField,
  YumiFieldLabel,
  YumiFormMessage,
  YumiListSurface,
  YumiListToolbar,
  YumiMetricStrip,
  YumiNumberField,
  YumiSearchSelect,
  YumiSection,
  YumiSelect,
  YumiSheet,
  YumiStatusTag,
  YumiTextArea,
  YumiTextField,
  useYumiNotificationMessage
} from '../ui'

interface AfterSalesPanelProps {
  orderId: string
  shipments: V2Shipment[]
  funds: V2OrderFund[]
  listCases: (query: { orderId: string }) => Promise<V2AfterSalesCase[]>
  createCase: (
    input: Parameters<Window['yumiV2']['afterSales']['createCase']>[0]
  ) => Promise<V2AfterSalesCase>
  updateCase: (
    id: string,
    input: Parameters<Window['yumiV2']['afterSales']['updateCase']>[1]
  ) => Promise<V2AfterSalesCase>
  linkCharge: (afterSalesCaseId: string, financialEntryId: string) => Promise<unknown>
}

const statusOptions = [
  { label: '待处理', value: 'open' },
  { label: '处理中', value: 'processing' },
  { label: '已解决', value: 'resolved' },
  { label: '已取消', value: 'cancelled' }
]

function statusLabel(status: V2AfterSalesStatus) {
  return status === 'open'
    ? '待处理'
    : status === 'processing'
      ? '处理中'
      : status === 'resolved'
        ? '已解决'
        : '已取消'
}

function statusTone(status: V2AfterSalesStatus) {
  return status === 'resolved'
    ? 'success'
    : status === 'cancelled'
      ? 'neutral'
      : status === 'processing'
        ? 'info'
        : 'warning'
}

function shipmentContext(shipment: V2Shipment) {
  const carrier = shipment.carrier?.trim() || '未填写承运方'
  const tracking = shipment.trackingNumber?.trim() || '未填写单号'
  const quantity = shipment.items.reduce((total, item) => total + item.quantity, 0)
  return `${shipment.shippedOn} · ${carrier} · ${tracking} · ${shipment.items.length} 种商品 / ${quantity} 件`
}

export function AfterSalesPanel({
  orderId,
  shipments,
  funds,
  listCases,
  createCase,
  updateCase,
  linkCharge
}: AfterSalesPanelProps) {
  const [cases, setCases] = useState<V2AfterSalesCase[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createConfirmOpen, setCreateConfirmOpen] = useState(false)
  const [showChargeForm, setShowChargeForm] = useState(false)
  const [shipmentId, setShipmentId] = useState('')
  const [occurredOn, setOccurredOn] = useState(today())
  const [reasonDescription, setReasonDescription] = useState('')
  const [customerRequest, setCustomerRequest] = useState('')
  const [responsibilityDescription, setResponsibilityDescription] = useState('')
  const [handlingDescription, setHandlingDescription] = useState('')
  const [status, setStatus] = useState<V2AfterSalesStatus>('open')
  const [customerChargeNote, setCustomerChargeNote] = useState('')
  const [accountingCost, setAccountingCost] = useState('0')
  const [note, setNote] = useState('')
  const [chargeCaseId, setChargeCaseId] = useState('')
  const [chargeEntryId, setChargeEntryId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)
  useYumiNotificationMessage(error)
  const availableCharges = useMemo(
    () =>
      funds.filter((fund) => fund.businessType === 'after_sales_charge' && !fund.reversalOfEntryId),
    [funds]
  )
  const shipmentOptions = useMemo(
    () => [
      { label: '不关联批次', value: '' },
      ...shipments.map((shipment) => ({
        label: `${shipment.shippedOn} · ${shipment.trackingNumber || shipment.id}`,
        searchText: shipmentContext(shipment),
        value: shipment.id
      }))
    ],
    [shipments]
  )
  const chargeOptions = useMemo(
    () =>
      availableCharges.map((item) => ({
        label: `${item.occurredOn} · ${formatCents(item.amountCents)}`,
        value: item.id
      })),
    [availableCharges]
  )
  const selectedShipment = useMemo(
    () => shipments.find((item) => item.id === shipmentId) ?? null,
    [shipments, shipmentId]
  )
  const selectedChargeCase = useMemo(
    () => cases.find((item) => item.id === chargeCaseId) ?? null,
    [cases, chargeCaseId]
  )
  const shipmentById = useMemo(
    () => new Map(shipments.map((shipment) => [shipment.id, shipment])),
    [shipments]
  )
  const summary = useMemo(
    () => ({
      accountingCostCents: cases.reduce((total, item) => total + item.accountingCostCents, 0),
      refundCents: funds
        .filter((fund) => fund.businessType === 'refund' && !fund.reversalOfEntryId)
        .reduce((total, fund) => total + Math.abs(fund.amountCents), 0),
      pendingCount: cases.filter((item) => item.status === 'open' || item.status === 'processing')
        .length
    }),
    [cases, funds]
  )
  const reload = useCallback(async () => {
    const next = await listCases({ orderId })
    setCases(next)
    return next
  }, [listCases, orderId])
  const draftDirty = Boolean(
    shipmentId ||
    reasonDescription ||
    customerRequest ||
    responsibilityDescription ||
    handlingDescription ||
    customerChargeNote ||
    accountingCost !== '0' ||
    note ||
    status !== 'open'
  )

  useEffect(() => {
    void reload().catch((cause) => setError(getErrorMessage(cause)))
  }, [reload])
  useEffect(() => {
    if (!chargeCaseId || cases.some((item) => item.id === chargeCaseId)) return
    setChargeCaseId('')
  }, [cases, chargeCaseId])

  const resetCreateDraft = () => {
    setShipmentId('')
    setOccurredOn(today())
    setReasonDescription('')
    setCustomerRequest('')
    setResponsibilityDescription('')
    setHandlingDescription('')
    setStatus('open')
    setCustomerChargeNote('')
    setAccountingCost('0')
    setNote('')
    setCreateConfirmOpen(false)
  }
  const openCreateForm = () => {
    resetCreateDraft()
    setError(null)
    setShowCreateForm(true)
  }
  const closeCreateForm = (open: boolean) => {
    setShowCreateForm(open)
    if (!open) setCreateConfirmOpen(false)
  }

  const handleCreate = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (
      !reasonDescription.trim() ||
      !responsibilityDescription.trim() ||
      !handlingDescription.trim()
    ) {
      setError('请完整填写问题原因、负责人责任判断和处理方式。')
      return
    }
    setCreateConfirmOpen(true)
  }
  const confirmCreate = async () => {
    setError(null)
    setSubmitting('create')
    try {
      await createCase({
        orderId,
        shipmentId: shipmentId || null,
        occurredOn,
        reasonDescription,
        customerRequest: customerRequest || null,
        responsibilityDescription,
        handlingDescription,
        status,
        customerChargeNote: customerChargeNote || null,
        accountingCostCents: yuanToCents(accountingCost),
        note: note || null
      })
      resetCreateDraft()
      setShowCreateForm(false)
      await reload()
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setSubmitting(null)
    }
  }
  const handleLink = async () => {
    setError(null)
    setSubmitting('link')
    try {
      await linkCharge(chargeCaseId, chargeEntryId)
      await reload()
      setChargeEntryId('')
      setShowChargeForm(false)
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setSubmitting(null)
    }
  }
  const updateStatus = async (item: V2AfterSalesCase, nextStatus: V2AfterSalesStatus) => {
    setError(null)
    setSubmitting(item.id)
    try {
      await updateCase(item.id, { status: nextStatus })
      await reload()
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="yumi-after-sales-panel">
      <YumiMetricStrip
        items={[
          { label: '售后单', value: `${cases.length} 笔` },
          {
            label: '已核算成本',
            note: '会进入订单盈利口径',
            value: formatCents(summary.accountingCostCents)
          },
          { label: '退款金额', value: formatCents(summary.refundCents) },
          { label: '待处理', value: `${summary.pendingCount} 笔` }
        ]}
      />
      <YumiSection
        actions={
          <YumiButton onClick={openCreateForm} variant="primary">
            新建售后
          </YumiButton>
        }
        description="退货、补发和退款等处理按售后单留痕，并将已知成本回写到订单盈利。"
        title="售后记录"
      >
        <YumiListSurface ariaLabel="售后记录">
          <YumiListToolbar
            ariaLabel="售后记录工具条"
            countLabel={`共 ${cases.length} 条售后记录`}
          />
          <YumiDataTable<V2AfterSalesCase>
            ariaLabel="售后记录列表"
            columns={[
              {
                key: 'occurredOn',
                label: '发生日期',
                render: (item) => item.occurredOn
              },
              {
                key: 'case',
                label: '问题 / 处理',
                render: (item) => (
                  <div className="yumi-list-cell">
                    <strong>{item.reasonDescription}</strong>
                    <span>
                      责任：{item.responsibilityDescription} · 处理：{item.handlingDescription}
                    </span>
                    {item.customerRequest ? <span>客户诉求：{item.customerRequest}</span> : null}
                  </div>
                )
              },
              {
                key: 'shipment',
                label: '原发货批次',
                render: (item) => {
                  const originalShipment = item.shipmentId
                    ? shipmentById.get(item.shipmentId)
                    : null
                  return originalShipment ? shipmentContext(originalShipment) : '未关联批次'
                }
              },
              {
                align: 'right',
                key: 'cost',
                label: '核算成本',
                render: (item) => <strong>{formatCents(item.accountingCostCents)}</strong>
              },
              {
                key: 'status',
                label: '状态',
                render: (item) => (
                  <YumiStatusTag tone={statusTone(item.status)}>
                    {statusLabel(item.status)}
                  </YumiStatusTag>
                )
              },
              {
                align: 'right',
                key: 'action',
                label: '操作',
                render: (item) => (
                  <div className="yumi-list-cell yumi-list-cell--actions">
                    <YumiSelect
                      aria-label={`${item.occurredOn}售后状态`}
                      disabled={submitting === item.id}
                      onValueChange={(nextStatus) =>
                        void updateStatus(item, nextStatus as V2AfterSalesStatus)
                      }
                      options={statusOptions}
                      value={item.status}
                    />
                    <YumiButton
                      onClick={() => {
                        setChargeCaseId(item.id)
                        setChargeEntryId('')
                        setShowChargeForm(true)
                        setError(null)
                      }}
                      variant="ghost"
                    >
                      关联实际收费
                    </YumiButton>
                  </div>
                )
              }
            ]}
            emptyText="暂未记录售后处理。"
            getRowKey={(item) => item.id}
            rows={cases}
          />
        </YumiListSurface>
      </YumiSection>

      <YumiSheet
        description="先记录负责人判断，再由负责人明确确认保存。系统不会自动定责、收费或创建返工任务；补发也必须由负责人另行确认和创建。"
        dirty={draftDirty}
        footer={
          <>
            <YumiButton onClick={() => closeCreateForm(false)} variant="ghost">
              取消
            </YumiButton>
            <YumiButton form="after-sales-case-form" type="submit" variant="primary">
              确认负责人判断
            </YumiButton>
          </>
        }
        onOpenChange={closeCreateForm}
        open={showCreateForm}
        title="新建售后"
      >
        <form
          className="yumi-form-panel yumi-sheet-form"
          id="after-sales-case-form"
          onSubmit={handleCreate}
        >
          <div className="yumi-form-grid yumi-form-grid--three">
            <YumiField>
              <YumiFieldLabel required>发生日期</YumiFieldLabel>
              <YumiDatePicker
                aria-label="售后发生日期"
                onValueChange={setOccurredOn}
                value={occurredOn}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel>关联发货批次</YumiFieldLabel>
              <YumiSearchSelect
                aria-label="关联发货批次"
                onValueChange={setShipmentId}
                options={shipmentOptions}
                value={shipmentId}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel>状态</YumiFieldLabel>
              <YumiSelect
                aria-label="售后状态"
                onValueChange={(value) => setStatus(value as V2AfterSalesStatus)}
                options={statusOptions}
                value={status}
              />
            </YumiField>
          </div>
          {selectedShipment ? (
            <div className="yumi-form-context">
              <strong>原发货上下文</strong>
              <span>{shipmentContext(selectedShipment)}</span>
            </div>
          ) : (
            <YumiFormMessage>
              如本次售后源于已发货商品，请选择原发货批次，后续处理会保留该上下文。
            </YumiFormMessage>
          )}
          <YumiField>
            <YumiFieldLabel required>问题原因</YumiFieldLabel>
            <YumiTextArea
              onChange={(event) => setReasonDescription(event.target.value)}
              placeholder="例如：客户不满意包装袋或产品质量问题"
              value={reasonDescription}
            />
          </YumiField>
          <div className="yumi-form-grid yumi-form-grid--two">
            <YumiField>
              <YumiFieldLabel>客户诉求</YumiFieldLabel>
              <YumiTextArea
                onChange={(event) => setCustomerRequest(event.target.value)}
                placeholder="例如：加封边、加配饰、换袋子"
                value={customerRequest}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel required>负责人责任判断</YumiFieldLabel>
              <YumiTextArea
                onChange={(event) => setResponsibilityDescription(event.target.value)}
                placeholder="负责人结合实际明确说明责任归属"
                value={responsibilityDescription}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel required>处理方式</YumiFieldLabel>
              <YumiTextArea
                onChange={(event) => setHandlingDescription(event.target.value)}
                placeholder="例如：重新包装、补发或协商收费"
                value={handlingDescription}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel>售后核算成本（元）</YumiFieldLabel>
              <YumiNumberField
                allowDecimal
                min="0"
                onChange={(event) => setAccountingCost(event.target.value)}
                value={accountingCost}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel>与客户收费约定</YumiFieldLabel>
              <YumiTextField
                onChange={(event) => setCustomerChargeNote(event.target.value)}
                placeholder="可以约定不收费，成本仍应记录"
                value={customerChargeNote}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel>备注</YumiFieldLabel>
              <YumiTextField onChange={(event) => setNote(event.target.value)} value={note} />
            </YumiField>
          </div>
        </form>
      </YumiSheet>

      <YumiConfirmDialog
        cancelLabel="继续修改"
        confirmLabel={submitting === 'create' ? '保存中…' : '确认并保存售后记录'}
        description="本次确认只保存负责人填写的售后判断、成本与收费约定。返工、补发和实际收费仍须由负责人在后续工作区另行创建或关联。"
        destructive={false}
        onConfirm={() => void confirmCreate()}
        onOpenChange={setCreateConfirmOpen}
        open={createConfirmOpen}
        title="确认售后处理判断"
      />

      <YumiSheet
        description="只关联已实际到账的“售后收费”流水；未收费或尚未到账时，无需在这里处理。"
        footer={
          <>
            <YumiButton onClick={() => setShowChargeForm(false)} variant="ghost">
              取消
            </YumiButton>
            <YumiButton
              disabled={!chargeCaseId || !chargeEntryId}
              loading={submitting === 'link'}
              onClick={() => void handleLink()}
              variant="primary"
            >
              确认关联收费
            </YumiButton>
          </>
        }
        onOpenChange={setShowChargeForm}
        open={showChargeForm}
        title="关联实际售后收费"
      >
        <div className="yumi-form-panel yumi-sheet-form">
          <YumiField>
            <YumiFieldLabel>售后记录</YumiFieldLabel>
            <p className="yumi-field__static">
              {selectedChargeCase
                ? `${selectedChargeCase.occurredOn} · ${selectedChargeCase.reasonDescription}`
                : '未选择售后记录'}
            </p>
          </YumiField>
          <YumiField>
            <YumiFieldLabel>已登记收费</YumiFieldLabel>
            <YumiSearchSelect
              aria-label="已登记收费"
              onValueChange={setChargeEntryId}
              options={chargeOptions}
              placeholder="选择已登记收费"
              value={chargeEntryId}
            />
          </YumiField>
          {availableCharges.length === 0 ? (
            <YumiFormMessage>
              请先在订单的“收款 / 退款”中登记实际到账的售后收费，再返回这里关联。
            </YumiFormMessage>
          ) : null}
        </div>
      </YumiSheet>
    </div>
  )
}
