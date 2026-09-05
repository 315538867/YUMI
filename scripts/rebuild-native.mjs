/* global console, process */
import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { URL, fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..')
const electronRebuildMarker = resolve(
  projectRoot,
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  '.forge-meta'
)

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      reject(new Error(`原生依赖重建失败（退出码：${code ?? '未知'}，信号：${signal ?? '无'}）。`))
    })
  })
}

async function main() {
  // `npm rebuild` 会替换原生二进制但保留 Electron Rebuild 的完成标记，
  // 因此每次按 Electron 重建前都清理标记，避免错误地跳过重建。
  await rm(electronRebuildMarker, { force: true })
  const electronBuilderCli = fileURLToPath(
    new URL('../node_modules/electron-builder/out/cli/cli.js', import.meta.url)
  )
  await run(process.execPath, [electronBuilderCli, 'install-app-deps'])
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
