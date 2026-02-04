# ClawSocial Warm-Up Guide

**Account safety through gradual rate limit scaling**

> ⚠️ **Status**: This guide is based on our real-world testing (currently in week 2). We've had minimal issues — most problems were selector bugs, not platform rate limiting. This suggests the approach is working.

---

## Why Warm-Up?

New accounts or accounts that suddenly spike activity get flagged. Social platforms detect:
- Sudden volume increases
- Non-human patterns
- Automated behavior signatures

The solution: **gradual warm-up** over 5 weeks to establish "normal" activity patterns.

---

## Warm-Up Schedule

### Week 1: Authentication & Light Activity

| Day | Likes | Comments | Follows/Connects | DMs |
|-----|-------|----------|------------------|-----|
| 1 | 0-2 | 0 | 0 | 0 |
| 2 | 2-4 | 0-1 | 0 | 0 |
| 3 | 4-6 | 1-2 | 0-1 | 0 |
| 4 | 6-8 | 2-3 | 1-2 | 0-1 |
| 5 | 8-12 | 3-5 | 2-3 | 1-2 |
| 6 | 12-16 | 5-8 | 3-5 | 2-4 |
| 7 | 16-20 | 8-14 | 5-10 | 4-10 |

**Week 1 Maximums:**
- 20 likes/day
- 14 comments/day
- 10 follows or connection requests/day
- 10 DMs/day

**Tips for Week 1:**
- Focus on manual browsing too (scroll feed, view profiles)
- Mix automated actions with manual ones
- Use longer delays between actions (15-30 min)
- Avoid back-to-back similar actions

---

### Week 2: +25% Increase

If week 1 completed without issues:

| Action | Limit |
|--------|-------|
| Likes | 25/day |
| Comments | 18/day |
| Follows/Connects | 13/day |
| DMs | 13/day |

**Environment:**
```bash
RATE_LIMIT_INSTAGRAM_LIKE=25
RATE_LIMIT_INSTAGRAM_COMMENT=18
RATE_LIMIT_INSTAGRAM_FOLLOW=13
RATE_LIMIT_INSTAGRAM_DM=13

RATE_LIMIT_LINKEDIN_LIKE=25
RATE_LIMIT_LINKEDIN_COMMENT=18
RATE_LIMIT_LINKEDIN_CONNECT=13
RATE_LIMIT_LINKEDIN_MESSAGE=13
```

---

### Week 3: +25% Increase

If week 2 completed without issues:

| Action | Limit |
|--------|-------|
| Likes | 32/day |
| Comments | 22/day |
| Follows/Connects | 16/day |
| DMs | 16/day |

---

### Week 4: +25% Increase

| Action | Limit |
|--------|-------|
| Likes | 40/day |
| Comments | 28/day |
| Follows/Connects | 20/day |
| DMs | 20/day |

---

### Week 5+: Full Limits

After 4 weeks of successful warm-up, you can use production limits:

| Platform | Likes | Comments | Follows/Connects | DMs |
|----------|-------|----------|------------------|-----|
| Instagram | 100/day | 30/day | 50/day | 50/day |
| LinkedIn | 100/day | 30/day | 15/day | 40/day |
| Twitter | 100/day | 50/day | 50/day | 20/day |

---

## Warning Signs

**Slow down immediately if you see:**
- "Action Blocked" messages
- CAPTCHA challenges
- Temporary restrictions
- Unusual logout prompts
- Email verification requests

**Recovery:**
1. Stop all automation for 24-48 hours
2. Use the account manually (browse, scroll)
3. Resume at 50% of previous limits
4. Increase by 10% weekly until stable

---

## Distribution Throughout the Day

Don't cluster actions. Spread them across active hours:

**Good Pattern:**
```
08:15 — 2 likes
10:33 — 1 comment, 1 like
12:07 — 1 connection request
13:44 — 2 likes, 1 comment
15:22 — 1 like
17:51 — 1 connection request, 1 like
19:17 — 1 comment
21:38 — 2 likes
```

**Bad Pattern:**
```
10:00 — 10 likes
10:05 — 5 comments
10:10 — 5 connection requests
```

**Rules:**
- Minimum 10 minutes between comments
- Minimum 15 minutes between connection requests
- Use odd minutes (:03, :17, :33, :51) not round numbers (:00, :15, :30, :45)
- Vary the gaps (don't make them predictable)

---

## Per-Platform Notes

### LinkedIn
- Connection requests are heavily monitored
- Keep connects under 15/day even at full limits
- 3rd degree connections are riskier than 2nd degree
- Add notes to connection requests when possible

### Instagram
- Follow/unfollow loops are detected quickly
- Comments with emojis only look bot-like
- Stories views are lower risk than post engagement
- Private accounts following is riskier

### Twitter/X
- Reply-spam is heavily penalized
- Likes are relatively safe
- DMs to non-followers may be restricted
- Quote tweets are safer than plain retweets

---

## Testing Status

| Week | Status | Issues |
|------|--------|--------|
| 1 | ✅ Complete | Selector bugs only |
| 2 | 🔄 In Progress | None so far |
| 3 | ⏳ Pending | — |
| 4 | ⏳ Pending | — |
| 5 | ⏳ Pending | — |

*Last updated: 2026-02-04*

---

## Quick Start for New Account

```bash
# Week 1 - Conservative
export RATE_LIMIT_INSTAGRAM_LIKE=20
export RATE_LIMIT_INSTAGRAM_COMMENT=14
export RATE_LIMIT_INSTAGRAM_FOLLOW=10
export RATE_LIMIT_INSTAGRAM_DM=10

export RATE_LIMIT_LINKEDIN_LIKE=20
export RATE_LIMIT_LINKEDIN_COMMENT=14
export RATE_LIMIT_LINKEDIN_CONNECT=10
export RATE_LIMIT_LINKEDIN_MESSAGE=10
```

Increase by 25% each week until you reach production limits.
