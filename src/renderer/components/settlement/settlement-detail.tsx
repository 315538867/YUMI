import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Badge, Button, Flex, Heading, Text, TextArea, TextField } from '@radix-ui/themes'
import type { V2WorkerSettlementDetail, V2WorkerSettlementDraftUpdateInput } from '@shared/contracts/index'
import { centsToYuan, formatCents, getErrorMessage, yuanToCents } from '../../composables/v2-utils'

interface SettlementDetailProps {
  settlement: V2WorkerSettlementDetail
  workerName: string
  updateDraft(id: string, input: V2WorkerSettlementDraftUpdateInput): Promise<V2WorkerSettlementDetail>
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
    attendanceMinutes: settlement.attendanceMinutes === null ? '' : String(settlement.attendanceMinutes),
    attendanceNote: settlement.attendanceNote ?? '', actualDeduction: centsToYuan(settlement.actualDeductionCents),
    otherAdjustment: centsToYuan(settlement.otherAdjustmentCents), finalPaid: settlement.finalPaidAmountCents === null ? '' : centsToYuan(settlement.finalPaidAmountCents),
    paidOn: settlement.paidOn ?? '', managerNote: settlement.managerNote ?? ''
  }
}

export function SettlementDetail(props: SettlementDetailProps) {
  const [draft, setDraft] = useState(() => createDraft(props.settlement))
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const allocationByDeductionId = useMemo(() => new Map(props.settlement.deductionAllocations.map((item) => [item.deductionRecordId, item.allocatedCents])), [props.settlement.deductionAllocations])

  useEffect(() => { setDraft(createDraft(props.settlement)); setError(null); setMessage(null) }, [props.settlement])

  const update = (patch: Partial<DetailDraft>) => setDraft((current) => ({ ...current, ...patch }))
  const buildUpdate = (): V2WorkerSettlementDraftUpdateInput => ({
    attendanceMinutes: draft.attendanceMinutes.trim() ? Math.round(Number(draft.attendanceMinutes)) : null,
    attendanceNote: draft.attendanceNote,
    actualDeductionCents: yuanToCents(draft.actualDeduction),
    otherAdjustmentCents: yuanToCents(draft.otherAdjustment),
    finalPaidAmountCents: draft.finalPaid.trim() ? yuanToCents(draft.finalPaid) : null,
    paidOn: draft.paidOn || null,
    managerNote: draft.managerNote
  })

  const handleSave = async (event: FormEvent) => {
    event.preventDefault(); setError(null); setMessage(null); setSubmitting('save')
    try { await props.updateDraft(props.settlement.id, buildUpdate()); setMessage('结算草稿已更新。') } catch (cause) { setError(getErrorMessage(cause)) } finally { setSubmitting(null) }
  }

  const handleConfirm = async () => {
    setError(null); setMessage(null); setSubmitting('confirm')
    try {
      await props.updateDraft(props.settlement.id, buildUpdate())
      await props.confirmSettlement(props.settlement.id)
      setMessage('工资结算已确认并写入实际工资支出。')
    } catch (cause) { setError(getErrorMessage(cause)) } finally { setSubmitting(null) }
  }

  const isDraft = props.settlement.status === 'draft'
  return <section className="settlement-detail panel">
    <Flex justify="between" align="start"><div><Text size="2" color="gray">{props.workerName} · {props.settlement.periodStartOn} 至 {props.settlement.periodEndOn}</Text><Heading size="5">工资结算明细</Heading></div><Badge color={isDraft ? 'orange' : 'green'}>{isDraft ? '草稿' : '已确认'}</Badge></Flex>
    {error && <Text color="red">{error}</Text>}{message && <Text color="green">{message}</Text>}
    <div className="settlement-reference-grid">
      <article><Text size="2" color="gray">排班口径</Text><Heading size="5">{props.settlement.scheduledMinutes} 分钟</Heading><Text>{formatCents(props.settlement.scheduledReferenceWageCents)}</Text></article>
      <article><Text size="2" color="gray">考勤口径</Text><Heading size="5">{props.settlement.attendanceMinutes ?? '未填'} 分钟</Heading><Text>{formatCents(props.settlement.attendanceReferenceWageCents)}</Text></article>
      <article><Text size="2" color="gray">合格提成 / 实际扣款</Text><Heading size="5">{formatCents(props.settlement.qualifiedCommissionCents)}</Heading><Text>扣 {formatCents(props.settlement.actualDeductionCents)}</Text></article>
      <article><Text size="2" color="gray">本期后续顺延</Text><Heading size="5">{formatCents(props.settlement.continuingCarryoverCents)}</Heading><Text>其他调整 {formatCents(props.settlement.otherAdjustmentCents)}</Text></article>
    </div>
    <div className="two-column settlement-sources">
      <div><Heading size="4">任务来源</Heading><div className="settlement-source-list">{props.settlement.tasks.map((task) => <Text size="2" key={task.id}>任务 {task.processTaskId} · 排班 {task.scheduledMinutes} 分钟 · 合格 {task.qualifiedQuantity} 件 · 提成 {formatCents(task.qualifiedCommissionCents)}</Text>)}</div></div>
      <div><Heading size="4">扣款来源</Heading><div className="settlement-source-list">{props.settlement.deductions.length === 0 ? <Text size="2" color="gray">本期无不合格扣款。</Text> : props.settlement.deductions.map((deduction) => <Text size="2" key={deduction.id}>{deduction.occurredOn} · {deduction.processType === 'making' ? '制作' : '捏毛装袋'} 不合格 {deduction.unqualifiedQuantity} 件 · 扣款 {formatCents(deduction.totalDeductionCents)} · 本期抵扣 {formatCents(allocationByDeductionId.get(deduction.id) ?? 0)}</Text>)}</div></div>
    </div>
    <form className="editor-form settlement-editor" onSubmit={handleSave}>
      <Heading size="4">负责人确认</Heading>
      <div className="form-grid three">
        <label>考勤总分钟<TextField.Root disabled={!isDraft} type="number" min="0" value={draft.attendanceMinutes} onChange={(event) => update({ attendanceMinutes: event.target.value })} /></label>
        <label>本期实际扣款（元）<TextField.Root disabled={!isDraft} type="number" min="0" step="0.01" value={draft.actualDeduction} onChange={(event) => update({ actualDeduction: event.target.value })} /></label>
        <label>其他调整（元）<TextField.Root disabled={!isDraft} type="number" step="0.01" value={draft.otherAdjustment} onChange={(event) => update({ otherAdjustment: event.target.value })} /></label>
        <label>最终实发（元）<TextField.Root disabled={!isDraft} type="number" min="0" step="0.01" value={draft.finalPaid} onChange={(event) => update({ finalPaid: event.target.value })} /></label>
        <label>实际付款日期<TextField.Root disabled={!isDraft} type="date" value={draft.paidOn} onChange={(event) => update({ paidOn: event.target.value })} /></label>
        <label>考勤备注<TextField.Root disabled={!isDraft} value={draft.attendanceNote} onChange={(event) => update({ attendanceNote: event.target.value })} /></label>
      </div>
      <label>负责人备注<TextArea disabled={!isDraft} value={draft.managerNote} onChange={(event) => update({ managerNote: event.target.value })} /></label>
      {props.settlement.financialEntryId && <Text size="2" color="gray">实际工资流水：{props.settlement.financialEntryId}</Text>}
      {isDraft && <Flex gap="2" justify="end"><Button type="submit" variant="soft" disabled={submitting !== null}>保存草稿</Button><Button type="button" color="green" onClick={() => void handleConfirm()} disabled={submitting !== null}>确认并记账</Button></Flex>}
    </form>
  </section>
}
