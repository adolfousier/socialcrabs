# ClawSocial Cron Job Template

**CRITICAL** — Agent MUST generate contextual, dynamic comments. NO hardcoded templates.

---

## Voice & Style Guide

Every engagement job MUST read the user's `VOICE.md` before writing comments.

**Example VOICE.md location:** `/home/sonofanton/clawd/VOICE.md`

### Key Rules:
- **8th grade reading level** — simple words, short sentences
- **Max 1-2 sentences** — 10-25 words for X/LinkedIn, 5-15 for Instagram
- **Reference something SPECIFIC** about the post/article
- **NO generic phrases:** "This is fire!", "Great insights!", "Love this!", "Amazing content!"
- **Ask questions** when natural — engage, don't lecture
- **Match the language** — English/Portuguese/Spanish as appropriate

### Comment Storage:
Log all comments to avoid repetition:
```
# ~/clawd/x-comments.txt
2026-02-06 15:30 | @username | Your comment text here
```

---

## X ENGAGEMENT (Like + Reply)

```
X ENGAGEMENT — Like + Reply

STEP 0: CONTEXT
Read /home/sonofanton/clawd/VOICE.md — follow this style guide strictly.
Read /home/sonofanton/clawd/x-engaged.txt for engaged IDs.
Read /home/sonofanton/clawd/x-comments.txt for recent comments (avoid repetition).

STEP 1: WARM-UP
bird home -n 8 && bird mentions -n 5

STEP 2: FIND TARGET
bird search "clawdbot OR moltbot OR openclaw" -n 30 --json
Pick ONE post not in engaged list. Note: author, preview (first 80 chars), language.

STEP 3: LIKE (SILENT)
cd /home/sonofanton/projects/clawsocial && npx tsx src/scripts/sync-bird-cookies.ts --env-file ~/.clawdbot/.env && CLAWSOCIAL_SILENT=1 npm run cli -- x like <tweet-url>

STEP 4: WRITE REPLY
Follow VOICE.md rules:
- Max 2 sentences, 10-25 words
- Use reaction starters: "That's wild.", "Spot on 💯", "Nice.", "Smart move."
- End with a question when natural
- NO: "Fascinating!", "Excellent analysis!", corporate buzzwords
- Match the language (EN/PT/ES)

STEP 5: SEND REPLY
bird reply <tweet-url> "your reply"

STEP 6: LOG COMMENT
Append to /home/sonofanton/clawd/x-comments.txt:
$(date +%Y-%m-%d %H:%M) | @<author> | <your reply text>

STEP 7: COMBINED NOTIFICATION
cd /home/sonofanton/projects/clawsocial && npm run cli -- notify report twitter engagement <tweet-url> --context='{"author":"<username>","preview":"<first 80 chars>","reply":"<your reply text>","language":"<en/es/pt>","behaviors":"Home feed viewed, search performed"}'

STEP 8: LOG TWEET ID
Append tweet ID to /home/sonofanton/clawd/x-engaged.txt
```

---

## X FOLLOW

```
X FOLLOW

1. Read /home/sonofanton/projects/clawsocial/db/x_state.json
2. Get first account where followed=false. If none: reply HEARTBEAT_OK
3. Count remaining unfollowed accounts for 'queueRemaining'
4. Sync cookies:
   cd /home/sonofanton/projects/clawsocial && npx tsx src/scripts/sync-bird-cookies.ts --env-file ~/.clawdbot/.env
5. Follow with FULL context (ClawSocial sends notification):
   cd /home/sonofanton/projects/clawsocial && npm run cli -- x follow [username] --context='{"username":"[username]","profileUrl":"https://x.com/[username]","followers":[count],"queueRemaining":[remaining],"behaviors":"Direct follow"}'
6. Update x_state.json: set followed=true for this account

DO NOT send manual notification — ClawSocial handles it via --context.
```

---

## INSTAGRAM ENGAGEMENT (Agent-Driven)

**CRITICAL:** Agent reads post content and generates contextual comment. NO hardcoded templates.

```
INSTAGRAM ENGAGEMENT

STEP 0: CONTEXT
Read /home/sonofanton/clawd/VOICE.md — follow this style guide strictly.
Read /home/sonofanton/projects/clawsocial/db/instagram_state.json for follower list.

STEP 1: PICK TARGET
From state, find a follower where engaged=false. Get their username.

STEP 2: GET THEIR POSTS
cd /home/sonofanton/projects/clawsocial && npm run cli -- ig posts <username> -n 3
Pick their most recent post. Note the post URL and what it's about (image/video description, caption if visible).

STEP 3: LIKE
cd /home/sonofanton/projects/clawsocial && CLAWSOCIAL_SILENT=1 npm run cli -- ig like <post-url>

STEP 4: WRITE COMMENT
Based on what you see in the post, write a SHORT contextual comment.
Follow VOICE.md rules:
- Max 1-2 sentences, 5-15 words
- Reference something SPECIFIC about the post
- NO generic: "This is fire!", "Love this!", "Amazing!"
- Be casual, authentic

STEP 5: COMMENT
cd /home/sonofanton/projects/clawsocial && npm run cli -- ig comment <post-url> "<your contextual comment>"

STEP 6: UPDATE STATE
Update instagram_state.json: set engaged=true for this follower.

STEP 7: NOTIFICATION
cd /home/sonofanton/projects/clawsocial && npm run cli -- notify report instagram comment <post-url> --context='{"author":"@<username>","comment":"<your comment>","behaviors":"Profile viewed, post liked"}'

If no posts found or engagement fails, try next follower. If all engaged, reply HEARTBEAT_OK.
```

