#!/usr/bin/env bash
# 任务 1.9：串行批量采集四档窗口基线截图。
#
# 本机约束（来自 1.7 实测）：Electron renderer 进程偶发 Mach port rendezvous 失败，
# 且一个进程内创建第二个 BrowserWindow 几乎必然失败。因此每张截图独占一个进程，
# 外层重试，串行执行；不要改成循环内新建窗口或并发采集。
#
# 用法：
#   bash run-capture.sh
#       # 默认固定矩阵（与视觉基线测试同源）：全 11 页面 × 四档尺寸 × default，
#       # 每页补 loading/empty/error/long-text，portal 页补 overflow/portal，
#       # 每页补登记的真实交互状态（form/detail/sheet/popover/dialog/invalid）。
#   bash run-capture.sh finance reports workbench \
#       --sizes 1100x720,1280x800,1440x920,1920x1080 \
#       --states default,loading,empty,error,overflow,long-text,portal
#       # 页面可经位置参数或 --pages 逗号列表给出；省略的组回落到默认矩阵对应项。
#   bash run-capture.sh --pages a,b --sizes WxH,... --states s1,s2
# 所有采集仍走同一个串行 run_one 循环，每张截图独占一个 Electron 进程。
#
# runs.log 行为：不带 CLI 参数时（默认矩阵）会先清空 runs.log；带 --pages/--sizes/
# --states 时改为「追加」——build-manifest.mjs 按 out 去重（后者胜出），因此多次
# 分段采集可以安全追加进同一条日志，最后一次性生成完整 manifest。也可用
# YUMI_CAPTURE_APPEND=1 强制追加。
# 环境变量：
#   YUMI_CAPTURE_BASE  截图输出根目录（默认 openspec/changes/rebuild-yumi-ui-system/baselines/screenshots）
#   YUMI_CAPTURE_SIZE  状态截图使用的窗口尺寸（默认 1440x920）
#   YUMI_CAPTURE_APPEND 1 时不截断 runs.log（强制追加）
set -u

HARNESS_DIR="$(cd "$(dirname "$0")" && pwd)"
# 归档后 harness 位于 openspec/changes/archive/2026-09-17-rebuild-yumi-ui-system/visual-harness，
# 上溯 5 级才回到仓库根（4 级会解析到 openspec/ 并让 out/renderer/index.html 加载失败）。
ROOT="$(cd "$HARNESS_DIR/../../../../.." && pwd)"
ELECTRON="$ROOT/node_modules/.bin/electron"
CAPTURE="$HARNESS_DIR/capture.mjs"
OUT_BASE="${YUMI_CAPTURE_BASE:-$ROOT/openspec/changes/rebuild-yumi-ui-system/baselines/screenshots}"
MAIN_SIZE="${YUMI_CAPTURE_SIZE:-1440x920}"
LOG="$OUT_BASE/runs.log"
MANIFEST="$OUT_BASE/manifest.json"
RETRIES=3

mkdir -p "$OUT_BASE"
# CLI 矩阵改为追加模式：分段采集共享一条 runs.log，build-manifest 按 out 去重。
CLI_MODE=0
for arg in "$@"; do
  case "$arg" in
    --pages|--sizes|--states) CLI_MODE=1 ;;
  esac
done
if [ "${YUMI_CAPTURE_APPEND:-0}" = "1" ] || [ "$CLI_MODE" = "1" ]; then
  touch "$LOG"
else
  : > "$LOG"
fi

DEFAULT_PAGES=(workbench orders fulfillment settlements finance reports customers products settings workers work-assignments)
DEFAULT_SIZES=(1100x720 1280x800 1440x920 1920x1080)
# 与 capture.mjs TRIGGERS / baseline-screenshots.test.ts REGISTERED_STATES 同源：
# 每页在 MAIN_SIZE 下补出的真实交互状态。
declare -A DEFAULT_TRIGGER_STATES=(
  [orders]="form detail sheet"
  [products]="form detail"
  [customers]="sheet detail"
  [fulfillment]="sheet invalid"
  [settlements]="sheet detail"
  [finance]="sheet popover"
  [reports]="popover"
  [settings]="sheet dialog"
  [workers]="form detail"
  [work-assignments]="sheet"
)
DEFAULT_PORTAL_PAGES=(orders customers products finance fulfillment settings settlements workers work-assignments)
DEFAULT_CLI_STATES=(default)

