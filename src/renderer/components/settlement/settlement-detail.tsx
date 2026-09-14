import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type {
  V2WorkerSettlementDetail,
  V2WorkerSettlementDraftUpdateInput,
  V2WorkerSettlementWorkTimeAdjustmentInput
} from '@shared/contracts/index'
import {
  centsToYuan,
  formatCents,
  getErrorMessage,
  signedYuanToCents,
  yuanToCents
} from '../../composables/v2-utils'
import {
  YumiButton,
  YumiDataTable,
  YumiDatePicker,
  YumiField,
  YumiFieldLabel,
  YumiFormMessage,
  YumiMetricStrip,
  YumiNumberField,
  YumiRecordSummary,
  YumiSection,
  YumiSelect,
  YumiStatusTag,
  YumiTextArea,
  YumiTextField,
  YumiConfirmDialog,
  useYumiNotificationMessage
} from '../ui'

export interface AdjustableReviewOption {
  id: string
  label: string
}

interface SettlementDetailProps {
  settlement: V2WorkerSettlementDetail
  workerName: string
  updateDraft(
    id: string,
    input: V2WorkerSettlementDraftUpdateInput
  ): Promise<V2WorkerSettlementDetail>
  confirmSettlement(id: string): Promise<V2WorkerSettlementDetail>
  adjustableReviews?: AdjustableReviewOption[]
  addWorkTimeAdjustment?(
    id: string,
    input: V2WorkerSettlementWorkTimeAdjustmentInput
  ): Promise<V2WorkerSettlementDetail>
}

const processLabels = {
  making: '制作',
  fluffing_bagging: '捏毛装袋',
  edge_sewing: '缝边',
  packing: '打包发货'
} as const

function formatSignedCents(cents: number): string {
  return cents < 0 ? `-${formatCents(-cents)}` : formatCents(cents)
}

function formatMakingSource(source: V2WorkerSettlementDetail['makingSources'][number]): string {
  const base = `${source.occurredOn} · 合格 ${source.qualifiedQuantity} 件 · 不合格 ${source.unqualifiedQuantity} 件`
  const rate =
    source.pieceRateCents === null
      ? '未设置冻结提成'
      : `冻结提成 ${formatCents(source.pieceRateCents)} / 件`
  const parts = [base, rate, `制作提成 ${formatCents(source.qualifiedCommissionCents)}`]
  if (source.materialDeductionCents > 0) {
    parts.push(`材料成本扣款 ${formatCents(source.materialDeductionCents)}`)
  }
  return parts.join(' · ')
}

function formatTimedSource(source: V2WorkerSettlementDetail['timedSources'][number]): string {
  const label = processLabels[source.processType]
  const parts = [
    `${source.occurredOn} · ${label} · 核算 ${source.approvedMinutes} 分钟`,
    `冻结时薪 ${formatCents(source.hourlyWageCentsSnapshot)} / 小时`,
    `计时工资 ${formatCents(source.timedWageCents)}`
  ]
  if (source.processType === 'packing') {
    parts.push('打包发货不产生计件提成')
  } else {
    parts.push(`完成计件提成 ${formatCents(source.commissionCents)}`)
  }
  const items = source.items
    .map(
      (item) =>
        `${formatCents(item.pieceRateCents ?? 0)} / 件 × ${item.completedQuantity} 件 = ${formatCents(item.commissionCents)}`
    )
    .join('；')
  if (items) parts.push(`商品完成明细：${items}`)
  return parts.join(' · ')
}

function formatAdjustment(adjustment: V2WorkerSettlementDetail['adjustments'][number]): string {
  const sign = adjustment.amountCents >= 0 ? '+' : '-'
  return [
    `${processLabels[adjustment.processType]} · 原核算 ${adjustment.originalMinutes} 分钟 → 更正 ${adjustment.correctedMinutes} 分钟`,
    `原工时冻结时薪 ${formatCents(adjustment.hourlyWageCentsSnapshot)} / 小时`,
    `调整金额 ${sign}${formatCents(Math.abs(adjustment.amountCents))}`,
    `原因：${adjustment.reason}`,
    `关联原结算 ${adjustment.originalSettlementId}`
  ].join(' · ')
}

