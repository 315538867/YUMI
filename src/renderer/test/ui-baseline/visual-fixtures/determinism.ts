/**
 * 视觉验收数据集的确定性基础（任务 1.6）。
 *
 * 目标：同一份代码在任何机器、任何时区、任何第二天运行，都产出完全相同的夹具数据，
 * 这样基线截图与视觉比对才有意义。
 *
 * 约束：
 * - 不使用 `Date.now()` 与 `Math.random()`，也不读取宿主时区。
 * - 所有业务日期都是字面量 `YYYY-MM-DD`；所有审计时间都是带 `+08:00` 偏移的 ISO 字符串。
 * - 随机值只来自固定种子的伪随机数发生器，且发生器按调用顺序推进。
 */

/** 夹具固定使用的时区；所有 ISO 时间都必须带这个偏移。 */
export const FIXED_TIMEZONE = 'Asia/Shanghai'

/** 夹具的固定偏移量字符串。 */
export const FIXED_UTC_OFFSET = '+08:00'

/** 夹具的基准时刻：2026-03-18 周三 10:00（带偏移，不依赖宿主时区）。 */
export const FIXED_NOW_ISO = `2026-03-18T10:00:00${FIXED_UTC_OFFSET}`

/** 夹具的基准业务日期，同时也是「今天」。 */
export const FIXED_TODAY = '2026-03-18'

/** 视觉验收默认使用的随机种子。 */
export const FIXED_SEED = 20260318

/** 夹具固定的材料克单价：0.0034 元每克（整数微元，避免浮点）。 */
export const FIXED_MATERIAL_PRICE_MICRO_YUAN_PER_GRAM = 3400

/** 固定基准日期所在周的周一，用于周历夹具。 */
export const FIXED_WEEK_START = '2026-03-16'

export const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const

/**
 * mulberry32：32 位种子伪随机数发生器。实现固定、无平台差异，
 * 保证同一种子在任何 Node/Chromium 版本下产出同一序列。
 */
export const createRandom = (seed: number = FIXED_SEED) => {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }

  return {
    /** [0, 1) */
    next,
    /** [min, max] 闭区间整数 */
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    /** 从非空数组里取一项 */
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
    /** 以给定概率返回 true */
    chance: (probability: number) => next() < probability,
    /** 不修改入参的确定性洗牌 */
    shuffle: <T>(items: readonly T[]): T[] => {
      const copy = [...items]
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(next() * (index + 1))
        ;[copy[index], copy[swap]] = [copy[swap] as T, copy[index] as T]
      }
      return copy
    }
  }
}

export type FixtureRandom = ReturnType<typeof createRandom>

/** 顺序 id 生成器：保证同一构建顺序产出同一批 id。 */
export const createIdSequence = () => {
  const counters = new Map<string, number>()
  return (prefix: string) => {
    const next = (counters.get(prefix) ?? 0) + 1
    counters.set(prefix, next)
    return `${prefix}-${String(next).padStart(4, '0')}`
  }
}

export type FixtureIdSequence = ReturnType<typeof createIdSequence>

const pad = (value: number) => String(value).padStart(2, '0')

/** 在固定基准日期上加减天数，返回 `YYYY-MM-DD`（纯字符串运算，不经过 Date）。 */
export const shiftDate = (date: string, days: number): string => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const base = Date.UTC(year, month - 1, day)
  const shifted = new Date(base + days * 86400000)
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

/** 把业务日期转成带固定偏移的 ISO 审计时间，小时由调用方固定给出。 */
export const atFixedHour = (date: string, hour: number, minute = 0): string =>
  `${date}T${pad(hour)}:${pad(minute)}:00${FIXED_UTC_OFFSET}`

/** 按 key 做稳定排序，key 相同时保持原顺序，避免依赖引擎排序实现细节。 */
export const stableSortBy = <T>(items: readonly T[], keyOf: (item: T) => string): T[] =>
  items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const a = keyOf(left.item)
      const b = keyOf(right.item)
      if (a < b) return -1
      if (a > b) return 1
      return left.index - right.index
    })
    .map((entry) => entry.item)
