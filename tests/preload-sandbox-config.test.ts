import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const viteConfigSource = readFileSync(resolve(process.cwd(), 'electron.vite.config.ts'), 'utf8')
const mainSource = readFileSync(resolve(process.cwd(), 'src/main/index.ts'), 'utf8')

describe('沙箱预加载构建配置', () => {
  it('以 CommonJS 预加载脚本保持沙箱和安全桥接可用', () => {
    expect(viteConfigSource).toMatch(/preload:\s*{[\s\S]*format:\s*'cjs'/)
    expect(viteConfigSource).toMatch(/entryFileNames:\s*'\[name\]\.cjs'/)
    expect(viteConfigSource).not.toMatch(
      /preload:\s*{[\s\S]*plugins:\s*\[externalizeDepsPlugin\(\)\]/
    )
    expect(mainSource).toContain("preload: join(__dirname, '../preload/index.cjs')")
    expect(mainSource).toContain('sandbox: true')
    expect(mainSource).toContain('contextIsolation: true')
  })
})
