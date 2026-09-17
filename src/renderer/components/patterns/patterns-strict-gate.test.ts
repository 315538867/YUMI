import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PAGE_PATTERNS } from './page-pattern'

const patternsDir = join(__dirname)
const isSource = (file: string) => file.endsWith('.tsx') && !file.endsWith('.test.tsx')

/** 七个 Pattern 组件文件与模式标识一一对应。 */
const PATTERN_COMPONENTS = [
  'list-page.tsx',
  'detail-page.tsx',
  'form-workspace.tsx',
  'dashboard-overview.tsx',
  'review-workspace.tsx',
  'calendar-workspace.tsx',
  'settings-workspace.tsx'
]

const sourceOf = (file: string) => readFileSync(join(patternsDir, file), 'utf8')
const patternIdOf = (file: string) => file.replace(/\.tsx$/, '')

describe('P2 · Patterns 严格门禁（任务 5.11）', () => {
  it('七个 Pattern 组件文件齐备且与模式标识一一对应', () => {
    const sources = readdirSync(patternsDir).filter(isSource)
    for (const file of PATTERN_COMPONENTS) {
      expect(sources).toContain(file)
    }
    const ids = PATTERN_COMPONENTS.map(patternIdOf)
    expect(ids.sort()).toEqual([...PAGE_PATTERNS].sort())
  })

  it('Pattern 源码零数据请求、零领域依赖：不引用 @shared/ipc/composables/页面模块', () => {
    for (const file of readdirSync(patternsDir).filter(isSource)) {
      const source = sourceOf(file)
      expect(source, `${file} 不得发起数据请求`).not.toMatch(
        /fetch\(|\baxios\b|from ['"]@shared\/|ipcRenderer|\.query\(|\.mutate\(/
      )
      expect(source, `${file} 不得导入领域或页面模块`).not.toMatch(
        /from ['"][^'"]*(?:\/pages\/|\/composables\/)[^'"]*['"]/
      )
    }
  })

  it('每个 Pattern 组件恰好渲染一个 PatternRoot 且声明自身模式标识，禁止嵌套根', () => {
    for (const file of PATTERN_COMPONENTS) {
      const source = sourceOf(file)
      const roots = source.match(/<PatternRoot/g) ?? []
      expect(roots.length, `${file} 必须恰好一个 PatternRoot，禁止嵌套根`).toBe(1)
      expect(source, `${file} 必须声明 pattern="${patternIdOf(file)}"`).toContain(
        `pattern="${patternIdOf(file)}"`
      )
    }
  })

  it('密度所有权归 PatternRoot：Pattern 组件不得直接发 data-density 或使用 DensityRoot', () => {
    for (const file of PATTERN_COMPONENTS) {
      const source = sourceOf(file)
      expect(source, `${file} 不得直接输出 data-density`).not.toContain('data-density')
      expect(source, `${file} 不得绕过 PatternRoot 使用 DensityRoot`).not.toContain('DensityRoot')
    }
  })

  it('Pattern 组件不使用内联样式携带裸视觉值', () => {
    for (const file of readdirSync(patternsDir).filter(isSource)) {
      const source = sourceOf(file)
      expect(source, `${file} 不得使用内联 style`).not.toMatch(/style=\{\{/)
    }
  })
})
