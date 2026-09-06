import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('客户管理 IPC 契约', () => {
  it('主进程与 preload 暴露客户列表、详情及增删改通道', () => {
    const ipc = source('src/main/ipc/register-ipc.ts')
    const preload = source('src/preload/index.ts')
    expect(ipc).toMatch(/customers:management:list/)
    expect(ipc).toMatch(/customers:detail/)
    expect(ipc).toMatch(/customers:create/)
    expect(ipc).toMatch(/customers:update/)
    expect(ipc).toMatch(/customers:delete/)
    expect(preload).toMatch(/listManagement/)
    expect(preload).toMatch(/getDetail/)
    expect(preload).toMatch(/customers:create/)
    expect(preload).toMatch(/customers:update/)
    expect(preload).toMatch(/customers:delete/)
  })
})
