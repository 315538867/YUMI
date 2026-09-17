import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, relative, resolve, sep } from 'node:path'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8')
const write = (p, body) => writeFileSync(resolve(repoRoot, p), body)

const appShellFile = 'src/renderer/pages/app.tsx'
const appShell = read(appShellFile)

const views = [...appShell.matchAll(/\{\s*id:\s*'(\w+)',\s*label:\s*'([^']+)'/g)].map((m) => ({
  view: m[1],
  label: m[2]
}))

const patterns = [
  'YumiPageHeader',
  'YumiPrimaryTabs',
  'YumiSegmentedTabs',
  'YumiListSurface',
  'YumiListToolbar',
  'YumiDataTable',
  'YumiMetricStrip',
  'YumiEntitySummary',
  'YumiRecordSummary',
  'YumiSection',
  'YumiDetailList',
  'YumiFormSection',
  'YumiSheet',
  'YumiDialog',
  'YumiEmptyState'
]

const has = (source, name) => new RegExp(`\\b${name}\\b`).test(source)

const viewFiles = new Map()
for (const file of [...new Set([...appShell.matchAll(/from '\.\/([\w-]+)'/g)].map((m) => m[1]))]) {
  viewFiles.set(file, `src/renderer/pages/${file}/index.tsx`)
}

const declaredComponents = new Map()
for (const file of [...new Set([...appShell.matchAll(/from '\.\/([\w-]+)'/g)].map((m) => m[1]))]) {
  const source = read(`src/renderer/pages/${file}/index.tsx`)
  for (const match of source.matchAll(/export function (\w+Page)\b/g)) {
    declaredComponents.set(match[1], `src/renderer/pages/${file}/index.tsx`)
  }
}

const listSourceFiles = (root = 'src') => {
  const found = []
  const visit = (absolute) => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const child = resolve(absolute, entry.name)
      if (entry.isDirectory()) visit(child)
      else if (/\.tsx?$/.test(entry.name)) found.push(relative(repoRoot, child))
    }
  }
  visit(resolve(repoRoot, root))
  return found.map((f) => f.split(sep).join('/')).sort()
}

// 全部页面目录导出的 *Page 组件（含未被 app.tsx 引用的嵌入式页面）。
for (const file of listSourceFiles('src/renderer/pages')) {
  if (/\.test\.tsx?$/.test(file) || file.endsWith('app.tsx')) continue
  for (const match of read(file).matchAll(/export function (\w+Page)\b/g)) {
    if (!declaredComponents.has(match[1])) declaredComponents.set(match[1], file)
  }
}

// 除 app.tsx 外，仍渲染某个 *Page 组件的文件即嵌入式宿主。
const embeddedHosts = new Map()
for (const hostFile of listSourceFiles('src')) {
  if (/\.test\.tsx?$/.test(hostFile) || hostFile.startsWith('src/renderer/test/')) continue
  if (hostFile === appShellFile) continue
  const hostSource = read(hostFile)
  for (const [component] of declaredComponents) {
    if (new RegExp(`<${component}\\b`).test(hostSource)) {
      embeddedHosts.set(component, [...(embeddedHosts.get(component) ?? []), hostFile])
    }
  }
}

const topLevelViews = views.map(({ view, label }) => {
  const file = viewFiles.get(view)
  const source = read(file)
  return {
    view,
    label,
    file,
    component: [...declaredComponents.entries()].find(([, f]) => f === file)?.[0] ?? null,
    renders: Object.fromEntries(patterns.map((name) => [name, has(source, name)]))
  }
})

const embeddedViews = [...embeddedHosts.entries()].map(([component, renderedBy]) => {
  const file = declaredComponents.get(component)
  const source = read(file)
  return {
    component,
    file,
    renderedBy: renderedBy.sort(),
    rendersPageHeader: has(source, 'YumiPageHeader'),
    rendersPageLevelSurface: has(source, 'YumiListSurface')
  }
})

// 壳层滚动容器：只统计 pages.css 中声明了纵向滚动的选择器。
const pagesCss = read('src/renderer/styles/pages.css')
const blankComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
const source = blankComments(pagesCss)
const shellScrollContainersAll = []
const stack = []
let buffer = ''
for (let index = 0; index < source.length; index += 1) {
  const char = source[index]
  if (char === '{') {
    stack.push({
      prelude: buffer.trim(),
      bodyStart: index + 1,
      isAtRule: buffer.trim().startsWith('@')
    })
    buffer = ''
  } else if (char === '}') {
    const context = stack.pop()
    if (context && !context.isAtRule) {
      const body = source.slice(context.bodyStart, index)
      if (/overflow-y:\s*(auto|scroll)/.test(body)) {
        shellScrollContainersAll.push(context.prelude)
      }
    }
    buffer = ''
  } else {
    buffer += char
  }
}

