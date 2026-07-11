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
PID_FILE="${HOT_REPLY_PID_FILE:-logs/opentwitter-hot-reply.pid}"

mkdir -p "$(dirname "$EVENT_LOG")" "$(dirname "$STATE_FILE")" "$(dirname "$DEBUG_LOG")" "$(dirname "$PID_FILE")" logs
printf '%s\n' "$$" > "$PID_FILE"
printf '[%s] launchd foreground hot-reply watcher starting pid=%s accounts=%s events=%s replyAccount=%s minReplyScore=%s\n' \
  "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$$" "$ACCOUNTS" "$EVENTS" "$REPLY_ACCOUNT" "$MIN_REPLY_SCORE"

exec node dist/scripts/opentwitter-hot-reply.js \
  --accounts "$ACCOUNTS" \
  --events "$EVENTS" \
  --reply-account "$REPLY_ACCOUNT" \
  --event-log "$EVENT_LOG" \
  --state "$STATE_FILE" \
  --reply-debug-log "$DEBUG_LOG" \
  --min-reply-score "$MIN_REPLY_SCORE"
