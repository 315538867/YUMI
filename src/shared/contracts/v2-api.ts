import type {
  V2AttachmentReference,
  V2BackupRestoreInput,
  V2BackupRestoreResult,
  V2BackupSummary,
  V2OrderFundProof,
  V2OrderFundProofOpenResult
} from './common'
import type {
  V2Customer,
  V2CustomerInput,
  V2CustomerQuery,
  V2CustomerUpdateInput
} from './customers'
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
  V2ShipmentInput,
  V2ShipmentVoidInput
} from './orders'
import type {
  V2Product,
  V2ProductExpectedProfit,
  V2ProductInput,
  V2ProductUpdateInput
} from './products'
import type { V2StudioSettings, V2StudioSettingsUpdateInput } from './settings'
import type { V2WorkbenchSnapshot } from './workbench'
import type {
  V2WorkTimeReview,
  V2WorkTimeReviewCandidate,
  V2WorkTimeReviewCandidateQuery,
  V2WorkTimeReviewCorrectionInput,
  V2WorkTimeReviewInput,
  V2WorkTimeReviewQuery,
  V2WorkTimeReviewVoidInput
} from './work-time-reviews'
import type {
  V2ProductInventoryAdjustInput,
  V2ProductInventoryAllocationResult,
  V2ProductInventoryAllocateInput,
  V2ProductInventorySummary,
  V2ProductOpeningInput,
  V2ProductStageInventoryEvent
} from './product-inventory'
import type {
  V2AdvancePayer,
  V2AdvancePayerCreateInput,
  V2AdvancePayerUpdateInput,
  V2BatchReimbursementInput,
  V2BatchReimbursementResult,
  V2FinanceCategory,
  V2FinanceCategoryCreateInput,
  V2FinanceCategoryUpdateInput,
  V2FinanceDirection,
  V2FinanceEntryQuery,
  V2FinancialEntry,
  V2ManualExpenseInput,
  V2ManualIncomeInput,
  V2MonthlyFinanceSummary,
  V2PendingReimbursement,
  V2ReimbursementInput
} from './finance'
import type {
  V2AfterSalesCase,
  V2AfterSalesCaseCreateInput,
  V2AfterSalesCaseQuery,
  V2AfterSalesCaseUpdateInput,
  V2AfterSalesChargeLink
} from './after-sales'
import type {
  V2FulfillmentAdjustmentInput,
  V2MakingReviewCorrectionInput,
  V2MakingReviewInput,
  V2MakingReviewVoidInput,
  V2OrderItemFulfillment,
  V2ProcessResult,
  V2ProcessTaskReassignmentInput,
  V2WorkAssignment,
  V2WorkAssignmentCreateInput,
  V2WorkAssignmentQuery,
  V2WorkAssignmentStatusUpdateInput
} from './fulfillment'
import type {
  V2Worker,
  V2WorkerCreateInput,
  V2WorkerSettlementWorkTimeAdjustmentInput,
  V2WorkerSettlementDetail,
  V2WorkerSettlementCreateInput,
  V2WorkerSettlementDraftUpdateInput,
  V2WorkerSettlementQuery,
  V2WorkerWageHistory,
  V2WorkerWageHistoryInput,
  V2WorkerRefundQuery,
  V2WorkerRefundRecord,
  V2WorkerRefundResolveInput
} from './settlements'
import type {
  V2CapacityRiskReport,
  V2CapacityRiskReportInput,
  V2ConfirmedSettlementReport,
  V2CustomerOrderInsights,
  V2DeliveryRiskReport,
  V2DeliveryRiskReportInput,
  V2FulfillmentProgressReport,
  V2MonthlyOperationReport,
  V2OrderBusinessDetail,
  V2OrderBusinessReport,
  V2OrderDocumentsExportInput,
  V2OrderTableExportInput,
  V2ReportExportInput,
  V2ReportExportResult,
  V2ShippingListExportInput,
  V2ShippingListPreviewInput,
  V2ShippingListDocument
} from './reports'

