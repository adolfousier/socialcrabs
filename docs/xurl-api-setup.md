# X API / xurl setup for SocialCrabs tweet-queue

This project can keep the existing pipeline:

1. `source-scan` reads source accounts.
2. `draft-tweets` creates Chinese drafts.
3. GPT image 2 generates images and writes `imagePath`.
4. `tweet-queue` publishes via official X API using `xurl`.

Browser-based tweet publishing is intentionally disabled in this fork. The
Playwright Twitter handler will refuse `post` actions, and CLI/server tweet
entrypoints route through `xurl` instead.

## Installed xurl binary

`xurl` is installed locally at:

```bash
/Users/openai/.local/bin/xurl
```

SocialCrabs resolves this path automatically if global `xurl` is unavailable.

## User-only setup steps

Do these yourself because they involve API credentials. Do not paste secrets into chat.

1. Open X Developer Portal:

```text
https://developer.x.com/en/portal/dashboard
```

2. Create or open an app.

3. Enable User Authentication Settings.

Recommended app type:

```text
Web App, Automated App or Bot
```

4. Set callback / redirect URI:

```text
http://localhost:8080/callback
```

5. Make sure the app has write permissions/scopes for posting and media.

6. Register the app locally:

```bash
/Users/openai/.local/bin/xurl auth apps add socialcrabs --client-id YOUR_CLIENT_ID --client-secret YOUR_CLIENT_SECRET
```

7. Authenticate your X account:

```bash
/Users/openai/.local/bin/xurl auth oauth2 --app socialcrabs yoyo_aigo
```

If that fails without the username, try:

```bash
/Users/openai/.local/bin/xurl auth oauth2 --app socialcrabs
```

8. Set it as default:

```bash
/Users/openai/.local/bin/xurl auth default socialcrabs yoyo_aigo
```

9. Verify:

```bash
/Users/openai/.local/bin/xurl auth status
/Users/openai/.local/bin/xurl whoami
```

## Publishing via API

Dry-run:

```bash
cd /Users/openai/socialcrabs
node dist/cli.js x tweet-queue queues/tweets.json --limit 1 --dry-run
```

Real publish with confirmation:

```bash
node dist/cli.js x tweet-queue queues/tweets.json --limit 1 --confirm
```

If the draft has `imagePath`, `tweet-queue` will:

1. Upload image with `xurl media upload <imagePath>`.
2. Parse returned media id.
3. Post with `xurl post <text> --media-id <id>`.
4. Save `postedUrl` to `queues/tweets.json`.

## End-to-end content pipeline

The one-shot pipeline command is:

```bash
cd /Users/openai/socialcrabs
node dist/cli.js x pipeline queues/source-users.json --limit-per-user 10 --count 3 --dry-run
```

Behavior:

1. Reads up to 10 enabled source accounts from `queues/source-users.json`.
2. Scans each account's recent tweets.
3. Ranks high-performing usable tweets by engagement.
4. Rewrites the top items into original Chinese drafts.
5. Writes pending tweet queue items to `queues/tweets.json`.
6. Writes pending image generation jobs to `queues/image-jobs.json`.
7. Marks source tweets as used so the same source post is not drafted twice.
8. Does **not** post anything. Publishing still happens only through
   `tweet-scheduler` / `tweet-queue`, which use X API/xurl.

Real run:

```bash
node dist/cli.js x pipeline queues/source-users.json --limit-per-user 10 --count 3
```

Source user format:

```json
[
  { "username": "account1", "weight": 1, "enabled": true },
  { "url": "https://x.com/account2", "weight": 2, "enabled": true }
]
```

Image jobs are deliberately separated from posting. Generate/review images,
write each output path back as `imagePath`, then let `tweet-scheduler` post
the queued tweet through the API.

## Random 6–8 hour scheduler

The scheduler tick command is:

```bash
cd /Users/openai/socialcrabs
node dist/cli.js x tweet-scheduler --min-hours 6 --max-hours 8
```

Behavior:

1. It checks `state/tweet-scheduler.json`.
2. If not due, it exits without doing anything.
3. If due, it posts one pending tweet via `tweet-queue` API logic.
4. It then schedules the next run randomly between 6 and 8 hours later.

A launchd template has been written to:

```text
docs/launchd-tweet-scheduler.plist
```

After xurl API auth is verified, enable it with:

```bash
mkdir -p ~/Library/LaunchAgents
cp /Users/openai/socialcrabs/docs/launchd-tweet-scheduler.plist ~/Library/LaunchAgents/com.socialcrabs.tweet-scheduler.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.socialcrabs.tweet-scheduler.plist
launchctl enable gui/$(id -u)/com.socialcrabs.tweet-scheduler
```

Check logs:

```bash
tail -f /Users/openai/socialcrabs/logs/tweet-scheduler.out.log
tail -f /Users/openai/socialcrabs/logs/tweet-scheduler.err.log
```

Disable:

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.socialcrabs.tweet-scheduler.plist
```

## Security notes

- Never paste Client ID/Secret or tokens into chat.
- Never run `xurl --verbose` in agent sessions.
- Do not commit `~/.xurl` or API credentials.
