export type CssDeclaration = { property: string; value: string; line: number }

export type CssRule = {
  selector: string
  /** 外层 at-rule 前奏，例如 `@media (max-width: 820px)`；最外层规则为空数组。 */
  atRules: string[]
  declarations: CssDeclaration[]
  /** 选择器所在行号（1 起）。 */
  line: number
}

/** 把注释替换为等量空白，保留换行，避免行号漂移。 */
const blankComments = (css: string) =>
  css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))

const lineOf = (css: string, index: number) => css.slice(0, index).split('\n').length

const parseDeclarations = (body: string, startLine: number): CssDeclaration[] => {
  const declarations: CssDeclaration[] = []
  let chunkStart = 0

  for (let index = 0; index <= body.length; index += 1) {
    const isEnd = index === body.length || body[index] === ';'
    if (!isEnd) continue
    const chunk = body.slice(chunkStart, index)
    chunkStart = index + 1
    const separator = chunk.indexOf(':')
    if (separator === -1) continue
    const property = chunk.slice(0, separator).trim()
    const value = chunk.slice(separator + 1).trim()
    if (!property || !value) continue
    declarations.push({
      property,
      value,
      line: lineOf(body, index - chunk.length) + startLine - 1
    })
  }

  return declarations
}

/**
 * 解析扁平 CSS（含 @media / @supports / @layer 嵌套）。
 * 返回值中的 atRules 顺序为从外到内，便于按条件规则区分同一选择器。
 */
export function parseCss(css: string): CssRule[] {
  const source = blankComments(css)
  const rules: CssRule[] = []
  const stack: Array<{ prelude: string; isAtRule: boolean; startLine: number; bodyStart: number }> =
    []
  let buffer = ''

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') {
      const prelude = buffer.trim()
      stack.push({
        prelude,
        isAtRule: prelude.startsWith('@'),
        startLine: lineOf(source, index),
        bodyStart: index + 1
      })
      buffer = ''
      continue
    }
    if (char === '}') {
      const context = stack.pop()
      if (context && !context.isAtRule && context.prelude) {
        rules.push({
          selector: context.prelude,
          atRules: stack.filter((entry) => entry.isAtRule).map((entry) => entry.prelude),
          declarations: parseDeclarations(
            source.slice(context.bodyStart, index),
            context.startLine + 1
          ),
          line: context.startLine
        })
      }
      buffer = ''
      continue
    }
    buffer += char
  }

  return rules.sort((a, b) => a.line - b.line)
}

export const declarationsMatching = (
  rule: CssRule,
  property: RegExp,
  value?: RegExp
): CssDeclaration[] =>
  rule.declarations.filter(
    (declaration) =>
      property.test(declaration.property) && (!value || value.test(declaration.value))
  )

export const atRuleBreakpoints = (rule: CssRule): number[] =>
  rule.atRules
    .filter((atRule) => /^@media/.test(atRule))
    .flatMap((atRule) =>
      [...atRule.matchAll(/(min|max)-width:\s*(\d+)px/g)].map((match) => Number(match[2]))
    )
