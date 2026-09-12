import { useCallback, useEffect, useState } from 'react'
import type {
  V2AdvancePayerCreateInput,
  V2AdvancePayerUpdateInput,
  V2BatchReimbursementInput,
  V2AfterSalesCaseCreateInput,
  V2AfterSalesCaseQuery,
  V2AfterSalesCaseUpdateInput,
  V2FinanceCategoryCreateInput,
  V2FinanceCategoryUpdateInput,
  V2FinanceEntryQuery,
  V2ManualExpenseInput,
  V2ManualIncomeInput,
  V2MonthlyFinanceSummary,
  V2ReimbursementInput
} from '@shared/contracts/index'
import { getErrorMessage, today } from './v2-utils'

/** 财务与售后能力只经预加载契约调用；页面只处理草稿和展示。 */
export function useFinance() {
  const [categories, setCategories] = useState<
    Awaited<ReturnType<typeof window.yumiV2.finance.listCategories>>
  >([])
  const [advancePayers, setAdvancePayers] = useState<
    Awaited<ReturnType<typeof window.yumiV2.finance.listAdvancePayers>>
  >([])
  const [entries, setEntries] = useState<
    Awaited<ReturnType<typeof window.yumiV2.finance.listEntries>>
  >([])
  const [pendingReimbursements, setPendingReimbursements] = useState<
    Awaited<ReturnType<typeof window.yumiV2.finance.listPendingReimbursements>>
  >([])
  const [monthlySummary, setMonthlySummary] = useState<V2MonthlyFinanceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async (entryQuery?: V2FinanceEntryQuery) => {
    setLoading(true)
    setLoadError(null)
    try {
      const [nextCategories, nextPayers, nextEntries, nextPending] = await Promise.all([
        window.yumiV2.finance.listCategories(undefined, true),
        window.yumiV2.finance.listAdvancePayers(true),
        window.yumiV2.finance.listEntries(entryQuery),
        window.yumiV2.finance.listPendingReimbursements(today())
      ])
      setCategories(nextCategories)
      setAdvancePayers(nextPayers)
      setEntries(nextEntries)
      setPendingReimbursements(nextPending)
      return nextEntries
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

  const loadMonthlyOverview = useCallback(async (month: string, asOf: string) => {
    const [year, monthNumber] = month.split('-').map(Number)
    const monthEnd = `${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, '0')}`
    setLoading(true)
    setLoadError(null)
    try {
      const [summary, nextEntries, nextPending] = await Promise.all([
        window.yumiV2.finance.getMonthlySummary(month),
        window.yumiV2.finance.listEntries({ fromOn: `${month}-01`, toOn: monthEnd }),
        window.yumiV2.finance.listPendingReimbursements(asOf)
      ])
      setMonthlySummary(summary)
      setEntries(nextEntries)
      setPendingReimbursements(nextPending)
      return { summary, entries: nextEntries, pendingReimbursements: nextPending }
    } catch (error) {
      setLoadError(getErrorMessage(error))
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  const createCategory = useCallback(
    async (input: V2FinanceCategoryCreateInput) => {
      const category = await window.yumiV2.finance.createCategory(input)
      await reload()
      return category
    },
    [reload]
  )
  const updateCategory = useCallback(
    async (id: string, input: V2FinanceCategoryUpdateInput) => {
      const category = await window.yumiV2.finance.updateCategory(id, input)
      await reload()
      return category
    },
    [reload]
  )
  const deleteCategory = useCallback(
    async (id: string) => {
      await window.yumiV2.finance.deleteCategory(id)
      await reload()
    },
    [reload]
  )
  const createAdvancePayer = useCallback(
    async (input: V2AdvancePayerCreateInput) => {
      const payer = await window.yumiV2.finance.createAdvancePayer(input)
      await reload()
      return payer
    },
    [reload]
  )
  const updateAdvancePayer = useCallback(
    async (id: string, input: V2AdvancePayerUpdateInput) => {
      const payer = await window.yumiV2.finance.updateAdvancePayer(id, input)
      await reload()
      return payer
    },
    [reload]
  )
  const deleteAdvancePayer = useCallback(
    async (id: string) => {
      await window.yumiV2.finance.deleteAdvancePayer(id)
      await reload()
    },
    [reload]
  )
  const createManualIncome = useCallback(
    async (input: V2ManualIncomeInput) => {
      const entry = await window.yumiV2.finance.createManualIncome(input)
      await reload()
      return entry
    },
    [reload]
  )
  const createManualExpense = useCallback(
    async (input: V2ManualExpenseInput) => {
      const entry = await window.yumiV2.finance.createManualExpense(input)
      await reload()
      return entry
    },
    [reload]
  )
  const reimburse = useCallback(
    async (input: V2ReimbursementInput) => {
      const result = await window.yumiV2.finance.reimburse(input)
      await reload()
      return result
    },
    [reload]
  )
  const reimburseBatch = useCallback(
    async (input: V2BatchReimbursementInput) => {
      const result = await window.yumiV2.finance.reimburseBatch(input)
      await reload()
      return result
    },
    [reload]
  )
  const listAfterSalesCases = useCallback(
    (query?: V2AfterSalesCaseQuery) => window.yumiV2.afterSales.listCases(query),
    []
  )
  const createAfterSalesCase = useCallback(
    async (input: V2AfterSalesCaseCreateInput) => window.yumiV2.afterSales.createCase(input),
    []
  )
  const updateAfterSalesCase = useCallback(
    async (id: string, input: V2AfterSalesCaseUpdateInput) =>
      window.yumiV2.afterSales.updateCase(id, input),
    []
  )
  const linkAfterSalesCharge = useCallback(
    async (afterSalesCaseId: string, financialEntryId: string) =>
      window.yumiV2.afterSales.linkCharge(afterSalesCaseId, financialEntryId),
    []
  )

  return {
    categories,
    advancePayers,
    entries,
    pendingReimbursements,
    monthlySummary,
    loading,
    loadError,
    reload,
    loadMonthlyOverview,
    createCategory,
    updateCategory,
    deleteCategory,
    createAdvancePayer,
    updateAdvancePayer,
    deleteAdvancePayer,
    createManualIncome,
    createManualExpense,
    reimburse,
    reimburseBatch,
    listAfterSalesCases,
    createAfterSalesCase,
    updateAfterSalesCase,
    linkAfterSalesCharge
  }
}
