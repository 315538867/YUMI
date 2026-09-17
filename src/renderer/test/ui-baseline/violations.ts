import { parseCss, type CssDeclaration, type CssRule } from './css-scan'
import {
  isTestFile,
  listCodeFiles,
  listSourceFiles,
  listStyleFiles,
  readSource
} from './source-scan'

export type ViolationCategory =
  | 'raw-color'
  | 'raw-typography'
  | 'raw-spacing'
  | 'raw-radius'
  | 'raw-shadow'
  | 'private-breakpoint'
  | 'shared-class-override'
  | 'legacy-class-in-source'
  | 'dangling-token-reference'
  | 'unconsumed-token'

export type Violation = {
  file: string
  category: ViolationCategory
  /** CSS 违规为所在选择器；TSX 违规为该行原文。 */
  selector: string
  /** 具体违规内容，例如 `padding: 14px`。 */
  detail: string
  line: number
}

export type ViolationKey = {
  file: string
  category: ViolationCategory
  selector: string
  detail: string
}

export const violationKey = ({ file, category, selector, detail }: ViolationKey) =>
  [file, category, selector, detail].join(' ␟ ')

const TOKENS_FILE = 'src/renderer/styles/tokens.css'

/** 桌面适配固化后的唯二合法断点（见 desktop-adaptation.json）：窄桌面 1280 下界与宽桌面 1440 上界。 */
const APPROVED_BREAKPOINTS = new Set([1279, 1440])

const COLOR_PROPERTY =
  /^(color|background|background-color|background-image|border|border-(?:top|right|bottom|left)-color|border-color|outline|outline-color|box-shadow|text-shadow|fill|stroke|accent-color|caret-color)$/
/** 只看真正的颜色字面量；仅由令牌组成的渐变不算裸值。 */
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
const LENGTH_LITERAL = /-?\d*\.?\d+(?:px|rem|em|ch|vh|vw)\b/
const SPACING_PROPERTY =
  /^(gap|row-gap|column-gap|padding|padding-(?:top|right|bottom|left|block|inline|block-start|block-end|inline-start|inline-end)|margin|margin-(?:top|right|bottom|left|block|inline|block-start|block-end|inline-start|inline-end))$/
const RADIUS_PROPERTY = /^border-(?:top-left-|top-right-|bottom-left-|bottom-right-)?radius$/
const TYPOGRAPHY_PROPERTY = /^(font-size|line-height|letter-spacing)$/

const rawValueViolations = (file: string, rule: CssRule): Violation[] => {
  const found: Violation[] = []
  const push = (category: ViolationCategory, declaration: CssDeclaration) => {
    found.push({
      file,
      category,
      selector: rule.selector,
      detail: `${declaration.property}: ${declaration.value}`,
      line: declaration.line
    })
  }

  for (const declaration of rule.declarations) {
    const { property, value } = declaration

    if (COLOR_PROPERTY.test(property) && COLOR_LITERAL.test(value)) {
      push('raw-color', declaration)
      continue
    }
    if (TYPOGRAPHY_PROPERTY.test(property) && LENGTH_LITERAL.test(value)) {
      push('raw-typography', declaration)
      continue
    }
    if (SPACING_PROPERTY.test(property) && LENGTH_LITERAL.test(value)) {
      push('raw-spacing', declaration)
      continue
    }
    if (RADIUS_PROPERTY.test(property) && LENGTH_LITERAL.test(value)) {
      push('raw-radius', declaration)
      continue
    }
    if (/^(box-shadow|text-shadow)$/.test(property) && LENGTH_LITERAL.test(value)) {
      push('raw-shadow', declaration)
    }
  }

  return found
}

/**
 * 共享组件内部使用的 class（primitives/composites 定义且被 components/ui 源码引用）：
 * 页面源码重复引用这些 class 即试图覆盖共享组件内部结构。页面专属的复合工具 class
 * （如 yumi-list-cell）专供各页列表列渲染消费，不在此集合内，不构成覆盖。
 */
export const sharedClassNames = (): Set<string> => {
  const cssNames = new Set<string>()
  for (const file of ['primitives.css', 'composites.css']) {
    for (const rule of parseCss(readSource(`src/renderer/styles/${file}`))) {
      for (const match of rule.selector.matchAll(/\.(yumi-[\w-]+)/g)) {
        cssNames.add(match[1])
      }
    }
  }
  const componentInternal = new Set<string>()
  for (const file of listSourceFiles()) {
    if (!file.startsWith('src/renderer/components/ui/') || isTestFile(file)) continue
    for (const match of readSource(file).matchAll(/\byumi-[\w-]+\b/g)) {
      if (cssNames.has(match[0])) componentInternal.add(match[0])
    }
  }
  return componentInternal
}

export const LEGACY_CLASS_NAMES = [
  'yumi-form-error',
  'yumi-form-hint',
  'yumi-field-hint',
  'yumi-page-tabs',
  'yumi-primary-tabs__item',
  'yumi-segmented-tabs__item',
  'yumi-order-summary',
  'yumi-order-archive-grid',
  'yumi-order-archive',
  'yumi-order-stat-grid',
  'yumi-order-simple-lines',
  'yumi-settlement-reference-grid',
  'yumi-settlement-detail__header',
  'yumi-source-list',
  'yumi-detail-grid',
  'yumi-product-editor-section',
  'yumi-form-panel__title',
  'yumi-settings-panel__intro',
  'yumi-settings-panel__value',
  'yumi-settings-panel__actions',
  'yumi-settings-category-grid',
  'yumi-settings-section-actions',
  'yumi-section-inline-status',
  'yumi-section-toolbar',
  'yumi-finance-filters',
  'yumi-finance-selection-summary',
  'yumi-finance-summary-grid',
  'yumi-finance-metric',
  'yumi-finance-reimburse-controls',
  'yumi-overview-grid',
  'yumi-worker-history',
  'yumi-worker-editor-grid',
  'yumi-profile-sheet',
  'yumi-feedback',
  'yumi-reports-workspace',
  'yumi-report-controls',
  'yumi-after-sales-link-fields',
  'yumi-empty',
  'yumi-business-list',
  'yumi-business-list__item',
  'yumi-task-rate-summary'
]

