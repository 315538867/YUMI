#!/usr/bin/env bash
# 任务 1.9：串行批量采集三档窗口基线截图。
#
# 本机约束（来自 1.7 实测）：Electron renderer 进程偶发 Mach port rendezvous 失败，
# 且一个进程内创建第二个 BrowserWindow 几乎必然失败。因此每张截图独占一个进程，
# 外层重试，串行执行；不要改成循环内新建窗口或并发采集。
#
# 用法：bash run-capture.sh
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

PAGES=(workbench orders fulfillment settlements finance reports customers products settings)
SIZES=(1100x720 1440x920 1920x1080)
PORTAL_PAGES=(orders customers products finance fulfillment settings)

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

fails=0
for page in "${PAGES[@]}"; do
  for size in "${SIZES[@]}"; do
    run_one "$page" default "$size" || fails=$((fails + 1))
  done
  for st in loading empty error; do
    run_one "$page" "$st" "$MAIN_SIZE" || fails=$((fails + 1))
  done
done
for page in "${PORTAL_PAGES[@]}"; do
  for st in overflow portal; do
    run_one "$page" "$st" "$MAIN_SIZE" || fails=$((fails + 1))
  done
done

if command -v node >/dev/null 2>&1; then
  node "$HARNESS_DIR/build-manifest.mjs" "$OUT_BASE" "$MANIFEST" "$@" >/dev/null 2>&1 \
    && echo "manifest: $MANIFEST"
fi

if [ "$fails" -gt 0 ]; then
  echo "done with $fails failure(s)" >&2
  exit 1
fi
echo "all shots done" >&2
