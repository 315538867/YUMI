import { useEffect, useState, type FormEvent } from 'react'
import type {
  V2AdvancePayer,
  V2BackupSummary,
  V2FinanceCategory,
  V2StudioSettings
} from '@shared/contracts/index'
import { formatGluePriceYuanPerGram, parseGluePriceYuanPerGram } from '@shared/money'
import { getErrorMessage } from '../../composables/v2-utils'
import { useBackups } from '../../composables/use-backups'
import { useFinance } from '../../composables/use-finance'
import { useStudioSettings } from '../../composables/use-studio-settings'
import {
  YumiBusinessList,
  YumiBusinessListItem,
  YumiButton,
  YumiConfirmDialog,
  YumiDialog,
  YumiEmptyState,
  YumiField,
  YumiFieldLabel,
  YumiNumberField,
  YumiPageHeader,
  YumiSelect,
  YumiStatusTag,
  YumiSheet,
  YumiTextArea,
  YumiTextField,
  useYumiNotificationMessage
} from '../../components/ui'

type CategoryEditor = { direction: 'income' | 'expense'; item?: V2FinanceCategory } | null
type PayerEditor = V2AdvancePayer | 'create' | null
type PendingDelete = { id: string; kind: 'category' | 'payer'; name: string } | null
type SettingsView = 'studio' | 'finance' | 'protection'
type LibraryView = 'income' | 'expense' | 'payer'

const settingsCopy: Record<SettingsView, { title: string; description: string }> = {
  studio: {
    title: '工作室参数',
    description: '维护全工作室统一使用的参数；商品只记录自身实际胶水用量。'
  },
  finance: {
    title: '财务资料',
    description: '维护财务登记可选择的资料；已被流水引用的资料不能删除，可改名或停用。'
  },
  protection: {
    title: '数据保护',
    description: '完整备份包含工作室数据和附件；恢复前会自动建立当前数据的安全备份。'
  }
}

