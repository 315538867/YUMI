// 由 feature-matrix.json 生成人类可读的功能保留矩阵报告。
//
//   node openspec/changes/rebuild-yumi-ui-system/scripts/render-feature-matrix.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(scriptDir, '..', '..', '..', '..')
const matrixPath = join(repoRoot, 'src/renderer/test/ui-baseline/feature-matrix.json')
const countsPath = join(repoRoot, 'src/renderer/test/ui-baseline/feature-matrix-counts.json')
const outPath = join(
  repoRoot,
  'openspec/changes/rebuild-yumi-ui-system/baselines/feature-matrix.md'
)

const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'))
const { counts } = JSON.parse(readFileSync(countsPath, 'utf8'))

const CATEGORY_LABELS = {
  view: '视图与结构',
  metric: '指标与汇总',
  list: '列表与表格',
  filter: '筛选、搜索与排序',
  action: '操作与流程',
  form: '表单与字段',
  state: '状态呈现',
  calendar: '日历与时间维度',
  interaction: '交互细节'
}

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS)

const lines = []
lines.push('# P0 功能保留矩阵（任务 1.5）')
lines.push('')
lines.push(
  '本文件由 `src/renderer/test/ui-baseline/feature-matrix.json` 生成，请勿手工编辑；改条目请改 JSON 后重新运行 `openspec/changes/rebuild-yumi-ui-system/scripts/render-feature-matrix.mjs`。'
)
lines.push('')
lines.push(
  '用途：P3 迁移任一家族前逐条核对，迁移后不得丢失其中任何一项。条目只增不减——确实要废弃的，必须先在任务说明里写明理由，再同步下调 `feature-matrix-counts.json`。'
)
lines.push('')

const grandTotal = matrix.families.reduce(
  (sum, family) => sum + family.pages.reduce((s, page) => s + page.features.length, 0),
  0
)
const pageCount = matrix.families.reduce((sum, family) => sum + family.pages.length, 0)

lines.push('## 规模总览')
lines.push('')
lines.push('| 家族 | 页面数 | 条目数 |')
lines.push('| --- | --- | --- |')
for (const family of matrix.families) {
  const total = family.pages.reduce((sum, page) => sum + page.features.length, 0)
  lines.push(`| ${family.label}（\`${family.id}\`） | ${family.pages.length} | ${total} |`)
}
lines.push(`| **合计** | **${pageCount}** | **${grandTotal}** |`)
lines.push('')

for (const family of matrix.families) {
  lines.push(`## ${family.label}`)
  lines.push('')
  for (const page of family.pages) {
    const key = `${family.id}.${page.module}`
    const recorded = counts[key]
    const drift = page.features.length - recorded
    lines.push(`### ${page.label} — \`${page.file}\``)
    lines.push('')
    lines.push(
      `目标 Pattern：${page.targetPatterns.map((pattern) => `\`${pattern}\``).join('、')} ｜ 条目 ${page.features.length} 条（登记下限 ${recorded}${drift > 0 ? `，已新增 ${drift}` : ''}）`
    )
    lines.push('')

    const byCategory = new Map()
    for (const entry of page.features) {
      const separator = entry.indexOf(':')
      const id = entry.slice(0, separator)
      const label = entry.slice(separator + 1).trim()
      const category = id.split('/')[0]
      if (!byCategory.has(category)) byCategory.set(category, [])
      byCategory.get(category).push(label)
    }

    for (const category of CATEGORY_ORDER) {
      const items = byCategory.get(category)
      if (!items) continue
      lines.push(`**${CATEGORY_LABELS[category]}**`)
      lines.push('')
      for (const item of items) lines.push(`- [ ] ${item}`)
      lines.push('')
    }
  }
}

lines.push('## 迁移已知风险（盘点时发现，需负责人确认）')
lines.push('')
lines.push('- `workers` 嵌入工资页时仍渲染页头，形成嵌套页头（1.2 已登记为已知项）。')
lines.push(
  '- `fulfillment` 页头的「导出排班」当前是空实现（`onClick` 直接返回）。迁移时需确认是补齐还是按未接线代码处理。'
)
lines.push(
  '- 脏值拦截行为不一致：订单页与客户页有脏值确认，设置页与商品页没有。迁移时需统一目标行为。'
)
lines.push('- 商品页返回列表即丢弃未保存修改，客户页会弹放弃修改确认。')
lines.push(
  '- 全仓现状普遍缺失：列排序、分页、多选批量、拖拽排班、键盘快捷键。这些是现状缺口，不是要保留的功能。'
)
lines.push('')

writeFileSync(outPath, `${lines.join('\n')}\n`)
console.log(
  `已生成 ${outPath.replace(`${repoRoot}/`, '')}：${matrix.families.length} 个家族 / ${pageCount} 个页面 / ${grandTotal} 条`
)
