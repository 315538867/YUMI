import { requirePositive } from './errors'

export type ScheduleRiskCode = 'MOLD_DAILY_CAPACITY_EXCEEDED' | 'DEADLINE_RISK'

export interface ScheduleRisk {
  code: ScheduleRiskCode
  level: 'warning' | 'critical'
  message: string
}

export interface SchedulingTaskInput {
  productId: string
  orderItemId: string
  plannedQuantity: number
  standardMinutesPerUnit: number
  completedQuantity: number
  dueDate: string
  dailyCapacity: number
  otherPlannedQuantityForDay: number
}

export interface ShiftPreviewInput {
  date: string
  extraMinutes: number
  tasks: SchedulingTaskInput[]
}

export interface ShiftPreviewResult {
  taskBaseMinutes: Array<{ orderItemId: string; baseMinutes: number }>
  baseTaskMinutes: number
  extraMinutes: number
  totalMinutes: number
  risks: ScheduleRisk[]
  canSaveWithConfirmation: true
}

export function previewShiftRisks(input: ShiftPreviewInput): ShiftPreviewResult {
  if (input.tasks.length === 0) throw new Error('排班至少需要一个订单商品任务')
  if (!Number.isInteger(input.extraMinutes) || input.extraMinutes < 0) {
    throw new Error('额外预留时长必须为非负整数')
  }

  const risks: ScheduleRisk[] = []
  const taskBaseMinutes = input.tasks.map((task) => {
    requirePositive(task.plannedQuantity, '计划制作数量')
    if (!Number.isFinite(task.standardMinutesPerUnit) || task.standardMinutesPerUnit < 0) {
      throw new Error('标准制作时长不能为负数')
    }
    requirePositive(task.completedQuantity, '已完成数量', true)
    requirePositive(task.dailyCapacity, '商品日产能')
    requirePositive(task.otherPlannedQuantityForDay, '当日已排数量', true)
    return { orderItemId: task.orderItemId, baseMinutes: Math.ceil(task.plannedQuantity * task.standardMinutesPerUnit) }
  })
  const baseTaskMinutes = taskBaseMinutes.reduce((total, task) => total + task.baseMinutes, 0)
  for (const task of input.tasks) {
    const dailyPlanned = task.otherPlannedQuantityForDay + task.plannedQuantity
    if (dailyPlanned > task.dailyCapacity) {
      risks.push({
        code: 'MOLD_DAILY_CAPACITY_EXCEEDED',
        level: 'critical',
        message: `商品 ${task.productId} 当日计划 ${dailyPlanned} 件，超过模具日产能 ${task.dailyCapacity} 件。`
      })
    }
    if (input.date > task.dueDate && task.plannedQuantity > task.completedQuantity) {
      risks.push({ code: 'DEADLINE_RISK', level: 'critical', message: '该任务排在订单最晚完成制作日期之后。' })
    }
  }
  return {
    taskBaseMinutes,
    baseTaskMinutes,
    extraMinutes: input.extraMinutes,
    totalMinutes: baseTaskMinutes + input.extraMinutes,
    risks,
    canSaveWithConfirmation: true
  }
}
