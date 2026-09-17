import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const indexPath = 'src/renderer/components/ui/index.ts'
const source = readFileSync(resolve(repoRoot, indexPath), 'utf8')

const UI_DIR = 'src/renderer/components/ui/'

const specifiers = new Map()
const runtimeExports = []
const typeOnlyExports = []

for (const match of source.matchAll(/export\s*\{([\s\S]*?)\}\s*from\s*'([^']+)'/g)) {
  const from = match[2].replace(/^\.\//, '')
  const file =
    [`${UI_DIR}${from}.tsx`, `${UI_DIR}${from}.ts`, `${UI_DIR}${from}/index.ts`].find((c) =>
      existsSync(resolve(repoRoot, c))
    ) ?? `${UI_DIR}${from}`

  for (const raw of match[1].split(',')) {
    const entry = raw.trim()
    if (!entry) continue
    const isType = entry.startsWith('type ')
    const name = entry
      .replace(/^type\s+/, '')
      .split(/\s+as\s+/)[0]
      .trim()
    if (!name) continue
    specifiers.set(name, file)
    ;(isType ? typeOnlyExports : runtimeExports).push(name)
  }
}

const matchingFiles = (name) => {
  try {
    return execFileSync('rg', ['--files-with-matches', '-w', name, 'src'], {
      cwd: repoRoot,
      encoding: 'utf8'
    })
      .split('\n')
      .filter(Boolean)
  } catch {
    return []
  }
}

const isTest = (f) => /\.test\.tsx?$/.test(f) || f.includes('/test/')
const isBarrel = (f) => f === indexPath

runtimeExports.sort()
typeOnlyExports.sort()

const declarations = {}
const consumers = {}
for (const name of runtimeExports) {
  const declaration = specifiers.get(name)
  declarations[name] = declaration
  consumers[name] = matchingFiles(name)
    .filter((f) => !isTest(f) && !isBarrel(f) && f !== declaration)
    .sort()
}

const zeroProductionUse = runtimeExports.filter((n) => consumers[n].length === 0)
const uiInternalOnly = runtimeExports.filter(
  (n) => consumers[n].length > 0 && consumers[n].every((f) => f.startsWith(UI_DIR))
)
const pageConsumed = runtimeExports.filter((n) => consumers[n].some((f) => !f.startsWith(UI_DIR)))

const baseline = {
  $comment:
    '由 OpenSpec 变更 rebuild-yumi-ui-system 的 baselines 脚本生成；改动 UI 导出面必须同步更新本文件，ui-inventory.test.ts 会校验。',
  source: indexPath,
  runtimeExports,
  typeOnlyExports,
  declarations,
  zeroProductionUse,
  uiInternalOnly
}

const baselinePath = 'src/renderer/test/ui-baseline/ui-inventory.json'
writeFileSync(resolve(repoRoot, baselinePath), `${JSON.stringify(baseline, null, 2)}\n`)

const reportDir = 'openspec/changes/rebuild-yumi-ui-system/baselines'
mkdirSync(resolve(repoRoot, reportDir), { recursive: true })

const lines = [
  '# P0 · UI 运行时导出与调用点盘点（任务 1.1）',
  '',
  `来源：\`${indexPath}\``,
  '',
  `- 运行时导出：${runtimeExports.length}`,
  `- 仅类型导出：${typeOnlyExports.length}`,
  `- 生产零使用：${zeroProductionUse.length}`,
  `- 仅被同层 ui 组件消费：${uiInternalOnly.length}`,
  `- 被页面/领域消费：${pageConsumed.length}`,
  '',
  '## 生产零使用（P1 任务 3.9 的候选删除清单）',
  '',
  '| 导出 | 声明文件 | 提案是否点名删除 |',
  '| --- | --- | --- |',
  ...zeroProductionUse.map((n) => {
    const named = [
      'YumiBusinessList',
      'YumiBusinessListItem',
      'YumiTaskRateSummary',
      'YumiDateTimePicker',
      'YumiDateTimeRangePicker'
    ].includes(n)
    return `| \`${n}\` | \`${declarations[n]}\` | ${named ? '是' : '**否，需决策**'} |`
  }),
  '',
  '## 仅被同层 ui 组件消费',
  '',
  '| 导出 | 声明文件 | 消费方 |',
  '| --- | --- | --- |',
  ...uiInternalOnly.map(
    (n) =>
      `| \`${n}\` | \`${declarations[n]}\` | ${consumers[n].map((c) => `\`${c}\``).join('<br>')} |`
  ),
  '',
  '## 被页面/领域消费',
  '',
  '| 导出 | 调用点文件数 | 声明文件 |',
  '| --- | --- | --- |',
  ...[...pageConsumed]
    .sort((a, b) => consumers[b].length - consumers[a].length)
    .map((n) => `| \`${n}\` | ${consumers[n].length} | \`${declarations[n]}\` |`),
  '',
  '## 全部运行时导出与调用点',
  '',
  '<details><summary>展开</summary>',
  '',
  ...runtimeExports.map(
    (n) =>
      `- \`${n}\` (${declarations[n]})\n${(consumers[n].length ? consumers[n] : ['— 无生产调用点']).map((c) => `  - ${c}`).join('\n')}`
  ),
  '',
  '</details>',
  ''
]
writeFileSync(resolve(repoRoot, reportDir, 'ui-inventory.md'), lines.join('\n'))

console.log(`wrote ${baselinePath}`)
console.log(`wrote ${reportDir}/ui-inventory.md`)
console.log(
  `runtime=${runtimeExports.length} typeOnly=${typeOnlyExports.length} zeroUse=${zeroProductionUse.length} uiInternalOnly=${uiInternalOnly.length} pageConsumed=${pageConsumed.length}`
)
console.log(`zeroUse: ${zeroProductionUse.join(', ')}`)
