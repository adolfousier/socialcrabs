# AUTOMATION_RULES.md

## ⚠️ WARNING

This software is for **educational and experimental purposes** only.
Use at your own risk. The authors are not responsible for account
suspensions or bans resulting from misuse.

---

## Platform Status

| Platform | Status | Recommendation |
|----------|--------|----------------|
| Twitter/X | 🟡 Use `bird` CLI | ClawSocial Twitter not tested; use [bird](https://github.com/adolfousier/bird) instead |
| Instagram | 🔴 Experimental | Auth + basic actions tested; **DO NOT USE IN PRODUCTION** |
| LinkedIn | 🔴 Experimental | Auth + basic actions tested; **DO NOT USE IN PRODUCTION** |

---

## Twitter/X Recommendations

**Do not use ClawSocial for Twitter/X.** Use the `bird` CLI instead:
- Cookie-based authentication (no API needed)
- Tested for 5+ days with no errors
- Supports: read timeline, mentions, search, post, reply, like

```bash
# Install bird
npm install -g bird-cli

# Set up (get cookies from browser)
export AUTH_TOKEN="your_auth_token"
export CT0="your_ct0"

# Usage
bird whoami
bird home
bird search "query"
bird tweet "Hello world"
bird reply <tweet-url> "response"
```

---

## Instagram Rules (EXPERIMENTAL)

**Status:** Basic auth, DM, like, comment tested. Not production-ready.

### What's Working
- [x] Login with session persistence
- [x] Like posts
- [x] Comment on posts
- [x] Send DMs

### What's NOT Tested
- [ ] Follow/unfollow
- [ ] Profile scraping
- [ ] Hashtag/search scraping
- [ ] Extended automation sessions
- [ ] Rate limit edge cases

### Known Risks
- Instagram has aggressive bot detection
- Session cookies expire frequently
- No proxy support yet
- No fingerprint randomization

### Recommended Wait
**Do not use for automation until:**
1. Proxy support implemented
2. Fingerprint rotation added
3. Extended testing (7+ days) completed
4. Rate limit verification done

---

## LinkedIn Rules (EXPERIMENTAL)

**Status:** Basic auth, DM, like, comment tested. Not production-ready.

### What's Working
- [x] Login with MFA support
- [x] Like posts
- [x] Comment on posts
- [x] Send messages (1st connections only)
- [x] Connection requests

### What's NOT Tested
- [ ] Profile scraping
- [ ] Search/hashtag scraping
- [ ] Extended automation sessions
- [ ] Connection acceptance rate
- [ ] Rate limit edge cases

### Known Risks
- LinkedIn restricts automation heavily
- Account restrictions are common
- No proxy support yet
- Selectors may break with UI updates

### Recommended Wait
**Do not use for automation until:**
1. Proxy support implemented
2. Extended testing (7+ days) completed
3. Rate limit verification done
4. Selector stability confirmed

---

## Human-like Behavior (All Platforms)

ClawSocial implements:
- **Warm-up browsing**: Scrolls feed 3-5 times before any action
- **Random delays**: 1.5-4s between actions
- **Natural typing**: 30-100ms per character
- **Thinking pauses**: 2-5s before complex actions
- **Action cooldown**: 2-3 min recommended between different actions

---

## Data Storage

**Current:** No scraping/storage implemented.

**Planned:**
- Safe local storage for scraped profiles
- Encrypted storage for interaction targets
- No network exfiltration of scraped data

---

## Rate Limits (Tested & Recommended)

### Warm-up Period (Days 1-7)

Start extremely slow. Platforms flag new automation patterns.

| Day | Like | Comment | Follow | DM |
|-----|------|---------|--------|-----|
| 1 | 1 | 1 | 0 | 1 |
| 2 | 2 | 2 | 1 | 1 |
| 3 | 3 | 3 | 1 | 2 |
| 4-7 | 5 | 5 | 2 | 3 |

**Delays between actions:** 30-60 minutes minimum

### After Warm-up (Day 8+)

| Platform | Like/day | Comment/day | Follow/day | DM/day |
|----------|----------|-------------|------------|--------|
| Instagram | 10-15 | 5-10 | 5 | 5 |
| LinkedIn | 10-15 | 5-10 | 3* | 5 |
| Twitter | 20-30 | 20** | 10 | 5 |

*Connection requests
**Spread across 3 time periods (e.g., 7 interactions × 3 = 21/day)

### Time Distribution

Don't do all actions at once. Spread across the day:

```
Morning:   7 interactions (9-11 AM)
Afternoon: 7 interactions (2-4 PM)  
Evening:   7 interactions (7-9 PM)
```

### What We Actually Tested

| Platform | Action | Tested Volume | Duration |
|----------|--------|---------------|----------|
| Twitter (bird) | Reply/engage | 21/day (7×3) | 5+ days ✅ |
| Instagram | Like/Comment/DM | 1 each | 1 day |
| LinkedIn | Like/Comment/DM | 1 each | 1 day |

⚠️ **Instagram and LinkedIn limits above are theoretical.** Only basic functionality tested, not sustained automation.

---

## Contributing

Before using ClawSocial for any platform automation:
1. Read this file completely
2. Understand the risks
3. Test on a secondary account first
4. Report issues and findings
