import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

export const repoRoot = process.cwd()

const SOURCE_ROOT = 'src'
const SOURCE_EXTENSIONS = ['.ts', '.tsx']

export const toPosix = (path: string) => path.split(sep).join('/')

export function listFiles(root = SOURCE_ROOT, extensions = SOURCE_EXTENSIONS): string[] {
  const found: string[] = []
  const visit = (absolute: string) => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const child = join(absolute, entry.name)
      if (entry.isDirectory()) {
        visit(child)
        continue
      }
      if (extensions.some((extension) => entry.name.endsWith(extension))) {
        found.push(toPosix(relative(repoRoot, child)))
      }
    }
  }
  visit(resolve(repoRoot, root))
  return found.sort()
}

export const listSourceFiles = (root = SOURCE_ROOT) => listFiles(root, ['.ts', '.tsx'])

export const listStyleFiles = (root = SOURCE_ROOT) => listFiles(root, ['.css'])

/** 代码与样式文件（含 CSS），用于需要同时遍历 TSX 与样式的规则。 */
export const listCodeFiles = (root = SOURCE_ROOT) => listFiles(root, ['.ts', '.tsx', '.css'])

export function readSource(relPath: string): string {
  return readFileSync(resolve(repoRoot, relPath), 'utf8')
}

export const isTestFile = (relPath: string) =>
  /\.test\.tsx?$/.test(relPath) || relPath.startsWith('src/renderer/test/')

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 按标识符边界匹配，避免 `useYumiNotification` 误命中 `useYumiNotificationMessage`。 */
export function matchesIdentifier(source: string, identifier: string): boolean {
  return new RegExp(`\\b${escapeRegExp(identifier)}\\b`).test(source)
}

export function filesReferencing(
  identifier: string,
  files: string[] = listSourceFiles()
): string[] {
  return files.filter((file) => matchesIdentifier(readSource(file), identifier)).sort()
}

export function productionFilesReferencing(identifier: string, files?: string[]): string[] {
  return filesReferencing(identifier, files).filter((file) => !isTestFile(file))
}

export function countOccurrences(source: string, pattern: RegExp): number {
  return (
    source.match(new RegExp(pattern.source, `${pattern.flags.replace(/g/g, '')}g`))?.length ?? 0
  )
}

export function lineOccurrences(
  source: string,
  pattern: RegExp
): Array<{ line: number; text: string }> {
  const test = new RegExp(pattern.source, pattern.flags.replace(/g/g, ''))
  return source
    .split('\n')
    .map((text, index) => ({ line: index + 1, text }))
    .filter(({ text }) => test.test(text))
}