export function SettingsPage() {
  const finance = useFinance()
  const studio = useStudioSettings()
  const [view, setView] = useState<SettingsView>('studio')
  const [libraryView, setLibraryView] = useState<LibraryView>('income')
  const [categoryEditor, setCategoryEditor] = useState<CategoryEditor>(null)
  const [studioEditorOpen, setStudioEditorOpen] = useState(false)
  const [payerEditor, setPayerEditor] = useState<PayerEditor>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)
  useYumiNotificationMessage(finance.loadError)
  useYumiNotificationMessage(studio.loadError)
  useYumiNotificationMessage(error)
  useYumiNotificationMessage(message, { tone: 'success' })

  const run = async (key: string, action: () => Promise<unknown>) => {
    setError(null)
    setMessage(null)
    setSubmitting(key)
    try {
      await action()
      return true
    } catch (cause) {
      setError(getErrorMessage(cause))
      return false
    } finally {
      setSubmitting(null)
    }
  }
  const saveCategory = async (input: { name: string; enabled: boolean }) => {
    if (!categoryEditor) return
    const success = categoryEditor.item
      ? await run(`category-${categoryEditor.item.id}`, () =>
          finance.updateCategory(categoryEditor.item!.id, input)
        )
      : await run(`category-create-${categoryEditor.direction}`, () =>
          finance.createCategory({ direction: categoryEditor.direction, name: input.name })
        )
    if (success) setCategoryEditor(null)
  }
  const savePayer = async (input: { name: string; note: string | null; enabled: boolean }) => {
    if (!payerEditor) return
    const success =
      payerEditor === 'create'
        ? await run('payer-create', () =>
            finance.createAdvancePayer({ name: input.name, note: input.note })
          )
        : await run(`payer-${payerEditor.id}`, () =>
            finance.updateAdvancePayer(payerEditor.id, input)
          )
    if (success) setPayerEditor(null)
  }
  const confirmDelete = async () => {
    if (!pendingDelete) return
    const success =
      pendingDelete.kind === 'category'
        ? await run(`category-delete-${pendingDelete.id}`, () =>
            finance.deleteCategory(pendingDelete.id)
          )
        : await run(`payer-delete-${pendingDelete.id}`, () =>
            finance.deleteAdvancePayer(pendingDelete.id)
          )
    if (success) setPendingDelete(null)
  }

  const incomeCategories = finance.categories.filter((item) => item.direction === 'income')
  const expenseCategories = finance.categories.filter((item) => item.direction === 'expense')
  const activeCategoryDirection = libraryView === 'expense' ? 'expense' : 'income'
  const activeCategories =
    activeCategoryDirection === 'income' ? incomeCategories : expenseCategories
  const activeCategoryLabel = activeCategoryDirection === 'income' ? '收入类目' : '支出类目'
  const openCreate = () => {
    if (libraryView === 'payer') setPayerEditor('create')
    else setCategoryEditor({ direction: activeCategoryDirection })
  }

  const headerActions =
    view === 'finance' ? (
      <YumiButton onClick={openCreate} variant="primary">
        {libraryView === 'payer' ? '新增垫付人' : `新增${activeCategoryLabel}`}
      </YumiButton>
    ) : view === 'studio' ? (
      <YumiButton onClick={() => setStudioEditorOpen(true)} variant="primary">
        编辑工作室参数
      </YumiButton>
    ) : undefined

  return (
    <div className="yumi-page yumi-settings-workspace">
      <YumiPageHeader
        actions={headerActions}
        description={settingsCopy[view].description}
        title={settingsCopy[view].title}
      />
      <nav aria-label="设置区域" className="yumi-page-tabs">
        <YumiButton
          aria-pressed={view === 'studio'}
          onClick={() => {
            setError(null)
            setView('studio')
          }}
          variant={view === 'studio' ? 'primary' : 'secondary'}
        >
          工作室参数
        </YumiButton>
        <YumiButton
          aria-pressed={view === 'finance'}
          onClick={() => {
            setError(null)
            setView('finance')
          }}
          variant={view === 'finance' ? 'primary' : 'secondary'}
        >
          财务资料
        </YumiButton>
        <YumiButton
          aria-pressed={view === 'protection'}
          onClick={() => {
            setError(null)
            setView('protection')
          }}
          variant={view === 'protection' ? 'primary' : 'secondary'}
        >
          数据保护
        </YumiButton>
      </nav>
      {view === 'studio' && (
        <StudioSettingsPanel loading={studio.loading} settings={studio.settings} />
      )}

      <YumiSheet
        description="修改后只影响后续新建订单，历史订单保留创建时的快照。"
        footer={
          <YumiButton
            form="studio-settings-editor-form"
            loading={submitting === 'studio-settings'}
            type="submit"
            variant="primary"
          >
            保存工作室参数
          </YumiButton>
        }
        onOpenChange={setStudioEditorOpen}
        open={studioEditorOpen}
        title="编辑工作室参数"
      >
        <StudioSettingsForm
          key={studio.settings?.updatedAt ?? 'studio-settings'}
          loading={studio.loading}
          onSave={async (input) => {
            const success = await run('studio-settings', () => studio.update(input))
            if (success) {
              setStudioEditorOpen(false)
              setMessage('已保存工作室参数')
            }
            return success
          }}
          settings={studio.settings}
        />
      </YumiSheet>

      {view === 'finance' && (
        <div className="yumi-library-workspace">
          <nav aria-label="财务资料类型" className="yumi-page-tabs">
            <YumiButton
              aria-pressed={libraryView === 'income'}
              onClick={() => {
                setError(null)
                setLibraryView('income')
              }}
              variant={libraryView === 'income' ? 'primary' : 'secondary'}
            >
              收入类目
            </YumiButton>
            <YumiButton
              aria-pressed={libraryView === 'expense'}
              onClick={() => {
                setError(null)
                setLibraryView('expense')
              }}
              variant={libraryView === 'expense' ? 'primary' : 'secondary'}
            >
              支出类目
            </YumiButton>
            <YumiButton
              aria-pressed={libraryView === 'payer'}
              onClick={() => {
                setError(null)
                setLibraryView('payer')
              }}
              variant={libraryView === 'payer' ? 'primary' : 'secondary'}
            >
              私人垫付人
            </YumiButton>
          </nav>
          {libraryView === 'payer' ? (
            <ResourceLibraryList
              emptyDescription="建立垫付人后，私人支付的支出才可在财务登记中选择对应来源。"
              emptyTitle="暂无私人垫付人"
              items={finance.advancePayers}
              loading={finance.loading}
              onDelete={(item) => setPendingDelete({ id: item.id, kind: 'payer', name: item.name })}
              onEdit={(item) => setPayerEditor(item)}
              summary={(item) => item.note || '暂无备注'}
            />
          ) : (
            <ResourceLibraryList
              emptyDescription={`建立${activeCategoryLabel}后，财务登记时才可选择对应类目。`}
              emptyTitle={`暂无${activeCategoryLabel}`}
              items={activeCategories}
              loading={finance.loading}
              onDelete={(item) =>
                setPendingDelete({ id: item.id, kind: 'category', name: item.name })
              }
              onEdit={(item) => setCategoryEditor({ direction: item.direction, item })}
              summary={(item) =>
                item.enabled ? '可在财务登记中选择' : '已停用，不再用于新的财务登记'
              }
            />
          )}
        </div>
      )}

      {view === 'protection' && <DataProtectionPanel />}

      <YumiDialog
        footer={
          <CategoryDialogFooter
            busy={submitting !== null}
            editing={Boolean(categoryEditor?.item)}
          />
        }
        onOpenChange={(open) => {
          if (!open) setCategoryEditor(null)
        }}
        open={categoryEditor !== null}
        title={
          categoryEditor?.item
            ? `编辑${categoryEditor.item.direction === 'income' ? '收入' : '支出'}类目`
            : `新增${categoryEditor?.direction === 'income' ? '收入' : '支出'}类目`
        }
      >
        {categoryEditor && (
          <CategoryEditorForm
            key={categoryEditor.item?.id ?? `new-${categoryEditor.direction}`}
            item={categoryEditor.item}
            onSubmit={saveCategory}
          />
        )}
      </YumiDialog>
      <YumiDialog
        footer={<PayerDialogFooter busy={submitting !== null} editing={payerEditor !== 'create'} />}
        onOpenChange={(open) => {
          if (!open) setPayerEditor(null)
        }}
        open={payerEditor !== null}
        title={payerEditor === 'create' ? '新增垫付人' : `编辑垫付人：${payerEditor?.name ?? ''}`}
      >
        {payerEditor && (
          <PayerEditorForm
            key={payerEditor === 'create' ? 'new-payer' : payerEditor.id}
            item={payerEditor === 'create' ? undefined : payerEditor}
            onSubmit={savePayer}
          />
        )}
      </YumiDialog>
      <YumiConfirmDialog
        confirmLabel="确认删除"
        description={
          pendingDelete
            ? `将删除“${pendingDelete.name}”。如果资料已被财务流水引用，系统会保留原有数据并拒绝删除。`
            : undefined
        }
        onConfirm={() => void confirmDelete()}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        open={pendingDelete !== null}
        title="删除基础资料？"
      />
    </div>
  )
}

