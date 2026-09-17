import { describe, expect, it } from 'vitest'
import { parseCss } from './css-scan'
import { listSourceFiles, readSource } from './source-scan'

type PageInventory = {
  appShell: {
    file: string
    commandBarSelector: string
    sidebarSelector: string
    sidebarWidth: string
    verticalScrollContainers: string[]
  }
  pageLocalScrollContainers: string[]
  topLevelViews: Array<{
    view: string
    label: string
    file: string
    component: string
    renders: Record<string, boolean>
  }>
  embeddedViews: Array<{
    component: string
    file: string
    renderedBy: string[]
    rendersPageHeader: boolean
    rendersPageLevelSurface: boolean
  }>
}

type PatternMap = {
  patterns: string[]
  embeddedRole: string
  families: Record<string, string[]>
  topLevelViews: Record<string, string[]>
  embeddedViews: Record<string, string>
}

const inventory = JSON.parse(
  readSource('src/renderer/test/ui-baseline/page-inventory.json')
) as PageInventory
const patternMap = JSON.parse(
  readSource('src/renderer/test/ui-baseline/page-pattern-map.json')
) as PatternMap

const declaredViews = () => {
  const source = readSource(inventory.appShell.file)
  return [...source.matchAll(/\{\s*id:\s*'(\w+)',\s*label:\s*'([^']+)'/g)].map((match) => ({
    view: match[1],
    label: match[2]
  }))
}

const verticalScrollContainers = () => {
  const rules = parseCss(readSource('src/renderer/styles/patterns.css'))
  return rules
    .filter((rule) =>
      rule.declarations.some(
        (declaration) =>
          declaration.property === 'overflow-y' && /auto|scroll/.test(declaration.value)
      )
    )
    .map((rule) => rule.selector.trim())
    .sort()
}

const appShellScrollContainers = () =>
  verticalScrollContainers().filter((selector) => selector.startsWith('.yumi-app-'))

const pageLocalScrollContainers = () =>
  verticalScrollContainers().filter((selector) => !selector.startsWith('.yumi-app-'))

const allSourceFiles = listSourceFiles()

describe('P0 · 页面模式与滚动/页头所有权（任务 1.2）', () => {
  it('应用壳只保留导航与内容两个纵向滚动容器，页面内容区是唯一页面级滚动入口', () => {
    expect(appShellScrollContainers()).toEqual(inventory.appShell.verticalScrollContainers)
    expect(inventory.appShell.verticalScrollContainers).toContain('.yumi-app-content')
  })

  it('页面内局部纵向滚动容器不新增，新增必须同步更新基线', () => {
    expect(pageLocalScrollContainers()).toEqual(inventory.pageLocalScrollContainers)
  })

  it('路由级页面清单与基线一致，新增导航入口必须同步更新基线', () => {
    expect(declaredViews()).toEqual(
      inventory.topLevelViews.map(({ view, label }) => ({ view, label }))
    )
  })

  it('每个路由级页面仍由共享页头承接：直接渲染或经归属模式统一渲染，且与基线一致', () => {
    for (const page of inventory.topLevelViews) {
      const source = readSource(page.file)
      const assignedPatterns = patternMap.topLevelViews[page.view] ?? []
      if (page.renders.YumiPageHeader) {
        expect(source).toContain('YumiPageHeader')
        continue
      }
      expect(
        assignedPatterns.length,
        `${page.view} 未直接渲染页头且未归属任何模式`
      ).toBeGreaterThan(0)
      expect(
        assignedPatterns.some(
          (pattern) =>
            source.includes(`components/patterns/${pattern}`) &&
            readSource(`src/renderer/components/patterns/${pattern}.tsx`).includes('YumiPageHeader')
        ),
        `${page.view} 未归属到渲染共享页头的模式`
      ).toBe(true)
    }
  })

  it('嵌入式页面不新增宿主之外的渲染方，且嵌套页头范围被登记为已知项', () => {
    const nestedHeaders = inventory.embeddedViews
      .filter((view) => view.rendersPageHeader)
      .map((view) => view.component)
      .sort()

    for (const embedded of inventory.embeddedViews) {
      for (const host of embedded.renderedBy) {
        expect(readSource(host)).toContain(`<${embedded.component}`)
      }
      expect(allSourceFiles).toContain(embedded.file)
    }

    // P3 工资家族后，嵌入式视图不再自渲染页面头：WorkersPage 收敛为区块标题。
    expect(nestedHeaders).toEqual([])
  })

  it('每个顶层页面都指定了七个 Pattern 之一，且没有悬空归属', () => {
    const viewIds = inventory.topLevelViews.map((page) => page.view).sort()
    expect(Object.keys(patternMap.topLevelViews).sort()).toEqual(viewIds)

    for (const [view, patterns] of Object.entries(patternMap.topLevelViews)) {
      expect(patterns.length, `${view} 应至少指定一个 Pattern`).toBeGreaterThan(0)
      for (const pattern of patterns) {
        expect(patternMap.patterns).toContain(pattern)
      }
      expect(new Set(patterns).size, `${view} 的 Pattern 不应重复`).toBe(patterns.length)
    }
  })

  it('嵌入式视图不得声明顶层 Pattern 归属', () => {
    const embeddedComponents = inventory.embeddedViews.map((view) => view.component).sort()
    expect(Object.keys(patternMap.embeddedViews).sort()).toEqual(embeddedComponents)
    for (const role of Object.values(patternMap.embeddedViews)) {
      expect(role).toBe(patternMap.embeddedRole)
    }
  })

  it('六个 P3 页面家族恰好覆盖全部页面模块，且每个模块只属一个家族', () => {
    const moduleIdOf = (file: string) =>
      file.match(/^src\/renderer\/pages\/([^/]+)\/index\.tsx$/)?.[1]
    const pageModules = [
      ...inventory.topLevelViews.map((page) => page.view),
      ...inventory.embeddedViews.map((view) => moduleIdOf(view.file))
    ]
      .filter((id): id is string => Boolean(id))
      .sort()

    expect(Object.values(patternMap.families).flat().sort()).toEqual(pageModules)

    for (const members of Object.values(patternMap.families)) {
      expect(members.length).toBeGreaterThan(0)
    }

    const memberships = Object.values(patternMap.families).flat()
    expect(new Set(memberships).size).toBe(memberships.length)
  })
})
