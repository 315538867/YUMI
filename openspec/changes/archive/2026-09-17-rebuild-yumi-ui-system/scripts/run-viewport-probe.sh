#!/usr/bin/env bash
# 依次测量三档验收窗口的实际 renderer viewport，并汇总为 JSON。
#
#   bash openspec/changes/rebuild-yumi-ui-system/scripts/run-viewport-probe.sh
#
# 本机 Electron renderer 进程偶发启动失败，因此每档尺寸最多重试 MAX_ATTEMPTS 次；
# 单档全部失败时脚本以非 0 退出，方便调用方判断数据是否完整。
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PROBE="$REPO_ROOT/openspec/changes/rebuild-yumi-ui-system/scripts/probe-viewport.mjs"
ELECTRON="$REPO_ROOT/node_modules/.bin/electron"
SIZES=("1100x720" "1440x920" "1920x1080")
MAX_ATTEMPTS=6
WORK_DIR="$(mktemp -d)"
OUT="$WORK_DIR/viewport.json"

printf '{\n  "sizes": [\n' > "$OUT"
failed=0

for index in "${!SIZES[@]}"; do
  size="${SIZES[$index]}"
  result=""

  for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
    (
      YUMI_PROBE_SIZE="$size" "$ELECTRON" --no-sandbox "$PROBE" \
        > "$WORK_DIR/attempt.json" 2> "$WORK_DIR/attempt.err" &
      probe_pid=$!
      ( sleep 25; kill -9 "$probe_pid" 2>/dev/null ) &
      watchdog=$!
      wait "$probe_pid"
      kill "$watchdog" 2>/dev/null
    ) >/dev/null 2>&1

    if [ -s "$WORK_DIR/attempt.json" ]; then
      result="$(cat "$WORK_DIR/attempt.json")"
      printf '  %s: %s (attempt %s)\n' "$size" "ok" "$attempt" >&2
      break
    fi
    printf '  %s: attempt %s failed\n' "$size" "$attempt" >&2
  done

  if [ -z "$result" ]; then
    failed=1
    printf '  %s: 全部 %s 次尝试均失败\n' "$size" "$MAX_ATTEMPTS" >&2
    result='null'
  fi

  if [ "$index" -gt 0 ]; then printf ',\n' >> "$OUT"; fi
  printf '    %s' "$result" >> "$OUT"
done

printf '\n  ]\n}\n' >> "$OUT"
cat "$OUT"

rm -rf "$WORK_DIR"
exit "$failed"
