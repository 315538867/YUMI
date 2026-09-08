import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { V2Worker, V2WorkerWageHistory } from '@shared/contracts/index'
import { centsToYuan, getErrorMessage, today, yuanToCents } from '../../composables/v2-utils'
import {
  YumiBusinessList,
  YumiBusinessListItem,
  YumiButton,
  YumiDatePicker,
  YumiEmptyState,
  YumiField,
  YumiFieldLabel,
  YumiNumberField,
  YumiPageHeader,
  YumiSearchSelect,
  YumiSection,
  YumiStatusTag,
  YumiTextField
} from '../../components/ui'

interface WorkersPageProps {
  workers: V2Worker[]
  createWorker(input: { name: string; note?: string | null; hourlyWageCents: number; effectiveOn: string }): Promise<V2Worker>
  listWageHistory(workerId: string): Promise<V2WorkerWageHistory[]>
  recordWageHistory(input: { workerId: string; effectiveOn: string; hourlyWageCents: number }): Promise<V2WorkerWageHistory>
}

export function WorkersPage({ workers, createWorker, listWageHistory, recordWageHistory }: WorkersPageProps) {
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [hourlyWage, setHourlyWage] = useState('')
  const [effectiveOn, setEffectiveOn] = useState(today())
  const [selectedWorkerId, setSelectedWorkerId] = useState('')
  const [historyWage, setHistoryWage] = useState('')
  const [historyEffectiveOn, setHistoryEffectiveOn] = useState(today())
  const [history, setHistory] = useState<V2WorkerWageHistory[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const workerOptions = useMemo(() => workers.map((worker) => ({ label: worker.name, searchText: worker.note ?? worker.name, value: worker.id })), [workers])
  const selectedWorker = workers.find((worker) => worker.id === selectedWorkerId) ?? null

  useEffect(() => {
    if (selectedWorkerId && workers.some((worker) => worker.id === selectedWorkerId)) return
    setSelectedWorkerId(workers[0]?.id ?? '')
  }, [workers, selectedWorkerId])

  useEffect(() => {
    if (!selectedWorkerId) { setHistory([]); return }
    void listWageHistory(selectedWorkerId).then(setHistory).catch((cause) => setError(getErrorMessage(cause)))
  }, [listWageHistory, selectedWorkerId])

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault(); setError(null); setMessage(null); setSubmitting('create')
    try {
      const worker = await createWorker({ name, note: note || null, hourlyWageCents: yuanToCents(hourlyWage), effectiveOn })
      setName(''); setNote(''); setHourlyWage(''); setSelectedWorkerId(worker.id)
      setMessage('兼职人员已建立，并已记录首条时薪。')
    } catch (cause) { setError(getErrorMessage(cause)) } finally { setSubmitting(null) }
  }

  const handleRecordWage = async (event: FormEvent) => {
    event.preventDefault(); setError(null); setMessage(null); setSubmitting('wage')
    try {
      await recordWageHistory({ workerId: selectedWorkerId, effectiveOn: historyEffectiveOn, hourlyWageCents: yuanToCents(historyWage) })
      setHistoryWage('')
      setHistory(await listWageHistory(selectedWorkerId))
      setMessage('时薪历史已记录。')
    } catch (cause) { setError(getErrorMessage(cause)) } finally { setSubmitting(null) }
  }

  return <div className="yumi-page yumi-workers-workspace">
    <YumiPageHeader description="新增兼职人员时记录首个时薪；后续时薪变动按负责人填写的生效日期保留历史，不回写既有结算。" title="兼职人员" />
    {error && <p className="yumi-feedback yumi-feedback--danger" role="alert">{error}</p>}
    {message && <p className="yumi-feedback yumi-feedback--success" role="status">{message}</p>}
    <div className="yumi-worker-editor-grid">
      <YumiSection description="负责人主动建立人员，并同时登记首条时薪。" title="新增兼职人员">
        <form className="yumi-form-panel" onSubmit={handleCreate}>
          <div className="yumi-form-grid yumi-form-grid--two">
            <YumiField><YumiFieldLabel htmlFor="worker-name" required>姓名</YumiFieldLabel><YumiTextField id="worker-name" onChange={(event) => setName(event.target.value)} placeholder="例如：小林" required value={name} /></YumiField>
            <YumiField><YumiFieldLabel htmlFor="worker-hourly-wage" required>首个时薪（元）</YumiFieldLabel><YumiNumberField allowDecimal id="worker-hourly-wage" onChange={(event) => setHourlyWage(event.target.value)} required value={hourlyWage} /></YumiField>
            <YumiField><YumiFieldLabel required>生效日期</YumiFieldLabel><YumiDatePicker aria-label="首个时薪生效日期" onValueChange={setEffectiveOn} value={effectiveOn} /></YumiField>
            <YumiField><YumiFieldLabel htmlFor="worker-note">备注</YumiFieldLabel><YumiTextField id="worker-note" onChange={(event) => setNote(event.target.value)} value={note} /></YumiField>
          </div>
          <div className="yumi-form-actions"><YumiButton loading={submitting === 'create'} type="submit" variant="primary">新增兼职人员</YumiButton></div>
        </form>
      </YumiSection>
      <YumiSection description="时薪历史以生效日期为准，供结算口径查询。" title="记录时薪历史">
        <form className="yumi-form-panel" onSubmit={handleRecordWage}>
          <div className="yumi-form-grid yumi-form-grid--two">
            <YumiField><YumiFieldLabel required>兼职人员</YumiFieldLabel><YumiSearchSelect aria-label="选择兼职人员" onValueChange={setSelectedWorkerId} options={workerOptions} placeholder="搜索或选择人员" value={selectedWorkerId} /></YumiField>
            <YumiField><YumiFieldLabel htmlFor="worker-history-wage" required>新时薪（元）</YumiFieldLabel><YumiNumberField allowDecimal id="worker-history-wage" onChange={(event) => setHistoryWage(event.target.value)} required value={historyWage} /></YumiField>
            <YumiField><YumiFieldLabel required>生效日期</YumiFieldLabel><YumiDatePicker aria-label="时薪历史生效日期" onValueChange={setHistoryEffectiveOn} value={historyEffectiveOn} /></YumiField>
          </div>
          <div className="yumi-form-actions"><YumiButton disabled={!selectedWorkerId} loading={submitting === 'wage'} type="submit" variant="secondary">记录时薪</YumiButton></div>
          {selectedWorker ? <div className="yumi-worker-history"><strong>{selectedWorker.name}的时薪历史</strong>{history.length === 0 ? <p>暂无已记录时薪。</p> : history.map((item) => <p key={item.id}>{item.effectiveOn} · {centsToYuan(item.hourlyWageCents)} / 小时</p>)}</div> : <p className="yumi-form-hint">请先建立或选择兼职人员。</p>}
        </form>
      </YumiSection>
    </div>
    <YumiSection description="点击人员可快速切换到其时薪历史，不会自动改动任何工资结算。" title={`已建人员 · ${workers.length} 人`}>
      {workers.length === 0 ? <YumiEmptyState description="建立首个兼职人员后，可继续维护其时薪历史。" scenario="first-use" title="还没有兼职人员" /> : <YumiBusinessList>
        {workers.map((worker) => <YumiBusinessListItem key={worker.id} onOpen={() => setSelectedWorkerId(worker.id)} status={<YumiStatusTag tone={worker.enabled ? 'success' : 'neutral'}>{worker.enabled ? '启用' : '停用'}</YumiStatusTag>} summary={worker.note || '暂无备注'} title={worker.name} />)}
      </YumiBusinessList>}
    </YumiSection>
  </div>
}
