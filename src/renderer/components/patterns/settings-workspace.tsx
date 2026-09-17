import type { ReactNode } from 'react'
import { YumiPageHeader, type YumiPageHeaderProps } from '../ui/page-header/yumi-page-header'
import { PatternRoot } from './page-pattern'

type SettingsWorkspaceProps = {
  /** 页头：标题与页面级动作。 */
  header: YumiPageHeaderProps
  /** 两级导航：一级分类与二级条目，由页面传入共享导航组件。 */
  navigation: ReactNode
  /** 当前设置视图内容；读取与编辑共用同一内容区域结构。 */
  children: ReactNode
}

export function SettingsWorkspace({ children, header, navigation }: SettingsWorkspaceProps) {
  return (
    <PatternRoot className="yumi-page yumi-settings-workspace" pattern="settings-workspace">
      <YumiPageHeader {...header} />
      <div className="yumi-settings-workspace__nav">{navigation}</div>
      <div className="yumi-settings-workspace__content">{children}</div>
    </PatternRoot>
  )
}