---

## LINKEDIN ENGAGEMENT (Agent-Driven)

**CRITICAL:** Agent reads article content and generates contextual comment. NO hardcoded templates.

```
LINKEDIN ENGAGEMENT

STEP 0: CONTEXT
Read /home/sonofanton/clawd/VOICE.md — follow this style guide strictly.
Read /home/sonofanton/projects/clawsocial/db/linkedin_state.json for pending articles.

STEP 1: PICK TARGET
From state.articles, find ONE where commented=false. Get the URL and title.
If none available, reply HEARTBEAT_OK.

STEP 2: READ THE ARTICLE
Use web_fetch to get the article content. Understand what it's about.

STEP 3: LIKE
cd /home/sonofanton/projects/clawsocial && CLAWSOCIAL_SILENT=1 npm run cli -- linkedin like <article-url>

STEP 4: WRITE COMMENT
Based on the article content, write a SHORT contextual comment.
Follow VOICE.md rules:
- Max 1-2 sentences, 10-20 words
- Reference something SPECIFIC from the article
- NO generic: "Great insights!", "Thanks for sharing!", "Interesting perspective!"
- Be direct, ask a follow-up question if natural
- Professional but casual

STEP 5: COMMENT
cd /home/sonofanton/projects/clawsocial && npm run cli -- linkedin comment <article-url> "<your contextual comment>"

STEP 6: UPDATE STATE
Update linkedin_state.json: set commented=true, comment_text="<your comment>" for this article.

STEP 7: NOTIFICATION
cd /home/sonofanton/projects/clawsocial && npm run cli -- notify report linkedin comment <article-url> --context='{"author":"<author if known>","title":"<article title>","comment":"<your comment>","behaviors":"Article read, liked"}'

Repeat for up to 3 articles total, with 2-3 min pause between each.
```

---

## LINKEDIN CONNECTION

```
LINKEDIN CONNECTION

1. Read /home/sonofanton/projects/clawsocial/db/linkedin_state.json
2. Pick first profile where connected=false. If none: reply HEARTBEAT_OK
3. Get degree (2nd/3rd) from the state
4. Connect with FULL context (ClawSocial sends notification):
   cd /home/sonofanton/projects/clawsocial && npm run cli -- linkedin connect [url] --context='{"username":"[name]","profileUrl":"[url]","degree":"[2nd/3rd]","method":"Direct","behaviors":"Profile viewed"}'
5. Update linkedin_state.json: set connected=true for this profile

DO NOT send manual notification — ClawSocial handles it via --context.
```

---

## ❌ Anti-Patterns (DO NOT USE)

### Hardcoded Comment Templates
```javascript
// ❌ WRONG - Never do this
const COMMENT_TEMPLATES = [
  "Great shot! 📸",
  "Love this! 🔥",
  "This is fire! 🔥",
  "Amazing content! 🙌",
];
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
❌ "Love this systematic approach!"
❌ "The intersection of X and Y is where things get really interesting"
❌ "This is a game-changer"

✅ "That's wild. What stack are you running?"
✅ "Spot on 💯"
✅ "Smart move. How long did that take?"
✅ "Nice setup. Did it work first try?"
```

---

## Command Reference

### Actions (auto-notify via --context)
```bash
# X
npm run cli -- x like <url> --context='{"author":"user","preview":"...","language":"EN","behaviors":"..."}'
npm run cli -- x follow <username> --context='{"username":"...","profileUrl":"...","followers":1234,"queueRemaining":10}'

# LinkedIn
npm run cli -- linkedin connect <url> --context='{"username":"...","profileUrl":"...","degree":"2nd","method":"Direct"}'
npm run cli -- linkedin comment <url> "<text>" --context='{"author":"...","title":"...","comment":"...","behaviors":"..."}'

# Instagram
npm run cli -- ig comment <url> "<text>" --context='{"author":"...","comment":"...","behaviors":"..."}'
```

### Suppress Auto-Notify
Use when you want to send a combined report later:
```bash
CLAWSOCIAL_SILENT=1 npm run cli -- x like <url>
# Then later...
npm run cli -- notify report twitter engagement <url> --context='...'
```

---

## Important Rules

1. **ALWAYS read VOICE.md first** — style guide is mandatory
2. **NEVER use hardcoded comment templates** — generate dynamically
3. **Reference something SPECIFIC** about the content
4. **Log comments** to avoid repetition
5. **NO manual Telegram notifications** — ClawSocial handles formatting
6. **Match the language** of the original content
