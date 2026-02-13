# ClawSocial Cron Job Template

**CRITICAL** — Agent MUST generate contextual, dynamic comments. NO hardcoded templates.

---

## 🚀 Autonomous Engagement System

ClawSocial is designed for **fully autonomous social engagement** with minimal human intervention. The system:

1. **Scrapes fresh content** when the pool runs dry (auto-replenish)
2. **Monitors session health** and triggers re-auth when sessions expire
3. **Alerts the user** to approve push notifications (LinkedIn 2FA, etc.)
4. **Resumes automatically** after re-auth confirmation

### Architecture

```
┌─────────────────────────────────────────────────┐
│  Cron Scheduler (OpenClaw / system cron)         │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ X Jobs   │  │ LI Jobs  │  │ IG Jobs      │   │
│  │ (35/day) │  │ (18/day) │  │ (14/day)     │   │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       │              │               │            │
│  ┌────▼──────────────▼───────────────▼────────┐  │
│  │           ClawSocial CLI                    │  │
│  │  node dist/cli.js <platform> <action>       │  │
│  └────────────────────┬───────────────────────┘  │
│                       │                           │
│  ┌────────────────────▼───────────────────────┐  │
│  │  State Files (db/*.json)                    │  │
│  │  - Pool empty? → Auto-scrape new content    │  │
│  │  - Session dead? → Re-auth + alert user     │  │
│  └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Performance Note

**Always use `node dist/cli.js`** instead of `npm run cli --`. The latter uses `tsx` (live TypeScript compilation) which adds ~700ms overhead per invocation and can cause browser launch hangs under load. Build first with `npm run build`, then use the compiled output.

```bash
# ✅ CORRECT — fast, compiled JS
node dist/cli.js x like <url>
node dist/cli.js linkedin search "AI"
node dist/cli.js ig follow <username>

# ❌ WRONG — slow, compiles on every run
npm run cli -- x like <url>
```

---

## Voice & Style Guide

Every engagement job MUST read the user's `VOICE.md` before writing comments.

Create a `VOICE.md` in your workspace with your style rules.

### Key Rules:
- **8th grade reading level** — simple words, short sentences
- **Max 1-2 sentences** — 10-20 words for X/LinkedIn, 5-15 for Instagram
- **Reference something SPECIFIC** about the post/article
- **NO generic phrases:** "This is fire!", "Great insights!", "Love this!", "Amazing content!"
- **Ask questions** when natural — engage, don't lecture
- **Match the language** — English/Portuguese/Spanish as appropriate

### Banned Patterns:
- Em-dashes (—) and en-dashes (–) — ClawSocial sanitizes these at code level
- "Game changer", "hit different", "next level", "pure power"
- "Been [verb]ing" as default opener
- Any corporate buzzwords

### Comment Storage:
Log all comments to avoid repetition:
```
# ~/workspace/x-comments.txt
2026-02-06 15:30 | @username | Your comment text here
```

---

## 🔄 Auto-Replenish System

When the content pool runs dry, engagement jobs should **automatically scrape new content** instead of stopping.

### LinkedIn Auto-Replenish

Add this as STEP 1 in every LinkedIn engagement job:

```
STEP 1: CHECK QUEUE
Read db/linkedin_state.json
Count posts where commented=false.
If ZERO uncommented posts:
  1. Run replenish script (searches multiple queries with human-like pauses)
  2. Wait for completion (~3-5 min)
  3. Re-read linkedin_state.json
  4. If STILL zero → reply HEARTBEAT_OK
```

#### Replenish Script Example

Create a shell script that:
- Searches 4-6 different queries sequentially
- Adds 8-15 second random pauses between each (human-like)
- Collects unique URNs
- Deduplicates against existing state
- Adds new posts to `db/linkedin_state.json`

```bash
#!/bin/bash
# linkedin-replenish.sh
CLAWSOCIAL_DIR="/path/to/clawsocial"
STATE_FILE="$CLAWSOCIAL_DIR/db/linkedin_state.json"
TEMP_FILE="/tmp/linkedin-scraped.json"

QUERIES=(
  "openclaw OR clawdbot OR claude code"
  "AI agent automation"
  "building AI agents 2026"
  "claude code assistant"
  "LLM developer tools"
  "AI startup founder"
)

echo "[]" > "$TEMP_FILE"
for i in "${!QUERIES[@]}"; do
  echo "Query $((i+1))/${#QUERIES[@]}: ${QUERIES[$i]}"
  cd "$CLAWSOCIAL_DIR" && node dist/cli.js linkedin search "${QUERIES[$i]}" 2>&1 | \
    grep "urn:li:" | sed 's/.*\(urn:li:[^ ]*\).*/\1/' >> /tmp/linkedin-urns.txt
  PAUSE=$((RANDOM % 8 + 8))
  echo "  Pause ${PAUSE}s..."
  sleep $PAUSE
