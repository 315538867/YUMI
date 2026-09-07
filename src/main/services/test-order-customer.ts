import type { CustomerInput, OrderCustomerInput } from '@shared/contracts'
import type { StudioService } from './studio-service'

/** 为订单测试显式建立客户主档，避免依赖订单自动建档。 */
export function createOrderCustomer(
  service: StudioService,
  input: CustomerInput
): OrderCustomerInput {
  const customer = service.createCustomer(input)
  return {
    id: customer.id,
    name: customer.name,
    contact: customer.contact,
    defaultAddress: customer.defaultAddress
  }
}