function StudioSettingsPanel({
  loading,
  settings
}: {
  loading: boolean
  settings: V2StudioSettings | null
}) {
  if (loading) return <div className="yumi-empty">正在读取工作室参数…</div>
  return (
    <section className="yumi-form-panel yumi-settings-panel" aria-label="工作室参数查看">
      <div className="yumi-settings-panel__intro">
        <strong>胶水单价</strong>
        <p>
          新建订单时，系统会将当时的单价和商品胶水用量一起冻结到订单快照中；之后调整不会回写历史订单。
        </p>
        <strong>订单默认预留天数</strong>
        <p>新建订单自动带入该天数，创建订单时仍可按实际交期单独调整。</p>
      </div>
      <div className="yumi-settings-panel__value" aria-label="当前工作室参数">
        {settings ? (
          <>
            <span>{formatGluePriceYuanPerGram(settings.gluePriceMicroYuanPerGram)} 元 / 克</span>
            <span>{settings.orderReservedDays} 天</span>
          </>
        ) : (
          '暂无参数'
        )}
      </div>
      <div className="yumi-settings-panel__actions">
        <span className="yumi-form-hint">如需修改，请点击页面右上角“编辑工作室参数”。</span>
      </div>
    </section>
  )
}

function StudioSettingsForm({
  loading,
  onSave,
  settings
}: {
  loading: boolean
  onSave(input: { gluePriceMicroYuanPerGram: number; orderReservedDays: number }): Promise<boolean>
  settings: V2StudioSettings | null
}) {
  const [gluePrice, setGluePrice] = useState('0')
  const [orderReservedDays, setOrderReservedDays] = useState('2')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (settings) {
      setGluePrice(formatGluePriceYuanPerGram(settings.gluePriceMicroYuanPerGram))
      setOrderReservedDays(String(settings.orderReservedDays))
    }
  }, [settings])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    try {
      const gluePriceMicroYuanPerGram = parseGluePriceYuanPerGram(gluePrice)
      const reservedDays = Number(orderReservedDays)
      if (!Number.isInteger(reservedDays) || reservedDays < 0)
        throw new Error('订单默认预留天数必须是非负整数')
      await onSave({ gluePriceMicroYuanPerGram, orderReservedDays: reservedDays })
    } catch (cause) {
      setError(getErrorMessage(cause))
    }
  }

  if (loading) return <div className="yumi-empty">正在读取工作室参数…</div>
  return (
    <form
      className="yumi-form-panel yumi-sheet-form"
      id="studio-settings-editor-form"
      onSubmit={(event) => void submit(event)}
    >
      <YumiField error={error ?? undefined} hint="支持最多 6 位小数，例如 0.0034。">
        <YumiFieldLabel htmlFor="studio-glue-price" required>
          元 / 克
        </YumiFieldLabel>
        <YumiNumberField
          allowDecimal
          id="studio-glue-price"
          onChange={(event) => setGluePrice(event.target.value)}
          required
          value={gluePrice}
        />
      </YumiField>
      <YumiField hint="新建订单默认使用，可在订单中按实际情况修改。">
        <YumiFieldLabel htmlFor="studio-order-reserved-days" required>
          订单默认预留天数（天）
        </YumiFieldLabel>
        <YumiNumberField
          aria-label="订单默认预留天数（天）"
          id="studio-order-reserved-days"
          min="0"
          onChange={(event) => setOrderReservedDays(event.target.value)}
          required
          step="1"
          value={orderReservedDays}
        />
      </YumiField>
      <p className="yumi-form-hint">
        保存后只影响后续新建订单；已建立订单会保留当时的商品、胶水单价与预留天数快照。
      </p>
    </form>
  )
}

