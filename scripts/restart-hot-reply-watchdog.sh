#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ACCOUNTS="${HOT_REPLY_ACCOUNTS:-ai_xiaomu,cz_binance,chuge857,artinmemes,BroBean88,Xuegaogx,daidaibtc,_FORAB,aleabitoreddit,justinsuntron}"
EVENTS="${HOT_REPLY_EVENTS:-NEW_TWEET,NEW_TWEET_QUOTE}"
REPLY_ACCOUNT="${HOT_REPLY_REPLY_ACCOUNT:-yoyo_aigo}"
MIN_REPLY_SCORE="${HOT_REPLY_MIN_REPLY_SCORE:-70}"
EVENT_LOG="${HOT_REPLY_EVENT_LOG:-queues/opentwitter-events.jsonl}"
STATE_FILE="${HOT_REPLY_STATE:-queues/hot-reply-flow-state.json}"
DEBUG_LOG="${HOT_REPLY_DEBUG_LOG:-logs/hot-reply-generation-debug.jsonl}"
RUN_LOG="${HOT_REPLY_RUN_LOG:-logs/opentwitter-hot-reply-watchdog.log}"
PID_FILE="${HOT_REPLY_PID_FILE:-logs/opentwitter-hot-reply.pid}"
WATCHER_PATTERN='node dist/scripts/opentwitter-hot-reply\.js'

mkdir -p "$(dirname "$EVENT_LOG")" "$(dirname "$STATE_FILE")" "$(dirname "$DEBUG_LOG")" "$(dirname "$RUN_LOG")" "$(dirname "$PID_FILE")"

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  npm run build
fi

OLD_PIDS="$(pgrep -f "$WATCHER_PATTERN" || true)"
if [[ -n "$OLD_PIDS" ]]; then
  printf '[%s] stopping old hot-reply watcher pid(s): %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$OLD_PIDS" | tee -a "$RUN_LOG"
  # shellcheck disable=SC2086 # intentional pid word-splitting
  kill $OLD_PIDS 2>/dev/null || true
  sleep 2
  STILL_RUNNING="$(pgrep -f "$WATCHER_PATTERN" || true)"
  if [[ -n "$STILL_RUNNING" ]]; then
    printf '[%s] force-stopping hot-reply watcher pid(s): %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$STILL_RUNNING" | tee -a "$RUN_LOG"
    # shellcheck disable=SC2086 # intentional pid word-splitting
    kill -9 $STILL_RUNNING 2>/dev/null || true
  fi
else
  printf '[%s] no existing hot-reply watcher found\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" | tee -a "$RUN_LOG"
fi

printf '[%s] starting hot-reply watcher accounts=%s events=%s replyAccount=%s minReplyScore=%s\n' \
  "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$ACCOUNTS" "$EVENTS" "$REPLY_ACCOUNT" "$MIN_REPLY_SCORE" | tee -a "$RUN_LOG"

nohup node dist/scripts/opentwitter-hot-reply.js \
  --accounts "$ACCOUNTS" \
  --events "$EVENTS" \
  --reply-account "$REPLY_ACCOUNT" \
  --event-log "$EVENT_LOG" \
  --state "$STATE_FILE" \
  --reply-debug-log "$DEBUG_LOG" \
  --min-reply-score "$MIN_REPLY_SCORE" \
  >> "$RUN_LOG" 2>&1 &

NEW_PID=$!
printf '%s\n' "$NEW_PID" > "$PID_FILE"
printf '[%s] started hot-reply watcher pid=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$NEW_PID" | tee -a "$RUN_LOG"

sleep "${HOT_REPLY_VERIFY_WAIT_SECONDS:-3}"
if ! kill -0 "$NEW_PID" 2>/dev/null; then
  printf '[%s] ERROR: hot-reply watcher exited during startup; tailing log:\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >&2
  tail -50 "$RUN_LOG" >&2 || true
  exit 1
fi

printf '[%s] hot-reply watcher healthy pid=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$NEW_PID" | tee -a "$RUN_LOG"
printf 'pid=%s\nlog=%s\neventLog=%s\nstate=%s\ndebugLog=%s\n' "$NEW_PID" "$RUN_LOG" "$EVENT_LOG" "$STATE_FILE" "$DEBUG_LOG"
