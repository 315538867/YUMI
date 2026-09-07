import { useEffect, useState, type FormEvent } from 'react'
import { Badge, Button, Flex, Heading, Text, TextField } from '@radix-ui/themes'
import type { V2Worker, V2WorkerWageHistory } from '@shared/contracts'
import { centsToYuan, getErrorMessage, today, yuanToCents } from '../../composables/v2-utils'

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
      const worker = await createWorker({
        name, note, hourlyWageCents: yuanToCents(hourlyWage), effectiveOn
      })
      setName(''); setNote(''); setHourlyWage(''); setSelectedWorkerId(worker.id)
      setMessage('兼职人员已建立，并已记录首条时薪。')
    } catch (cause) { setError(getErrorMessage(cause)) } finally { setSubmitting(null) }
  }

  const handleRecordWage = async (event: FormEvent) => {
    event.preventDefault(); setError(null); setMessage(null); setSubmitting('wage')
    try {
      await recordWageHistory({
        workerId: selectedWorkerId, effectiveOn: historyEffectiveOn, hourlyWageCents: yuanToCents(historyWage)
      })
      setHistoryWage('')
      setHistory(await listWageHistory(selectedWorkerId))
      setMessage('时薪历史已记录。')
    } catch (cause) { setError(getErrorMessage(cause)) } finally { setSubmitting(null) }
  }

  return <section className="workers-workspace">
    <div className="page-heading"><div><Text size="2" color="gray">工资基础资料</Text><Heading size="6">兼职人员</Heading></div><Badge color="blue">{workers.length} 人</Badge></div>
    {error && <div className="panel"><Text color="red">{error}</Text></div>}
    {message && <div className="panel"><Text color="green">{message}</Text></div>}
    <div className="two-column">
      <form className="panel editor-form" onSubmit={handleCreate}>
        <Heading size="4">新增兼职人员</Heading>
        <label>姓名<TextField.Root required value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：小林" /></label>
        <label>首个时薪（元）<TextField.Root required type="number" min="0.01" step="0.01" value={hourlyWage} onChange={(event) => setHourlyWage(event.target.value)} /></label>
        <label>生效日期<TextField.Root required type="date" value={effectiveOn} onChange={(event) => setEffectiveOn(event.target.value)} /></label>
        <label>备注<TextField.Root value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <Flex justify="end"><Button type="submit" disabled={submitting === 'create'}>新增兼职人员</Button></Flex>
      </form>
      <form className="panel editor-form" onSubmit={handleRecordWage}>
        <Heading size="4">时薪历史</Heading>
        <label>兼职人员<select required value={selectedWorkerId} onChange={(event) => setSelectedWorkerId(event.target.value)}><option value="">请选择</option>{workers.map((worker) => <option value={worker.id} key={worker.id}>{worker.name}</option>)}</select></label>
        <label>新时薪（元）<TextField.Root required type="number" min="0.01" step="0.01" value={historyWage} onChange={(event) => setHistoryWage(event.target.value)} /></label>
        <label>生效日期<TextField.Root required type="date" value={historyEffectiveOn} onChange={(event) => setHistoryEffectiveOn(event.target.value)} /></label>
        <Flex justify="end"><Button type="submit" disabled={!selectedWorkerId || submitting === 'wage'}>记录时薪</Button></Flex>
        {history.length === 0 ? <Text size="2" color="gray">选择人员后显示时薪历史。</Text> : <div className="settlement-source-list">{history.map((item) => <Text size="2" key={item.id}>{item.effectiveOn} · {centsToYuan(item.hourlyWageCents)} / 小时</Text>)}</div>}
      </form>
    </div>
    <div className="worker-list">{workers.map((worker) => <article className="panel" key={worker.id}><Flex justify="between"><div><Heading size="4">{worker.name}</Heading>{worker.note && <Text size="2" color="gray">{worker.note}</Text>}</div><Badge color={worker.enabled ? 'green' : 'gray'}>{worker.enabled ? '启用' : '停用'}</Badge></Flex></article>)}</div>
  </section>
}
