import { format } from 'date-fns'

const invalidFileNameCharacter = /[<>:"/\\|?*]/g

function fileNameCustomerName(customerName: string): string {
  const normalized = customerName.trim().replace(invalidFileNameCharacter, '_')
  return normalized || '未命名客户'
}

export function buildDocumentDefaultFileName(
  savedAt: Date,
  documentType: '订单表' | '发货清单',
  customerName: string
): string {
  return `${format(savedAt, 'yyyyMMdd-HHmmss')}-${documentType}-${fileNameCustomerName(customerName)}.xlsx`
}