run_one() {
  local page="$1" state="$2" size="$3"
  local out="$OUT_BASE/${page}-${size}-${state}.png"
  local attempt
  for attempt in $(seq 1 "$RETRIES"); do
    if YUMI_SHOT_PAGE="$page" YUMI_SHOT_SIZE="$size" YUMI_SHOT_STATE="$state" \
        YUMI_SHOT_OUT="$out" perl -e '$SIG{ALRM}=sub { die "timeout\n" }; alarm 60; exec @ARGV' \
        "$ELECTRON" --no-sandbox "$CAPTURE" >>"$LOG" 2>&1; then
      if [ -s "$out" ]; then
        echo "ok   $page $state $size (attempt $attempt)" >&2
        return 0
      fi
    fi
    echo "retry $page $state $size attempt $attempt" >&2
  done
  echo "FAIL $page $state $size" >&2
  return 1
}

# CLI 解析：位置参数视为页面；--pages/--sizes/--states 接受逗号分隔列表。
declare -a CLI_PAGES=() CLI_SIZES=() CLI_STATES=() POSITIONAL=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --pages)
      [ "$#" -ge 2 ] || { echo "--pages 需要逗号分隔页面列表" >&2; exit 2; }
      IFS=',' read -r -a _list <<<"$2"
      CLI_PAGES+=("${_list[@]}")
      shift 2
      ;;
    --sizes)
      [ "$#" -ge 2 ] || { echo "--sizes 需要逗号分隔尺寸列表" >&2; exit 2; }
      IFS=',' read -r -a _list <<<"$2"
      CLI_SIZES+=("${_list[@]}")
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
SIZES=("${CLI_SIZES[@]}")
STATES=("${CLI_STATES[@]}")

fails=0
if [ "${#PAGES[@]}" -eq 0 ] && [ "${#SIZES[@]}" -eq 0 ] && [ "${#STATES[@]}" -eq 0 ]; then
  # 默认固定矩阵：与视觉基线测试同源的全量矩阵，逐页串行、每张截图独占进程。
  for page in "${DEFAULT_PAGES[@]}"; do
    for size in "${DEFAULT_SIZES[@]}"; do
      run_one "$page" default "$size" || fails=$((fails + 1))
    done
    for st in loading empty error long-text; do
      run_one "$page" "$st" "$MAIN_SIZE" || fails=$((fails + 1))
    done
    for st in ${DEFAULT_TRIGGER_STATES[$page]}; do
      run_one "$page" "$st" "$MAIN_SIZE" || fails=$((fails + 1))
    done
  done
  for page in "${DEFAULT_PORTAL_PAGES[@]}"; do
    for st in overflow portal; do
      run_one "$page" "$st" "$MAIN_SIZE" || fails=$((fails + 1))
    done
  done
else
  # CLI 矩阵：页面 × 尺寸 × 状态的串行笛卡尔积；省略的组回落到默认矩阵对应项。
  if [ "${#PAGES[@]}" -eq 0 ]; then PAGES=("${DEFAULT_PAGES[@]}"); fi
  if [ "${#SIZES[@]}" -eq 0 ]; then SIZES=("${DEFAULT_SIZES[@]}"); fi
  if [ "${#STATES[@]}" -eq 0 ]; then STATES=("${DEFAULT_CLI_STATES[@]}"); fi

  for page in "${PAGES[@]}"; do
    for size in "${SIZES[@]}"; do
      for st in "${STATES[@]}"; do
        run_one "$page" "$st" "$size" || fails=$((fails + 1))
      done
    done
  done
fi

if command -v node >/dev/null 2>&1; then
  # 必须在仓库根运行：build-manifest 按 process.cwd() 解析 SHOT.out 的相对路径，
  # 在 harness 目录下跑会把全部 png 元数据丢掉。
  ( cd "$ROOT" && node "$HARNESS_DIR/build-manifest.mjs" "$OUT_BASE" "$MANIFEST" "$@" >/dev/null 2>&1 ) \
    && echo "manifest: $MANIFEST"
fi

if [ "$fails" -gt 0 ]; then
  echo "done with $fails failure(s)" >&2
  exit 1
fi
echo "all shots done" >&2
