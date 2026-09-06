export interface ProductSummary {
  id: string
  name: string
  code: string | null
  category: string | null
  basePriceCents: number
  edgePriceCents: number
  enabled: boolean
  standardMinutesPerUnit: number
  dailyCapacity: number
}

export interface ProductDetail extends ProductSummary {
  weightGrams: number
  lossRate: number
  packagingCostCents: number
  accessoryCostCents: number
  replacementBagCostCents: number
  commissionCentsPerUnit: number
  moldCount: number
  outputPerMoldPerBatch: number
  maxBatchesPerDay: number
  imagePath: string | null
  notes: string | null
}

export interface CostSettings {
  id: string
  gluePriceCentsPerGram: number
  defaultHourlyWageCents: number
  effectiveFrom: string
  createdAt: string
}

export interface CostSettingsInput {
  gluePriceCentsPerGram: number
  defaultHourlyWageCents?: number
  effectiveFrom: string
}

export interface OrderDefaults {
  defaultReserveDays: number
}

export interface AuditLogSummary {
  id: string
  action: string
  entityType: string
  entityId: string
  actorName: string
  createdAt: string
}

export interface AuditLogDetail extends AuditLogSummary {
  before: unknown
  after: unknown
  metadata: unknown
}

export interface AuditLogInput {
  action: string
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
  metadata?: unknown
}

export type AttachmentKind = 'payment_receipt' | 'product_image'

export interface AttachmentSummary {
  id: string
  kind: AttachmentKind
  originalName: string
  storagePath: string
  mimeType: string | null
  sizeBytes: number
  createdAt: string
}

export type BackupReason = 'manual' | 'pre_restore'

export interface BackupSummary {
  id: string
  backupPath: string
  createdAt: string
  reason: BackupReason
  applicationVersion: string
  attachmentCount: number
}

export interface BackupRestoreInput {
  backupPath: string
  confirmed: boolean
}

export interface BackupRestoreResult {
  restoredBackup: BackupSummary
  safetyBackup: BackupSummary
}

export interface LastRestoreResult extends BackupRestoreResult {
  restoredAt: string
}

export interface LastExportResult {
  kind: ReportExportKind
  savedPath: string
  exportedAt: string
}

export interface LocalDataActivity {
  lastBackup: BackupSummary | null
  lastRestore: LastRestoreResult | null
  lastExport: LastExportResult | null
}

export type ProductionStatus =
  | 'pending_confirmation'
  | 'pending_schedule'
  | 'in_production'
  | 'pending_shipment'
  | 'completed'
  | 'cancelled'

export type FinancialStatus = 'unpaid' | 'partial' | 'paid' | 'refunding' | 'refunded' | 'overpaid'

export type ProductionScheduleStatus =
  | 'pending_schedule'
  | 'partially_scheduled'
  | 'fully_scheduled'
  | 'pending_replenishment'
  | 'production_completed'

export interface ProductionProgressSummary {
  orderedQuantity: number
  qualifiedQuantity: number
  unqualifiedQuantity: number
  scheduledQuantity: number
  coveredQuantity: number
  unplannedQuantity: number
  excessQuantity: number
  status: ProductionScheduleStatus
}

export interface CustomerProfile {
  id: string
  name: string
  contact: string | null
  defaultAddress: string | null
  notes: string | null
  createdAt?: string
  updatedAt?: string
}

export interface CustomerInput {
  name: string
  contact?: string | null
  defaultAddress?: string | null
  notes?: string | null
}

export interface CustomerUpdateInput extends CustomerInput {
  id: string
}

export interface OrderCustomerInput {
  id: string
  name: string
  contact?: string | null
  defaultAddress?: string | null
}

export interface CustomerManagementQuery {
  keyword?: string
}

export interface CustomerOverview extends CustomerProfile {
  orderCount: number
  pendingShipmentOrderCount: number
  outstandingCents: number
  latestOrderAt: string | null
}

export interface ProductOrderSnapshot {
  productId: string
  name: string
  code: string | null
  category: string | null
  basePriceCents: number
  edgePriceCents: number
  weightGrams: number
  lossRate: number
  standardMinutesPerUnit: number
  packagingCostCents: number
  accessoryCostCents: number
  replacementBagCostCents: number
  commissionCentsPerUnit: number
  moldCount: number
  outputPerMoldPerBatch: number
  maxBatchesPerDay: number
  gluePriceCentsPerGram: number
  defaultHourlyWageCents?: number
}

