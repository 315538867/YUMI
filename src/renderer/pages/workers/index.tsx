import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { V2Worker, V2WorkerWageHistory } from '@shared/contracts/index'
import { parseYuanToCents } from '@shared/money'
import { centsToYuan, getErrorMessage, today } from '../../composables/v2-utils'
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
  YumiSheet,
  YumiStatusTag,
  YumiTextField,
  YumiNotification
} from '../../components/ui'

interface WorkersPageProps {
  workers: V2Worker[]
  createWorker(input: { name: string; note?: string | null; hourlyWageCents: number; effectiveOn: string }): Promise<V2Worker>
  listWageHistory(workerId: string): Promise<V2WorkerWageHistory[]>
  recordWageHistory(input: { workerId: string; effectiveOn: string; hourlyWageCents: number }): Promise<V2WorkerWageHistory>
}

export function WorkersPage({ workers, createWorker, listWageHistory, recordWageHistory }: WorkersPageProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedWorker, setSelectedWorker] = useState<V2Worker | null>(null)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [hourlyWage, setHourlyWage] = useState('')
  const [effectiveOn, setEffectiveOn] = useState(today())
  const [adjustingWage, setAdjustingWage] = useState(false)
  const [historyWage, setHistoryWage] = useState('')
  const [historyEffectiveOn, setHistoryEffectiveOn] = useState(today())
  const [history, setHistory] = useState<V2WorkerWageHistory[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)

  const createDirty = useMemo(
    () => Boolean(name || note || hourlyWage || effectiveOn !== today()),
    [effectiveOn, hourlyWage, name, note]
  )
  const profileDirty = adjustingWage && Boolean(historyWage || historyEffectiveOn !== today())

  useEffect(() => {
    if (!selectedWorker) {
      setHistory([])
      return
    }
    let disposed = false
    setHistoryLoading(true)
    setError(null)
    void listWageHistory(selectedWorker.id)
      .then((nextHistory) => { if (!disposed) setHistory(nextHistory) })
      .catch((cause) => { if (!disposed) setError(getErrorMessage(cause)) })
      .finally(() => { if (!disposed) setHistoryLoading(false) })
    return () => { disposed = true }
  }, [listWageHistory, selectedWorker])

  const resetCreate = () => {
    setName('')
    setNote('')
    setHourlyWage('')
    setEffectiveOn(today())
    setCreateOpen(false)
  }
  const closeProfile = () => {
    setSelectedWorker(null)
    setAdjustingWage(false)
    setHistoryWage('')
    setHistoryEffectiveOn(today())
  }
  const openProfile = (worker: V2Worker) => {
    setError(null)
    setMessage(null)
    setSelectedWorker(worker)
    setAdjustingWage(false)
    setHistoryWage('')
    setHistoryEffectiveOn(today())
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setSubmitting('create')
    try {
      const worker = await createWorker({
        name,
        note: note || null,
        hourlyWageCents: parseYuanToCents(hourlyWage),
        effectiveOn
      })
      resetCreate()
      setMessage('兼职人员已建立，并已记录首条时薪。')
      openProfile(worker)
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setSubmitting(null)
    }
  }

  const handleRecordWage = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedWorker) return
    setError(null)
    setMessage(null)
    setSubmitting('wage')
    try {
      await recordWageHistory({
        workerId: selectedWorker.id,
        effectiveOn: historyEffectiveOn,
        hourlyWageCents: parseYuanToCents(historyWage)
      })
      setHistory(await listWageHistory(selectedWorker.id))
      setHistoryWage('')
      setHistoryEffectiveOn(today())
      setAdjustingWage(false)
      setMessage('时薪历史已记录。')
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setSubmitting(null)
    }
  }

  const currentWage = history[0] ?? null

  return <div className="yumi-page yumi-workers-workspace">
    <YumiPageHeader
      actions={<YumiButton onClick={() => { setError(null); setMessage(null); setCreateOpen(true) }} variant="primary">新增人员</YumiButton>}
      description="人员与时薪分开维护：时薪变动按负责人填写的生效日期保留历史，不回写既有工资结算。"
      title="兼职人员"
    />
    {error && <YumiNotification key={error} message={error} />}
    {message && <YumiNotification key={message} message={message} tone="success" />}

    <div aria-label="兼职人员列表" className="yumi-primary-list">
      {workers.length === 0 ? <YumiEmptyState description="从右上角新增首位兼职人员，并同时记录其初始时薪。" scenario="first-use" title="还没有兼职人员" /> : <YumiBusinessList>
        {workers.map((worker) => <YumiBusinessListItem
          key={worker.id}
          onOpen={() => openProfile(worker)}
          status={<YumiStatusTag tone={worker.enabled ? 'success' : 'neutral'}>{worker.enabled ? '启用' : '停用'}</YumiStatusTag>}
          summary={worker.note || '暂无备注'}
          title={worker.name}
        />)}
      </YumiBusinessList>}
    </div>

    <YumiSheet
      description="建立人员时同时记录第一条时薪；后续调整将在人员资料中完成。"
      dirty={createDirty}
      footer={<><YumiButton onClick={resetCreate} variant="ghost">取消</YumiButton><YumiButton form="worker-create-form" loading={submitting === 'create'} type="submit" variant="primary">创建人员</YumiButton></>}
      onOpenChange={(open) => { if (!open) resetCreate() }}
      open={createOpen}
      title="新增兼职人员"
    >
      <form className="yumi-form-panel yumi-sheet-form" id="worker-create-form" onSubmit={handleCreate}>
        <div className="yumi-form-grid yumi-form-grid--two">
          <YumiField><YumiFieldLabel htmlFor="worker-name" required>姓名</YumiFieldLabel><YumiTextField id="worker-name" onChange={(event) => setName(event.target.value)} placeholder="例如：小林" required value={name} /></YumiField>
          <YumiField><YumiFieldLabel htmlFor="worker-hourly-wage" required>首个时薪（元）</YumiFieldLabel><YumiNumberField allowDecimal id="worker-hourly-wage" onChange={(event) => setHourlyWage(event.target.value)} required value={hourlyWage} /></YumiField>
          <YumiField><YumiFieldLabel required>生效日期</YumiFieldLabel><YumiDatePicker aria-label="首个时薪生效日期" onValueChange={setEffectiveOn} value={effectiveOn} /></YumiField>
          <YumiField><YumiFieldLabel htmlFor="worker-note">备注</YumiFieldLabel><YumiTextField id="worker-note" onChange={(event) => setNote(event.target.value)} value={note} /></YumiField>
        </div>
        {error && <YumiNotification key={error} message={error} />}
      </form>
    </YumiSheet>

    <YumiSheet
      description={selectedWorker ? '查看当前时薪与变动记录；调整仅影响生效日期之后的新结算。' : undefined}
      dirty={profileDirty}
      footer={<YumiButton onClick={closeProfile} variant="ghost">关闭</YumiButton>}
      onOpenChange={(open) => { if (!open) closeProfile() }}
      open={Boolean(selectedWorker)}
      title={selectedWorker ? `人员资料：${selectedWorker.name}` : '人员资料'}
    >
      {selectedWorker ? <div className="yumi-profile-sheet">
        <div className="yumi-profile-sheet__summary">
          <div><span>当前时薪</span><strong>{currentWage ? `${centsToYuan(currentWage.hourlyWageCents)} 元 / 小时` : '暂未记录'}</strong></div>
          <YumiStatusTag tone={selectedWorker.enabled ? 'success' : 'neutral'}>{selectedWorker.enabled ? '启用' : '停用'}</YumiStatusTag>
        </div>
        <div className="yumi-profile-sheet__section-head"><div><h3>时薪历史</h3><p>按生效日期保存，既有工资结算不会被修改。</p></div><YumiButton onClick={() => setAdjustingWage((value) => !value)} variant="secondary">{adjustingWage ? '取消调整' : '调整时薪'}</YumiButton></div>
        {adjustingWage ? <form className="yumi-form-panel" onSubmit={handleRecordWage}>
          <div className="yumi-form-grid yumi-form-grid--two">
            <YumiField><YumiFieldLabel htmlFor="worker-history-wage" required>新时薪（元）</YumiFieldLabel><YumiNumberField allowDecimal id="worker-history-wage" onChange={(event) => setHistoryWage(event.target.value)} required value={historyWage} /></YumiField>
            <YumiField><YumiFieldLabel required>生效日期</YumiFieldLabel><YumiDatePicker aria-label="时薪生效日期" onValueChange={setHistoryEffectiveOn} value={historyEffectiveOn} /></YumiField>
          </div>
          <div className="yumi-form-actions"><YumiButton loading={submitting === 'wage'} type="submit" variant="primary">保存时薪调整</YumiButton></div>
        </form> : null}
        {historyLoading ? <p className="yumi-form-hint">正在加载时薪历史…</p> : history.length === 0 ? <p className="yumi-form-hint">暂无已记录时薪。</p> : <div className="yumi-history-list">{history.map((item) => <p key={item.id}>{item.effectiveOn} · {centsToYuan(item.hourlyWageCents)} / 小时</p>)}</div>}
      </div> : null}
    </YumiSheet>
  </div>
}
