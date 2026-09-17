# P0 · 三档窗口基线截图（任务 1.9）

来源：`visual-harness/capture.mjs` + `preload-stub.cjs`（确定性数据 stub）+ `run-capture.sh`（批量调度）

## 交付物

- 66 张 PNG：`baselines/screenshots/<page>-<WxH>-<state>.png`
- `baselines/screenshots/manifest.json`：schemaVersion 1，逐张记录请求尺寸、实际 renderer viewport、PNG 尺寸/体积、页面级横向滚动、`role="status"` 数量、harness 状态、miss 方法、portal 展开信息、正文文本预览与注入的夹具日期
- `baselines/screenshots/runs.log`：逐次采集原文（重试时保留最近一次）
- 采集脚本与说明见 `visual-harness/`（README 见本文件；`run-capture.sh` 重新执行即可复采）

## 覆盖矩阵

| 状态     | 尺寸                            | 页数 | 张数 |
| -------- | ------------------------------- | ---- | ---- |
| default  | 1100×720 / 1440×920 / 1920×1080 | 9    | 27   |
| loading  | 1440×920                        | 9    | 9    |
| empty    | 1440×920                        | 9    | 9    |
| error    | 1440×920                        | 9    | 9    |
| overflow | 1440×920                        | 6    | 6    |
| portal   | 1440×920                        | 6    | 6    |

页面 id：workbench / orders / fulfillment / settlements / finance / reports / customers / products / settings（与 `page-inventory.json` 一致）。

## 确定性

- 数据集：`visual-harness/fixtures.json`（由 1.6 `emit-fixtures.mjs` 从 visual-fixtures 打包导出，固定时区 `Asia/Shanghai`、基准日 `2026-03-18`、种子 `20260318`）
- stub preload 把所有 IPC 读方法映射到该数据集；写方法一律抛「不支持写」错误；未被 SURFACE 声明的调用记录到 `misses`（manifest 每张图可见，用于排查空白页）
- 状态注入：`--yumi-harness-state` 由 `additionalArguments` 传入（loading 挂起、error 拒绝、empty 返回空集合、overflow 注入长文案与克隆行）
- 进程纪律：一进程一拍 + 外层重试 + 60s 超时（本机 Electron 一进程内第二个 BrowserWindow 几乎必然失败，见 1.7）

## 实测事实（基线现状）

- **默认态三档窗口全部无页面级横向滚动**（27/27，`pageLevelHorizontalScroll=false`）
- 全部默认态页面渲染出 `yumi-page` 根节点，截图尺寸 = 请求尺寸 × devicePixelRatio（本机 DPR=2，截图 2880×1840 等）
- loading 态：8/9 页面出现 `role="status"` 加载呈现；**finance 页当前没有专有加载状态**（月度结果直接渲染 0），已登记为当前基线事实并在契约测试豁免
- empty 态：工作台 count 归零并显示「当前没有履约待办」等空态文案
- error 态：页面将读失败降级为零/占位（工作台「数据截至 —」），为当前错误呈现现状
- portal 态：customers/finance/fulfillment/settings 打开 Dialog，orders/products 展开 Select Popover（`overlay=1`）
- overflow 态：orders 表格出现局部横向滚动（`scrollableTables=1`），orders/customers/products/finance 渲染出注入的超长中文文案
- 契约测试：`src/renderer/test/ui-baseline/baseline-screenshots.test.ts` 共 11 例，锁定上述覆盖、文件存在性、尺寸、harnessState、日期与状态呈现

## 已知限制（已记录，不阻塞）

1. **finance 加载态无 spinner**：属页面现状，不是采集缺陷；迁移时（P3 财务家族）需按目标 Pattern 补加载态。
2. **月份选择器使用运行时月份**：部分页面（finance/reports/settlements 等）的期间标签取运行时系统日期（2026-09），而夹具数据落在 2026-03，因此按月统计在「2026年09月」标签下显示 0（如 finance 本月经营结果）。同日内重跑结果稳定；跨月/跨年复采可能改变月份标签。后续若要让月份也确定化，需在标题区加 fixture 时钟注入，属可选项。
3. **products 的「新建商品」是全页工作区而非浮层**：portal 态改用「全部状态」筛选下拉（Select Popover）作为代表。
4. 截图以 PNG 形式随 change 留存（约 18MB）；重跑 `run-capture.sh` 可重建。

## 后续用途

- P2 七种 Pattern 的三档窗口验收（任务 5.10）与此基线逐页对比
- P3 每个页面家族迁移前先复采该家族截图作为检查点（6.x–11.x）
- 12.6 最终全量验收复用同一套 `run-capture.sh`
