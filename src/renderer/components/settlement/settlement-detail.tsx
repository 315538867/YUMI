import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type {
  V2WorkerSettlementDetail,
  V2WorkerSettlementDraftUpdateInput
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
  YumiStatusTag,
  YumiTextArea,
  YumiTextField,
  useYumiNotificationMessage,
  YumiConfirmDialog
} from '../ui'

interface SettlementDetailProps {
  settlement: V2WorkerSettlementDetail
  workerName: string
  updateDraft(
    id: string,
    input: V2WorkerSettlementDraftUpdateInput
  ): Promise<V2WorkerSettlementDetail>
  confirmSettlement(id: string): Promise<V2WorkerSettlementDetail>
}

interface DetailDraft {
  attendanceMinutes: string
  attendanceNote: string
  actualDeduction: string
  otherAdjustment: string
  finalPaid: string
  paidOn: string
  managerNote: string
}

function createDraft(settlement: V2WorkerSettlementDetail): DetailDraft {
  return {
    attendanceMinutes:
      settlement.attendanceMinutes === null ? '' : String(settlement.attendanceMinutes),
    attendanceNote: settlement.attendanceNote ?? '',
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
  }, [props.settlement])

  const update = (patch: Partial<DetailDraft>) => setDraft((current) => ({ ...current, ...patch }))
  const buildUpdate = (): V2WorkerSettlementDraftUpdateInput => ({
    attendanceMinutes: draft.attendanceMinutes.trim()
      ? Math.round(Number(draft.attendanceMinutes))
      : null,
    attendanceNote: draft.attendanceNote,
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

  const isDraft = props.settlement.status === 'draft'
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
            {
              label: '排班口径',
              value: `${props.settlement.scheduledMinutes} 分钟 · ${formatCents(props.settlement.scheduledReferenceWageCents)}`
            },
            {
              label: '考勤口径',
              value: `${props.settlement.attendanceMinutes ?? '未填'} 分钟 · ${formatCents(props.settlement.attendanceReferenceWageCents)}`
            },
            {
              label: '合格提成 / 实际扣款',
              value: `${formatCents(props.settlement.qualifiedCommissionCents)} · 扣 ${formatCents(props.settlement.actualDeductionCents)}`
            },
            {
              label: '本期后续顺延',
              value: `${formatCents(props.settlement.continuingCarryoverCents)} · 其他调整 ${formatCents(props.settlement.otherAdjustmentCents)}`
            }
          ]}
        />
      </YumiRecordSummary>

      <div className="yumi-settlement-sources">
        <YumiSection title="任务来源">
          <YumiDataTable
            ariaLabel="任务来源记录"
            columns={[
              {
                key: 'summary',
                label: '任务记录',
                render: (task) =>
                  `任务 ${task.processTaskId} · 排班 ${task.scheduledMinutes} 分钟 · 合格 ${task.qualifiedQuantity} 件 · 提成 ${formatCents(task.qualifiedCommissionCents)}`
              }
            ]}
            emptyText="本期无已完成任务。"
            getRowKey={(task) => task.id}
            rows={props.settlement.tasks}
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
                  `${deduction.occurredOn} · ${deduction.processType === 'making' ? '制作' : '捏毛装袋'} 不合格 ${deduction.unqualifiedQuantity} 件 · 扣款 ${formatCents(deduction.totalDeductionCents)} · 本期抵扣 ${formatCents(allocationByDeductionId.get(deduction.id) ?? 0)}`
              }
            ]}
            emptyText="本期无不合格扣款。"
            getRowKey={(deduction) => deduction.id}
            rows={props.settlement.deductions}
          />
        </YumiSection>
      </div>

      <YumiSection description="工资确认后即代表实际发放，并写入实际工资支出。" title="负责人确认">
        <form className="yumi-form-panel" onSubmit={handleSave}>
          <div className="yumi-form-grid yumi-form-grid--three">
            <YumiField>
              <YumiFieldLabel>考勤总分钟</YumiFieldLabel>
              <YumiNumberField
                aria-label="考勤总分钟"
                disabled={!isDraft}
                min="0"
                onChange={(event) => update({ attendanceMinutes: event.target.value })}
                value={draft.attendanceMinutes}
              />
            </YumiField>
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
            <YumiField>
              <YumiFieldLabel>考勤备注</YumiFieldLabel>
              <YumiTextField
                aria-label="考勤备注"
                disabled={!isDraft}
                onChange={(event) => update({ attendanceNote: event.target.value })}
                value={draft.attendanceNote}
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
