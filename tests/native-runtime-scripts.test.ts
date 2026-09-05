import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface PackageManifest {
  scripts?: Record<string, string>
}

const packageManifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
) as PackageManifest

describe('原生依赖运行时配置', () => {
  it('安装依赖和启动调试前都会按 Electron 运行时重建原生依赖', () => {
    expect(packageManifest.scripts?.postinstall).toBe('node scripts/rebuild-native.mjs')
    expect(packageManifest.scripts?.pretest).toBe('npm rebuild better-sqlite3')
    expect(packageManifest.scripts?.predev).toBe('node scripts/rebuild-native.mjs')
  })
})
