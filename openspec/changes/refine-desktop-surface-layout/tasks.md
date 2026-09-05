## 1. 样式契约测试（依赖：无）

- [ ] 1.1 新增 `tests/desktop-surface-layout.test.ts`，读取 `src/renderer/styles/app.css`，断言 `.content` 使用 `22px 28px 30px` 内边距、`.stat-grid` 使用 `10px` 间距和 `12px` 下边距、`.stat` 与 `.panel` 不含 `border: 1px` 或卡片阴影。
- [ ] 1.2 在同一测试中断言 `.stat.warning` 与 `.stat.danger` 使用背景色且不含顶部强调边线；断言 `.week-grid` 仍保留网格边界、`:focus-visible` 规则仍保留焦点轮廓。
- [ ] 1.3 运行 `npm test -- tests/desktop-surface-layout.test.ts`，确认测试因当前边框卡片与较大间距而失败，再记录失败原因。

## 2. 常规工作区底色分区（依赖：1.3）

- [ ] 2.1 修改 `src/renderer/styles/app.css` 的 `.content`、`.stat-grid`、`.stat`、`.stat.warning`、`.stat.danger` 与 `.panel`：收紧页面与模块间距，去掉常规外框和投影，改用暖白、淡杏、淡红底色。
- [ ] 2.2 修改同一文件的 `.form-section`、`.order-summary-bar`、`.inspector-kpis`、`.detail-list`、`.payment-timeline`、`.shift-inspector-tasks`、`.cost-preview-grid`、`.queue-item` 与 `.report-filters`：移除这些常规业务容器的外框，保留内部行分隔、输入控件、日历网格及 hover/focus 反馈。
- [ ] 2.3 运行 `npm test -- tests/desktop-surface-layout.test.ts`，确认新增样式契约测试通过。

## 3. 全量验证与人工检查（依赖：2.3）

- [ ] 3.1 运行 `npm test`、`npm run typecheck`、`npm run lint`、`npm run build`，记录每个命令的退出状态与结果。
- [ ] 3.2 启动 `npm run dev`，人工检查概览、订单、排班、商品与报表：确认外框已由底色分区替代，间距更紧凑，且表格、日历、输入与键盘焦点仍清楚可用。
- [ ] 3.3 运行 `openspec validate refine-desktop-surface-layout --strict`，将已验证的任务逐项勾选并记录验证证据；不归档，等待用户确认视觉效果。
