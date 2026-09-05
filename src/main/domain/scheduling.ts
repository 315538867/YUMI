import { differenceInMinutes, isAfter, parseISO } from 'date-fns'
import { requirePositive } from './errors'

export type ScheduleRiskCode =
  | 'WORKER_TIME_OVERLAP'
  | 'SHIFT_OVER_CAPACITY'
  | 'SHIFT_UNDER_CAPACITY'
  | 'MOLD_DAILY_CAPACITY_EXCEEDED'
  | 'DEADLINE_RISK'

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
  startTime: string
  endTime: string
  existingWorkerShifts: Array<{ startTime: string; endTime: string }>
  tasks: SchedulingTaskInput[]
}

export interface ShiftPreviewResult {
  shiftMinutes: number
  totalPlannedMinutes: number
  risks: ScheduleRisk[]
  canSaveWithConfirmation: true
}

function toDateTime(date: string, time: string): Date {
  const value = parseISO(`${date}T${time}:00`)
  if (Number.isNaN(value.getTime()) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error('排班时间格式必须为 HH:mm')
  }
  return value
}

function overlaps(
  startTime: string,
  endTime: string,
  otherStart: string,
  otherEnd: string,
  date: string
): boolean {
  const start = toDateTime(date, startTime)
  const end = toDateTime(date, endTime)
  const otherStartAt = toDateTime(date, otherStart)
  const otherEndAt = toDateTime(date, otherEnd)
  return start < otherEndAt && otherStartAt < end
}

export function previewShiftRisks(input: ShiftPreviewInput): ShiftPreviewResult {
  if (input.tasks.length === 0) throw new Error('排班至少需要一个订单商品任务')
  const start = toDateTime(input.date, input.startTime)
  const end = toDateTime(input.date, input.endTime)
  if (!isAfter(end, start)) throw new Error('结束时间必须晚于开始时间')

  const risks: ScheduleRisk[] = []
  const shiftMinutes = differenceInMinutes(end, start)
  const totalPlannedMinutes = input.tasks.reduce((total, task) => {
    requirePositive(task.plannedQuantity, '计划制作数量')
    requirePositive(task.standardMinutesPerUnit, '标准制作时长')
    requirePositive(task.completedQuantity, '已完成数量', true)
    requirePositive(task.dailyCapacity, '商品日产能')
    requirePositive(task.otherPlannedQuantityForDay, '当日已排数量', true)
    return total + task.plannedQuantity * task.standardMinutesPerUnit
  }, 0)

  if (
    input.existingWorkerShifts.some((shift) =>
      overlaps(input.startTime, input.endTime, shift.startTime, shift.endTime, input.date)
    )
  ) {
    risks.push({
      code: 'WORKER_TIME_OVERLAP',
      level: 'critical',
      message: '该兼职人员在此时段已有重叠排班。'
    })
  }
  if (totalPlannedMinutes > shiftMinutes) {
    risks.push({
      code: 'SHIFT_OVER_CAPACITY',
      level: 'critical',
      message: `计划任务超出排班时长 ${totalPlannedMinutes - shiftMinutes} 分钟。`
    })
  }
  if (totalPlannedMinutes < shiftMinutes) {
    risks.push({
      code: 'SHIFT_UNDER_CAPACITY',
      level: 'warning',
      message: `排班尚有 ${shiftMinutes - totalPlannedMinutes} 分钟未分配。`
    })
  }
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
      risks.push({
        code: 'DEADLINE_RISK',
        level: 'critical',
        message: '该任务排在订单最晚完成制作日期之后。'
      })
    }
  }

  return { shiftMinutes, totalPlannedMinutes, risks, canSaveWithConfirmation: true }
}
