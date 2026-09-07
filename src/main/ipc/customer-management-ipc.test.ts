import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('V2 客户管理 IPC 契约', () => {
  it('仅经 v2 命名空间暴露客户列表、新建和更新能力', () => {
    const ipc = source('src/main/ipc/register-v2-ipc.ts')
    const preload = source('src/preload/index.ts')
    expect(ipc).toMatch(/v2:customers:list/)
    expect(ipc).toMatch(/v2:customers:create/)
    expect(ipc).toMatch(/v2:customers:update/)
    expect(preload).toMatch(/customers:\s*\{/)
    expect(preload).toMatch(/v2:customers:list/)
    expect(preload).toMatch(/v2:customers:create/)
    expect(preload).toMatch(/v2:customers:update/)
    expect(preload).not.toMatch(/customers:management:list/)
    expect(preload).not.toMatch(/listManagement/)
  })
})
