import { useCallback, useEffect, useState } from 'react'
import type {
  V2Worker,
  V2WorkerCreateInput,
  V2WorkerSettlementCreateInput,
  V2WorkerSettlementDetail,
  V2WorkerSettlementDraftUpdateInput,
  V2WorkerSettlementQuery,
  V2WorkerRefundRecord,
  V2WorkerRefundResolveInput,
  V2WorkerWageHistory,
  V2WorkerWageHistoryInput
} from '@shared/contracts/index'
import { getErrorMessage } from './v2-utils'

export function useSettlements() {
  const [workers, setWorkers] = useState<V2Worker[]>([])
  const [settlements, setSettlements] = useState<V2WorkerSettlementDetail[]>([])
  const [refunds, setRefunds] = useState<V2WorkerRefundRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async (query?: V2WorkerSettlementQuery) => {
    setLoading(true)
    setLoadError(null)
    try {
      const [nextWorkers, nextSettlements, nextRefunds] = await Promise.all([
        window.yumiV2.workers.list(),
        window.yumiV2.settlements.list(query),
        window.yumiV2.settlements.listRefunds()
      ])
      setWorkers(nextWorkers)
      setSettlements(nextSettlements)
      setRefunds(nextRefunds)
      return nextSettlements
    } catch (error) {
      setLoadError(getErrorMessage(error))
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload().catch(() => undefined)
  }, [reload])

  const createWorker = useCallback(
    async (input: V2WorkerCreateInput) => {
      const worker = await window.yumiV2.workers.create(input)
      await reload()
      return worker
    },
    [reload]
  )

  const listWageHistory = useCallback(
    (workerId: string): Promise<V2WorkerWageHistory[]> =>
      window.yumiV2.workers.listWageHistory(workerId),
    []
  )

  const recordWageHistory = useCallback(
    async (input: V2WorkerWageHistoryInput) => {
      const history = await window.yumiV2.workers.recordWageHistory(input)
      await reload()
      return history
    },
    [reload]
  )

  const createDraft = useCallback(
    async (input: V2WorkerSettlementCreateInput) => {
      const settlement = await window.yumiV2.settlements.createDraft(input)
      await reload()
      return settlement
    },
    [reload]
  )

  const updateDraft = useCallback(
    async (id: string, input: V2WorkerSettlementDraftUpdateInput) => {
      const settlement = await window.yumiV2.settlements.updateDraft(id, input)
      await reload()
      return settlement
    },
    [reload]
  )

  const confirmSettlement = useCallback(
    async (id: string) => {
      const settlement = await window.yumiV2.settlements.confirm(id)
      await reload()
      return settlement
    },
    [reload]
  )

  const resolveRefund = useCallback(
    async (id: string, input: V2WorkerRefundResolveInput) => {
      const refund = await window.yumiV2.settlements.resolveRefund(id, input)
      await reload()
      return refund
    },
    [reload]
  )

  return {
    workers,
    settlements,
    refunds,
    loading,
    loadError,
    reload,
    createWorker,
    listWageHistory,
    recordWageHistory,
    createDraft,
    updateDraft,
    confirmSettlement,
    resolveRefund
  }
}
