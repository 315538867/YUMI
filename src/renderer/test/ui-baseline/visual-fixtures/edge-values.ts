/**
 * 视觉验收用的边界值样本（任务 1.6）。
 *
 * 覆盖设计文档要求的三类极端：最长中文文案、极端金额、极端记录数量。
 * 这些值刻意贴近但不越过契约边界（金额一律整数分，重量一律整数毫克）。
 */
import type { Cents, WeightMilligrams } from '@shared/contracts/index'

/** 中文排版最容易被挤坏的场景：超长且不含空格的连续中文。 */
export const LONG_TEXT = {
  /** 18 字客户名，用于验证列表单元格与页头截断 */
  customerName: '杭州余杭捏捏手工定制礼品工作室旗舰店客户王女士',
  /** 12 字联系人，含微信风格后缀 */
  contact: '王女士（微信同号）',
  /** 22 字快递地址 */
  address: '浙江省杭州市余杭区五常街道文一西路 969 号淘宝城 5 号楼 302 室',
  /** 20 字商品名 */
  productName: '奶油胶手工捏捏解压玩具定制礼盒装（含缝边工艺）',
  /** 24 字订单备注 */
  orderNotes: '客户要求本周五前发出，外箱贴易碎标签，务必核对缝边颜色为奶油白',
  /** 16 字类目名 */
  categoryName: '平台推广与短视频投流费用',
  /** 14 字垫付人备注 */
  payerNote: '负责义乌小商品城零星采买的长期合作供应商',
  /** 12 字结算备注 */
  managerNote: '本月含一次补发与两次返工，已与负责人当面核对',
  /** 20 字售后说明 */
  afterSalesNote: '客户反馈第二只捏捏边缘开胶，已协商免费重做并用顺丰补发',
  /** 10 字人员备注 */
  workerNote: '擅长大批量捏毛装袋工序',
  /** 15 字任务备注 */
  taskNote: '返工件，需按负责人提供的色卡重新配色'
} as const

/** 空值边界：这些字段全部取 null，用来验证界面回退文案。 */
export const NULL_TEXT_SAMPLES = {
  contact: null,
  defaultAddress: null,
  notes: null,
  managerNote: null
} as const

/**
 * 极端金额（整数分）。
 * 上界选在 100 万元以内但足够撑破数字列宽；同时包含 0 与 1 分两个下界。
 */
export const EXTREME_AMOUNTS = {
  zero: 0 as Cents,
  oneCent: 1 as Cents,
  /** 9,999,999.99 元 */
  huge: 999999999 as Cents,
  /** 1,234,567.89 元，用于验证千分位换行 */
  wide: 123456789 as Cents,
  /** 负向极值，用于冲正与退款列 */
  hugeNegative: -999999999 as Cents
} as const

/** 极端数量。 */
export const EXTREME_QUANTITIES = {
  min: 1,
  /** 四位数，用来验证数字列宽与紧凑排列 */
  huge: 9999
} as const

/** 极端重量（整数毫克）：1 毫克与 12.345 千克。 */
export const EXTREME_WEIGHTS = {
  min: 1 as WeightMilligrams,
  huge: 12345000 as WeightMilligrams
} as const

/** 极端时长（分钟）：0 与 48 小时。 */
export const EXTREME_MINUTES = {
  zero: 0,
  huge: 2880
} as const

/** 材料克单价（微元每克）：0.000001 元与 1 元。 */
export const EXTREME_MATERIAL_PRICE = {
  min: 1,
  max: 1000000
} as const

/** 记录数量边界：小到空态附近，大到需要横向滚动。 */
export const RECORD_COUNT_LEVELS = {
  empty: 0,
  single: 1,
  typical: 7,
  crowded: 24
} as const
