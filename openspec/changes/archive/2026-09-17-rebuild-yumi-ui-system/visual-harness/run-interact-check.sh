#!/usr/bin/env bash
# 任务 12.7：串行对所有路由级页面做 Electron 运行时质量交互检查。
#
# 本机约束（1.7/1.9）：Electron 渲染进程偶发 Mach port rendezvous 失败，
# 一个进程内创建第二个 BrowserWindow 几乎必然失败 → 一进程一页，串行，外层重试。
set -u

HARNESS_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HARNESS_DIR/../../../.." && pwd)"
ELECTRON="$ROOT/node_modules/.bin/electron"
CHECK="$HARNESS_DIR/interact-check.mjs"
OUT_BASE="${YUMI_CHECK_BASE:-$ROOT/openspec/changes/rebuild-yumi-ui-system/baselines/interact-check}"
LOG="$OUT_BASE/runs.log"
RETRIES=3
FAILS=0

mkdir -p "$OUT_BASE"
: > "$LOG"

PAGES=(workbench orders fulfillment settlements finance reports customers products settings)

run_one() {
  local page="$1"
  local out="$OUT_BASE/$page.json"
  local attempt
  for attempt in $(seq 1 "$RETRIES"); do
    if YUMI_CHECK_PAGE="$page" YUMI_CHECK_SIZE="${YUMI_CHECK_SIZE:-1440x920}" YUMI_CHECK_OUT="$out" \
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

for page in "${PAGES[@]}"; do
  run_one "$page" || FAILS=$((FAILS + 1))
done

cat > "$OUT_BASE/summary.json" <<EOF
{
  "capturedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "results": [$(for f in "$OUT_BASE"/*.json; do [ "$(basename "$f")" = "summary.json" ] && continue; cat "$f"; echo ","; done | sed '$ s/,$//')]
}
EOF

if [ "$FAILS" -gt 0 ]; then
  echo "done with $FAILS failure(s)" >&2
  exit 1
fi
echo "all pages checked" >&2
