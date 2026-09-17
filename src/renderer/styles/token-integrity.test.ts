import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

const styleDir = resolve(__dirname)
const rendererDir = resolve(__dirname, '..')

const styleFiles = ['tokens.css', 'base.css', 'primitives.css', 'composites.css', 'patterns.css']

function walk(dir: string, extensions: string[], files: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      walk(entryPath, extensions, files)
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      files.push(entryPath)
    }
  }
  return files
}

function collect(source: string, pattern: RegExp) {
  return [...source.matchAll(pattern)].map((match) => match[1])
}

it('样式表引用的 --yumi token 都有定义或由运行时注入', () => {
  const defined = new Set<string>()
  const used = new Set<string>()
  for (const file of styleFiles) {
    const source = readFileSync(resolve(styleDir, file), 'utf8')
    for (const token of collect(source, /(--yumi-[a-z0-9-]+)\s*:/g)) {
      defined.add(token)
    }
    for (const token of collect(source, /var\((--yumi-[a-z0-9-]+)\)/g)) {
      used.add(token)
    }
  }
  for (const file of walk(rendererDir, ['.tsx', '.ts'])) {
    if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue
    for (const token of collect(readFileSync(file, 'utf8'), /'(--yumi-[a-z0-9-]+)'/g)) {
      defined.add(token)
    }
  }

  const dangling = [...used].filter((token) => !defined.has(token)).sort()
  expect(dangling).toEqual([])
})