function formatDeductionSource(
  deduction: V2WorkerSettlementDetail['deductions'][number],
  allocatedCents: number
): string {
  return [
    `${deduction.occurredOn} · 制作不合格 ${deduction.unqualifiedQuantity} 件`,
    `材料成本扣款 ${formatCents(deduction.materialDeductionCents)}`,
    `本期抵扣 ${formatCents(allocatedCents)}`
  ].join(' · ')
}

interface DetailDraft {
  actualDeduction: string
  otherAdjustment: string
  finalPaid: string
  paidOn: string
  managerNote: string
}

function createDraft(settlement: V2WorkerSettlementDetail): DetailDraft {
  return {
    actualDeduction: centsToYuan(settlement.actualDeductionCents),
    otherAdjustment: centsToYuan(settlement.otherAdjustmentCents),
    finalPaid:
      settlement.finalPaidAmountCents === null ? '' : centsToYuan(settlement.finalPaidAmountCents),
    paidOn: settlement.paidOn ?? '',
    managerNote: settlement.managerNote ?? ''
  }
}

export function SettlementDetail(props: SettlementDetailProps) {
  const [draft, setDraft] = useState(() => createDraft(props.settlement))
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [adjustmentReviewId, setAdjustmentReviewId] = useState('')
  const [correctedMinutes, setCorrectedMinutes] = useState('')
  const [adjustmentReason, setAdjustmentReason] = useState('')
  const [adjustmentNote, setAdjustmentNote] = useState('')
  useYumiNotificationMessage(error)
  useYumiNotificationMessage(message, { tone: 'success' })
  const allocationByDeductionId = useMemo(
    () =>
      new Map(
        props.settlement.deductionAllocations.map((item) => [
          item.deductionRecordId,
          item.allocatedCents
        ])
      ),
    [props.settlement.deductionAllocations]
  )

  useEffect(() => {
    setDraft(createDraft(props.settlement))
    setError(null)
    setMessage(null)
    setConfirmOpen(false)
    setAdjustmentReviewId('')
    setCorrectedMinutes('')
    setAdjustmentReason('')
    setAdjustmentNote('')
  }, [props.settlement])

  const update = (patch: Partial<DetailDraft>) => setDraft((current) => ({ ...current, ...patch }))
  const buildUpdate = (): V2WorkerSettlementDraftUpdateInput => ({
    actualDeductionCents: yuanToCents(draft.actualDeduction),
    otherAdjustmentCents: signedYuanToCents(draft.otherAdjustment),
    finalPaidAmountCents: draft.finalPaid.trim() ? yuanToCents(draft.finalPaid) : null,
    paidOn: draft.paidOn || null,
    managerNote: draft.managerNote
  })

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setSubmitting('save')
    try {
      await props.updateDraft(props.settlement.id, buildUpdate())
      setMessage('结算草稿已更新。')
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setSubmitting(null)
    }
  }

  const finalPaidAmountCents = draft.finalPaid.trim() ? yuanToCents(draft.finalPaid) : 0
  const confirmReady = finalPaidAmountCents > 0 && Boolean(draft.paidOn)

  const handleConfirm = () => {
    setError(null)
    setMessage(null)
    if (finalPaidAmountCents <= 0) {
      setError('确认前请填写大于零的最终实发金额。')
      return
    }
    if (!draft.paidOn) {
      setError('确认前请选择实际付款日期。')
      return
    }
    setConfirmOpen(true)
  }

  const executeConfirm = async () => {
    setConfirmOpen(false)
    setSubmitting('confirm')
    try {
      await props.updateDraft(props.settlement.id, buildUpdate())
      await props.confirmSettlement(props.settlement.id)
      setMessage('工资结算已确认并写入实际工资支出。')
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setSubmitting(null)
    }
  }

  const handleAdjustment = async (event: FormEvent) => {
    event.preventDefault()
    if (!props.addWorkTimeAdjustment) return
    setError(null)
    setMessage(null)
    setSubmitting('adjustment')
    try {
      await props.addWorkTimeAdjustment(props.settlement.id, {
        workTimeReviewId: adjustmentReviewId,
        correctedMinutes: Math.round(Number(correctedMinutes)),
        reason: adjustmentReason,
        note: adjustmentNote || null
      })
      setAdjustmentReviewId('')
      setCorrectedMinutes('')
      setAdjustmentReason('')
      setAdjustmentNote('')
      setMessage('已建立来源关联的工时调整。')
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setSubmitting(null)
    }
  }

  const isDraft = props.settlement.status === 'draft'
  const adjustableReviews = props.adjustableReviews ?? []
  return (
    <div className="yumi-settlement-detail">
      <YumiRecordSummary
        ariaLabel="工资结算摘要"
        description={`${props.settlement.periodStartOn} 至 ${props.settlement.periodEndOn}`}
        status={
          <YumiStatusTag tone={isDraft ? 'warning' : 'success'}>
            {isDraft ? '草稿' : '已确认'}
          </YumiStatusTag>
        }
        title={props.workerName}
      >
        <YumiMetricStrip
          ariaLabel="工资结算经营摘要"
          items={[
            { label: '计时工资', value: formatCents(props.settlement.timedWageCents) },
            { label: '计件提成', value: formatCents(props.settlement.commissionCents) },
            {
              label: '材料扣款 / 来源调整',
              tone: 'warning',
              value: `${formatCents(props.settlement.materialDeductionCents)} · 调整 ${formatSignedCents(props.settlement.adjustmentCents)}`
            },
            {
              label: '计算候选应发',
              tone: 'brand',
              value: formatCents(props.settlement.candidateWageCents)
            },
            {
              label: '本期抵扣 / 顺延',
              value: `${formatCents(props.settlement.actualDeductionCents)} · ${formatCents(props.settlement.continuingCarryoverCents)}`
            }
          ]}
        />
      </YumiRecordSummary>

      <div className="yumi-settlement-sources">
        <YumiSection
          description="制作按合格数量计提成、按不合格数量扣除冻结材料成本，不含时薪。"
          title="制作结果来源"
        >
          <YumiDataTable
            ariaLabel="制作结果来源记录"
            columns={[{ key: 'summary', label: '制作记录', render: formatMakingSource }]}
            emptyText="本期无已确认制作结果。"
            getRowKey={(source) => source.id}
            rows={props.settlement.makingSources}
          />
        </YumiSection>
        <YumiSection
          description="捏毛装袋与缝边按确认工时计个人时薪并加完成数量提成；打包发货只按确认工时。"
          title="计时来源"
        >
          <YumiDataTable
            ariaLabel="计时来源记录"
            columns={[{ key: 'summary', label: '工时记录', render: formatTimedSource }]}
            emptyText="本期无已确认工时核算。"
            getRowKey={(source) => source.id}
            rows={props.settlement.timedSources}
          />
        </YumiSection>
        <YumiSection
          description="已结算工时差异在后续结算中按原工时冻结时薪建立正负调整，不改写历史实发。"
          title="来源关联调整"
        >
          <YumiDataTable
            ariaLabel="来源关联调整记录"
            columns={[{ key: 'summary', label: '调整记录', render: formatAdjustment }]}
            emptyText="本期无来源关联调整。"
            getRowKey={(adjustment) => adjustment.id}
            rows={props.settlement.adjustments}
          />
        </YumiSection>
        <YumiSection title="扣款来源">
          <YumiDataTable
            ariaLabel="扣款来源记录"
            columns={[
              {
                key: 'summary',
                label: '扣款记录',
                render: (deduction) =>
                  formatDeductionSource(deduction, allocationByDeductionId.get(deduction.id) ?? 0)
              }
            ]}
            emptyText="本期无不合格材料扣款。"
            getRowKey={(deduction) => deduction.id}
            rows={props.settlement.deductions}
          />
        </YumiSection>
      </div>

      {isDraft && props.addWorkTimeAdjustment && adjustableReviews.length ? (
        <YumiSection
          description="仅当工时已进入已确认结算时才能建立差异调整；履约完成数量更正必须走独立的履约调整。"
          title="已结算工时更正"
        >
          <form className="yumi-form-panel" onSubmit={(event) => void handleAdjustment(event)}>
            <div className="yumi-form-grid yumi-form-grid--two">
              <YumiField>
                <YumiFieldLabel required>原已结算工时</YumiFieldLabel>
                <YumiSelect
                  aria-label="原已结算工时"
                  onValueChange={setAdjustmentReviewId}
                  options={adjustableReviews.map((review) => ({
                    value: review.id,
                    label: review.label
                  }))}
                  placeholder="请选择已结算工时"
                  value={adjustmentReviewId}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel required>更正核算分钟</YumiFieldLabel>
                <YumiNumberField
                  aria-label="更正核算分钟"
                  min="0"
                  onChange={(event) => setCorrectedMinutes(event.target.value)}
                  value={correctedMinutes}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel required>更正原因</YumiFieldLabel>
                <YumiTextField
                  aria-label="更正原因"
                  onChange={(event) => setAdjustmentReason(event.target.value)}
                  value={adjustmentReason}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel>更正备注</YumiFieldLabel>
                <YumiTextField
                  aria-label="更正备注"
                  onChange={(event) => setAdjustmentNote(event.target.value)}
                  value={adjustmentNote}
                />
              </YumiField>
            </div>
            <div className="yumi-form-actions">
              <YumiButton disabled={submitting !== null} type="submit" variant="secondary">
                建立来源调整
              </YumiButton>
            </div>
          </form>
        </YumiSection>
      ) : null}

      <YumiSection description="工资确认后即代表实际发放，并写入实际工资支出。" title="负责人确认">
        <form className="yumi-form-panel" onSubmit={handleSave}>
          <div className="yumi-form-grid yumi-form-grid--three">
            <YumiField>
              <YumiFieldLabel>本期实际扣款（元）</YumiFieldLabel>
              <YumiNumberField
                allowDecimal
                aria-label="本期实际扣款（元）"
                disabled={!isDraft}
                min="0"
                onChange={(event) => update({ actualDeduction: event.target.value })}
                value={draft.actualDeduction}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel>其他调整（元）</YumiFieldLabel>
              <YumiNumberField
                allowDecimal
                aria-label="其他调整（元）"
                disabled={!isDraft}
                onChange={(event) => update({ otherAdjustment: event.target.value })}
                value={draft.otherAdjustment}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel required>最终实发（元）</YumiFieldLabel>
              <YumiNumberField
                allowDecimal
                aria-label="最终实发（元）"
                disabled={!isDraft}
                min="0.01"
                onChange={(event) => update({ finalPaid: event.target.value })}
                value={draft.finalPaid}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel required>实际付款日期</YumiFieldLabel>
              <YumiDatePicker
                aria-label="实际付款日期"
                disabled={!isDraft}
                onValueChange={(paidOn) => update({ paidOn })}
                value={draft.paidOn}
              />
            </YumiField>
          </div>
          <YumiField>
            <YumiFieldLabel>负责人备注</YumiFieldLabel>
            <YumiTextArea
              aria-label="负责人备注"
              disabled={!isDraft}
              onChange={(event) => update({ managerNote: event.target.value })}
              value={draft.managerNote}
            />
          </YumiField>
          {isDraft && !confirmReady && (
            <YumiFormMessage>请填写最终实发金额并选择实际付款日期后再确认。</YumiFormMessage>
          )}
          {props.settlement.financialEntryId && (
            <YumiFormMessage>实际工资流水：{props.settlement.financialEntryId}</YumiFormMessage>
          )}
          {isDraft && (
            <div className="yumi-form-actions">
              <YumiButton disabled={submitting !== null} type="submit" variant="secondary">
                保存草稿
              </YumiButton>
              <YumiButton
                disabled={submitting !== null || !confirmReady}
                loading={submitting === 'confirm'}
                onClick={handleConfirm}
                variant="primary"
              >
                确认并记账
              </YumiButton>
            </div>
          )}
        </form>
      </YumiSection>
      <YumiConfirmDialog
        cancelLabel="继续修改"
        confirmLabel="确认记账"
        description="确认后将保存当前实发金额，并写入实际工资支出流水；如金额或日期有误，请先取消并修改草稿。"
        destructive={false}
        onConfirm={() => void executeConfirm()}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title="确认工资结算并记账？"
      />
    </div>
  )
}
