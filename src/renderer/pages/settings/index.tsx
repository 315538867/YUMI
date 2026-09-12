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
  YumiButton,
  YumiDataTable,
  YumiDetailList,
  YumiConfirmDialog,
  YumiDialog,
  YumiEmptyState,
  YumiField,
  YumiFieldLabel,
  YumiFormMessage,
  YumiFormSection,
  YumiNumberField,
  YumiListSurface,
  YumiListToolbar,
  YumiPageHeader,
  YumiPrimaryTabs,
  YumiSegmentedTabs,
  YumiSection,
  YumiSelect,
  YumiStatusTag,
  YumiSheet,
  YumiTextArea,
  YumiTextField,
  type YumiPagePrimaryAction,
  useYumiNotificationMessage
} from '../../components/ui'

type CategoryEditor = { direction: 'income' | 'expense'; item?: V2FinanceCategory } | null
type PayerEditor = V2AdvancePayer | 'create' | null
type PendingDelete = { id: string; kind: 'category' | 'payer'; name: string } | null
type SettingsView = 'studio' | 'formulas' | 'finance' | 'protection'
type LibraryView = 'income' | 'expense' | 'payer'

const settingsCopy: Record<SettingsView, { title: string; description: string }> = {
  studio: {
    title: '工作室参数',
    description: '维护全工作室统一使用的参数；商品只记录自身实际胶水用量。'
  },
  formulas: {
    title: '计算公式',
    description: '集中公开当前系统已实现的计算口径、输入字段、快照边界与未纳入项；这里不提供编辑。'
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
  const backupState = useBackups()
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
  useYumiNotificationMessage(backupState.error)
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

  const primaryAction: YumiPagePrimaryAction | undefined =
    view === 'finance'
      ? {
          label: libraryView === 'payer' ? '新增垫付人' : `新增${activeCategoryLabel}`,
          onClick: openCreate
        }
      : view === 'studio'
        ? { label: '编辑工作室参数', onClick: () => setStudioEditorOpen(true) }
        : view === 'protection'
          ? {
              label: '立即备份',
              loading: backupState.busy,
              onClick: () => void backupState.createBackup().catch(() => undefined)
            }
          : undefined
  const headerActions = {
    ariaLabel: `${settingsCopy[view].title}页面动作`,
    primaryAction
  }

  return (
    <div className="yumi-page yumi-settings-workspace">
      <YumiPageHeader
        actions={headerActions}
        description={settingsCopy[view].description}
        title={settingsCopy[view].title}
      />
      <YumiPrimaryTabs
        ariaLabel="设置区域"
        items={[
          { id: 'studio', label: '工作室参数' },
          { id: 'formulas', label: '计算公式' },
          { id: 'finance', label: '财务资料' },
          { id: 'protection', label: '数据保护' }
        ]}
        onValueChange={(nextView) => {
          setError(null)
          setView(nextView)
        }}
        value={view}
      />
      {view === 'studio' && (
        <StudioSettingsPanel loading={studio.loading} settings={studio.settings} />
      )}
      {view === 'formulas' && <CalculationFormulaCatalog />}

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
          <YumiSegmentedTabs
            ariaLabel="财务资料类型"
            items={[
              { id: 'income', label: '收入类目' },
              { id: 'expense', label: '支出类目' },
              { id: 'payer', label: '私人垫付人' }
            ]}
            onValueChange={(nextView) => {
              setError(null)
              setLibraryView(nextView)
            }}
            value={libraryView}
          />
          {libraryView === 'payer' ? (
            <ResourceLibraryList
              emptyDescription="建立垫付人后，私人支付的支出才可在财务登记中选择对应来源。"
              emptyTitle="暂无私人垫付人"
              items={finance.advancePayers}
              listTitle="私人垫付人"
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
              listTitle={activeCategoryLabel}
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

      {view === 'protection' && <DataProtectionPanel backupState={backupState} />}

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

type FormulaRow = {
  category: string
  name: string
  formula: string
  input: string
  boundary: string
}

/**
 * 只列出会产生业务结果的当前实现公式；字段校验、状态映射和快照复制不单列为公式。
 * 每行都与主进程领域函数一一对应。未建立订单归属规则的成本必须明确排除，不能以估算值补齐。
 */
const calculationFormulaRows: FormulaRow[] = [
  {
    category: '订单金额',
    name: '商品金额',
    formula: '数量 × 成交单价',
    input: '订单商品行',
    boundary: '金额以分保存'
  },
  {
    category: '订单金额',
    name: '缝边金额',
    formula: '缝边数量 × 缝边单价',
    input: '启用缝边的订单商品行',
    boundary: '缝边数量不得超过商品数量'
  },
  {
    category: '订单金额',
    name: '商品行应收',
    formula: '商品金额 + 缝边金额 − 明细优惠',
    input: '商品行金额与优惠',
    boundary: '明细优惠不得超过该商品行金额'
  },
  {
    category: '订单金额',
    name: '订单应收金额',
    formula: '所有商品行应收之和 − 订单优惠',
    input: '商品行应收、订单优惠',
    boundary: '订单优惠不得超过商品行应收之和'
  },
  {
    category: '订单金额',
    name: '当前订单金额',
    formula: '订单应收金额 + 全部金额调整',
    input: '订单金额、金额调整流水',
    boundary: '每笔调整不能为 0，可正可负'
  },

  {
    category: '订单资金',
    name: '累计收款',
    formula: '未被冲正的收入资金流水之和',
    input: '订单资金流水',
    boundary: '已冲正原流水和冲正流水均不重复计入'
  },
  {
    category: '订单资金',
    name: '累计退款',
    formula: '未被冲正的支出资金流水之和',
    input: '订单资金流水',
    boundary: '退款必须是支出方向'
  },
  {
    category: '订单资金',
    name: '净收款',
    formula: '累计收款 − 累计退款',
    input: '订单资金流水',
    boundary: '仅以已保存且未冲正流水计算'
  },
  {
    category: '订单资金',
    name: '待收款',
    formula: '当前订单金额 − 净收款',
    input: '当前订单金额、订单资金流水',
    boundary: '可为负，表示超收或后续需核对'
  },

  {
    category: '交期与发货',
    name: '制作截止日',
    formula: '预计发货日 − 预留天数',
    input: '预计发货日、订单或工作室预留天数',
    boundary: '未填预计发货日时不计算截止日；默认预留 2 天'
  },
  {
    category: '交期与发货',
    name: '待发数量',
    formula: '订单确认数量 − 累计已发数量',
    input: '订单确认数量、有效发货批次数量',
    boundary: '无可用待发数约束时，累计已发不得超过确认数量'
  },

  {
    category: '商品成本与产能',
    name: '每日模具产能',
    formula: '模具数量 × 每模每批产出 × 每日最大批次',
    input: '商品模具参数',
    boundary: '三项均为正整数时才可计算'
  },
  {
    category: '商品成本与产能',
    name: '材料用量',
    formula: '数量 × 单件材料毫克 × (1 + 损耗率)',
    input: '订单冻结的商品材料参数',
    boundary: '以毫克计算并按四舍五入取整；损耗率小于 100%'
  },
  {
    category: '商品成本与产能',
    name: '商品直接成本',
    formula: '材料或胶水成本 + (包装成本 + 配饰成本 + 替换袋成本) × 数量 + 内部缝边成本 × 缝边数量',
    input: '订单冻结商品快照',
    boundary: '新订单按整批材料计算；旧快照沿用旧材料成本'
  },

  {
    category: '生产与排班',
    name: '实际生产人工成本',
    formula: '实际分钟 ÷ 60 × 时薪',
    input: '实际申报分钟、任务时薪',
    boundary: '金额以分级别四舍五入'
  },
  {
    category: '生产与排班',
    name: '实际生产计件成本',
    formula: '合格数量 × 单件提成',
    input: '生产合格数量、任务冻结提成',
    boundary: '返工和报废不产生该项'
  },
  {
    category: '生产与排班',
    name: '实际生产总成本',
    formula: '实际生产人工成本 + 实际生产计件成本',
    input: '实际人工与合格计件成本',
    boundary: '用于实际生产核算，不替代订单盈利分摊'
  },
  {
    category: '生产与排班',
    name: '生产覆盖数量',
    formula: '合格数量 + 已排班数量',
    input: '订单数量、合格数量、排班数量',
    boundary: '未排数量 = max(0，订单数量 − 覆盖数量)；超额数量 = max(0，覆盖数量 − 订单数量)'
  },
  {
    category: '生产与排班',
    name: '任务计划时长',
    formula: '制作：计划数量 × 标准制作分钟 + 额外分钟；其他工序：负责人填写的计划分钟',
    input: '任务工序、计划数量、商品快照、额外分钟',
    boundary: '额外分钟仅适用于制作任务'
  },
  {
    category: '生产与排班',
    name: '可发货数量',
    formula: '待发货阶段库存',
    input: '订单履约阶段状态',
    boundary: '由制作、捏毛装袋、打包及发货事件逐步流转'
  },

  {
    category: '兼职结算',
    name: '时薪工资',
    formula: '工作分钟 ÷ 60 × 任务冻结时薪',
    input: '排班分钟或考勤分钟、任务时薪',
    boundary: '金额以分级别四舍五入；任务创建后时薪不回写'
  },
  {
    category: '兼职结算',
    name: '合格计件提成',
    formula: '仅制作、捏毛装袋：合格数量 × 任务冻结单件提成',
    input: '任务工序、合格数量、任务冻结费率',
    boundary: '打包和发货不产生计件提成；历史缺失费率按 0 元'
  },
  {
    category: '兼职结算',
    name: '制作不合格扣款',
    formula: '不合格数量 × 制作提成 + 不合格数量 × 标准制作分钟 ÷ 60 × 时薪 + 胶水扣款',
    input: '制作不合格数量、制作任务快照',
    boundary: '胶水扣款可按单件成本计算，也可直接录入总额'
  },
  {
    category: '兼职结算',
    name: '捏毛装袋不合格扣款',
    formula: '不合格数量 × 捏毛装袋提成 + (计划分钟 × 不合格数量 ÷ 计划数量) ÷ 60 × 时薪',
    input: '捏毛装袋任务快照',
    boundary: '不扣胶水；不合格数量不得超过计划数量'
  },
  {
    category: '兼职结算',
    name: '参考工资（排班 / 考勤）',
    formula: 'max(0，时薪工资 + 合格计件提成 + 其他调整 − min(可扣款，排班口径扣前应发))',
    input: '排班或考勤分钟、提成、扣款、其他调整',
    boundary: '两套口径只在时薪分钟来源不同；负责人最终确认实发'
  },
  {
    category: '兼职结算',
    name: '扣款分配与顺延',
    formula: '按发生时间依次：本次抵扣 = min(待抵扣金额，剩余可抵扣上限)',
    input: '待抵扣记录、排班口径扣前应发',
    boundary: '未抵完金额原样顺延；不允许负工资'
  },

  {
    category: '财务',
    name: '月经营收入',
    formula: '查询月份内全部收入流水之和',
    input: '财务流水实际发生日、方向',
    boundary: '按实际收款日期归属月份'
  },
  {
    category: '财务',
    name: '月经营支出',
    formula: '查询月份内支出流水之和（不含报销）',
    input: '财务流水实际发生日、来源',
    boundary: '报销是现金付款，不重复记为经营支出'
  },
  {
    category: '财务',
    name: '月经营结果',
    formula: '月经营收入 − 月经营支出',
    input: '当月收入、当月经营支出',
    boundary: '只统计查询月份内的已保存流水'
  },
  {
    category: '财务',
    name: '待报销金额',
    formula: '截至查询日发生、且尚无当日或更早完整报销的私人垫付之和',
    input: '私人垫付、报销记录、查询日',
    boundary: '同一私人垫付只允许对应一笔等额报销'
  }
]

function CalculationFormulaCatalog() {
  return (
    <div className="yumi-calculation-formula-catalog">
      <YumiSection
        description="公式与字段以当前程序实现为准。涉及订单、商品、时薪和提成的基础值，均须遵循相应快照规则，避免后续资料修改改写历史。"
        title="计算公式"
      >
        <YumiDataTable
          ariaLabel="系统计算公式"
          columns={[
            { key: 'category', label: '分类', render: (item) => item.category },
            { key: 'name', label: '计算项', render: (item) => <strong>{item.name}</strong> },
            { key: 'formula', label: '公式', render: (item) => item.formula },
            { key: 'input', label: '输入来源', render: (item) => item.input },
            { key: 'boundary', label: '口径与边界', render: (item) => item.boundary }
          ]}
          getRowKey={(item) => item.name}
          rows={calculationFormulaRows}
        />
      </YumiSection>
      <YumiSection title="不纳入订单盈利">
        <YumiFormMessage tone="hint">
          运费尚未建立订单级归属规则；兼职时薪、制作与捏毛装袋提成需以已确认任务和结算结果为准。因此它们不会被系统虚构为单订单成本或净利。
        </YumiFormMessage>
      </YumiSection>
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
  if (loading)
    return (
      <YumiEmptyState
        description="正在读取当前工作室参数，请稍候。"
        scenario="loading"
        title="工作室参数加载中"
      />
    )
  return (
    <section aria-label="工作室参数查看" className="yumi-form-panel yumi-settings-panel">
      <YumiFormSection
        description="胶水单价和订单默认预留天数会带入新建订单快照；之后调整不会回写历史订单。"
        title="工作室参数"
      >
        <YumiDetailList
          ariaLabel="当前工作室参数"
          items={[
            {
              label: '胶水单价',
              value: settings
                ? `${formatGluePriceYuanPerGram(settings.gluePriceMicroYuanPerGram)} 元 / 克`
                : '暂无参数'
            },
            {
              label: '订单默认预留天数',
              value: settings ? `${settings.orderReservedDays} 天` : '暂无参数'
            }
          ]}
        />
        <YumiFormMessage>如需修改，请点击页面右上角“编辑工作室参数”。</YumiFormMessage>
      </YumiFormSection>
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

  if (loading)
    return (
      <YumiEmptyState
        description="正在读取当前工作室参数，请稍候。"
        scenario="loading"
        title="工作室参数加载中"
      />
    )
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
      <YumiFormMessage>
        保存后只影响后续新建订单；已建立订单会保留当时的商品、胶水单价与预留天数快照。
      </YumiFormMessage>
    </form>
  )
}

function DataProtectionPanel({ backupState }: { backupState: ReturnType<typeof useBackups> }) {
  const { backups, loading, busy, restoreBackup } = backupState
  const [restoreTarget, setRestoreTarget] = useState<V2BackupSummary | null>(null)

  const restore = async () => {
    if (!restoreTarget) return
    const target = restoreTarget
    setRestoreTarget(null)
    await restoreBackup(target.backupPath)
  }

  return (
    <div className="yumi-settings-protection">
      <p className="yumi-settings-protection__intro">
        建议在批量导入、重大调整或版本升级前建立一份完整备份。备份和恢复都以完整记录留痕管理。
      </p>
      {loading ? (
        <YumiEmptyState
          description="正在读取历史备份记录，请稍候。"
          scenario="loading"
          title="备份记录加载中"
        />
      ) : backups.length === 0 ? (
        <YumiEmptyState
          description="首次完整备份会同时保存当前数据库和已上传附件。"
          title="还没有备份"
        />
      ) : (
        <YumiSection
          ariaLabel="备份记录区"
          description="按创建时间查看可恢复的完整数据备份。"
          title="备份记录"
        >
          <YumiListSurface className="yumi-settings-backup-surface">
            <YumiListToolbar
              ariaLabel="备份记录列表工具"
              countLabel={`共 ${backups.length} 份备份`}
            />
            <YumiDataTable<V2BackupSummary>
              ariaLabel="备份记录列表"
              columns={[
                {
                  key: 'createdAt',
                  label: '创建时间',
                  render: (backup) => <strong>{formatBackupDate(backup.createdAt)}</strong>
                },
                {
                  key: 'reason',
                  label: '备份类型',
                  render: (backup) => (
                    <YumiStatusTag tone={backup.reason === 'manual' ? 'success' : 'neutral'}>
                      {backup.reason === 'manual' ? '手动备份' : '恢复前安全备份'}
                    </YumiStatusTag>
                  )
                },
                {
                  key: 'details',
                  label: '内容',
                  render: (backup) =>
                    `${backup.attachmentCount} 个附件 · 版本 ${backup.applicationVersion}`
                },
                {
                  align: 'right',
                  key: 'actions',
                  label: '操作',
                  render: (backup) => (
                    <YumiButton
                      aria-label={`恢复${formatBackupDate(backup.createdAt)}的备份`}
                      disabled={busy}
                      onClick={() => setRestoreTarget(backup)}
                      variant="secondary"
                    >
                      恢复
                    </YumiButton>
                  )
                }
              ]}
              getRowKey={(backup) => backup.id}
              rows={backups}
            />
          </YumiListSurface>
        </YumiSection>
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
  listTitle,
  loading,
  onDelete,
  onEdit,
  summary
}: {
  emptyDescription: string
  emptyTitle: string
  items: T[]
  listTitle: string
  loading: boolean
  onDelete(item: T): void
  onEdit(item: T): void
  summary(item: T): string
}) {
  if (loading)
    return (
      <YumiEmptyState description={`正在读取${listTitle}，请稍候。`} title={`${listTitle}加载中`} />
    )
  if (items.length === 0)
    return <YumiEmptyState description={emptyDescription} title={emptyTitle} />
  return (
    <YumiSection ariaLabel={`${listTitle}记录区`} title={listTitle}>
      <YumiListSurface className="yumi-settings-library-surface">
        <YumiListToolbar
          ariaLabel={`${listTitle}列表工具`}
          countLabel={`共 ${items.length} 项${listTitle}`}
        />
        <YumiDataTable<T>
          ariaLabel={`${listTitle}列表`}
          columns={[
            {
              key: 'name',
              label: '名称',
              render: (item) => <strong>{item.name}</strong>
            },
            {
              key: 'summary',
              label: '说明',
              render: (item) => summary(item)
            },
            {
              key: 'status',
              label: '状态',
              render: (item) => (
                <YumiStatusTag tone={item.enabled ? 'success' : 'neutral'}>
                  {item.enabled ? '启用' : '已停用'}
                </YumiStatusTag>
              )
            },
            {
              align: 'right',
              key: 'actions',
              label: '操作',
              render: (item) => (
                <div className="yumi-settings-table-actions">
                  <YumiButton
                    aria-label={`编辑${item.name}`}
                    onClick={() => onEdit(item)}
                    variant="secondary"
                  >
                    编辑
                  </YumiButton>
                  <YumiButton
                    aria-label={`删除${item.name}`}
                    onClick={() => onDelete(item)}
                    variant="ghost"
                  >
                    删除
                  </YumiButton>
                </div>
              )
            }
          ]}
          getRowKey={(item) => item.id}
          rows={items}
        />
      </YumiListSurface>
    </YumiSection>
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