export interface OrderItemInput {
  id?: string
  productId: string
  quantity: number
  unitPriceCents?: number
  edgeEnabled?: boolean
  edgeQuantity?: number
  edgePriceCents?: number
  discountCents?: number
}

export interface OrderCreateInput {
  customer: OrderCustomerInput
  expectedShipDate: string
  reserveDays?: number
  discountCents?: number
  notes?: string | null
  items: OrderItemInput[]
}

export interface OrderUpdateInput extends OrderCreateInput {
  id: string
}

export interface OrderItemDetail {
  id: string
  productId: string
  productSnapshot: ProductOrderSnapshot
  quantity: number
  unitPriceCents: number
  edgeEnabled: boolean
  edgeQuantity: number
  edgePriceCents: number
  discountCents: number
  estimatedCostCents: number
  progress: ProductionProgressSummary
}

export interface OrderScheduleSummary {
  id: string
  workerId: string
  workerName: string
  shiftDate: string
  status: ShiftStatus
  plannedQuantity: number
  qualifiedQuantity: number
  unqualifiedQuantity: number
  unfinishedQuantity: number
  orderItemId: string
  productName: string
}

export interface ShipmentItemInput {
  orderItemId: string
  quantity: number
}

export interface ShipmentCreateInput {
  orderId: string
  shippedAt: string
  notes?: string | null
  items: ShipmentItemInput[]
}

export interface ShipmentUpdateInput extends ShipmentCreateInput {
  id: string
}

export interface OrderShipmentSummary {
  orderItemId: string
  productName: string
  orderedQuantity: number
  shippedQuantity: number
  pendingQuantity: number
}

export interface ShipmentItemDetail extends OrderShipmentSummary {
  shipmentQuantity: number
}

export interface ShipmentDetail {
  id: string
  orderId: string
  shippedAt: string
  notes: string | null
  items: ShipmentItemDetail[]
  createdAt: string
  updatedAt: string
}

export interface OrderSheetExportInput {
  orderId: string
}

export interface ShipmentManifestExportInput {
  orderId: string
  shipmentId: string
}

export interface MonthlyProductionWeightQuery {
  month: string
}

export interface MonthlyProductionWeightReport {
  month: string
  completedQuantity: number
  qualifiedQuantity: number
  unqualifiedQuantity: number
  totalWeightGrams: number
  totalWeightKilograms: number
}

export interface PaymentRecordInput {
  orderId: string
  type: 'receipt' | 'refund'
  amountCents: number
  paymentMethod: string
  paidAt: string
  note?: string | null
  receiptAttachmentId?: string | null
}

export interface PaymentRecord extends PaymentRecordInput {
  id: string
  createdAt: string
}

export interface OrderFinancialSummary {
  receivableCents: number
  receivedCents: number
  refundedCents: number
  receivedNetCents: number
  outstandingCents: number
  status: FinancialStatus
}

export interface CustomerDetail extends CustomerOverview {
  orders: OrderSummary[]
}

export interface OrderDetail {
  id: string
  code: string
  customerId: string | null
  customer: CustomerProfile
  expectedShipDate: string
  reserveDays: number
  productionDeadline: string
  productionStatus: ProductionStatus
  schedulingStatus: ProductionScheduleStatus
  progress: ProductionProgressSummary
  discountCents: number
  receivableCents: number
  estimatedCostCents: number
  actualCostCents: number
  notes: string | null
  items: OrderItemDetail[]
  payments: PaymentRecord[]
  financial: OrderFinancialSummary
  relatedSchedules: OrderScheduleSummary[]
  createdAt: string
  updatedAt: string
}

export interface OrderProductionStatusInput {
  orderId: string
  productionStatus: ProductionStatus
}

export type ScheduleRiskCode =
  'MOLD_DAILY_CAPACITY_EXCEEDED' | 'DEADLINE_RISK' | 'ORDER_QUANTITY_EXCEEDED'

