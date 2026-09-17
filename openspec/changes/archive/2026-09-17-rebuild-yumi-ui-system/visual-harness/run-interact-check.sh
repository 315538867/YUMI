#!/usr/bin/env bash
# Task 7：串行对所有路由级页面做 Electron「运行时质量 + 真实交互状态」检查
# （interact-check，承接任务 12.7 并扩展 dialog/sheet/popover/invalid 逐页状态断言）。
#
# 本机约束（1.7/1.9）：Electron 渲染进程偶发 Mach port rendezvous 失败，
# 一个进程内创建第二个 BrowserWindow 几乎必然失败 → 一进程一页，串行，外层重试。
#
# 用法：
#   bash run-interact-check.sh
#       # 默认矩阵：全 11 页面 × 交互状态 dialog,sheet,popover,invalid
#       #（页面 × 状态均为 capture.mjs TRIGGERS 登记的注册状态；无触发器页面按
#       #  确定性失败「no-trigger」如实记录，不重试不掩盖）。
#   bash run-interact-check.sh --pages workbench,orders \
#       --states dialog,sheet,popover,invalid
#       # --pages/--states 接受逗号列表；省略的组回落到默认矩阵对应项。
# 页面 id：workbench orders products fulfillment finance reports customers settings
#          settlements workers work-assignments（同 capture.mjs；workers/work-assignments
#          为嵌入页，经 NAV_PATHS 纳工资 → 人员与时薪 / 排班 进入）。
#
# runs.log 行为：不带 CLI 参数时（默认矩阵）会先清空 runs.log；带 --pages/--states
# 时改为「追加」——多次分段检查可以安全追加进同一条日志。也可用
# YUMI_INTERACT_APPEND=1 强制追加。
# 环境变量：
#   YUMI_CHECK_BASE   结果输出根目录（默认 openspec/changes/archive/…/baselines/interact-check）
#   YUMI_CHECK_SIZE   窗口尺寸（默认 1440x920）
#   YUMI_CHECK_APPEND 1 时不截断 runs.log（强制追加）
set -u

HARNESS_DIR="$(cd "$(dirname "$0")" && pwd)"
# 归档后 harness 位于 openspec/changes/archive/2026-09-17-rebuild-yumi-ui-system/visual-harness，
# 上溯 5 级才回到仓库根（4 级会解析到 openspec/ 并让 out/renderer/index.html 加载失败）。
ROOT="$(cd "$HARNESS_DIR/../../../../.." && pwd)"
ELECTRON="$ROOT/node_modules/.bin/electron"
CHECK="$HARNESS_DIR/interact-check.mjs"
OUT_BASE="${YUMI_CHECK_BASE:-$ROOT/openspec/changes/archive/2026-09-17-rebuild-yumi-ui-system/baselines/interact-check}"
LOG="$OUT_BASE/runs.log"
RETRIES=3

mkdir -p "$OUT_BASE"
# 与 run-capture.sh 同款日志语义：CLI 分段检查追加，默认矩阵截断。
CLI_MODE=0
for arg in "$@"; do
  case "$arg" in
    --pages|--states) CLI_MODE=1 ;;
  esac
done
if [ "${YUMI_CHECK_APPEND:-0}" = "1" ] || [ "$CLI_MODE" = "1" ]; then
  touch "$LOG"
else
  : > "$LOG"
fi

# 记录原始 CLI（后续 while/set -- 会消费 $@，summary 的 command 字段需用它还原）。
ORIGINAL_ARGS=("$@")

DEFAULT_PAGES=(workbench orders products fulfillment finance reports customers settings settlements workers work-assignments)
DEFAULT_STATES=(dialog sheet popover invalid)

# CLI 解析：--pages/--states 接受逗号分隔列表；其余位置参数视为页面。
declare -a CLI_PAGES=() CLI_STATES=() POSITIONAL=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --pages)
      [ "$#" -ge 2 ] || { echo "--pages 需要逗号分隔页面列表" >&2; exit 2; }
      IFS=',' read -r -a _list <<<"$2"
      CLI_PAGES+=("${_list[@]}")
      shift 2
      ;;
    --states)
      [ "$#" -ge 2 ] || { echo "--states 需要逗号分隔状态列表" >&2; exit 2; }
      IFS=',' read -r -a _list <<<"$2"
      CLI_STATES+=("${_list[@]}")
      shift 2
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done

PAGES=("${CLI_PAGES[@]}" "${POSITIONAL[@]}")
STATES=("${CLI_STATES[@]}")
if [ "${#PAGES[@]}" -eq 0 ]; then PAGES=("${DEFAULT_PAGES[@]}"); fi
if [ "${#STATES[@]}" -eq 0 ]; then STATES=("${DEFAULT_STATES[@]}"); fi
STATES_CSV="$(IFS=','; echo "${STATES[*]}")"