function DataProtectionPanel() {
  const { backups, loading, busy, error, createBackup, restoreBackup } = useBackups()
  const [restoreTarget, setRestoreTarget] = useState<V2BackupSummary | null>(null)
  useYumiNotificationMessage(error)

  const restore = async () => {
    if (!restoreTarget) return
    const target = restoreTarget
    setRestoreTarget(null)
    await restoreBackup(target.backupPath)
  }

  return (
    <div className="yumi-settings-protection">
      <div className="yumi-settings-protection__toolbar">
        <p>建议在批量导入、重大调整或版本升级前建立一份完整备份。</p>
        <YumiButton
          loading={busy}
          onClick={() => void createBackup().catch(() => undefined)}
          variant="primary"
        >
          立即备份
        </YumiButton>
      </div>
      {loading ? (
        <div className="yumi-empty">正在读取备份记录…</div>
      ) : backups.length === 0 ? (
        <YumiEmptyState
          description="首次完整备份会同时保存当前数据库和已上传附件。"
          title="还没有备份"
        />
      ) : (
        <YumiBusinessList>
          {backups.map((backup) => (
            <YumiBusinessListItem
              key={backup.id}
              meta={
                <YumiButton
                  disabled={busy}
                  onClick={(event) => {
                    event.stopPropagation()
                    setRestoreTarget(backup)
                  }}
                  variant="secondary"
                >
                  恢复
                </YumiButton>
              }
              status={
                <YumiStatusTag tone={backup.reason === 'manual' ? 'success' : 'neutral'}>
                  {backup.reason === 'manual' ? '手动备份' : '恢复前安全备份'}
                </YumiStatusTag>
              }
              summary={`${formatBackupDate(backup.createdAt)} · ${backup.attachmentCount} 个附件 · 版本 ${backup.applicationVersion}`}
              title="完整数据备份"
            />
          ))}
        </YumiBusinessList>
      )}
      <YumiConfirmDialog
        confirmLabel="恢复此备份"
        description={
          restoreTarget
            ? '恢复将覆盖当前工作室数据。系统会先创建一份当前数据的安全备份，恢复完成后应用会自动重新启动。'
            : undefined
        }
        onConfirm={() => void restore().catch(() => undefined)}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null)
        }}
        open={restoreTarget !== null}
        title="确认恢复数据？"
      />
    </div>
  )
}

function formatBackupDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  )
}

