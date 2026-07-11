#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

python3 - <<'PY'
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path.cwd()
SCHEDULER_PATH = ROOT / os.environ.get('AUTO_PUBLISH_SCHEDULER', 'queues/auto-publish-random-scheduler.json')
STATE_PATH = ROOT / os.environ.get('AUTO_PUBLISH_STATE', 'queues/auto-publish-state.json')
ACCOUNTS_PATH = ROOT / os.environ.get('AUTO_PUBLISH_ACCOUNTS', 'queues/accounts.example.json')
SOURCES_PATH = ROOT / os.environ.get('AUTO_PUBLISH_SOURCES', 'queues/source-users.json')
CRON_JOBS_PATH = Path(os.path.expanduser(os.environ.get('HERMES_CRON_JOBS', '~/.hermes/cron/jobs.json')))
CRON_NAME = os.environ.get('AUTO_PUBLISH_CRON_NAME', 'SocialCrabs X auto-publish random 3-5h')
WARN_LAST_RUN_HOURS = float(os.environ.get('AUTO_PUBLISH_HEALTH_WARN_LAST_RUN_HOURS', '6'))
CRIT_LAST_RUN_HOURS = float(os.environ.get('AUTO_PUBLISH_HEALTH_CRIT_LAST_RUN_HOURS', '12'))
WARN_OVERDUE_MINUTES = float(os.environ.get('AUTO_PUBLISH_HEALTH_WARN_OVERDUE_MINUTES', '45'))
CRIT_OVERDUE_MINUTES = float(os.environ.get('AUTO_PUBLISH_HEALTH_CRIT_OVERDUE_MINUTES', '180'))


def load_json(path):
    try:
        return json.loads(path.read_text())
    except Exception as exc:
        return {'__error__': str(exc)}


def parse_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except Exception:
        return None


def seconds_since(dt):
    if not dt:
        return None
    return int((datetime.now(timezone.utc) - dt.astimezone(timezone.utc)).total_seconds())


def seconds_until(dt):
    if not dt:
        return None
    return int((dt.astimezone(timezone.utc) - datetime.now(timezone.utc)).total_seconds())


def latest_publish(state):
    published = state.get('publishedSourceTweets') if isinstance(state, dict) else None
    if not isinstance(published, dict):
        return None
    latest = None
    for source_id, rec in published.items():
        first = parse_dt(rec.get('firstPostedAt'))
        accounts = rec.get('accounts') if isinstance(rec.get('accounts'), dict) else {}
        for account, acc_rec in accounts.items():
            posted = parse_dt(acc_rec.get('postedAt'))
            candidate = {
                'sourceTweetId': source_id,
                'sourceUser': rec.get('sourceUser'),
                'sourceUrl': rec.get('sourceUrl'),
                'account': account,
                'postedAt': acc_rec.get('postedAt'),
                'postedUrl': acc_rec.get('postedUrl'),
            }
            dt = posted or first
            if dt and (latest is None or dt > latest[0]):
                latest = (dt, candidate)
    return latest[1] if latest else None


def load_auto_publish_cron():
    if not CRON_JOBS_PATH.exists():
        return {'found': False, 'path': str(CRON_JOBS_PATH)}
    data = load_json(CRON_JOBS_PATH)
    if isinstance(data, dict) and '__error__' in data:
        return {'found': False, 'path': str(CRON_JOBS_PATH), 'error': data['__error__']}
    jobs = data.get('jobs') if isinstance(data, dict) else data
    if not isinstance(jobs, list):
        return {'found': False, 'path': str(CRON_JOBS_PATH), 'error': 'unexpected jobs.json shape'}
    for idx, job in enumerate(jobs):
        if not isinstance(job, dict):
            continue
        if job.get('name') == CRON_NAME or job.get('id') == '763704b1bf23' or job.get('job_id') == '763704b1bf23':
            schedule = job.get('schedule')
            return {
                'found': True,
                'path': str(CRON_JOBS_PATH),
                'index': idx,
                'id': job.get('id') or job.get('job_id'),
                'name': job.get('name'),
                'enabled': job.get('enabled'),
                'schedule': schedule.get('display') if isinstance(schedule, dict) else schedule,
                'nextRunAt': job.get('next_run_at'),
                'lastRunAt': job.get('last_run_at'),
                'lastStatus': job.get('last_status'),
                'lastError': job.get('last_error'),
                'workdir': job.get('workdir'),
                'deliver': job.get('deliver'),
            }
    return {'found': False, 'path': str(CRON_JOBS_PATH), 'name': CRON_NAME}


scheduler = load_json(SCHEDULER_PATH)
state = load_json(STATE_PATH)
accounts = load_json(ACCOUNTS_PATH)
sources = load_json(SOURCES_PATH)
cron = load_auto_publish_cron()

issues = []
status = 'ok'

for label, path, obj in [
    ('scheduler', SCHEDULER_PATH, scheduler),
    ('state', STATE_PATH, state),
    ('accounts', ACCOUNTS_PATH, accounts),
    ('sources', SOURCES_PATH, sources),
]:
    if isinstance(obj, dict) and '__error__' in obj:
        status = 'critical'
        issues.append(f'{label} JSON parse failed: {obj["__error__"]}')

now = datetime.now(timezone.utc)
s_next = parse_dt(scheduler.get('nextRunAt')) if isinstance(scheduler, dict) else None
s_last_run = parse_dt(scheduler.get('lastRunAt')) if isinstance(scheduler, dict) else None
s_last_checked = parse_dt(scheduler.get('lastCheckedAt')) if isinstance(scheduler, dict) else None
scheduler_seconds_until = seconds_until(s_next)
scheduler_last_run_age = seconds_since(s_last_run)
scheduler_last_checked_age = seconds_since(s_last_checked)

