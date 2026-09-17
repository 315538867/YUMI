// 从 runs.log 提取 SHOT 记录，合并 PNG 实际信息，生成 manifest.json。
//   node build-manifest.mjs <outDir> <manifestPath> [captureArgs...]
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const [, , outDir = '.', manifestPath = join(outDir, 'manifest.json')] = process.argv
const logPath = join(outDir, 'runs.log')

/** 从 PNG 头读取宽高（IHDR 在固定偏移 16..24）。 */
function pngSize(filePath) {
  const buf = readFileSync(filePath)
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

const shots = []
if (existsSync(logPath)) {
  for (const line of readFileSync(logPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('SHOT ')) continue
    try {
      const report = JSON.parse(trimmed.slice('SHOT '.length))
      const pngPath = join(process.cwd(), report.out)
      if (existsSync(pngPath)) {
        const bytes = statSync(pngPath).size
        report.png = { basename: basename(pngPath), bytes, size: pngSize(pngPath) }
      }
      shots.push(report)
    } catch {
      // 跳过无法解析的行
    }
  }
}

// 同一 out 路径可能因重试出现多次记录，按出现顺序后者覆盖前者。
const byOut = new Map()
for (const shot of shots) byOut.set(shot.out, shot)
const deduped = [...byOut.values()]

const manifest = {
  kind: 'yumi-visual-baseline',
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  sourceFixtures: 'openspec/changes/rebuild-yumi-ui-system/visual-harness/fixtures.json',
  shotCount: deduped.length,
  shots: deduped
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
console.log(JSON.stringify({ manifest: manifestPath, shotCount: shots.length }))
