import { readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { afterEach, describe, expect, it } from 'vitest'
import { build } from 'vite'

const rendererRoot = resolve(__dirname, '..')

async function collectCss(dir: string): Promise<string> {
  const chunks: string[] = []
  const walk = async (current: string) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.name.endsWith('.css')) chunks.push(await readFile(full, 'utf8'))
    }
  }
  await walk(dir)
  return chunks.join('\n')
}

/** 取出 `@layer <name> { ... }` 的块体，按花括号配平，不切到内层右花括号。 */
function layerBlock(css: string, layerName: string): string | null {
  const marker = `@layer ${layerName}`
  const start = css.indexOf(marker)
  if (start === -1) return null
  const open = css.indexOf('{', start)
  if (open === -1) return null
  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    else if (css[index] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, index)
    }
  }
  return null
}

describe('P1 · DayPicker vendor 层构建验证（任务 2.4）', () => {
  let outDir: string

  afterEach(async () => {
    if (outDir) await rm(outDir, { recursive: true, force: true })
  })

  it('生产 CSS 中 DayPicker 规则位于 @layer vendor，本地组件样式按 primitives/composites 层落位', async () => {
    outDir = join(tmpdir(), `yumi-vendor-${Date.now()}`)
    await build({
      root: rendererRoot,
      configFile: false,
      logLevel: 'error',
      plugins: [react()],
      resolve: {
        alias: {
          '@shared': resolve(rendererRoot, '../shared')
        }
      },
      build: {
        outDir,
        emptyOutDir: true,
        cssCodeSplit: false,
        assetsDir: 'assets',
        minify: false
      }
    })

    const css = await collectCss(outDir)
    const vendorBlock = layerBlock(css, 'vendor')
    expect(vendorBlock, '生产 CSS 缺少 @layer vendor 块').toBeTruthy()
    expect(vendorBlock).toContain('.rdp-root')
    expect(vendorBlock).toContain('.rdp-day_button')
    expect(vendorBlock).not.toContain('yumi-button')

    const primitivesBlock = layerBlock(css, 'primitives')
    const compositesBlock = layerBlock(css, 'composites')
    expect(primitivesBlock, '生产 CSS 缺少 @layer primitives 块').toContain('.yumi-button')
    expect(compositesBlock, '生产 CSS 缺少 @layer composites 块').toContain('.yumi-page-header')
    expect(primitivesBlock).not.toContain('.yumi-page-header')
  }, 60_000)
})
