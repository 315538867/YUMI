#!/usr/bin/env bash
# 任务 1.9：串行批量采集三档窗口基线截图。
#
# 本机约束（来自 1.7 实测）：Electron renderer 进程偶发 Mach port rendezvous 失败，
# 且一个进程内创建第二个 BrowserWindow 几乎必然失败。因此每张截图独占一个进程，
# 外层重试，串行执行；不要改成循环内新建窗口或并发采集。
#
# 用法：
#   bash run-capture.sh
#       # 默认固定矩阵（历史调用方行为不变）：全 9 页面 × 三档尺寸 × default，
#       # 每页补 loading/empty/error，portal 页面补 overflow/portal。
#   bash run-capture.sh finance reports workbench \
#       --sizes 1100x720,1280x800,1440x920,1920x1080 \
#       --states default,loading,empty,error,overflow,portal
#       # 页面可经位置参数或 --pages 逗号列表给出；省略的组回落到默认矩阵对应项。
#   bash run-capture.sh --pages a,b --sizes WxH,... --states s1,s2
# 所有采集仍走同一个串行 run_one 循环，每张截图独占一个 Electron 进程。
# 环境变量：
#   YUMI_CAPTURE_BASE  截图输出根目录（默认 openspec/changes/rebuild-yumi-ui-system/baselines/screenshots）
#   YUMI_CAPTURE_SIZE  状态截图使用的窗口尺寸（默认 1440x920）
set -u

HARNESS_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HARNESS_DIR/../../../.." && pwd)"
ELECTRON="$ROOT/node_modules/.bin/electron"
CAPTURE="$HARNESS_DIR/capture.mjs"
OUT_BASE="${YUMI_CAPTURE_BASE:-$ROOT/openspec/changes/rebuild-yumi-ui-system/baselines/screenshots}"
MAIN_SIZE="${YUMI_CAPTURE_SIZE:-1440x920}"
LOG="$OUT_BASE/runs.log"
MANIFEST="$OUT_BASE/manifest.json"
RETRIES=3

mkdir -p "$OUT_BASE"
: > "$LOG"

DEFAULT_PAGES=(workbench orders fulfillment settlements finance reports customers products settings)
DEFAULT_SIZES=(1100x720 1440x920 1920x1080)
DEFAULT_PORTAL_PAGES=(orders customers products finance fulfillment settings)
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
  # 默认固定矩阵：与历史调用方行为完全一致，逐页串行、每张截图独占进程。
  for page in "${DEFAULT_PAGES[@]}"; do
    for size in "${DEFAULT_SIZES[@]}"; do
      run_one "$page" default "$size" || fails=$((fails + 1))
    done
    for st in loading empty error; do
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
  node "$HARNESS_DIR/build-manifest.mjs" "$OUT_BASE" "$MANIFEST" "$@" >/dev/null 2>&1 \
    && echo "manifest: $MANIFEST"
fi

if [ "$fails" -gt 0 ]; then
  echo "done with $fails failure(s)" >&2
  exit 1
fi
echo "all shots done" >&2
