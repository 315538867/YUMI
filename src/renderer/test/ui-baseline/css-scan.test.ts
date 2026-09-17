import { describe, expect, it } from 'vitest'
import { atRuleBreakpoints, declarationsMatching, parseCss } from './css-scan'

const fixture = `/* 注释里带 { 大括号 } 不应影响解析 */
.alpha {
  color: red;
  overflow-y: auto;
}

@media (max-width: 820px) {
  .alpha {
    display: none;
  }
  .beta {
    overflow-x: scroll;
  }
}

@media (max-width: 1080px) {
  @media (min-width: 900px) {
    .gamma {
      gap: 4px;
    }
  }
}
`

describe('P0 · CSS 规则扫描器', () => {
  const rules = parseCss(fixture)

  it('解析出全部选择器并保留出现顺序', () => {
    expect(rules.map((rule) => rule.selector)).toEqual(['.alpha', '.alpha', '.beta', '.gamma'])
  })

  it('记录外层 at-rule 与断点，区分同一选择器在不同条件块中的规则', () => {
    expect(rules[0].atRules).toEqual([])
    expect(atRuleBreakpoints(rules[0])).toEqual([])
    expect(rules[1].atRules).toEqual(['@media (max-width: 820px)'])
    expect(atRuleBreakpoints(rules[1])).toEqual([820])
    expect(atRuleBreakpoints(rules[3])).toEqual([1080, 900])
  })

  it('注释不干扰行号，声明行号按 1 起计算', () => {
    expect(rules[0].line).toBe(2)
    expect(declarationsMatching(rules[0], /^color$/)[0]).toEqual({
      property: 'color',
      value: 'red',
      line: 3
    })
    expect(declarationsMatching(rules[0], /^overflow-y$/)[0].line).toBe(4)
  })

  it('按属性与值过滤声明', () => {
    expect(declarationsMatching(rules[1], /^display$/)).toHaveLength(1)
    expect(declarationsMatching(rules[1], /^display$/, /^none$/)).toHaveLength(1)
    expect(declarationsMatching(rules[1], /^display$/, /^block$/)).toHaveLength(0)
    expect(declarationsMatching(rules[2], /^overflow/, /auto|scroll/)).toHaveLength(1)
  })
})
