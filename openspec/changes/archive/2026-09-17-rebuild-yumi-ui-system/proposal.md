## Why

YUMI 已经统一使用 React、Radix、DayPicker、Lucide 和 `Yumi*` 共享组件，但最终页面仍由分散的裸值、私有布局和隐式 CSS 顺序决定，导致字号、间距、密度、导航层级、浮层和页面结构持续漂移。现在需要从设计令牌、共享组件和页面模式建立可验证的完整 UI 系统，再按页面家族迁移，避免继续以单页补丁扩大维护成本。

## What Changes

- 建立 Foundations → Primitives → Composites → Patterns → Domains 的单向 UI 架构，并以唯一 CSS 入口和固定 cascade layers 管理第三方与本地样式。
- 建立中性经营工作台的颜色、排版、间距、尺寸、圆角、阴影、动效和浮层层级令牌。
- 由顶层 Page Pattern 统一编排 compact、standard、comfortable 密度，并将密度显式传播到 Radix Portal 内容。
- 建立 List Page、Detail Page、Form Workspace、Dashboard Overview、Review Workspace、Calendar Workspace 和 Settings Workspace 七种页面模式；嵌入式视图不得创建嵌套 Pattern。
- 统一页面、区块、记录动作归属，字段/表单/页面/全局四级反馈，以及 Primary Tabs、Secondary Tabs、Segmented Control 三种导航层级。
- 以确定性 fixture 和三档 Electron 窗口进行渲染与交互验收，并记录 BrowserWindow 外层尺寸对应的实际 renderer viewport。
- 采用 P0 基线、P1 共享能力、P2 页面模式、P3 页面家族迁移的渐进门禁，迁移完成后清零旧 class、私有断点和通用视觉裸值。
- **BREAKING** 删除生产零使用的 `YumiBusinessList`、`YumiBusinessListItem`、`YumiTaskRateSummary`、`YumiDateTimePicker` 和 `YumiDateTimeRangePicker`，不保留兼容导出。
- **BREAKING** 迁移页面不保留旧 props、旧 class、双套 API 或适配层；需要变更共享 API 时必须原子更新全部调用点。
- 保持现有数据库 schema、IPC 合约、领域计算、状态流转、负责人裁量和导出数据语义不变。

## Capabilities

### New Capabilities

- `ui-system-foundations`: 定义可消费、可治理的设计令牌、CSS 分层、密度传播、浮层层级和渐进式静态门禁。
- `page-pattern-system`: 定义七种顶层页面模式、嵌入式视图边界、页面密度所有权和桌面窗口适配契约。

### Modified Capabilities

- `operating-ui-design-system`: 将既有动作、导航和间距规范扩展为统一的组件状态、布局原语、语义插槽及页面层级契约。
- `desktop-workbench-ui`: 将既有浅色工作台调整为中性经营工作台，并统一列表、表格、表单、浮层和三档桌面窗口下的表现。
- `notification-feedback`: 将操作反馈扩展为字段、表单、页面和全局四级体系，并约束同一事件的主要反馈出口。
- `detail-workspaces`: 使订单、客户、商品、人员、安排和结算等详情统一归入 Detail Page 或 Form Workspace，同时保留返回上下文和既有业务操作。

## Impact

- 主要影响 `src/renderer/components/ui/**`、`src/renderer/styles/**`、`src/renderer/pages/**`、renderer 测试与 Electron 视觉验收工具。
- `src/renderer/main.tsx` 将改为唯一 UI 样式入口；`src/main/index.ts` 的窗口背景色需要与 renderer canvas 保持同步。
- `app-components.test.ts`、`layering.test.ts` 及令牌治理测试需要从旧文件名和源码字符串断言迁移到 cascade layer、渲染契约和分阶段基线检查。
- 所有页面按报表、设置、订单、排班与核算、财务/工资/工作台、客户/商品/人员的顺序分批迁移。
- 不新增 UI 框架依赖，继续使用 React、Radix、DayPicker 和 Lucide。
- 当前未提交的财务总览改动属于受保护 WIP；提案实施不得覆盖、回退或误提交这些改动。
