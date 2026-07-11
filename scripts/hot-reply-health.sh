#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

python3 - <<'PY'
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

LABEL = 'com.socialcrabs.hot-reply'
DOMAIN = f'gui/{os.getuid()}'
ROOT = Path.cwd()
EVENT_LOG = ROOT / os.environ.get('HOT_REPLY_EVENT_LOG', 'queues/opentwitter-events.jsonl')
DEBUG_LOG = ROOT / os.environ.get('HOT_REPLY_DEBUG_LOG', 'logs/hot-reply-generation-debug.jsonl')
PID_FILE = ROOT / os.environ.get('HOT_REPLY_PID_FILE', 'logs/opentwitter-hot-reply.pid')
RUN_LOG = ROOT / os.environ.get('HOT_REPLY_RUN_LOG', 'logs/opentwitter-hot-reply-watchdog.log')
WARN_EVENT_AGE_SECONDS = int(os.environ.get('HOT_REPLY_HEALTH_WARN_EVENT_AGE_SECONDS', '180'))
CRIT_EVENT_AGE_SECONDS = int(os.environ.get('HOT_REPLY_HEALTH_CRIT_EVENT_AGE_SECONDS', '600'))

def run(cmd):
    return subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

def parse_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except Exception:
        return None

def age_seconds(dt):
    if not dt:
        return None
    return max(0, int((datetime.now(timezone.utc) - dt).total_seconds()))

def read_jsonl_tail(path, limit=2000):
    if not path.exists():
        return []
    try:
        lines = path.read_text(errors='replace').splitlines()[-limit:]
    except Exception:
        return []
    out = []
    for line in lines:
        try:
            out.append(json.loads(line))
        except Exception:
            pass
    return out

def compact_event(event):
    if not event:
        return None
    e = event.get('event') or {}
    raw = event.get('raw') or {}
    params = raw.get('params') if isinstance(raw, dict) else None
    content = params.get('content') if isinstance(params, dict) else None
    return {
        'type': event.get('type'),
        'at': event.get('at'),
        'sourceUrl': event.get('sourceUrl') or e.get('url') or (f"https://x.com/{content.get('userScreenName')}/status/{content.get('id')}" if isinstance(content, dict) and content.get('userScreenName') and content.get('id') else None),
        'sourceAccount': e.get('account') or e.get('username') or (content.get('userScreenName') if isinstance(content, dict) else None),
        'tweetId': event.get('tweetId') or e.get('tweetId') or (content.get('id') if isinstance(content, dict) else None),
        'replyScore': event.get('replyScore') or e.get('replyScore'),
        'notified': event.get('notified'),
        'copyNotified': event.get('copyNotified'),
    }

launch = run(['launchctl', 'print', f'{DOMAIN}/{LABEL}'])
launch_text = launch.stdout if launch.returncode == 0 else launch.stderr
launch_state = None
launch_pid = None
launch_runs = None
for line in launch_text.splitlines():
    if launch_state is None:
        m = re.search(r'\bstate = (\w+)', line)
        if m:
            launch_state = m.group(1)
    if launch_pid is None:
        m = re.search(r'\bpid = (\d+)', line)
        if m:
            launch_pid = int(m.group(1))
    if launch_runs is None:
        m = re.search(r'\bruns = (\d+)', line)
        if m:
            launch_runs = int(m.group(1))

pg = run(['pgrep', '-af', r'node dist/scripts/opentwitter-hot-reply\.js'])
process_lines = [line for line in pg.stdout.splitlines() if line.strip()]
process_pids = []
for line in process_lines:
    try:
        process_pids.append(int(line.split()[0]))
    except Exception:
        pass
pid_file_value = PID_FILE.read_text().strip() if PID_FILE.exists() else None

events = read_jsonl_tail(EVENT_LOG)
debugs = read_jsonl_tail(DEBUG_LOG)
last_event = events[-1] if events else None
last_event_dt = parse_dt(last_event.get('at') if last_event else None)
last_ws_open = next((e for e in reversed(events) if e.get('type') == 'ws-open'), None)
last_pong = next((e for e in reversed(events) if e.get('type') == 'ws-pong'), None)
last_candidate = next((e for e in reversed(events) if e.get('type') == 'opentwitter-ws' and ((e.get('event') or {}).get('replyScore') or 0) >= 70), None)
last_tg = next((e for e in reversed(events) if e.get('type') == 'reply-candidate-telegram'), None)
last_debug = debugs[-1] if debugs else None
last_debug_compact = None
if last_debug:
    last_debug_compact = {
        'at': last_debug.get('at'),
        'sourceUrl': last_debug.get('sourceUrl'),
        'sourceAccount': last_debug.get('sourceAccount'),
        'tweetId': last_debug.get('tweetId'),
        'replyScore': last_debug.get('replyScore'),
        'fallbackUsed': last_debug.get('fallbackUsed'),
        'humanizerSkill': last_debug.get('humanizerSkill'),
        'finalReply': last_debug.get('finalReply'),
    }

last_event_age = age_seconds(last_event_dt)
status = 'ok'
issues = []
if launch.returncode != 0 or launch_state != 'running':
    status = 'critical'
    issues.append('launchd service is not running')
if len(process_pids) != 1:
    status = 'critical'
    issues.append(f'expected exactly 1 watcher process, found {len(process_pids)}')
if launch_pid and process_pids and launch_pid not in process_pids:
    status = 'critical'
    issues.append('launchd pid does not match watcher process pid')
if pid_file_value and process_pids and str(process_pids[0]) != pid_file_value:
    status = 'warning' if status == 'ok' else status
    issues.append('pid file does not match current watcher process')
if last_event_age is None:
    status = 'warning' if status == 'ok' else status
    issues.append('event log has no parseable events')
elif last_event_age > CRIT_EVENT_AGE_SECONDS:
    status = 'critical'
    issues.append(f'event log stale: {last_event_age}s')
elif last_event_age > WARN_EVENT_AGE_SECONDS and status == 'ok':
    status = 'warning'
    issues.append(f'event log older than warning threshold: {last_event_age}s')

summary = {
    'status': status,
    'issues': issues,
    'launchd': {
        'label': LABEL,
        'domain': DOMAIN,
        'state': launch_state,
        'pid': launch_pid,
        'runs': launch_runs,
    },
    'process': {
        'pids': process_pids,
        'pidFile': str(PID_FILE),
        'pidFileValue': pid_file_value,
    },
    'logs': {
        'eventLog': str(EVENT_LOG),
        'eventLogAgeSeconds': last_event_age,
        'debugLog': str(DEBUG_LOG),
        'runLog': str(RUN_LOG),
    },
    'last': {
        'event': compact_event(last_event),
        'wsOpen': compact_event(last_ws_open),
        'pong': compact_event(last_pong),
        'candidate70Plus': compact_event(last_candidate),
        'telegramNotification': compact_event(last_tg),
        'generationDebug': last_debug_compact,
    },
}

print(json.dumps(summary, ensure_ascii=False, indent=2))
sys.exit(0 if status == 'ok' else (1 if status == 'warning' else 2))
PY
