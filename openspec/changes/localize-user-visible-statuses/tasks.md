# 用户可见状态中文化实施任务

- Change ID：`localize-user-visible-statuses`
- 方案版本：v1.0
- 状态：已完成
- 创建人：Codex
- 创建时间：2026-09-06
- 最后修改时间：2026-09-06

## 1. 状态展示契约与测试

- [x] 1.1 在 `src/renderer/status-display.ts` 集中定义生产、收付款和排班状态的中文名称与颜色展示函数；函数接收既有英文枚举或字符串，对已知值返回统一中文名称，对未知值返回“未知状态（原始值）”和中性色；完成条件是模块不改变共享契约或持久化值；验证方式为新增 `src/renderer/status-display.test.ts` 覆盖三类全部已知枚举与未知值。
- [x] 1.2 在 `src/renderer/status-display.test.ts` 增加状态色、中文名称和未知状态兜底断言；完成条件是测试不依赖 React 或 Electron 运行时，并能锁定未知英文枚举不被直接裸露展示；验证方式为运行 `npm test -- src/renderer/status-display.test.ts`。

## 2. 页面展示迁移

- [x] 2.1 在 `src/renderer/pages/app.tsx` 用集中状态展示函数替换局部生产、收付款和排班映射、排班颜色判断，以及订单详情中直接渲染的生产状态；完成条件是订单详情、订单报表和概览不再直接显示内部英文状态值；验证方式为扩充 `src/renderer/pages/app-components.test.ts` 的源码断言并运行对应测试。
- [x] 2.2 在 `src/renderer/pages/app.tsx` 将排班日历卡片、排班详情标签和排班状态下拉选项迁移至集中展示函数；完成条件是下拉选项文本为中文而其提交值仍为既有英文枚举，未知已读状态展示中文兜底；验证方式为 `src/renderer/pages/app-components.test.ts` 与 `npm run typecheck`。

## 3. 验证与提案回写

- [x] 3.1 执行状态模块测试、界面组件测试、`npm run typecheck`、`npm run lint`、`npm test` 和 `npm run build`；完成条件是全部命令退出码为 0；验证方式为记录命令输出摘要。
- [x] 3.2 运行 `openspec validate localize-user-visible-statuses --strict`，逐项更新任务状态，并在 `proposal.md` 写入完成时间、验证结果和未发生数据迁移的事实；完成条件是严格校验通过且仅在验证完成后将提案标记为已完成；验证方式为读取完整校验输出。

## 实施验证记录

- 2026-09-06：新增 `src/renderer/status-display.ts`，集中管理生产、收付款及排班状态的中文名称和状态色；未知值统一显示为“未知状态（原始值）”。
- 2026-09-06：订单列表与详情、订单报表、生产状态筛选、排班日历、排班详情与状态下拉框均已迁移至集中展示模块；数据库、共享契约和 IPC 中的英文状态枚举未变更。
- 2026-09-06：已运行 `npm run typecheck`、`npm run lint`、`npm test`（28 个测试文件、72 个测试通过）、`npm run build`、`openspec validate localize-user-visible-statuses --strict` 和 `git diff --check`，退出码均为 0。
