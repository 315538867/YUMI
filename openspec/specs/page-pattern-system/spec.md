# page-pattern-system Specification

## Purpose

为 YUMI 的顶层业务页面建立稳定、可验证的页面结构，使列表、详情、表单、总览、审核、日历和设置在桌面窗口中遵循一致的信息层级与密度规则。

## Requirements

### Requirement: 顶层业务页面归入唯一页面模式

每个路由级页面或由应用壳直接承载的顶层业务页面 MUST 归入 List Page、Detail Page、Form Workspace、Dashboard Overview、Review Workspace、Calendar Workspace 或 Settings Workspace 中的一种，并输出稳定的页面模式和密度标识。一个顶层页面不得嵌套第二个完整页面模式。

#### Scenario: 打开订单列表

- **WHEN** 负责人从主导航进入订单列表
- **THEN** 页面以唯一的 List Page 根呈现页头、工具栏和记录区域
- **AND** 页面根输出可供自动验证的模式与密度标识

#### Scenario: 页面嵌入人员视图

- **WHEN** 一个顶层工作区嵌入人员或派工子视图
- **THEN** 子视图作为领域内容呈现
- **AND** 子视图不重复页头、页面滚动容器或页面模式根

### Requirement: 页面模式拥有区域顺序和动作归属

系统 SHALL 由页面模式约束页头、导航、指标、工具栏、内容区、摘要和操作区的顺序。页面级、区块级和记录级动作 MUST 分别位于对应区域；页面不得以嵌套装饰卡片或任意大面积留白替代信息层级。

#### Scenario: 查看列表页面

- **WHEN** 负责人查看任一业务列表
- **THEN** 页面级创建或导出位于页头，搜索、筛选和计数位于列表工具栏，记录操作位于对应行
- **AND** 列表主体只使用一个连续内容表面

#### Scenario: 查看实体详情

- **WHEN** 负责人进入订单、客户、商品或结算详情
- **THEN** 页面依次呈现页头、实体摘要、主要视图切换和当前详情区块
- **AND** 摘要不重复当前详情视图的完整内容

### Requirement: 页面模式决定信息密度

List Page、Review Workspace 和 Calendar Workspace MUST 默认使用 compact；Detail Page、Dashboard Overview 和 Settings Workspace MUST 默认使用 standard；Form Workspace MUST 默认使用 standard。只有规范列明的长流程或高风险任务变体可由页面模式根使用 comfortable，页面作者不得在内部区块任意切换密度。

#### Scenario: 打开待核算队列

- **WHEN** 负责人进入待核算 Review Workspace
- **THEN** 队列与工具栏使用 compact 密度
- **AND** 打开的处理表单使用其所属工作区或浮层契约规定的密度

#### Scenario: 打开高风险长流程

- **WHEN** 负责人进入规范列明的高风险长流程变体
- **THEN** 页面模式根统一使用 comfortable 密度
- **AND** 页面内部不存在与根模式冲突的局部密度覆盖

### Requirement: 桌面页面在受支持窗口范围内保持可用

系统 MUST 支持 `1100 × 720`、`1440 × 920` 和 `1920 × 1080` 三档 Electron 外层窗口验收，并以实际 renderer viewport 作为布局断点依据。页面整体不得横向滚动；表格和日历 MAY 在自身区域横向滚动，工具栏折行后控件仍须按内容保持可读和可操作。

#### Scenario: 在最小窗口查看日历

- **WHEN** Electron 外层窗口设置为 `1100 × 720`
- **THEN** 系统记录实际 renderer viewport 并按该空间呈现页面
- **AND** 日历在自身区域滚动，不压缩到文字或操作互相重叠

#### Scenario: 在宽屏查看经营总览

- **WHEN** Electron 外层窗口设置为 `1920 × 1080`
- **THEN** 数据区域利用额外宽度且正文行长保持受控
- **AND** 控件字号不会随 viewport 宽度缩放

### Requirement: 页面模式覆盖完整内容状态

每种页面模式 MUST 为正常数据、加载、空数据或筛选无结果、错误、长文案、极端数值和内容溢出提供稳定结构。视觉通过不得以隐藏既有功能、静态占位或吞掉错误为代价。

#### Scenario: 列表筛选后无结果

- **WHEN** 负责人应用筛选且没有匹配记录
- **THEN** List Page 在记录区域显示筛选无结果状态并提供清除筛选入口
- **AND** 页头、工具栏和页面尺寸保持稳定

#### Scenario: 页面加载失败

- **WHEN** 顶层页面的必要数据加载失败
- **THEN** 页面内容区显示可理解的页面级错误和适用的恢复动作
- **AND** 系统不以自动消失的通知作为唯一错误呈现
