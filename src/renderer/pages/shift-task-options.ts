export type ShiftTaskOption = {
  id: string
  orderId: string
  productId: string
  label: string
}

type ShiftTaskSelection = {
  id: string
  orderItemId: string
}

function orderProductKey(item: Pick<ShiftTaskOption, 'orderId' | 'productId'>): string {
  return `${item.orderId}:${item.productId}`
}

export function getAvailableShiftTaskItems(
  items: readonly ShiftTaskOption[],
  tasks: readonly ShiftTaskSelection[],
  currentTaskId?: string
): ShiftTaskOption[] {
  const itemById = new Map(items.map((item) => [item.id, item]))
  const selectedOrderProducts = new Set(
    tasks
      .filter((task) => task.id !== currentTaskId)
      .map((task) => itemById.get(task.orderItemId))
      .filter((item): item is ShiftTaskOption => Boolean(item))
      .map(orderProductKey)
  )
  const currentOrderItemId = tasks.find((task) => task.id === currentTaskId)?.orderItemId
  return items.filter(
    (item) => item.id === currentOrderItemId || !selectedOrderProducts.has(orderProductKey(item))
  )
}
