// 把 1.6 的确定性数据集导出成 JSON，供截图用的 stub preload 读取。
//
// 为什么需要这一步：数据集是 TypeScript 且用 `@shared/*` 路径别名，Electron 的
// preload 只能是 CommonJS、也读不了 TS。这里用 esbuild 打包一次，产出纯 JSON。
//
//   node openspec/changes/rebuild-yumi-ui-system/visual-harness/emit-fixtures.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const harnessDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(harnessDir, '..', '..', '..', '..')

const entry = join(harnessDir, '.emit-entry.ts')
const bundle = join(harnessDir, '.emit-entry.mjs')
const output = join(harnessDir, 'fixtures.json')

writeFileSync(
  entry,
  [
    "import { writeFileSync } from 'node:fs'",
    "import { buildVisualDataset } from '../../../../src/renderer/test/ui-baseline/visual-fixtures/dataset'",
    `const dataset = buildVisualDataset()`,
    `writeFileSync(${JSON.stringify(output)}, JSON.stringify(dataset, null, 2))`,
    ''
  ].join('\n')
)

try {
  execFileSync(
    join(repoRoot, 'node_modules/.bin/esbuild'),
    [
      entry,
      '--bundle',
      '--platform=node',
      '--format=esm',
      '--log-level=warning',
      `--outfile=${bundle}`
    ],
    { cwd: repoRoot, stdio: 'inherit' }
  )
  execFileSync(process.execPath, [bundle], { cwd: repoRoot, stdio: 'inherit' })
  if (!existsSync(output)) throw new Error('未生成 fixtures.json')
  console.log(`已生成 ${output.replace(`${repoRoot}/`, '')}`)
} finally {
  for (const temp of [entry, bundle]) {
    rmSync(temp, { force: true })
  }
}
