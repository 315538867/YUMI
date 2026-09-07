import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/preload/index.ts'), 'utf8')

describe('V2 preload API', () => {
  it('只暴露 V2 API 和 v2 IPC 通道，不再暴露 V1 写入通道', () => {
    expect(source).toContain("exposeInMainWorld('yumiV2', yumiV2)")
    expect(source).toContain("ipcRenderer.invoke('v2:orders:create'")
    expect(source).toContain("ipcRenderer.invoke('v2:orders:record-fund'")
    expect(source).toContain("ipcRenderer.invoke('v2:fulfillment:assignments:create'")
    expect(source).toContain("ipcRenderer.invoke('v2:fulfillment:tasks:result:get'")
    expect(source).toContain("ipcRenderer.invoke('v2:fulfillment:inspections:confirm'")
    expect(source).toContain("ipcRenderer.invoke('v2:workers:create'")
    expect(source).toContain("ipcRenderer.invoke('v2:workers:wages:record'")
    expect(source).toContain("ipcRenderer.invoke('v2:settlements:drafts:create'")
    expect(source).toContain("ipcRenderer.invoke('v2:settlements:drafts:update'")
    expect(source).toContain("ipcRenderer.invoke('v2:settlements:confirm'")
    expect(source).not.toContain("exposeInMainWorld('yumi',")
    expect(source).not.toContain("ipcRenderer.invoke('orders:create'")
  })
})
