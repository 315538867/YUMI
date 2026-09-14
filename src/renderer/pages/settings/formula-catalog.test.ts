import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { formulaCatalog } from '@shared/calculations/catalog'

const settingsSource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf8')

it('设置页公式目录完全来自共享公式注册表', () => {
  expect(settingsSource).toContain("from '@shared/calculations/catalog'")
  expect(settingsSource).toContain('formulaCatalog')
  expect(settingsSource).not.toContain('calculationFormulaRows')
})

it('共享公式注册表保持非空且每项都有业务名称', () => {
  expect(formulaCatalog.length).toBeGreaterThan(0)
  for (const entry of formulaCatalog) {
    expect(entry.name.trim()).not.toBe('')
  }
})
