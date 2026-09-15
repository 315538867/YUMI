import { useEffect, useMemo, useState } from 'react'
import type { V2NavigationTarget, V2WorkAssignment } from '@shared/contracts/index'
import { useFulfillment } from '../../composables/use-fulfillment'
import { WorkAssignmentsPage } from '../work-assignments'
import { WorkTimeReviewPanel } from '../../components/fulfillment/work-time-review-panel'
import {
  WorkAssignmentDetailDialog,
  WorkAssignmentSheet,
  WorkerWeekSchedule,
  type DispatchPrefill,
  type WeekScheduleReviewTarget
} from '../../components/fulfillment/dispatch-views'
import {
  YumiEmptyState,
  YumiFormMessage,
  YumiMetricStrip,
  YumiPageHeader,
  YumiPrimaryTabs,
  useYumiNotificationMessage
} from '../../components/ui'

type FulfillmentOverview = 'workers' | 'reviews'

/** 工作台待核算事项与订单只读导航都可能携带这些 focus。 */
const reviewNavigationFocuses = new Set<string>(['inspection', 'reviews'])

const processTypeLabels: Record<V2WorkAssignment['processType'], string> = {
  making: '制作',
  fluffing_bagging: '捏毛装袋',
  edge_sewing: '缝边',
  packing: '打包发货'
}

interface FulfillmentPageProps {
  navigationTarget?: Extract<V2NavigationTarget, { view: 'fulfillment' }> | null
  onNavigate?(target: V2NavigationTarget): void
}

/**
 * 排班工作区：默认且只保留人员周历与待核算两个视角。
 * 人员周历日期格的“＋ 派工”是唯一的新建工作安排入口；
 * 任务处理上下文只承接深链任务，只读查看安排与核算摘要。
 */