export interface ScheduleRisk {
  code: ScheduleRiskCode
  level: 'warning' | 'critical'
  message: string
  orderItemId?: string
  orderCode?: string
  orderedQuantity?: number
  qualifiedQuantity?: number
  scheduledQuantity?: number
  requestedQuantity?: number
  excessQuantity?: number
}

export interface ShiftTaskInput {
  orderItemId: string
  plannedQuantity: number
}

export interface ShiftInput {
  workerId: string
  shiftDate: string
  extraMinutes?: number
  tasks: ShiftTaskInput[]
  confirmedWarningCodes?: ScheduleRiskCode[]
}

export interface ShiftUpdateInput extends ShiftInput {
  id: string
}

export interface ShiftPreviewTaskProgress {
  orderItemId: string
  productName: string
  progress: ProductionProgressSummary
}

export interface ShiftPreviewResult {
  taskProgress: ShiftPreviewTaskProgress[]
  taskBaseMinutes: Array<{ orderItemId: string; baseMinutes: number }>
  baseTaskMinutes: number
  extraMinutes: number
  totalMinutes: number
  risks: ScheduleRisk[]
  canSaveWithConfirmation: true
}

export interface ShiftDetail extends ShiftSummary {
  tasks: Array<{
    id: string
    orderItemId: string
    productId: string
    productName: string
    orderId: string
    orderCode: string
    plannedQuantity: number
    estimatedMinutes: number
    baseMinutes: number
    actualMinutes: number | null
    completedQuantity: number | null
    qualifiedQuantity: number
    unqualifiedQuantity: number | null
    reworkQuantity: number
    scrapQuantity: number
    actualLaborCostCents: number
    commissionCostCents: number
    unfinishedQuantity: number
  }>
}

export type ShiftStatus = 'scheduled' | 'leave' | 'absent' | 'late' | 'cancelled' | 'completed'

export interface ShiftTaskCompletionInput {
  shiftTaskId: string
  qualifiedQuantity: number
  unqualifiedQuantity: number
}

export interface ShiftStatusInput {
  shiftId: string
  status: ShiftStatus
  taskCompletions?: ShiftTaskCompletionInput[]
}

export interface ProductionRecordInput {
  shiftTaskId: string
  actualMinutes: number
  qualifiedQuantity: number
  reworkQuantity: number
  scrapQuantity: number
}

export interface ProductionRecord extends ProductionRecordInput {
  id: string
  actualLaborCostCents: number
  commissionCostCents: number
  recordedAt: string
}

export interface OrderSummary {
  id: string
  code: string
  customerName: string
  expectedShipDate: string
  productionDeadline: string
  productionStatus: ProductionStatus
  schedulingStatus: ProductionScheduleStatus
  progress: ProductionProgressSummary
  receivableCents: number
  receivedNetCents: number
  outstandingCents: number
  financialStatus: FinancialStatus
}

export interface WorkerWageHistory {
  id: string
  workerId: string
  hourlyWageCents: number
  effectiveFrom: string
  createdAt: string
}

export interface WorkerUpdateInput extends WorkerCreateInput {
  id: string
  active: boolean
  effectiveFrom: string
}

export interface WorkerSummary {
  id: string
  name: string
  hourlyWageCents: number
  defaultWorkStart: string | null
  defaultWorkEnd: string | null
  active: boolean
}

export interface WorkerShiftSummary extends ShiftSummary {
  actualMinutes: number
  qualifiedQuantity: number
  commissionCostCents: number
}

export interface WorkerOrderTaskSummary {
  shiftId: string
  shiftDate: string
  shiftStatus: ShiftStatus
  orderId: string
  orderCode: string
  orderItemId: string
  productName: string
  plannedQuantity: number
  qualifiedQuantity: number
  unqualifiedQuantity: number
  unfinishedQuantity: number
}

export interface WorkerDetail extends WorkerSummary {
  phone: string | null
  wageHistory: WorkerWageHistory[]
  shifts: WorkerShiftSummary[]
  orderTasks: WorkerOrderTaskSummary[]
  totalActualMinutes: number
  totalQualifiedQuantity: number
  totalCommissionCostCents: number
  absenceCount: number
}

export interface ShiftSummary {
  id: string
  workerId: string
  workerName: string
  shiftDate: string
  startTime: string | null
  endTime: string | null
  baseTaskMinutes: number
  extraMinutes: number
  totalMinutes: number
  status: string
  taskCount: number
  confirmedRisks: string[]
}

