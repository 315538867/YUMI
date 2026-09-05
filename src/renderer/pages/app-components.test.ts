import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(resolve(process.cwd(), 'src/renderer/pages/app.tsx'), 'utf8')

describe('桌面工作区组件声明', () => {
  it('设置工作区组件不与导航 Settings 图标同名', () => {
    expect(appSource).not.toMatch(/function\s+Settings\s*\(/)
    expect(appSource).toMatch(/function\s+SettingsWorkspace\s*\(/)
  })
})
