import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { V2ApplicationRuntime } from './v2-runtime'

const runtimes: V2ApplicationRuntime[] = []

afterEach(() => {
  runtimes.splice(0).forEach((runtime) => runtime.close())
})

describe('V2ApplicationRuntime', () => {
  it('恢复后关闭旧连接并重建 V2 服务引用，恢复前后的数据空间保持隔离', async () => {
    const userDataDirectory = await mkdtemp(join(tmpdir(), 'yumi-v2-runtime-'))
    const runtime = new V2ApplicationRuntime(userDataDirectory, '2.0.0')
    runtimes.push(runtime)
    runtime.start()

    runtime.orderService.createCustomer({ name: '备份前客户' })
    const sourceBackup = await runtime.backupService.createBackup()
    runtime.orderService.createCustomer({ name: '恢复前新增客户' })
    const previousService = runtime.orderService

    const result = await runtime.restore({ backupPath: sourceBackup.backupPath, confirmed: true })

    expect(result.restoredBackup.id).toBe(sourceBackup.id)
    expect(runtime.orderService).not.toBe(previousService)
    expect(runtime.orderService.listCustomers().map((customer) => customer.name)).toEqual(['备份前客户'])
    expect(runtime.orderService.listAuditLogs().some((item) => item.action === 'backup.restored')).toBe(true)
  })
})