/** tokens.css 中定义的令牌及其定义行号。 */
export const tokenDefinitions = (): Map<string, number> => {
  const source = readSource(TOKENS_FILE)
  const definitions = new Map<string, number>()
  for (const match of source.matchAll(/(--yumi-[\w-]+)\s*:/g)) {
    const line = source.slice(0, match.index).split('\n').length
    if (!definitions.has(match[1])) definitions.set(match[1], line)
  }
  return definitions
}

/** 组件在样式或 JSX 内按需定义的自定义属性（动态列数、进度比例等），不属于悬空令牌。 */
export const localTokenDefinitions = (): Set<string> => {
  const tokens = new Set<string>()
  for (const file of listStyleFiles()) {
    if (file === TOKENS_FILE) continue
    for (const match of readSource(file).matchAll(/(--yumi-[\w-]+)\s*:/g)) {
      tokens.add(match[1])
    }
  }
  for (const file of listSourceFiles()) {
    if (isTestFile(file)) continue
    for (const match of readSource(file).matchAll(/['"`](--yumi-[\w-]+)['"`]\s*:/g)) {
      tokens.add(match[1])
    }
  }
  return tokens
}

export const referencedTokens = (): Map<string, Array<{ file: string; line: number }>> => {
  const references = new Map<string, Array<{ file: string; line: number }>>()
  const add = (token: string, file: string, line: number) => {
    references.set(token, [...(references.get(token) ?? []), { file, line }])
  }

  for (const file of listCodeFiles()) {
    if (isTestFile(file)) continue
    if (file.endsWith('.css')) {
      // 令牌文件自身也引用基础色板与语义别名，必须计入消费，否则会误报未消费令牌。
      for (const rule of parseCss(readSource(file))) {
        for (const declaration of rule.declarations) {
          for (const match of declaration.value.matchAll(/var\((--yumi-[\w-]+)/g)) {
            add(match[1], file, declaration.line)
          }
        }
      }
      continue
    }
    readSource(file)
      .split('\n')
      .forEach((text, index) => {
        for (const match of text.matchAll(/var\((--yumi-[\w-]+)/g)) {
          add(match[1], file, index + 1)
        }
      })
  }
  return references
}

const classNameOccurrences = (file: string) => {
  const found: Array<{ text: string; line: number }> = []
  readSource(file)
    .split('\n')
    .forEach((text, index) => {
      for (const match of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) {
        const value = match[1] ?? match[2] ?? match[3] ?? ''
        if (value) found.push({ text: value, line: index + 1 })
      }
    })
  return found
}

export function computeViolations(): Violation[] {
  const violations: Violation[] = []
  const shared = sharedClassNames()

  for (const file of listStyleFiles()) {
    if (file === TOKENS_FILE) continue
    for (const rule of parseCss(readSource(file))) {
      violations.push(...rawValueViolations(file, rule))
    }

    // 私有断点按「文件 + 断点值」登记：桌面适配固化后只允许两个合法适配点，
    // 其余（含 ≤1023 的死断点）一律视为违规。
    const breakpoints = new Set<number>()
    for (const rule of parseCss(readSource(file))) {
      for (const atRule of rule.atRules) {
        for (const match of atRule.matchAll(/(?:min|max)-width:\s*(\d+)px/g)) {
          breakpoints.add(Number(match[1]))
        }
      }
    }
    for (const breakpoint of [...breakpoints].sort((a, b) => a - b)) {
      if (APPROVED_BREAKPOINTS.has(breakpoint)) continue
      violations.push({
        file,
        category: 'private-breakpoint',
        selector: '',
        detail: `${breakpoint}px`,
        line: 0
      })
    }
  }

  const definitions = tokenDefinitions()
  const localDefinitions = localTokenDefinitions()
  const referenced = referencedTokens()
  for (const [token, sites] of referenced) {
    if (definitions.has(token) || localDefinitions.has(token)) continue
    for (const site of sites) {
      violations.push({
        file: site.file,
        category: 'dangling-token-reference',
        selector: token,
        detail: token,
        line: site.line
      })
    }
  }

  for (const file of listSourceFiles()) {
    if (isTestFile(file) || file.startsWith('src/renderer/components/ui/')) continue
    for (const occurrence of classNameOccurrences(file)) {
      for (const legacy of LEGACY_CLASS_NAMES) {
        if (
          new RegExp(`(^|\\s)${legacy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(
            occurrence.text
          )
        ) {
          violations.push({
            file,
            category: 'legacy-class-in-source',
            selector: occurrence.text.trim(),
            detail: legacy,
            line: occurrence.line
          })
        }
      }
      for (const match of occurrence.text.matchAll(/(?:^|\s)(yumi-[\w-]+)/g)) {
        if (shared.has(match[1])) {
          violations.push({
            file,
            category: 'shared-class-override',
            selector: occurrence.text.trim(),
            detail: match[1],
            line: occurrence.line
          })
        }
      }
    }
  }

  for (const [token, line] of definitions) {
    if (referenced.has(token)) continue
    violations.push({
      file: TOKENS_FILE,
      category: 'unconsumed-token',
      selector: '',
      detail: token,
      line
    })
  }

  return violations.sort((a, b) =>
    violationKey(a) < violationKey(b) ? -1 : violationKey(a) > violationKey(b) ? 1 : 0
  )
}