run_one() {
  local page="$1"
  local out="$OUT_BASE/$page.json"
  local attempt
  # 先清掉该页旧结果：失败重试时不会把上一版本（或归档前旧格式）的 json 误留给 summary。
  rm -f "$out"
  for attempt in $(seq 1 "$RETRIES"); do
    if YUMI_CHECK_PAGE="$page" YUMI_CHECK_SIZE="${YUMI_CHECK_SIZE:-1440x920}" \
        YUMI_CHECK_STATES="$STATES_CSV" YUMI_CHECK_OUT="$out" \
        perl -e '$SIG{ALRM}=sub { die "timeout\n" }; alarm 90; exec @ARGV' \
        "$ELECTRON" --no-sandbox "$CHECK" >>"$LOG" 2>&1; then
      if [ -s "$out" ]; then
        echo "ok   $page (attempt $attempt)" >&2
        return 0
      fi
    fi
    echo "retry $page attempt $attempt" >&2
  done
  echo "FAIL $page" >&2
  return 1
}

FAILS=0
for page in "${PAGES[@]}"; do
  run_one "$page" || FAILS=$((FAILS + 1))
done

# 汇总：页面 × 状态判定矩阵 + 控制台/网络/异常计数 + 焦点恢复结果。
# 每页 JSON 由 interact-check.mjs 覆盖写入（页面是单位），页面内 states 数组记录
# 每状态 verdict（ok / no-trigger / failure）。no-trigger 属确定性失败，如实计数
# 但不由本脚本判失败——只有 realDefects（console error / 网络失败 / 运行时异常 /
# 状态触发失败 / 焦点未恢复）才推高 FAILS 反映到退出码。
node - "$OUT_BASE" "$STATES_CSV" "${ORIGINAL_ARGS[@]}" >"$OUT_BASE/summary.json" <<'EOF'
const fs = require('node:fs')
const path = require('node:path')
const [outBase, statesCsv] = process.argv.slice(2)
const pages = fs
  .readdirSync(outBase)
  .filter((f) => f.endsWith('.json') && f !== 'summary.json')
  .map((f) => JSON.parse(fs.readFileSync(path.join(outBase, f), 'utf8')))
  .sort((a, b) => a.page.localeCompare(b.page))

const states = statesCsv ? statesCsv.split(',') : []
const matrix = {}
const totals = { consoleErrors: 0, consoleWarnings: 0, loadFailures: 0, runtimeErrors: 0, realDefects: 0 }
const focusRestored = {}
for (const report of pages) {
  totals.consoleErrors += report.consoleErrors ?? 0
  totals.consoleWarnings += report.consoleWarnings ?? 0
  totals.loadFailures += (report.loadFailures || []).length
  totals.runtimeErrors += (report.runtimeErrors || []).length
  const real = []
  if ((report.consoleErrors ?? 0) > 0) real.push('console-error')
  if ((report.loadFailures || []).length > 0) real.push('network-failure')
  if ((report.runtimeErrors || []).length > 0) real.push('runtime-error')
  for (const entry of report.states || []) {
    if (entry.verdict === 'failure') real.push(`state-${entry.state}-failure`)
  }
  if (report.focusRestore) {
    focusRestored[report.page] = report.focusRestore.ok === true ? 'ok' : 'failure'
    if (report.focusRestore.ok !== true) real.push('portal-focus-restore-failure')
  } else {
    focusRestored[report.page] = 'n-a'
  }
  matrix[report.page] = {}
  for (const s of states) {
    const entry = (report.states || []).find((e) => e.state === s)
    matrix[report.page][s] = entry ? entry.verdict : 'skipped'
  }
  totals.realDefects += real.length
}

const summary = {
  schemaVersion: 2,
  capturedAt: new Date().toISOString(),
  command: process.argv.slice(4).join(' '),
  pages: pages.map((p) => p.page),
  statesRequested: states,
  counts: totals,
  focusRestored,
  matrix,
  remark: '每页 1 条 Electron 开发模式固有 CSP 安全警告（Insecure Content-Security-Policy），打包后不出现，非应用日志，不算失败；no-trigger 为页面未登记该状态触发器的确定性失败，如实记录',
  results: pages
}
process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
EOF
echo "summary: $OUT_BASE/summary.json"

if [ "$FAILS" -gt 0 ]; then
  echo "done with $FAILS failure(s)" >&2
  exit 1
fi
echo "all pages checked" >&2
