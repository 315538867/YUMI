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
  V2FulfillmentAdjustmentInput, V2OpeningWipInput, V2OrderItemFulfillment, V2ProcessResult,
  V2ProcessResultInput, V2QualityInspection, V2QualityInspectionInput, V2WorkAssignment,
  V2WorkAssignmentCreateInput, V2WorkAssignmentQuery
} from './fulfillment'

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
  backup: {
    create(): Promise<V2BackupSummary>
    list(): Promise<V2BackupSummary[]>
    restore(input: V2BackupRestoreInput): Promise<V2BackupRestoreResult>
  }
}