done

# Deduplicate and add to state via Python/jq
python3 -c "
import json
urns = set(open('/tmp/linkedin-urns.txt').read().strip().split('\n'))
with open('$STATE_FILE') as f:
    data = json.load(f)
articles = data.get('articles', {})
added = 0
for urn in urns:
    if urn and urn not in articles:
        articles[urn] = {'url': f'https://www.linkedin.com/feed/update/{urn}', 'urn': urn, 'commented': False}
        added += 1
data['articles'] = articles
with open('$STATE_FILE', 'w') as f:
    json.dump(data, f, indent=2)
print(f'Added {added} new articles')
"
rm -f /tmp/linkedin-urns.txt
```

### Instagram Auto-Replenish

When all followers are engaged, scrape new targets from explore/search:

```bash
# Search AI-related terms on Instagram explore
node dist/cli.js ig followers <ai-related-account> -n 20

# Or use explore search queries
# "ai agent", "ai automation", "coding assistant", "ai developer tools"
```

### LinkedIn Connect Auto-Replenish

When all profiles are exhausted, add a STEP 0 to connect jobs:

```
STEP 0: CHECK PROFILE QUEUE
Read db/linkedin_state.json, count profiles where connect_attempted=false.
If ZERO:
  Search "AI startup founder" and "AI agent developer"
  Extract profile URLs from results
  Add to state with connect_attempted=false
```

---

## 🔐 Session Health Check

Sessions expire. When they do, the system should **auto-detect, re-auth, and alert**.

### LinkedIn Auth Check Cron (every 6h)

```
LINKEDIN SESSION HEALTH CHECK

STEP 1: Test session
Run: cd /path/to/clawsocial && timeout 40 node dist/cli.js linkedin search "AI" 2>&1

STEP 2: Check output
- 'Session restored' AND postsFound > 0 → healthy → HEARTBEAT_OK
- 'Session expired' OR 'No session found' OR 0 posts → dead → STEP 3

STEP 3: Trigger re-auth
Run: cd /path/to/clawsocial && timeout 60 node dist/cli.js session login linkedin 2>&1
This sends a push notification to your phone (LinkedIn 2FA).

STEP 4: Alert user
Send notification on ALL channels:
"🔴 LinkedIn session expired. I've sent the login push notification.
Please accept it so I can resume scraping.
Let me know here once confirmed."

Wait for user confirmation before proceeding.
```

### Session Expiry Alert Protocol

When ANY platform session expires:
1. **Immediately trigger re-auth** (sends push notification / enters credentials)
2. **Alert user on all available channels** — say you're waiting for confirmation
3. **Wait for user confirmation** (they accept 2FA, then message back)
4. **Re-scrape and resume** engagement

---

## X ENGAGEMENT (Like + Reply)

```
X ENGAGEMENT — Like + Reply

STEP 0: CONTEXT
Read VOICE.md — follow this style guide strictly.
Read x-engaged.txt for engaged IDs.
Read x-comments.txt for recent comments (avoid repetition).

STEP 1: WARM-UP
cd /path/to/clawsocial && node dist/cli.js x home -n 8
cd /path/to/clawsocial && node dist/cli.js x mentions -n 5

STEP 2: FIND TARGET
cd /path/to/clawsocial && node dist/cli.js x search "your search query" -n 30 --json
Pick ONE post not in engaged list. Note: author, preview (first 80 chars), language.

STEP 3: LIKE (SILENT)
cd /path/to/clawsocial && CLAWSOCIAL_SILENT=1 node dist/cli.js x like <tweet-url>

STEP 4: WRITE REPLY
Follow VOICE.md rules:
- Max 2 sentences, 10-20 words
- Use reaction starters: "That's wild.", "Spot on 💯", "Nice.", "Smart move."
- End with a question when natural
- NO: "Fascinating!", "Excellent analysis!", corporate buzzwords
- Match the language (EN/PT/ES)

STEP 5: SEND REPLY (built-in notifier fires here)
cd /path/to/clawsocial && node dist/cli.js x reply <tweet-url> "your reply" --context='{"author":"<username>","preview":"<first 80 chars>","comment":"<your reply>","behaviors":"Home feed viewed, search performed"}'

STEP 6: LOG COMMENT
Append to x-comments.txt:
$(date +%Y-%m-%d %H:%M) | @<author> | <your reply text>

STEP 7: LOG TWEET ID
Append tweet ID to x-engaged.txt
```

---

## X FOLLOW

```
X FOLLOW