if isinstance(scheduler, dict) and not scheduler.get('enabled', False):
    status = 'critical'
    issues.append('auto-publish random scheduler is disabled')

if scheduler_seconds_until is not None and scheduler_seconds_until < 0:
    overdue_minutes = abs(scheduler_seconds_until) / 60
    if overdue_minutes > CRIT_OVERDUE_MINUTES:
        status = 'critical'
        issues.append(f'scheduler nextRunAt overdue by {int(overdue_minutes)}m')
    elif overdue_minutes > WARN_OVERDUE_MINUTES and status == 'ok':
        status = 'warning'
        issues.append(f'scheduler nextRunAt overdue by {int(overdue_minutes)}m')

if scheduler_last_run_age is not None:
    last_run_hours = scheduler_last_run_age / 3600
    if last_run_hours > CRIT_LAST_RUN_HOURS:
        status = 'critical'
        issues.append(f'scheduler lastRunAt older than {CRIT_LAST_RUN_HOURS:g}h: {last_run_hours:.1f}h')
    elif last_run_hours > WARN_LAST_RUN_HOURS and status == 'ok':
        status = 'warning'
        issues.append(f'scheduler lastRunAt older than {WARN_LAST_RUN_HOURS:g}h: {last_run_hours:.1f}h')

if cron.get('found'):
    c_next = parse_dt(cron.get('nextRunAt'))
    c_last = parse_dt(cron.get('lastRunAt'))
    cron['nextRunInSeconds'] = seconds_until(c_next)
    cron['lastRunAgeSeconds'] = seconds_since(c_last)
    if cron.get('enabled') is False:
        status = 'critical'
        issues.append('Hermes auto-publish cron job is disabled')
    if cron.get('lastStatus') == 'error':
        status = 'critical'
        err = cron.get('lastError') or 'unknown error'
        issues.append(f'Hermes auto-publish cron last_status=error: {err}')
else:
    if status == 'ok':
        status = 'warning'
    issues.append('Hermes auto-publish cron job not found')

accounts_list = accounts.get('accounts') if isinstance(accounts, dict) else []
enabled_accounts = [a for a in accounts_list if isinstance(a, dict) and a.get('enabled')]
sources_list = sources if isinstance(sources, list) else []
enabled_sources = [s for s in sources_list if isinstance(s, dict) and s.get('enabled')]

published = state.get('publishedSourceTweets') if isinstance(state, dict) else {}
published_count = len(published) if isinstance(published, dict) else None
latest = latest_publish(state if isinstance(state, dict) else {})

last_posted_urls = scheduler.get('lastPostedUrls') if isinstance(scheduler, dict) else []
last_square_links = scheduler.get('lastSquareLinks') if isinstance(scheduler, dict) else []
last_square_statuses = scheduler.get('lastSquareStatuses') if isinstance(scheduler, dict) else []

summary = {
    'status': status,
    'issues': issues,
    'now': now.isoformat(),
    'files': {
        'scheduler': str(SCHEDULER_PATH),
        'state': str(STATE_PATH),
        'accounts': str(ACCOUNTS_PATH),
        'sources': str(SOURCES_PATH),
    },
    'cron': cron,
    'scheduler': {
        'enabled': scheduler.get('enabled') if isinstance(scheduler, dict) else None,
        'mode': scheduler.get('mode') if isinstance(scheduler, dict) else None,
        'checkEveryMinutes': scheduler.get('checkEveryMinutes') if isinstance(scheduler, dict) else None,
        'minHours': scheduler.get('minHours') if isinstance(scheduler, dict) else None,
        'maxHours': scheduler.get('maxHours') if isinstance(scheduler, dict) else None,
        'nextRunAt': scheduler.get('nextRunAt') if isinstance(scheduler, dict) else None,
        'nextRunInSeconds': scheduler_seconds_until,
        'lastRunAt': scheduler.get('lastRunAt') if isinstance(scheduler, dict) else None,
        'lastRunAgeSeconds': scheduler_last_run_age,
        'lastCheckedAt': scheduler.get('lastCheckedAt') if isinstance(scheduler, dict) else None,
        'lastCheckedAgeSeconds': scheduler_last_checked_age,
        'lastAccounts': scheduler.get('lastAccounts') if isinstance(scheduler, dict) else None,
        'lastPostedUrls': last_posted_urls,
        'lastSquareLinks': last_square_links,
        'lastSquareStatuses': last_square_statuses,
        'lastSourceUrls': scheduler.get('lastSourceUrls') if isinstance(scheduler, dict) else None,
    },
    'queues': {
        'enabledAccounts': [a.get('username') for a in enabled_accounts],
        'enabledAccountCount': len(enabled_accounts),
        'enabledSources': [s.get('username') for s in enabled_sources],
        'enabledSourceCount': len(enabled_sources),
    },
    'state': {
        'lastWindowStartAt': state.get('lastWindowStartAt') if isinstance(state, dict) else None,
        'lastWindowEndAt': state.get('lastWindowEndAt') if isinstance(state, dict) else None,
        'targetAccountCursor': state.get('targetAccountCursor') if isinstance(state, dict) else None,
        'publishedSourceTweetCount': published_count,
        'latestPublished': latest,
    },
}

print(json.dumps(summary, ensure_ascii=False, indent=2))
sys.exit(0 if status == 'ok' else (1 if status == 'warning' else 2))
PY
