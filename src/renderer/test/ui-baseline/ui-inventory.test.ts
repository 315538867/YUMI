import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  filesReferencing,
  isTestFile,
  listSourceFiles,
  productionFilesReferencing,
  readSource,
  repoRoot
} from './source-scan'

type InventoryBaseline = {
  source: string
  runtimeExports: string[]
  typeOnlyExports: string[]
  declarations: Record<string, string>
  zeroProductionUse: string[]
  uiInternalOnly: string[]
}

const baseline = JSON.parse(
  readSource('src/renderer/test/ui-baseline/ui-inventory.json')
) as InventoryBaseline

const UI_DIR = 'src/renderer/components/ui/'
const barrelPath = baseline.source

const parseBarrel = (source: string) => {
  const runtime: string[] = []
  const typeOnly: string[] = []
  const declarations: Record<string, string> = {}

  for (const match of source.matchAll(/export\s*\{([\s\S]*?)\}\s*from\s*'([^']+)'/g)) {
    const from = match[2].replace(/^\.\//, '')
    const candidates = [`${UI_DIR}${from}.tsx`, `${UI_DIR}${from}.ts`, `${UI_DIR}${from}/index.ts`]
    const resolvedDeclaration = candidates.find((c) => existsSync(resolve(repoRoot, c)))

    for (const raw of match[1].split(',')) {
      const entry = raw.trim()
      if (!entry) continue
      const isType = entry.startsWith('type ')
      const name = entry
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]
        .trim()
      if (!name) continue
      if (isType) {
        typeOnly.push(name)
        continue
      }
      if (resolvedDeclaration) declarations[name] = resolvedDeclaration
      runtime.push(name)
    }
  }

  return {
    runtime: [...runtime].sort(),
    typeOnly: [...typeOnly].sort(),
    declarations
  }
}

const allSourceFiles = listSourceFiles()
const actual = parseBarrel(readSource(barrelPath))

const consumersOf = (name: string) =>
  filesReferencing(name, allSourceFiles).filter(
    (file) => file !== barrelPath && !isTestFile(file) && file !== actual.declarations[name]
  )

const zeroProductionUse = actual.runtime.filter((name) => consumersOf(name).length === 0)
const uiInternalOnly = actual.runtime.filter((name) => {
  const consumers = consumersOf(name)
  return consumers.length > 0 && consumers.every((file) => file.startsWith(UI_DIR))
})

describe('P0 · UI 公共导出清单（任务 1.1）', () => {
  it('运行时导出面与基线完全一致，新增或删除导出必须同步更新基线', () => {
    expect(actual.runtime).toEqual(baseline.runtimeExports)
  })

  it('仅类型导出与基线完全一致', () => {
    expect(actual.typeOnly).toEqual(baseline.typeOnlyExports)
  })

  it('每个导出的声明文件与基线一致，组件不得被静默换位或改名', () => {
    expect(actual.declarations).toEqual(baseline.declarations)
  })

  it('生产零使用导出清单与基线一致', () => {
    expect(zeroProductionUse.slice().sort()).toEqual(baseline.zeroProductionUse.slice().sort())
  })

  it('仅被同层 ui 组件消费的导出清单与基线一致', () => {
    expect(uiInternalOnly.slice().sort()).toEqual(baseline.uiInternalOnly.slice().sort())
  })

  it('页面与领域代码只从 ui 桶文件导入共享组件，不从组件目录深层路径旁路', () => {
    const deepImports = productionFilesReferencing('components/ui/', allSourceFiles).filter(
      (file) => !file.startsWith(UI_DIR) && !file.startsWith('src/renderer/test/')
    )
    expect(deepImports).toEqual([])
  })
})
