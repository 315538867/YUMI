import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')

const deletedV1Paths = [
  'src/main/database/connection.ts',
  'src/main/database/migrations.ts',
  'src/main/domain/orders.ts',
  'src/main/repositories/studio-repository.ts',
  'src/main/services/studio-service.ts',
  'src/main/services/demo-data-service.ts',
  'src/main/services/attachment-service.ts',
  'src/main/services/backup-service.ts',
  'src/main/services/export-document-workbook.ts',
  'src/main/ipc/register-ipc.ts',
  'src/main/ipc/export-file-name.ts',
  'src/shared/contracts.ts',
  'src/renderer/pages/customer-management-page.tsx',
  'src/renderer/pages/workspace-utils.ts',
  'src/renderer/status-display.ts'
]

describe('V2 与 V1 运行时隔离', () => {
  it('已移除 V1 写入实现与旧契约入口', () => {
    for (const path of deletedV1Paths) {
      expect(existsSync(resolve(process.cwd(), path))).toBe(false)
    }
  })

  it('V2 组合根、预加载和应用壳不再引用 V1 运行时入口', () => {
    const runtimeSource = source('src/main/application/v2-runtime.ts')
    const mainSource = source('src/main/index.ts')
    const preloadSource = source('src/preload/index.ts')
    const appSource = source('src/renderer/pages/app.tsx')

    for (const candidate of [runtimeSource, mainSource, preloadSource, appSource]) {
      expect(candidate).not.toContain('StudioRepository')
      expect(candidate).not.toContain('StudioService')
      expect(candidate).not.toContain('registerIpc')
      expect(candidate).not.toContain('window.yumi')
      expect(candidate).not.toContain("@shared/contracts'")
    }
  })
})
