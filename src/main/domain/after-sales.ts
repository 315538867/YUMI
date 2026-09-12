import type { Cents } from '@shared/contracts/index'
import { DomainValidationError } from './errors'

export const afterSalesStatuses = ['open', 'processing', 'resolved', 'cancelled'] as const
export type AfterSalesStatus = (typeof afterSalesStatuses)[number]

export interface AfterSalesCaseInput {
  orderId: string
  shipmentId: string | null
  occurredOn: string
  reasonDescription: string
  customerRequest: string | null
  responsibilityDescription: string
  handlingDescription: string
  status: AfterSalesStatus
  customerChargeNote: string | null
  accountingCostCents: Cents
  note: string | null
}

export interface AfterSalesAccountingSnapshot {
  accountingCostCents: Cents
  createsOperatingExpense: false
  createsCustomerCharge: false
}

export interface AfterSalesChargeLinkInput {
  afterSalesOrderId: string
  financialEntry: {
    orderId: string | null
    sourceType: string
    direction: string
    businessType: string
  }
}

function requireNonBlank(value: string | null | undefined, label: string): string {
  if (!value?.trim()) throw new DomainValidationError(`${label}不能为空`)
  return value.trim()
}

function requireBusinessDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new DomainValidationError(`${label}必须是有效日期`)
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new DomainValidationError(`${label}必须是有效日期`)
  }
  return value
}

function requireNonNegativeCents(value: Cents, label: string): Cents {
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainValidationError(`${label}必须是非负整数分`)
  }
  return value
}

/** 售后只保留负责人填写的事实，不在此处推断责任、收费或履约动作。 */
export function validateAfterSalesCase(input: AfterSalesCaseInput): void {
  requireNonBlank(input.orderId, '订单标识')
  if (input.shipmentId !== null) requireNonBlank(input.shipmentId, '发货批次标识')
  requireBusinessDate(input.occurredOn, '售后发生日期')
  requireNonBlank(input.reasonDescription, '售后原因说明')
  requireNonBlank(input.responsibilityDescription, '责任归属说明')
  requireNonBlank(input.handlingDescription, '处理内容说明')
  if (!afterSalesStatuses.includes(input.status)) throw new DomainValidationError('售后状态不合法')
  requireNonNegativeCents(input.accountingCostCents, '售后核算成本')
}

/** 售后核算成本用于订单成本参考，不构造日常现金支出或客户收费。 */
export function createAfterSalesAccountingSnapshot(
  input: AfterSalesCaseInput
): AfterSalesAccountingSnapshot {
  validateAfterSalesCase(input)
  return {
    accountingCostCents: input.accountingCostCents,
    createsOperatingExpense: false,
    createsCustomerCharge: false
  }
}

/** 客户实际收费须先作为订单资金流水登记，再由负责人显式关联至售后单。 */
export function validateAfterSalesChargeLink(input: AfterSalesChargeLinkInput): void {
  const orderId = requireNonBlank(input.afterSalesOrderId, '售后订单标识')
  if (input.financialEntry.orderId !== orderId) {
    throw new DomainValidationError('售后收费流水必须关联同一订单')
  }
  if (
    input.financialEntry.sourceType !== 'order_fund' ||
    input.financialEntry.direction !== 'income' ||
    input.financialEntry.businessType !== 'after_sales_charge'
  ) {
    throw new DomainValidationError('售后收费必须关联订单售后收费流水')
  }
}