export interface DashboardSummary {
  outstandingOrderCount: number
  outstandingCents: number
  upcomingOrderCount: number
  rescheduleTaskCount: number
  riskShiftCount: number
}

export interface OrderProfitReportQuery {
  fromDate: string
  toDate: string
  productionStatus?: ProductionStatus | 'all'
  outstandingOnly?: boolean
}

export interface OrderProfitReportRow {
  id: string
  code: string
  customerName: string
  expectedShipDate: string
  productionStatus: ProductionStatus
  financialStatus: FinancialStatus
  receivableCents: number
  receivedNetCents: number
  outstandingCents: number
  estimatedCostCents: number
  actualCostCents: number
  estimatedProfitCents: number
  actualProfitCents: number
}

export interface OrderProfitReport {
  rows: OrderProfitReportRow[]
  totals: {
    orderCount: number
    receivableCents: number
    receivedNetCents: number
    outstandingCents: number
    estimatedCostCents: number
    actualCostCents: number
    estimatedProfitCents: number
    actualProfitCents: number
  }
}

export interface WorkerSettlementReportQuery {
  fromDate: string
  toDate: string
}

export interface WorkerSettlementReportRow {
  workerId: string
  workerName: string
  actualMinutes: number
  qualifiedQuantity: number
  laborCostCents: number
  commissionCostCents: number
  absenceCount: number
}

export interface WorkerSettlementReport {
  rows: WorkerSettlementReportRow[]
  totals: {
    workerCount: number
    actualMinutes: number
    qualifiedQuantity: number
    laborCostCents: number
    commissionCostCents: number
    absenceCount: number
  }
}

export interface CapacityRiskReportQuery {
  fromDate: string
  toDate: string
}

export interface ProductCapacityReportRow {
  productId: string
  productName: string
  estimatedCostPerUnitCents: number
  dailyCapacity: number
  plannedQuantity: number
  qualifiedQuantity: number
}

export interface DailyCapacityReportRow {
  date: string
  productId: string
  productName: string
  plannedQuantity: number
  qualifiedQuantity: number
  dailyCapacity: number
  pendingScheduleQuantity: number
}

export interface DeliveryRiskReportRow {
  orderId: string
  orderCode: string
  customerName: string
  expectedShipDate: string
  productionDeadline: string
  remainingQuantity: number
  pendingScheduleQuantity: number
  riskReasons: string[]
}

export interface CapacityRiskReport {
  products: ProductCapacityReportRow[]
  daily: DailyCapacityReportRow[]
  risks: DeliveryRiskReportRow[]
}

export type ReportExportKind = 'orders' | 'workers' | 'capacity'

export interface ReportExportInput {
  kind: ReportExportKind
  fromDate: string
  toDate: string
  productionStatus?: ProductionStatus | 'all'
  outstandingOnly?: boolean
}

export interface ProductCreateInput {
  name: string
  code?: string | null
  category?: string | null
  basePriceCents: number
  edgePriceCents: number
  weightGrams: number
  lossRate: number
  standardMinutesPerUnit: number
  packagingCostCents: number
  accessoryCostCents?: number
  replacementBagCostCents?: number
  commissionCentsPerUnit: number
  moldCount: number
  outputPerMoldPerBatch: number
  maxBatchesPerDay: number
  imagePath?: string | null
  notes?: string | null
}

export interface ProductUpdateInput extends ProductCreateInput {
  id: string
  enabled: boolean
}

export interface ProductCostPreviewInput extends ProductCreateInput {
  quantity: number
  edgeEnabled: boolean
  edgeQuantity: number
}

export interface ProductCostPreview {
  appliedHourlyWageCents: number
  glueGrams: number
  glueCostCents: number
  packagingCostCents: number
  accessoryCostCents: number
  replacementBagCostCents: number
  laborMinutes: number
  laborCostCents: number
  commissionCostCents: number
  edgeRevenueCents: number
  totalCostCents: number
  dailyCapacity: number
}

export interface DemoDataSummary {
  products: number
  orders: number
  workers: number
  shifts: number
  generatedAt: string
}

