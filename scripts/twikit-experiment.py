#!/usr/bin/env python3
"""Standalone Twikit experiment runner for SocialCrabs.

This script is intentionally separate from the production SocialCrabs
opentwitter/xurl flow. It uses Twikit only when invoked manually.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

from twikit import Client

ROOT = Path(__file__).resolve().parents[1]
RATE_LIMITS_PATH = ROOT / 'scripts' / 'twikit-ratelimits.json'
DEFAULT_ENV_FILE = Path(os.environ.get('TWIKIT_ENV_FILE', '~/.hermes/private/twikit/.env')).expanduser()


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        value = os.path.expandvars(value.strip().strip('"').strip("'"))
        if key and key not in os.environ:
            os.environ[key] = value


load_env_file(DEFAULT_ENV_FILE)

DEFAULT_COOKIES = Path(os.environ.get('TWIKIT_COOKIES', '~/.hermes/private/twikit/default/cookies.json')).expanduser()
DEFAULT_STATE = Path(os.environ.get('TWIKIT_RATE_STATE', '~/.hermes/private/twikit/ratelimit-state.json')).expanduser()
WINDOW_SECONDS = 15 * 60

FUNCTION_ALIASES = {
    'login': 'login',
    'search': 'search_tweet',
    'user': 'get_user_by_screen_name',
    'user-tweets:Tweets': 'get_user_tweets[tweet_type="Tweets"]',
    'user-tweets:Replies': 'get_user_tweets[tweet_type="Replies"]',
    'user-tweets:Media': 'get_user_tweets[tweet_type="Media"]',
    'user-tweets:Likes': 'get_user_tweets[tweet_type="Likes"]',
    'tweet': 'get_tweet_by_id',
    'trends': 'get_trends',
}


def load_rate_limits() -> dict[str, dict[str, Any]]:
    payload = json.loads(RATE_LIMITS_PATH.read_text())
    rows = payload['rows']
    mapping: dict[str, dict[str, Any]] = {}
    for row in rows:
        for name in [part.strip() for part in row['functions'].split(',')]:
            if not name or name == '-':
                continue
            mapping[name] = row
    return mapping


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text())


def save_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def check_and_record(function_name: str, *, dry_run: bool = False) -> dict[str, Any]:
    limits = load_rate_limits()
    if function_name not in limits:
        raise SystemExit(f'No Twikit rate-limit entry for {function_name!r}; refusing to call it.')
    row = limits[function_name]
    limit = row['limit']
    if limit is None:
        raise SystemExit(f'Twikit rate-limit for {function_name!r} is "-" in ratelimits.md; this experiment script refuses unbounded/unknown calls.')

    state = load_json(DEFAULT_STATE, {})
    now = time.time()
    bucket = state.get(function_name, [])
    bucket = [ts for ts in bucket if now - float(ts) < WINDOW_SECONDS]
    remaining = int(limit) - len(bucket)
    if remaining <= 0:
        oldest = min(bucket) if bucket else now
        reset_in = max(0, int(WINDOW_SECONDS - (now - oldest)))
        raise SystemExit(json.dumps({
            'ok': False,
            'function': function_name,
            'limit': limit,
            'window_seconds': WINDOW_SECONDS,
            'remaining': 0,
            'reset_in_seconds': reset_in,
        }, ensure_ascii=False, indent=2))

    if not dry_run:
        bucket.append(now)
        state[function_name] = bucket
        save_json(DEFAULT_STATE, state)
    return {
        'function': function_name,
        'endpoint': row['endpoint'],
        'limit': limit,
        'window_minutes': row['window_minutes'],
        'remaining_before_call': remaining,
        'remaining_after_call': remaining - (0 if dry_run else 1),
        'state_file': str(DEFAULT_STATE),
    }


def client_from_cookies(cookies: Path) -> Client:
    if not cookies.exists():
        raise SystemExit(f'Cookie file not found: {cookies}. Run login first or set TWIKIT_COOKIES.')
    client = Client('en-US')
    client.load_cookies(str(cookies))
    return client


def tweet_to_dict(tweet: Any) -> dict[str, Any]:
    user = getattr(tweet, 'user', None)
    return {
        'id': getattr(tweet, 'id', None),
        'text': getattr(tweet, 'text', None),
        'created_at': getattr(tweet, 'created_at', None),
        'favorite_count': getattr(tweet, 'favorite_count', None),
        'retweet_count': getattr(tweet, 'retweet_count', None),
        'reply_count': getattr(tweet, 'reply_count', None),
        'user': {
            'id': getattr(user, 'id', None),
            'screen_name': getattr(user, 'screen_name', None),
            'name': getattr(user, 'name', None),
        } if user else None,
    }


def user_to_dict(user: Any) -> dict[str, Any]:
    return {
        'id': getattr(user, 'id', None),
        'screen_name': getattr(user, 'screen_name', None),
        'name': getattr(user, 'name', None),
        'followers_count': getattr(user, 'followers_count', None),
        'following_count': getattr(user, 'following_count', None),
        'statuses_count': getattr(user, 'statuses_count', None),
    }


async def cmd_login(args: argparse.Namespace) -> None:
    meta = check_and_record('login', dry_run=args.dry_run)
    if args.dry_run:
        print(json.dumps({'ok': True, 'dry_run': True, 'rate_limit': meta}, ensure_ascii=False, indent=2))
        return
    username = os.environ.get('TWIKIT_USERNAME')
    password = os.environ.get('TWIKIT_PASSWORD')
    email = os.environ.get('TWIKIT_EMAIL')
    totp = os.environ.get('TWIKIT_TOTP_SECRET')
    if not username or not password:
        raise SystemExit('Set TWIKIT_USERNAME and TWIKIT_PASSWORD in the local shell; do not paste secrets into chat.')
    args.cookies.parent.mkdir(parents=True, exist_ok=True)
    client = Client('en-US')
    await client.login(auth_info_1=username, auth_info_2=email, password=password, totp_secret=totp, cookies_file=str(args.cookies))
    print(json.dumps({'ok': True, 'saved_cookies': str(args.cookies), 'rate_limit': meta}, ensure_ascii=False, indent=2))


async def cmd_search(args: argparse.Namespace) -> None:
    meta = check_and_record('search_tweet', dry_run=args.dry_run)
    if args.dry_run:
        print(json.dumps({'ok': True, 'dry_run': True, 'query': args.query, 'rate_limit': meta}, ensure_ascii=False, indent=2))
        return
    client = client_from_cookies(args.cookies)
    tweets = await client.search_tweet(args.query, args.product, count=args.count)
    print(json.dumps({'ok': True, 'rate_limit': meta, 'tweets': [tweet_to_dict(t) for t in tweets]}, ensure_ascii=False, indent=2))


async def cmd_user(args: argparse.Namespace) -> None:
    meta = check_and_record('get_user_by_screen_name', dry_run=args.dry_run)
    if args.dry_run:
        print(json.dumps({'ok': True, 'dry_run': True, 'screen_name': args.screen_name, 'rate_limit': meta}, ensure_ascii=False, indent=2))
        return
    client = client_from_cookies(args.cookies)
    user = await client.get_user_by_screen_name(args.screen_name.lstrip('@'))
    print(json.dumps({'ok': True, 'rate_limit': meta, 'user': user_to_dict(user)}, ensure_ascii=False, indent=2))


async def cmd_user_tweets(args: argparse.Namespace) -> None:
    key = f'get_user_tweets[tweet_type="{args.tweet_type}"]'
    meta = check_and_record(key, dry_run=args.dry_run)
    if args.dry_run:
        print(json.dumps({'ok': True, 'dry_run': True, 'user_id': args.user_id, 'tweet_type': args.tweet_type, 'rate_limit': meta}, ensure_ascii=False, indent=2))
        return
    client = client_from_cookies(args.cookies)
    tweets = await client.get_user_tweets(args.user_id, args.tweet_type, count=args.count)
    print(json.dumps({'ok': True, 'rate_limit': meta, 'tweets': [tweet_to_dict(t) for t in tweets]}, ensure_ascii=False, indent=2))


async def cmd_tweet(args: argparse.Namespace) -> None:
    meta = check_and_record('get_tweet_by_id', dry_run=args.dry_run)
    if args.dry_run:
        print(json.dumps({'ok': True, 'dry_run': True, 'tweet_id': args.tweet_id, 'rate_limit': meta}, ensure_ascii=False, indent=2))
        return
    client = client_from_cookies(args.cookies)
    tweet = await client.get_tweet_by_id(args.tweet_id)
    print(json.dumps({'ok': True, 'rate_limit': meta, 'tweet': tweet_to_dict(tweet)}, ensure_ascii=False, indent=2))


async def cmd_trends(args: argparse.Namespace) -> None:
    meta = check_and_record('get_trends', dry_run=args.dry_run)
    if args.dry_run:
        print(json.dumps({'ok': True, 'dry_run': True, 'category': args.category, 'rate_limit': meta}, ensure_ascii=False, indent=2))
        return
    client = client_from_cookies(args.cookies)
    trends = await client.get_trends(args.category, count=args.count)
    print(json.dumps({'ok': True, 'rate_limit': meta, 'trends': [getattr(t, '__dict__', str(t)) for t in trends]}, ensure_ascii=False, indent=2, default=str))


def cmd_limits(args: argparse.Namespace) -> None:
    payload = json.loads(RATE_LIMITS_PATH.read_text())
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description='Standalone Twikit experiment runner. Loads ~/.hermes/private/twikit/.env by default and does not affect SocialCrabs production opentwitter/xurl flows.')
    p.add_argument('--cookies', type=Path, default=DEFAULT_COOKIES, help='Twikit cookies path (default: TWIKIT_COOKIES from env file/shell, or ~/.hermes/private/twikit/default/cookies.json)')
    p.add_argument('--dry-run', action='store_true', help='Only check rate-limit budget; do not call Twikit/X')
    sub = p.add_subparsers(dest='command', required=True)

    sub.add_parser('limits', help='Print exact ratelimits.md-derived configuration')

    sub.add_parser('login', help='Login using TWIKIT_USERNAME/TWIKIT_PASSWORD env and save cookies')

    s = sub.add_parser('search', help='Search tweets')
    s.add_argument('query')
    s.add_argument('--product', choices=['Top', 'Latest', 'Media'], default='Latest')
    s.add_argument('--count', type=int, default=20)

    u = sub.add_parser('user', help='Get user by screen name')
    u.add_argument('screen_name')

    ut = sub.add_parser('user-tweets', help='Get user tweets by user id')
    ut.add_argument('user_id')
    ut.add_argument('--tweet-type', choices=['Tweets', 'Replies', 'Media', 'Likes'], default='Tweets')
    ut.add_argument('--count', type=int, default=20)

    t = sub.add_parser('tweet', help='Get tweet by id')
    t.add_argument('tweet_id')

    tr = sub.add_parser('trends', help='Get trends')
    tr.add_argument('--category', choices=['trending', 'for-you', 'news', 'sports', 'entertainment'], default='trending')
    tr.add_argument('--count', type=int, default=20)
    return p


async def main() -> None:
    args = parser().parse_args()
    try:
        if args.command == 'limits':
            cmd_limits(args)
        elif args.command == 'login':
            await cmd_login(args)
        elif args.command == 'search':
            await cmd_search(args)
        elif args.command == 'user':
            await cmd_user(args)
        elif args.command == 'user-tweets':
            await cmd_user_tweets(args)
        elif args.command == 'tweet':
            await cmd_tweet(args)
        elif args.command == 'trends':
            await cmd_trends(args)
    except Exception as exc:
        message = str(exc)
        hint = None
        if "Couldn't get KEY_BYTE indices" in message:
            hint = 'Twikit upstream currently cannot parse X client transaction indices. Credentials/env are not the cause; wait for d60/twikit update or patch x_client_transaction.'
        elif 'Cloudflare' in message or 'Attention Required' in message or 'Sorry, you have been blocked' in message:
            hint = 'Twikit transaction patch is working, but X/Cloudflare blocked this environment during login. Try from your own Terminal/IP later, use existing cookies if available, or keep SocialCrabs production on opentwitter/xurl.'
        print(json.dumps({'ok': False, 'error': message, 'hint': hint}, ensure_ascii=False, indent=2), file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == '__main__':
    asyncio.run(main())