1. Read db/x_state.json
2. Get first account where followed=false. If none: reply HEARTBEAT_OK
3. Count remaining unfollowed accounts for 'queueRemaining'
4. Follow with FULL context (ClawSocial sends notification):
   cd /path/to/clawsocial && node dist/cli.js x follow <username> --context='{"username":"...","profileUrl":"...","followers":1234,"queueRemaining":10}'
5. Update x_state.json: set followed=true for this account

DO NOT send manual notification — ClawSocial handles it via --context.
```

---

## INSTAGRAM ENGAGEMENT (Agent-Driven)

**CRITICAL:** Agent reads post content and generates contextual comment. NO hardcoded templates.

```
INSTAGRAM ENGAGEMENT

STEP 0: CONTEXT
Read VOICE.md — follow this style guide strictly.
Read db/instagram_state.json for follower list.

STEP 1: CHECK QUEUE
Count followers where engaged=false. If ZERO → auto-replenish or HEARTBEAT_OK.

STEP 2: PICK TARGET
From state, find a follower where engaged=false. Get their username.

STEP 3: GET THEIR POSTS
cd /path/to/clawsocial && node dist/cli.js ig posts <username> -n 3
Pick their most recent post. Note the post URL.

STEP 4: LIKE
cd /path/to/clawsocial && CLAWSOCIAL_SILENT=1 node dist/cli.js ig like <post-url>

STEP 5: WRITE COMMENT
Based on what you see in the post, write a SHORT contextual comment.
VOICE.MD rules: Max 1-2 sentences, 5-15 words. Be casual, authentic.
If you can't understand the post content → LIKE ONLY, skip commenting.

STEP 6: COMMENT (built-in notifier fires here)
cd /path/to/clawsocial && node dist/cli.js ig comment <post-url> "<your comment>" --context='{"author":"@<username>","comment":"<your comment>","behaviors":"Profile viewed, post liked"}'

STEP 7: UPDATE STATE
Update instagram_state.json: set engaged=true for this follower.

If no posts found or engagement fails, try next follower.
```

---

## LINKEDIN ENGAGEMENT (Agent-Driven)

**CRITICAL:** Agent reads article content and generates contextual comment. NO hardcoded templates.

```
LINKEDIN ENGAGEMENT

STEP 0: CONTEXT
Read VOICE.md — follow this style guide strictly.

STEP 1: CHECK QUEUE (Auto-Replenish)
Read db/linkedin_state.json
Count posts where commented=false.
If ZERO uncommented posts:
  1. Run replenish script (or search queries manually)
  2. Wait for completion
  3. Re-read linkedin_state.json
  4. If STILL zero → HEARTBEAT_OK

STEP 2: PICK TARGET
From state.articles, find ONE where commented=false. Get the URL.

STEP 3: READ THE POST
Use web_fetch to get the post content. Understand what it's about.
If fetch fails or no useful content → LIKE ONLY, skip commenting.

STEP 4: LIKE
cd /path/to/clawsocial && CLAWSOCIAL_SILENT=1 node dist/cli.js linkedin like <post-url>

STEP 5: WRITE COMMENT
Follow VOICE.md rules:
- Max 1-2 sentences, 10-20 words
- Reference something SPECIFIC from the post
- Professional but casual

STEP 6: COMMENT (built-in notifier fires here)
cd /path/to/clawsocial && node dist/cli.js linkedin comment <post-url> "<your comment>" --context='{"author":"<author>","title":"<post title>","comment":"<your comment>","behaviors":"Post read, liked"}'

STEP 7: UPDATE STATE
Update linkedin_state.json: set commented=true, comment_text="<your comment>"
```

---

## LINKEDIN CONNECTION

```
LINKEDIN CONNECTION

STEP 0: CHECK PROFILE QUEUE (Auto-Replenish)
Read db/linkedin_state.json, count profiles where connect_attempted=false.
If ZERO:
  Search "AI startup founder" and "AI agent developer" via:
  cd /path/to/clawsocial && node dist/cli.js linkedin search "<query>"
  Extract profile URLs, add to state.

STEP 1: PICK TARGET
First profile where connect_attempted=false. If none: HEARTBEAT_OK

STEP 2: CONNECT (built-in notifier fires here)
cd /path/to/clawsocial && node dist/cli.js linkedin connect <url> --context='{"username":"<name>","profileUrl":"<url>","degree":"<2nd/3rd>","method":"Direct","behaviors":"Profile viewed"}'