export function FulfillmentPage({ navigationTarget = null, onNavigate }: FulfillmentPageProps) {
  const {
    queueItems,
    assignments,
    itemLabels,
    workers,
    loading,
    loadError,
    reload,
    createWorkAssignment
  } = useFulfillment()
  const [overview, setOverview] = useState<FulfillmentOverview>('workers')
  const [assignmentPrefill, setAssignmentPrefill] = useState<DispatchPrefill | null>(null)
  const [reviewHint, setReviewHint] = useState<string | null>(null)
  const [focusedProcessTaskId, setFocusedProcessTaskId] = useState('')
  const [detailTarget, setDetailTarget] = useState<{
    assignment: V2WorkAssignment
    workerName: string
  } | null>(null)
  useYumiNotificationMessage(loadError)

  useEffect(() => {
    if (!navigationTarget) return
    if (navigationTarget.focus === 'shipment' && navigationTarget.orderId) {
      onNavigate?.({ view: 'orders', orderId: navigationTarget.orderId, orderView: 'fulfillment' })
      return
    }
    if (navigationTarget.processTaskId) {
      setFocusedProcessTaskId(navigationTarget.processTaskId)
      return
    }
    setOverview(reviewNavigationFocuses.has(navigationTarget.focus ?? '') ? 'reviews' : 'workers')
  }, [navigationTarget, onNavigate])

  const scheduleTotals = useMemo(
    () =>
      queueItems.reduce(
        (totals, item) => ({
          confirmed: totals.confirmed + item.confirmedQuantity,
          making: totals.making + item.stages.making,
          fluffingBagging: totals.fluffingBagging + item.stages.fluffingBagging,
          edgeSewing: totals.edgeSewing + item.stages.edgeSewing,
          packing: totals.packing + item.stages.packing,
          readyToShip: totals.readyToShip + item.stages.readyToShip,
          shipped: totals.shipped + item.stages.shipped
        }),
        {
          confirmed: 0,
          making: 0,
          fluffingBagging: 0,
          edgeSewing: 0,
          packing: 0,
          readyToShip: 0,
          shipped: 0
        }
      ),
    [queueItems]
  )
  const openReviewTarget = (target: WeekScheduleReviewTarget) => {
    const { card, workerName } = target
    const processLabel = processTypeLabels[card.assignment.processType]
    setReviewHint(
      card.reviewed
        ? `已切换到待核算：${workerName} · ${card.assignedOn} · ${processLabel}已核算，请在「已核算记录」中查看、更正或作废。`
        : `已切换到待核算：${workerName} · ${card.assignedOn} · ${processLabel}待核算，请在下方待核算列表选择「核算」。`
    )
    setOverview('reviews')
  }

  if (focusedProcessTaskId) {
    return (
      <section className="yumi-page fulfillment-workspace">
        <YumiPageHeader
          actions={{ ariaLabel: '排班处理页面动作' }}
          navigation={{
            ariaLabel: '排班处理导航',
            label: '返回人员周历',
            onClick: () => setFocusedProcessTaskId('')
          }}
          description="深链的排班任务只读展示工作安排、状态与核算摘要；新增排班请在人员周历日期格点击「＋ 派工」。"
          title="任务处理"
        />
        <WorkAssignmentsPage focusedTaskId={focusedProcessTaskId} onChanged={() => void reload()} />
      </section>
    )
  }

  return (
    <section className="yumi-page fulfillment-workspace">
      <YumiPageHeader
        actions={{
          ariaLabel: '排班页面动作',
          visibleActions: [{ label: '导出排班', onClick: () => undefined }]
        }}
        description="人员周历是唯一的新建排班入口；待核算页签统一登记制作与计时的实际产出。"
        title="排班"
      />
      <YumiPrimaryTabs
        ariaLabel="排班视角"
        items={[
          { id: 'workers', label: '人员周历' },
          { id: 'reviews', label: '待核算' }
        ]}
        onValueChange={setOverview}
        value={overview}
      />
      <YumiMetricStrip
        ariaLabel="排班阶段总量"
        items={[
          { label: '订单总量', value: `${scheduleTotals.confirmed} 件` },
          { label: '待制作', value: `${scheduleTotals.making} 件` },
          { label: '待捏毛装袋', value: `${scheduleTotals.fluffingBagging} 件` },
          { label: '待缝边', value: `${scheduleTotals.edgeSewing} 件` },
          { label: '待打包发货', value: `${scheduleTotals.packing} 件` },
          { label: '待发货', tone: 'brand', value: `${scheduleTotals.readyToShip} 件` },
          { label: '已发货', value: `${scheduleTotals.shipped} 件` }
        ]}
      />
      {loading ? (
        <YumiEmptyState
          description="排班资料正在读取，请稍候。"
          scenario="loading"
          title="加载排班待办中…"
        />
      ) : overview === 'workers' ? (
        <WorkerWeekSchedule
          assignments={assignments}
          itemLabels={itemLabels}
          onOpenAssignment={(prefill) => setAssignmentPrefill(prefill)}
          onOpenAssignmentDetail={(assignment, workerName) =>
            setDetailTarget({ assignment, workerName })
          }
          onOpenReview={openReviewTarget}
          workers={workers}
        />
      ) : (
        <>
          {reviewHint ? <YumiFormMessage tone="hint">{reviewHint}</YumiFormMessage> : null}
          <WorkTimeReviewPanel
            onChanged={() => {
              setReviewHint(null)
              void reload()
            }}
            workers={workers}
          />
        </>
      )}
      <WorkAssignmentSheet
        items={queueItems}
        onOpenChange={(open) => {
          if (!open) setAssignmentPrefill(null)
        }}
        onSubmit={createWorkAssignment}
        open={assignmentPrefill !== null}
        prefill={assignmentPrefill}
        workers={workers}
      />
      <WorkAssignmentDetailDialog
        assignment={detailTarget?.assignment ?? null}
        itemLabels={itemLabels}
        onClose={() => setDetailTarget(null)}
        workerName={detailTarget?.workerName ?? ''}
      />
    </section>
  )
}
