import type { V2BackupRestoreInput, V2BackupRestoreResult, V2BackupSummary } from './common'
import type { V2Customer, V2CustomerInput, V2CustomerQuery, V2CustomerUpdateInput } from './customers'
import type {
  V2Order,
  V2OrderContentChange,
  V2OrderContentChangeInput,
  V2OrderCreateInput,
  V2OrderFund,
  V2OrderFundCorrectionInput,
  V2OrderFundInput,
  V2OrderSummary,
  V2Shipment,
  V2ShipmentInput
} from './orders'
import type { V2Product, V2ProductInput, V2ProductUpdateInput } from './products'
import type {
  V2AdvancePayer, V2AdvancePayerCreateInput, V2AdvancePayerUpdateInput, V2FinanceCategory,
  V2FinanceCategoryCreateInput, V2FinanceCategoryUpdateInput, V2FinanceDirection, V2FinanceEntryQuery,
  V2FinancialEntry, V2ManualExpenseInput, V2ManualIncomeInput, V2MonthlyFinanceSummary,
  V2PendingReimbursement, V2ReimbursementInput
} from './finance'
import type {
  V2AfterSalesCase, V2AfterSalesCaseCreateInput, V2AfterSalesCaseQuery,
  V2AfterSalesCaseUpdateInput, V2AfterSalesChargeLink
} from './after-sales'
import type {
  V2FulfillmentAdjustmentInput, V2OpeningWipInput, V2OrderItemFulfillment, V2ProcessResult,
  V2ProcessResultInput, V2QualityInspection, V2QualityInspectionInput, V2WorkAssignment,
  V2WorkAssignmentCreateInput, V2WorkAssignmentQuery
} from './fulfillment'
import type {
  V2Worker, V2WorkerCreateInput, V2WorkerSettlementDetail, V2WorkerSettlementCreateInput,
  V2WorkerSettlementDraftUpdateInput, V2WorkerSettlementQuery, V2WorkerWageHistory,
  V2WorkerWageHistoryInput
} from './settlements'

/** V2 预加载层唯一向渲染进程暴露的能力边界。 */
export interface V2YumiApi {
  health(): Promise<{ version: string; databaseReady: boolean }>
  customers: {
    list(query?: V2CustomerQuery): Promise<V2Customer[]>
    create(input: V2CustomerInput): Promise<V2Customer>
    update(input: V2CustomerUpdateInput): Promise<V2Customer>
  }
  products: {
    list(includeDisabled?: boolean): Promise<V2Product[]>
    create(input: V2ProductInput): Promise<V2Product>
    update(input: V2ProductUpdateInput): Promise<V2Product>
  }
  orders: {
    list(): Promise<V2OrderSummary[]>
    get(orderId: string): Promise<V2Order | null>
    create(input: V2OrderCreateInput): Promise<V2Order>
    changeContent(orderId: string, input: V2OrderContentChangeInput): Promise<V2Order>
    listContentChanges(orderId: string): Promise<V2OrderContentChange[]>
    listFunds(orderId: string): Promise<V2OrderFund[]>
    recordFund(orderId: string, input: V2OrderFundInput): Promise<V2OrderFund>
    correctFund(orderId: string, input: V2OrderFundCorrectionInput): Promise<{ reversal: V2OrderFund; replacement: V2OrderFund }>
    listShipments(orderId: string): Promise<V2Shipment[]>
    createShipment(orderId: string, input: V2ShipmentInput): Promise<V2Shipment>
  }
  fulfillment: {
    createWorkAssignment(input: V2WorkAssignmentCreateInput): Promise<V2WorkAssignment>
    getWorkAssignment(id: string): Promise<V2WorkAssignment | null>
    listWorkAssignments(query?: V2WorkAssignmentQuery): Promise<V2WorkAssignment[]>
    getProcessResultForTask(taskId: string): Promise<V2ProcessResult | null>
    submitProcessResult(taskId: string, input: V2ProcessResultInput): Promise<V2ProcessResult>
    confirmQualityInspection(resultId: string, input: V2QualityInspectionInput): Promise<V2QualityInspection>
    recordOpeningWip(input: V2OpeningWipInput): Promise<V2OrderItemFulfillment>
    adjustStageQuantity(input: V2FulfillmentAdjustmentInput): Promise<V2OrderItemFulfillment>
    getOrderItem(orderItemId: string): Promise<V2OrderItemFulfillment>
  }
  workers: {
    list(): Promise<V2Worker[]>
    create(input: V2WorkerCreateInput): Promise<V2Worker>
    listWageHistory(workerId: string): Promise<V2WorkerWageHistory[]>
    recordWageHistory(input: V2WorkerWageHistoryInput): Promise<V2WorkerWageHistory>
  }
  settlements: {
    list(query?: V2WorkerSettlementQuery): Promise<V2WorkerSettlementDetail[]>
    createDraft(input: V2WorkerSettlementCreateInput): Promise<V2WorkerSettlementDetail>
    get(id: string): Promise<V2WorkerSettlementDetail | null>
    updateDraft(id: string, input: V2WorkerSettlementDraftUpdateInput): Promise<V2WorkerSettlementDetail>
    confirm(id: string): Promise<V2WorkerSettlementDetail>
  }
  finance: {
    listCategories(direction?: V2FinanceDirection, includeDisabled?: boolean): Promise<V2FinanceCategory[]>
    createCategory(input: V2FinanceCategoryCreateInput): Promise<V2FinanceCategory>
    updateCategory(id: string, input: V2FinanceCategoryUpdateInput): Promise<V2FinanceCategory>
    deleteCategory(id: string): Promise<void>
    listAdvancePayers(includeDisabled?: boolean): Promise<V2AdvancePayer[]>
    createAdvancePayer(input: V2AdvancePayerCreateInput): Promise<V2AdvancePayer>
    updateAdvancePayer(id: string, input: V2AdvancePayerUpdateInput): Promise<V2AdvancePayer>
    deleteAdvancePayer(id: string): Promise<void>
    listEntries(query?: V2FinanceEntryQuery): Promise<V2FinancialEntry[]>
    createManualIncome(input: V2ManualIncomeInput): Promise<V2FinancialEntry>
    createManualExpense(input: V2ManualExpenseInput): Promise<V2FinancialEntry>
    listPendingReimbursements(asOf: string): Promise<V2PendingReimbursement[]>
    reimburse(input: V2ReimbursementInput): Promise<V2FinancialEntry>
    getMonthlySummary(month: string): Promise<V2MonthlyFinanceSummary>
  }
  afterSales: {
    listCases(query?: V2AfterSalesCaseQuery): Promise<V2AfterSalesCase[]>
    getCase(id: string): Promise<V2AfterSalesCase | null>
    createCase(input: V2AfterSalesCaseCreateInput): Promise<V2AfterSalesCase>
    updateCase(id: string, input: V2AfterSalesCaseUpdateInput): Promise<V2AfterSalesCase>
    linkCharge(afterSalesCaseId: string, financialEntryId: string): Promise<V2AfterSalesChargeLink>
  }
  backup: {
    create(): Promise<V2BackupSummary>
    list(): Promise<V2BackupSummary[]>
    restore(input: V2BackupRestoreInput): Promise<V2BackupRestoreResult>
  }
}