STEP 3: UPDATE STATE
Set connect_attempted=true for this profile.
```

---

## 📅 Recommended Cron Schedule

Spread jobs across the day with odd minutes to look human:

| Time Slot | Platform | Jobs | Schedule |
|-----------|----------|------|----------|
| 08:15-08:51 | Instagram | 3 | Morning engagement |
| 10:23-11:19 | X | 7 | AM like+reply |
| 12:07-12:38 | LinkedIn | 3 | Connect |
| 13:17-14:03 | LinkedIn | 2 | Comment |
| 13:22-13:44 | Instagram | 2 | Afternoon engagement |
| 15:07-16:09 | X | 7 | PM like+reply |
| 18:17-18:38 | Instagram | 2 | Evening engagement |
| 19:23-20:11 | LinkedIn | 2 | Comment |
| 21:07-22:09 | X | 7 | Evening like+reply |
| 23:11-02:33 | X | 7 | Late night like+reply |
| 00:33-02:23 | LinkedIn | 7 | Night like+comment+connect |
| 02:41-04:07 | Instagram | 7 | Night engagement |
| 04:23-06:03 | X | 7 | Night like+reply |

**Rules:**
- Min 10 min between comments on same platform
- Min 15 min between connect requests
- Min 5 min between likes
- Use odd minutes (:03, :17, :33, :51) not rounded (:00, :15, :30)
- Night jobs use `CLAWSOCIAL_SILENT=1` + one consolidated notification

---

## Night Job Pattern

Night engagement combines like → comment → follow/connect in a single session:

```
NIGHT ENGAGEMENT

STEP 0: Read VOICE.md
STEP 1: Pick target from state (uncommented/unengaged)
STEP 2: LIKE (CLAWSOCIAL_SILENT=1)
STEP 3: Wait 5 seconds
STEP 4: COMMENT (CLAWSOCIAL_SILENT=1)
STEP 5: Wait 12 seconds
STEP 6: FOLLOW/CONNECT (built-in notifier fires here with --context)
STEP 7: Update state
STEP 8: Send ONE consolidated Telegram notification with all actions
```

---

## ❌ Anti-Patterns (DO NOT USE)

### Hardcoded Comment Templates
```javascript
// ❌ WRONG - Never do this
const COMMENT_TEMPLATES = ["Great shot! 📸", "Love this! 🔥"];
comment = COMMENT_TEMPLATES[random];

// ✅ CORRECT - Agent generates based on content
// 1. Read the post/article
// 2. Read VOICE.md for style
// 3. Write unique, contextual comment
```

### Generic AI Phrases
```
❌ "Fascinating approach!"
❌ "Excellent analysis!"
❌ "The intersection of X and Y is where things get really interesting"
❌ "This is a game-changer"

✅ "That's wild. What stack are you running?"
✅ "Spot on 💯"
✅ "Smart move. How long did that take?"
✅ "Nice setup bro. Did it work first try?"
```

### Using npm run cli
```bash
# ❌ WRONG — slow tsx compilation, causes browser hangs
npm run cli -- x like <url>

# ✅ CORRECT — compiled JS, fast startup
node dist/cli.js x like <url>
```

---

## Command Reference

### Actions (auto-notify via --context)
```bash
# X
node dist/cli.js x like <url> --context='{"author":"user","preview":"...","behaviors":"..."}'
node dist/cli.js x reply <url> "text" --context='{"author":"...","preview":"...","comment":"...","behaviors":"..."}'
node dist/cli.js x follow <username> --context='{"username":"...","profileUrl":"...","followers":1234,"queueRemaining":10}'

# LinkedIn
node dist/cli.js linkedin like <url>
node dist/cli.js linkedin comment <url> "text" --context='{"author":"...","title":"...","comment":"...","behaviors":"..."}'
node dist/cli.js linkedin connect <url> --context='{"username":"...","profileUrl":"...","degree":"2nd","method":"Direct"}'
node dist/cli.js linkedin search "<query>"

# Instagram
node dist/cli.js ig like <url>
node dist/cli.js ig comment <url> "text" --context='{"author":"...","comment":"...","behaviors":"..."}'
node dist/cli.js ig follow <username> --context='{"username":"...","profileUrl":"...","behaviors":"..."}'

# Session management
node dist/cli.js session login <platform>
node dist/cli.js session status
```

### Suppress Auto-Notify
```bash
CLAWSOCIAL_SILENT=1 node dist/cli.js x like <url>
```

---

## Important Rules

1. **ALWAYS use `node dist/cli.js`** — never `npm run cli --`
2. **ALWAYS read VOICE.md first** — style guide is mandatory
3. **NEVER use hardcoded comment templates** — generate dynamically
4. **Reference something SPECIFIC** about the content
5. **Log comments** to avoid repetition
6. **Auto-replenish** when content pool is empty — don't stop
7. **Monitor sessions** — alert user immediately when auth expires
8. **Match the language** of the original content
9. **NO manual Telegram notifications** — ClawSocial handles formatting via --context