/** V2 预加载层唯一向渲染进程暴露的能力边界。 */
export interface V2YumiApi {
  health(): Promise<{ version: string; databaseReady: boolean }>
  workbench: {
    getSnapshot(): Promise<V2WorkbenchSnapshot>
  }
  customers: {
    list(query?: V2CustomerQuery): Promise<V2Customer[]>
    create(input: V2CustomerInput): Promise<V2Customer>
    update(input: V2CustomerUpdateInput): Promise<V2Customer>
  }
  studioSettings: {
    get(): Promise<V2StudioSettings>
    update(input: V2StudioSettingsUpdateInput): Promise<V2StudioSettings>
  }
  products: {
    list(includeDisabled?: boolean): Promise<V2Product[]>
    create(input: V2ProductInput): Promise<V2Product>
    update(input: V2ProductUpdateInput): Promise<V2Product>
    /** 读取主进程基于当前商品与全局设置计算的权威预计盈利。 */
    getExpectedProfit(productId: string): Promise<V2ProductExpectedProfit | null>
  }
  orders: {
    list(): Promise<V2OrderSummary[]>
    get(orderId: string): Promise<V2Order | null>
    create(input: V2OrderCreateInput): Promise<V2Order>
    changeContent(orderId: string, input: V2OrderContentChangeInput): Promise<V2Order>
    listContentChanges(orderId: string): Promise<V2OrderContentChange[]>
    listFunds(orderId: string): Promise<V2OrderFund[]>
    recordFund(orderId: string, input: V2OrderFundInput): Promise<V2OrderFund>
    correctFund(
      orderId: string,
      input: V2OrderFundCorrectionInput
    ): Promise<{ reversal: V2OrderFund; replacement: V2OrderFund }>
    listShipments(orderId: string): Promise<V2Shipment[]>
    createShipment(orderId: string, input: V2ShipmentInput): Promise<V2Shipment>
    voidShipment(
      orderId: string,
      shipmentId: string,
      input: V2ShipmentVoidInput
    ): Promise<V2Shipment>
  }
  orderFundProofs: {
    pick(): Promise<V2AttachmentReference | null>
    discardPrepared(attachmentId: string): Promise<void>
    get(fundId: string): Promise<V2OrderFundProof | null>
    attach(fundId: string, attachmentId: string): Promise<void>
    open(fundId: string): Promise<V2OrderFundProofOpenResult>
  }
  fulfillment: {
    createWorkAssignment(input: V2WorkAssignmentCreateInput): Promise<V2WorkAssignment>
    /** 缺勤或取消排班；已有有效核算的排班会被拒绝。 */
    setWorkAssignmentStatus(
      assignmentId: string,
      input: V2WorkAssignmentStatusUpdateInput
    ): Promise<V2WorkAssignment>
    reassignProcessTask(
      taskId: string,
      input: V2ProcessTaskReassignmentInput
    ): Promise<V2WorkAssignment>
    getWorkAssignment(id: string): Promise<V2WorkAssignment | null>
    listWorkAssignments(query?: V2WorkAssignmentQuery): Promise<V2WorkAssignment[]>
    getProcessResultForTask(taskId: string): Promise<V2ProcessResult | null>
    /** 制作一次核算：实际产出与合格数量，系统计算不合格与未完成。 */
    reviewMaking(input: V2MakingReviewInput): Promise<V2ProcessResult>
    correctMakingReview(input: V2MakingReviewCorrectionInput): Promise<V2ProcessResult>
    voidMakingReview(input: V2MakingReviewVoidInput): Promise<V2ProcessResult>
    adjustStageQuantity(input: V2FulfillmentAdjustmentInput): Promise<V2OrderItemFulfillment>
    getOrderItem(orderItemId: string): Promise<V2OrderItemFulfillment>
  }
  workTimeReviews: {
    list(query?: V2WorkTimeReviewQuery): Promise<V2WorkTimeReview[]>
    get(id: string): Promise<V2WorkTimeReview | null>
    /** 计时核算候选：从当前工序可处理的订单商品直接检索。 */
    listCandidates(
      assignmentId: string,
      query?: V2WorkTimeReviewCandidateQuery
    ): Promise<V2WorkTimeReviewCandidate[]>
    /** 计时一次核算：单个安排、单一时间范围与跨订单商品明细。 */
    review(input: V2WorkTimeReviewInput): Promise<V2WorkTimeReview>
    correct(input: V2WorkTimeReviewCorrectionInput): Promise<V2WorkTimeReview>
    void(id: string, input: V2WorkTimeReviewVoidInput): Promise<V2WorkTimeReview>
  }
  productInventory: {
    getSummary(productId: string): Promise<V2ProductInventorySummary>
    listEvents(productId: string): Promise<V2ProductStageInventoryEvent[]>
    recordOpening(input: V2ProductOpeningInput): Promise<V2ProductInventorySummary>
    adjust(input: V2ProductInventoryAdjustInput): Promise<V2ProductInventorySummary>
    allocateToOrder(
      input: V2ProductInventoryAllocateInput
    ): Promise<V2ProductInventoryAllocationResult>
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
    updateDraft(
      id: string,
      input: V2WorkerSettlementDraftUpdateInput
    ): Promise<V2WorkerSettlementDetail>
    confirm(id: string): Promise<V2WorkerSettlementDetail>
    addWorkTimeAdjustment(
      id: string,
      input: V2WorkerSettlementWorkTimeAdjustmentInput
    ): Promise<V2WorkerSettlementDetail>
    listRefunds(query?: V2WorkerRefundQuery): Promise<V2WorkerRefundRecord[]>
    resolveRefund(id: string, input: V2WorkerRefundResolveInput): Promise<V2WorkerRefundRecord>
  }
  finance: {
    listCategories(
      direction?: V2FinanceDirection,
      includeDisabled?: boolean
    ): Promise<V2FinanceCategory[]>
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
    reimburseBatch(input: V2BatchReimbursementInput): Promise<V2BatchReimbursementResult>
    getMonthlySummary(month: string): Promise<V2MonthlyFinanceSummary>
  }
  afterSales: {
    listCases(query?: V2AfterSalesCaseQuery): Promise<V2AfterSalesCase[]>
    getCase(id: string): Promise<V2AfterSalesCase | null>
    createCase(input: V2AfterSalesCaseCreateInput): Promise<V2AfterSalesCase>
    updateCase(id: string, input: V2AfterSalesCaseUpdateInput): Promise<V2AfterSalesCase>
    linkCharge(afterSalesCaseId: string, financialEntryId: string): Promise<V2AfterSalesChargeLink>
  }
  reports: {
    listCustomerOrderInsights(): Promise<V2CustomerOrderInsights[]>
    getCustomerOrderInsights(customerId: string): Promise<V2CustomerOrderInsights | null>
    getOrderBusiness(): Promise<V2OrderBusinessReport>
    getOrderBusinessDetail(orderId: string): Promise<V2OrderBusinessDetail | null>
    getShippingListPreview(input: V2ShippingListPreviewInput): Promise<V2ShippingListDocument>
    getFulfillmentProgress(): Promise<V2FulfillmentProgressReport>
    getCapacityRiskReport(input: V2CapacityRiskReportInput): Promise<V2CapacityRiskReport>
    getDeliveryRiskReport(input: V2DeliveryRiskReportInput): Promise<V2DeliveryRiskReport>
    listConfirmedSettlements(): Promise<V2ConfirmedSettlementReport>
    getMonthlyOperation(month: string): Promise<V2MonthlyOperationReport>
    exportCurrentReport(input: V2ReportExportInput): Promise<V2ReportExportResult>
    exportOrderTable(input?: V2OrderTableExportInput): Promise<V2ReportExportResult>
    exportOrderDocuments(input: V2OrderDocumentsExportInput): Promise<V2ReportExportResult>
    exportShippingList(input?: V2ShippingListExportInput): Promise<V2ReportExportResult>
  }
  backup: {
    create(): Promise<V2BackupSummary>
    list(): Promise<V2BackupSummary[]>
    restore(input: V2BackupRestoreInput): Promise<V2BackupRestoreResult>
  }
}
