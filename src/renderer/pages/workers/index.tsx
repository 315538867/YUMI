import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { V2Worker, V2WorkerWageHistory } from '@shared/contracts/index'
import { parseYuanToCents } from '@shared/money'
import { centsToYuan, getErrorMessage, today } from '../../composables/v2-utils'
import {
  YumiButton,
  YumiDataTable,
  YumiDatePicker,
  YumiDetailList,
  YumiEmptyState,
  YumiField,
  YumiFieldLabel,
  YumiFormSection,
  YumiListSurface,
  YumiListToolbar,
  YumiNumberField,
  YumiSection,
  YumiSelect,
  YumiSheet,
  YumiStatusTag,
  YumiTextField,
  useYumiNotificationMessage
} from '../../components/ui'

interface WorkersPageProps {
  workers: V2Worker[]
  createWorker(input: {
    name: string
    note?: string | null
    hourlyWageCents: number
    effectiveOn: string
  }): Promise<V2Worker>
  listWageHistory(workerId: string): Promise<V2WorkerWageHistory[]>
  recordWageHistory(input: {
    workerId: string
    effectiveOn: string
    hourlyWageCents: number
  }): Promise<V2WorkerWageHistory>
}

export function WorkersPage({
  workers,
  createWorker,
  listWageHistory,
  recordWageHistory
}: WorkersPageProps) {
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
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [submitting, setSubmitting] = useState<string | null>(null)
  useYumiNotificationMessage(error)
  useYumiNotificationMessage(message, { tone: 'success' })

  const createDirty = useMemo(
    () => Boolean(name || note || hourlyWage || effectiveOn !== today()),
    [effectiveOn, hourlyWage, name, note]
  )
  const profileDirty = adjustingWage && Boolean(historyWage || historyEffectiveOn !== today())
  const visibleWorkers = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase()
    return workers.filter((worker) => {
      const matchesStatus =
        statusFilter === 'all' || (statusFilter === 'enabled' ? worker.enabled : !worker.enabled)
      const matchesQuery =
        !query ||
        [worker.name, worker.note].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)
      return matchesStatus && matchesQuery
    })
  }, [searchQuery, statusFilter, workers])

  useEffect(() => {
    if (!selectedWorker) {
      setHistory([])
      return
    }
    let disposed = false
    setHistoryLoading(true)
    setError(null)
    void listWageHistory(selectedWorker.id)
      .then((nextHistory) => {
        if (!disposed) setHistory(nextHistory)
      })
      .catch((cause) => {
        if (!disposed) setError(getErrorMessage(cause))
      })
      .finally(() => {
        if (!disposed) setHistoryLoading(false)
      })
    return () => {
      disposed = true
    }
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
  const pageDescription =
    '人员与时薪分开维护：时薪变动按负责人填写的生效日期保留历史，不回写既有工资结算。'
  const openCreate = () => {
    setError(null)
    setMessage(null)
    setCreateOpen(true)
  }
  const createAction = (
    <YumiButton onClick={openCreate} variant="primary">
      新增人员
    </YumiButton>
  )
  const workerList = (
    <YumiListSurface ariaLabel={`兼职人员列表，共 ${visibleWorkers.length} 位`}>
      <YumiListToolbar
        ariaLabel="兼职人员列表工具"
        countLabel={`共 ${visibleWorkers.length} 位人员`}
        filters={
          <YumiSelect
            aria-label="人员状态筛选"
            onValueChange={(value) => setStatusFilter(value as 'all' | 'enabled' | 'disabled')}
            options={[
              { label: '全部状态', value: 'all' },
              { label: '已启用', value: 'enabled' },
              { label: '已停用', value: 'disabled' }
            ]}
            value={statusFilter}
          />
        }
        search={
          <YumiTextField
            aria-label="搜索兼职人员"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索姓名或备注"
            value={searchQuery}
          />
        }
      />
      {workers.length === 0 ? (
        <YumiEmptyState
          description="从右上角新增首位兼职人员，并同时记录其初始时薪。"
          scenario="first-use"
          title="还没有兼职人员"
        />
      ) : visibleWorkers.length ? (
        <YumiDataTable
          ariaLabel="兼职人员列表"
          columns={[
            {
              key: 'worker',
              label: '人员 / 备注',
              render: (worker) => (
                <div className="yumi-list-cell">
                  <strong>{worker.name}</strong>
                  <span>{worker.note || '暂无备注'}</span>
                </div>
              )
            },
            {
              key: 'status',
              label: '状态',
              render: (worker) => (
                <YumiStatusTag tone={worker.enabled ? 'success' : 'neutral'}>
                  {worker.enabled ? '启用' : '停用'}
                </YumiStatusTag>
              )
            },
            {
              key: 'createdAt',
              label: '建立日期',
              render: (worker) => worker.createdAt.slice(0, 10)
            },
            {
              align: 'right',
              key: 'actions',
              label: '操作',
              render: (worker) => (
                <YumiButton
                  aria-label={`查看人员资料：${worker.name}`}
                  onClick={() => openProfile(worker)}
                  variant="ghost"
                >
                  查看详情
                </YumiButton>
              )
            }
          ]}
          getRowKey={(worker) => worker.id}
          rows={visibleWorkers}
        />
      ) : (
        <YumiEmptyState
          description="请调整搜索内容或状态筛选后重试。"
          title="没有符合筛选条件的人员。"
        />
      )}
    </YumiListSurface>
  )

  return (
    <div className="yumi-workers-workspace">
      <YumiSection actions={createAction} description={pageDescription} title="兼职人员">
        {workerList}
      </YumiSection>

      <YumiSheet
        description="建立人员时同时记录第一条时薪；后续调整将在人员资料中完成。"
        dirty={createDirty}
        footer={
          <>
            <YumiButton onClick={resetCreate} variant="ghost">
              取消
            </YumiButton>
            <YumiButton
              form="worker-create-form"
              loading={submitting === 'create'}
              type="submit"
              variant="primary"
            >
              创建人员
            </YumiButton>
          </>
        }
        onOpenChange={(open) => {
          if (!open) resetCreate()
        }}
        open={createOpen}
        title="新增兼职人员"
      >
        <form
          className="yumi-form-panel yumi-sheet-form"
          id="worker-create-form"
          onSubmit={handleCreate}
        >
          <div className="yumi-form-grid yumi-form-grid--two">
            <YumiField>
              <YumiFieldLabel htmlFor="worker-name" required>
                姓名
              </YumiFieldLabel>
              <YumiTextField
                id="worker-name"
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：小林"
                required
                value={name}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel htmlFor="worker-hourly-wage" required>
                首个时薪（元）
              </YumiFieldLabel>
              <YumiNumberField
                allowDecimal
                id="worker-hourly-wage"
                onChange={(event) => setHourlyWage(event.target.value)}
                required
                value={hourlyWage}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel required>生效日期</YumiFieldLabel>
              <YumiDatePicker
                aria-label="首个时薪生效日期"
                onValueChange={setEffectiveOn}
                value={effectiveOn}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel htmlFor="worker-note">备注</YumiFieldLabel>
              <YumiTextField
                id="worker-note"
                onChange={(event) => setNote(event.target.value)}
                value={note}
              />
            </YumiField>
          </div>
        </form>
      </YumiSheet>

      <YumiSheet
        description={
          selectedWorker ? '查看当前时薪与变动记录；调整仅影响生效日期之后的新结算。' : undefined
        }
        dirty={profileDirty}
        footer={
          <YumiButton onClick={closeProfile} variant="ghost">
            关闭
          </YumiButton>
        }
        onOpenChange={(open) => {
          if (!open) closeProfile()
        }}
        open={Boolean(selectedWorker)}
        title={selectedWorker ? `人员资料：${selectedWorker.name}` : '人员资料'}
      >
        {selectedWorker ? (
          <>
            <YumiDetailList
              ariaLabel="兼职人员资料"
              items={[
                { label: '姓名', value: selectedWorker.name },
                {
                  label: '状态',
                  value: (
                    <YumiStatusTag tone={selectedWorker.enabled ? 'success' : 'neutral'}>
                      {selectedWorker.enabled ? '启用' : '停用'}
                    </YumiStatusTag>
                  )
                },
                { label: '备注', value: selectedWorker.note || '暂无备注' },
                {
                  label: '当前时薪',
                  value: currentWage
                    ? `${centsToYuan(currentWage.hourlyWageCents)} 元 / 小时`
                    : '暂未记录'
                }
              ]}
            />
            <YumiSection
              actions={
                <YumiButton onClick={() => setAdjustingWage((value) => !value)} variant="secondary">
                  {adjustingWage ? '取消调整' : '调整时薪'}
                </YumiButton>
              }
              description="按生效日期保存，既有工资结算不会被修改。"
              title="时薪历史"
            >
              {adjustingWage ? (
                <YumiFormSection
                  description="调整只影响生效日期之后的新结算。"
                  title="登记时薪调整"
                >
                  <form className="yumi-form-panel" onSubmit={handleRecordWage}>
                    <div className="yumi-form-grid yumi-form-grid--two">
                      <YumiField>
                        <YumiFieldLabel htmlFor="worker-history-wage" required>
                          新时薪（元）
                        </YumiFieldLabel>
                        <YumiNumberField
                          allowDecimal
                          id="worker-history-wage"
                          onChange={(event) => setHistoryWage(event.target.value)}
                          required
                          value={historyWage}
                        />
                      </YumiField>
                      <YumiField>
                        <YumiFieldLabel required>生效日期</YumiFieldLabel>
                        <YumiDatePicker
                          aria-label="时薪生效日期"
                          onValueChange={setHistoryEffectiveOn}
                          value={historyEffectiveOn}
                        />
                      </YumiField>
                    </div>
                    <div className="yumi-form-actions">
                      <YumiButton loading={submitting === 'wage'} type="submit" variant="primary">
                        保存时薪调整
                      </YumiButton>
                    </div>
                  </form>
                </YumiFormSection>
              ) : null}
              {historyLoading ? (
                <YumiEmptyState scenario="loading" title="正在加载时薪历史" />
              ) : (
                <YumiDataTable
                  ariaLabel="时薪历史记录"
                  columns={[
                    { key: 'effectiveOn', label: '生效日期', render: (item) => item.effectiveOn },
                    {
                      align: 'right',
                      key: 'hourlyWage',
                      label: '时薪（元 / 小时）',
                      render: (item) => centsToYuan(item.hourlyWageCents)
                    }
                  ]}
                  emptyText="暂无已记录时薪。"
                  getRowKey={(item) => item.id}
                  rows={history}
                />
              )}
            </YumiSection>
          </>
        ) : null}
      </YumiSheet>
    </div>
  )
}