const sidebarRule = pagesCss.match(/\.yumi-app-sidebar\s*\{([^}]*)\}/)
const sidebarWidth = sidebarRule?.[1].match(/width:\s*([^;]+);/)?.[1]?.trim() ?? null

const shellScrollContainers = shellScrollContainersAll.filter((selector) =>
  selector.startsWith('.yumi-app-')
)
const pageLocalScrollContainers = shellScrollContainersAll.filter(
  (selector) => !selector.startsWith('.yumi-app-')
)

const inventory = {
  $comment:
    '由 OpenSpec 变更 rebuild-yumi-ui-system 的 baselines 脚本生成；page-pattern.test.ts 会校验。目标 Pattern 归属另见 page-pattern-map.json。',
  appShell: {
    file: appShellFile,
    commandBarSelector: '.yumi-app-command-bar',
    sidebarSelector: '.yumi-app-sidebar',
    sidebarWidth,
    verticalScrollContainers: shellScrollContainers.sort()
  },
  pageLocalScrollContainers: pageLocalScrollContainers.sort(),
  topLevelViews,
  embeddedViews
}

const outPath = 'src/renderer/test/ui-baseline/page-inventory.json'
write(outPath, `${JSON.stringify(inventory, null, 2)}\n`)

const reportDir = 'openspec/changes/rebuild-yumi-ui-system/baselines'
mkdirSync(resolve(repoRoot, reportDir), { recursive: true })
const lines = [
  '# P0 · 页面模式与滚动/页头所有权盘点（任务 1.2）',
  '',
  `来源：\`${appShellFile}\`、各页面文件与 \`src/renderer/styles/pages.css\``,
  '',
  '## 应用壳',
  '',
  `- 侧栏：\`${inventory.appShell.sidebarSelector}\`，宽度 \`${sidebarWidth}\``,
  `- 命令栏：\`${inventory.appShell.commandBarSelector}\``,
  `- 壳层纵向滚动容器：${shellScrollContainers.map((s) => `\`${s}\``).join('、')}`,
  `- 页面内局部纵向滚动容器（pages.css，非壳层）：${
    pageLocalScrollContainers.map((s) => `\`${s}\``).join('、') || '—'
  }`,
  '',
  '## 路由级页面（AppShell 直接工作区）',
  '',
  '| view | 组件 | 文件 | 页头 | 主 Tab | 分段 Tab | 列表表面 | 指标带 | 摘要 |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...topLevelViews.map(
    (v) =>
      `| \`${v.view}\` | ${v.component} | \`${v.file}\` | ${v.renders.YumiPageHeader ? '✓' : '—'} | ${
        v.renders.YumiPrimaryTabs ? '✓' : '—'
      } | ${v.renders.YumiSegmentedTabs ? '✓' : '—'} | ${v.renders.YumiListSurface ? '✓' : '—'} | ${
        v.renders.YumiMetricStrip ? '✓' : '—'
      } | ${v.renders.YumiEntitySummary ? 'EntitySummary' : v.renders.YumiRecordSummary ? 'RecordSummary' : '—'} |`
  ),
  '',
  '## 嵌入式页面模式',
  '',
  '| 组件 | 文件 | 宿主 | 自带页头 | 自带列表表面 |',
  '| --- | --- | --- | --- | --- |',
  ...embeddedViews.map(
    (v) =>
      `| ${v.component} | \`${v.file}\` | ${v.renderedBy.map((f) => `\`${f}\``).join('<br>')} | ${
        v.rendersPageHeader ? '**✓（嵌套页头，待 P3 处理）**' : '—'
      } | ${v.rendersPageLevelSurface ? '✓' : '—'} |`
  ),
  ''
]
write(`${reportDir}/page-inventory.md`, lines.join('\n'))

console.log(`wrote ${outPath}`)
console.log(`wrote ${reportDir}/page-inventory.md`)
console.log(`topLevelViews=${topLevelViews.length} embeddedViews=${embeddedViews.length}`)
console.log(
  `embedded: ${embeddedViews.map((v) => `${v.component}<-${v.renderedBy.join(',')}`).join(' | ')}`
)
console.log(`shellScrollContainers: ${shellScrollContainers.join(', ')}`)
console.log(`pageLocalScrollContainers: ${pageLocalScrollContainers.join(', ')}`)