function ResourceLibraryList<T extends V2FinanceCategory | V2AdvancePayer>({
  emptyDescription,
  emptyTitle,
  items,
  loading,
  onDelete,
  summary
}: {
  emptyDescription: string
  emptyTitle: string
  items: T[]
  loading: boolean
  onDelete(item: T): void
  onEdit(item: T): void
  summary(item: T): string
}) {
  if (loading) return <div className="yumi-empty">加载中…</div>
  if (items.length === 0)
    return <YumiEmptyState description={emptyDescription} title={emptyTitle} />
  return (
    <YumiBusinessList>
      {items.map((item) => (
        <YumiBusinessListItem
          key={item.id}
          meta={
            <YumiButton
              onClick={(event) => {
                event.stopPropagation()
                onDelete(item)
              }}
              variant="ghost"
            >
              删除
            </YumiButton>
          }
          onOpen={() => onEdit(item)}
          status={
            <YumiStatusTag tone={item.enabled ? 'success' : 'neutral'}>
              {item.enabled ? '启用' : '已停用'}
            </YumiStatusTag>
          }
          summary={summary(item)}
          title={item.name}
        />
      ))}
    </YumiBusinessList>
  )
}

function CategoryEditorForm({
  item,
  onSubmit
}: {
  item?: V2FinanceCategory
  onSubmit(input: { name: string; enabled: boolean }): void
}) {
  const [name, setName] = useState(item?.name ?? '')
  const [enabled, setEnabled] = useState(item?.enabled ?? true)
  return (
    <form
      className="yumi-form-panel yumi-sheet-form"
      id="category-editor-form"
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        onSubmit({ name, enabled })
      }}
    >
      <YumiField>
        <YumiFieldLabel htmlFor="finance-category-name" required>
          类目名称
        </YumiFieldLabel>
        <YumiTextField
          id="finance-category-name"
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </YumiField>
      {item && (
        <YumiField>
          <YumiFieldLabel>状态</YumiFieldLabel>
          <YumiSelect
            aria-label="类目状态"
            onValueChange={(value) => setEnabled(value === 'enabled')}
            options={[
              { label: '启用', value: 'enabled' },
              { label: '停用', value: 'disabled' }
            ]}
            value={enabled ? 'enabled' : 'disabled'}
          />
        </YumiField>
      )}
    </form>
  )
}

function PayerEditorForm({
  item,
  onSubmit
}: {
  item?: V2AdvancePayer
  onSubmit(input: { name: string; note: string | null; enabled: boolean }): void
}) {
  const [name, setName] = useState(item?.name ?? '')
  const [note, setNote] = useState(item?.note ?? '')
  const [enabled, setEnabled] = useState(item?.enabled ?? true)
  return (
    <form
      className="yumi-form-panel yumi-sheet-form"
      id="payer-editor-form"
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        onSubmit({ name, note: note || null, enabled })
      }}
    >
      <YumiField>
        <YumiFieldLabel htmlFor="advance-payer-name" required>
          姓名
        </YumiFieldLabel>
        <YumiTextField
          id="advance-payer-name"
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </YumiField>
      <YumiField>
        <YumiFieldLabel htmlFor="advance-payer-note">备注</YumiFieldLabel>
        <YumiTextArea
          id="advance-payer-note"
          onChange={(event) => setNote(event.target.value)}
          value={note}
        />
      </YumiField>
      {item && (
        <YumiField>
          <YumiFieldLabel>状态</YumiFieldLabel>
          <YumiSelect
            aria-label="垫付人状态"
            onValueChange={(value) => setEnabled(value === 'enabled')}
            options={[
              { label: '启用', value: 'enabled' },
              { label: '停用', value: 'disabled' }
            ]}
            value={enabled ? 'enabled' : 'disabled'}
          />
        </YumiField>
      )}
    </form>
  )
}

function CategoryDialogFooter({ busy, editing }: { busy: boolean; editing: boolean }) {
  return (
    <YumiButton form="category-editor-form" loading={busy} type="submit" variant="primary">
      {editing ? '保存类目' : '创建类目'}
    </YumiButton>
  )
}
function PayerDialogFooter({ busy, editing }: { busy: boolean; editing: boolean }) {
  return (
    <YumiButton form="payer-editor-form" loading={busy} type="submit" variant="primary">
      {editing ? '保存垫付人' : '创建垫付人'}
    </YumiButton>
  )
}
