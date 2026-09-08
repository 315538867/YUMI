import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Badge, Button, Flex, Heading, Text, TextField } from '@radix-ui/themes'
import type { V2WorkerSettlementDetail } from '@shared/contracts/index'
import { getErrorMessage, today } from '../../composables/v2-utils'
import { useSettlements } from '../../composables/use-settlements'
import { SettlementDetail } from '../../components/settlement/settlement-detail'
import { WorkersPage } from '../workers'

export function SettlementsPage() {
  const {
    workers, settlements, loading, loadError,
    createWorker, listWageHistory, recordWageHistory,
    createDraft, updateDraft, confirmSettlement
  } = useSettlements()
  const [workspace, setWorkspace] = useState<'settlements' | 'workers'>('settlements')
  const [showDraftForm, setShowDraftForm] = useState(false)
  const [workerId, setWorkerId] = useState('')
  const [periodStartOn, setPeriodStartOn] = useState(today())
  const [periodEndOn, setPeriodEndOn] = useState(today())
  const [selectedSettlementId, setSelectedSettlementId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (workerId && workers.some((worker) => worker.id === workerId)) return
    setWorkerId(workers[0]?.id ?? '')
  }, [workerId, workers])
  useEffect(() => {
    if (!selectedSettlementId || settlements.some((settlement) => settlement.id === selectedSettlementId)) return
    setSelectedSettlementId('')
  }, [selectedSettlementId, settlements])

  const workerNames = useMemo(() => new Map(workers.map((worker) => [worker.id, worker.name])), [workers])
  const selectedSettlement: V2WorkerSettlementDetail | null = settlements.find((settlement) => settlement.id === selectedSettlementId) ?? null
  const openDraftForm = () => {
    setShowDraftForm(true)
    setSelectedSettlementId('')
    setError(null)
  }
  const handleCreateDraft = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const draft = await createDraft({ workerId, periodStartOn, periodEndOn })
      setSelectedSettlementId(draft.id)
      setShowDraftForm(false)
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="settlements-workspace">
    <div className="page-heading"><div><Text size="2" color="gray">兼职工资</Text><Heading size="7">工资</Heading></div><Flex gap="3" align="center"><Button variant={workspace === 'settlements' ? 'soft' : 'ghost'} color="gray" onClick={() => setWorkspace('settlements')}>工资结算</Button><Button variant={workspace === 'workers' ? 'soft' : 'ghost'} color="gray" onClick={() => setWorkspace('workers')}>人员与时薪</Button>{workspace === 'settlements' && <Button onClick={openDraftForm}>新建结算</Button>}</Flex></div>
    {loadError && <div className="panel"><Text color="red">{loadError}</Text></div>}
    {error && <div className="panel"><Text color="red">{error}</Text></div>}
    {workspace === 'workers' ? <WorkersPage workers={workers} createWorker={createWorker} listWageHistory={listWageHistory} recordWageHistory={recordWageHistory} /> : <>
      {showDraftForm && <form className="panel editor-form" onSubmit={handleCreateDraft}>
        <Flex justify="between" align="center"><Heading size="4">新建结算草稿</Heading><Button type="button" variant="ghost" color="gray" onClick={() => setShowDraftForm(false)}>关闭</Button></Flex>
        <Text size="2" color="gray">结算日期范围可按任意周或负责人指定周期填写；两套参考工资不会自动决定最终实发。</Text>
        <label>兼职人员<select required value={workerId} onChange={(event) => setWorkerId(event.target.value)}><option value="">请选择</option>{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select></label>
        <div className="form-grid two"><label>开始日期<TextField.Root required type="date" value={periodStartOn} onChange={(event) => setPeriodStartOn(event.target.value)} /></label><label>结束日期<TextField.Root required type="date" value={periodEndOn} onChange={(event) => setPeriodEndOn(event.target.value)} /></label></div>
        <Flex justify="end"><Button type="submit" disabled={!workerId || submitting}>{submitting ? '创建中…' : '新建结算草稿'}</Button></Flex>
      </form>}
      <div className="panel settlement-list-panel"><Heading size="4">已有结算</Heading>{loading ? <div className="empty">加载工资结算中…</div> : settlements.length === 0 ? <div className="empty">尚未建立工资结算。</div> : <div className="settlement-list">{settlements.map((settlement) => <Button key={settlement.id} variant={settlement.id === selectedSettlementId ? 'soft' : 'ghost'} color="gray" className="settlement-list-item" onClick={() => { setSelectedSettlementId(settlement.id); setShowDraftForm(false) }}><span>{workerNames.get(settlement.workerId) ?? settlement.workerId}</span><span>{settlement.periodStartOn} 至 {settlement.periodEndOn}</span><Badge color={settlement.status === 'draft' ? 'orange' : 'green'}>{settlement.status === 'draft' ? '草稿' : '已确认'}</Badge></Button>)}</div>}</div>
      {selectedSettlement && <SettlementDetail settlement={selectedSettlement} workerName={workerNames.get(selectedSettlement.workerId) ?? selectedSettlement.workerId} updateDraft={updateDraft} confirmSettlement={confirmSettlement} />}
    </>}
  </div>
}
