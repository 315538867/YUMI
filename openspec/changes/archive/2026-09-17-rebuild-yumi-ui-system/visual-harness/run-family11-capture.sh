#!/usr/bin/env bash
set -u
HARNESS_DIR="/Volumes/code/YUMI/openspec/changes/rebuild-yumi-ui-system/visual-harness"
ROOT="/Volumes/code/YUMI"
ELECTRON="$ROOT/node_modules/.bin/electron"
CAPTURE="$HARNESS_DIR/capture.mjs"
OUT_BASE="$ROOT/openspec/changes/rebuild-yumi-ui-system/baselines/screenshots"
MAIN_SIZE="1440x920"
LOG="$OUT_BASE/runs.log"
RETRIES=3

mkdir -p "$OUT_BASE"

run_one() {
  local page="$1" state="$2" size="$3"
  local out="$OUT_BASE/${page}-${size}-${state}.png"
  local attempt
  for attempt in $(seq 1 "$RETRIES"); do
    if YUMI_SHOT_PAGE="$page" YUMI_SHOT_SIZE="$size" YUMI_SHOT_STATE="$state" \
        YUMI_SHOT_OUT="$out" perl -e '$SIG{ALRM}=sub { die "timeout\n" }; alarm 90; exec @ARGV' \
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
for page in customers products; do
  for size in 1100x720 1440x920 1920x1080; do
    run_one "$page" default "$size" || fails=$((fails + 1))
  done
  for st in loading empty error overflow portal; do
    run_one "$page" "$st" "$MAIN_SIZE" || fails=$((fails + 1))
  done
done

if [ "$fails" -gt 0 ]; then
  echo "done with $fails failure(s)" >&2
  exit 1
fi
echo "all shots done" >&2