export interface WorkerCreateInput {
  name: string
  hourlyWageCents: number
  phone?: string
  defaultWorkStart?: string
  defaultWorkEnd?: string
}

export interface YumiApi {
  health(): Promise<{ version: string; databaseReady: boolean }>
  dashboard: { get(): Promise<DashboardSummary> }
  demo: { load(): Promise<DemoDataSummary> }
  reports: {
    orderProfit(query: OrderProfitReportQuery): Promise<OrderProfitReport>
    workerSettlement(query: WorkerSettlementReportQuery): Promise<WorkerSettlementReport>
    capacityRisk(query: CapacityRiskReportQuery): Promise<CapacityRiskReport>
    monthlyProductionWeight(
      query: MonthlyProductionWeightQuery
    ): Promise<MonthlyProductionWeightReport>
    export(input: ReportExportInput): Promise<{ savedPath: string | null }>
  }
  products: {
    list(): Promise<ProductSummary[]>
    get(id: string): Promise<ProductDetail | null>
    create(input: ProductCreateInput): Promise<ProductDetail>
    update(input: ProductUpdateInput): Promise<ProductDetail>
    previewCost(input: ProductCostPreviewInput): Promise<ProductCostPreview>
  }
  attachments: {
    chooseAndImport(kind: AttachmentKind): Promise<AttachmentSummary | null>
    delete(id: string): Promise<boolean>
  }
  backup: {
    create(): Promise<BackupSummary>
    list(): Promise<BackupSummary[]>
    activity(): Promise<LocalDataActivity>
    chooseRestoreSource(): Promise<BackupSummary | null>
    restore(input: BackupRestoreInput): Promise<BackupRestoreResult>
  }
  settings: {
    getCost(): Promise<CostSettings>
    updateCost(input: CostSettingsInput): Promise<CostSettings>
    getOrderDefaults(): Promise<OrderDefaults>
    updateOrderDefaults(input: OrderDefaults): Promise<OrderDefaults>
    listAuditLogs(): Promise<AuditLogSummary[]>
  }
  customers: {
    list(): Promise<CustomerProfile[]>
    listManagement(input?: CustomerManagementQuery): Promise<CustomerOverview[]>
    getDetail(customerId: string): Promise<CustomerDetail | null>
    create(input: CustomerInput): Promise<CustomerProfile>
    update(input: CustomerUpdateInput): Promise<CustomerProfile>
    delete(customerId: string): Promise<void>
    history(customerId: string): Promise<OrderSummary[]>
  }
  orders: {
    list(): Promise<OrderSummary[]>
    get(id: string): Promise<OrderDetail | null>
    create(input: OrderCreateInput): Promise<OrderDetail>
    update(input: OrderUpdateInput): Promise<OrderDetail>
    recordPayment(input: PaymentRecordInput): Promise<OrderDetail>
    updateProductionStatus(input: OrderProductionStatusInput): Promise<OrderDetail>
    shipmentSummary(orderId: string): Promise<OrderShipmentSummary[]>
    listShipments(orderId: string): Promise<ShipmentDetail[]>
    createShipment(input: ShipmentCreateInput): Promise<ShipmentDetail>
    updateShipment(input: ShipmentUpdateInput): Promise<ShipmentDetail>
    exportOrderSheet(input: OrderSheetExportInput): Promise<{ savedPath: string | null }>
    exportShipmentManifest(
      input: ShipmentManifestExportInput
    ): Promise<{ savedPath: string | null }>
  }
  workers: {
    list(): Promise<WorkerSummary[]>
    get(id: string): Promise<WorkerDetail | null>
    create(input: WorkerCreateInput): Promise<WorkerSummary>
    update(input: WorkerUpdateInput): Promise<WorkerSummary>
  }
  production: {
    record(input: ProductionRecordInput): Promise<ProductionRecord>
  }
  schedule: {
    list(from: string, to: string): Promise<ShiftSummary[]>
    get(id: string): Promise<ShiftDetail | null>
    preview(input: ShiftInput | ShiftUpdateInput): Promise<ShiftPreviewResult>
    save(input: ShiftInput): Promise<ShiftSummary>
    update(input: ShiftUpdateInput): Promise<ShiftSummary>
    updateStatus(input: ShiftStatusInput): Promise<ShiftSummary>
  }
}
