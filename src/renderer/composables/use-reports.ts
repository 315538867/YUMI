import { useCallback, useState } from 'react'
import { getErrorMessage } from './v2-utils'

/** 报表页面只读取 V2 已确认事实；所有读写边界均由预加载契约提供。 */
export function useReports() {
  const [orderBusiness, setOrderBusiness] = useState<Awaited<ReturnType<typeof window.yumiV2.reports.getOrderBusiness>> | null>(null)
  const [fulfillmentProgress, setFulfillmentProgress] = useState<Awaited<ReturnType<typeof window.yumiV2.reports.getFulfillmentProgress>> | null>(null)
  const [confirmedSettlements, setConfirmedSettlements] = useState<Awaited<ReturnType<typeof window.yumiV2.reports.listConfirmedSettlements>> | null>(null)
  const [monthlyOperation, setMonthlyOperation] = useState<Awaited<ReturnType<typeof window.yumiV2.reports.getMonthlyOperation>> | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)

  const load = useCallback(async (month: string) => {
    setLoading(true)
    setLoadError(null)
    try {
      const [nextOrders, nextFulfillment, nextSettlements, nextMonthly] = await Promise.all([
        window.yumiV2.reports.getOrderBusiness(),
        window.yumiV2.reports.getFulfillmentProgress(),
        window.yumiV2.reports.listConfirmedSettlements(),
        window.yumiV2.reports.getMonthlyOperation(month)
      ])
      setOrderBusiness(nextOrders)
      setFulfillmentProgress(nextFulfillment)
      setConfirmedSettlements(nextSettlements)
      setMonthlyOperation(nextMonthly)
    } catch (error) {
      setLoadError(getErrorMessage(error))
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  const exportCurrentReport = useCallback(async (month: string) => {
    setExporting(true)
    setExportMessage(null)
    try {
      const result = await window.yumiV2.reports.exportCurrentReport({ month })
      setExportMessage(result.savedPath ? `已导出：${result.savedPath}` : '已取消导出。')
      return result
    } catch (error) {
      const message = getErrorMessage(error)
      setExportMessage(message)
      throw error
    } finally {
      setExporting(false)
    }
  }, [])

  return {
    orderBusiness, fulfillmentProgress, confirmedSettlements, monthlyOperation,
    loading, loadError, exporting, exportMessage, load, exportCurrentReport
  }
}
