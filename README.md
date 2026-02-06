![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)
![Node](https://img.shields.io/badge/Node-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-1.48+-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)


# 🦀 ClawSocial

**Web-based social media automation tool with human-like behavior simulation built with Playwright**

*Post, like, comment, follow/connect, unfollow and DM on Instagram, Twitter/X, and LinkedIn. Reddit is comming soon!*

[Features](#-features) • [Architecture](#-architecture) • [Workflow](#-workflow) • [Installation](#-installation) • [Usage](#-usage) • [API](#-api-reference) • [Configuration](#-configuration)

---

## 📑 Table of Contents

- [Features](#-features)
  - [Platform Support](#platform-support)
  - [Automation Capabilities](#automation-capabilities)
  - [Integration Options](#integration-options)
- [Architecture](#-architecture)
- [Workflow](#-workflow)
  - [Human Simulation](#human-simulation)
  - [Rate Limiting](#rate-limiting)
- [Security](#-security)
- [Installation](#-installation)
  - [Prerequisites](#prerequisites)
  - [Quick Start (Human)](#quick-start-human)
  - [AI Agent Instructions](#-ai-agent-instructions)
  - [Docker](#docker)
- [Usage](#-usage)
  - [CLI Commands](#cli-commands)
  - [REST API Examples](#rest-api-examples)
  - [Programmatic Usage](#programmatic-usage)
- [API Reference](#-api-reference)
- [Configuration](#-configuration)
  - [Environment Variables](#environment-variables)
  - [Rate Limits](#rate-limits)
- [Disclaimer](#-disclaimer)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

### Platform Support

| Platform | Login | Like | Comment | Follow | DM | Connect | Search | Status |
|----------|:-----:|:----:|:-------:|:------:|:--:|:-------:|:------:|--------|
| Instagram | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | **Production Ready** |
| LinkedIn | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **Production Ready** |
| Twitter/X | ✅ | ✅ | ✅ | ✅ | ❌ | — | ✅ | **Production Ready** |
| Reddit | 🔜 | 🔜 | 🔜 | 🔜 | 🔜 | — | — | Planned |

> **Status Key**: "Production Ready" = tested & verified. "Implemented" = code complete. "Planned" = on roadmap.

### Automation Capabilities

- **🤖 Human-like Behavior**
  - Warm-up browsing (scrolls feed before actions)
  - Randomized delays (1.5-4s between actions)
  - Natural typing speed (30-100ms per character)
  - Thinking pauses (2-5s before complex actions)
  - Action cooldown (2-3 min between multiple actions)

- **🛡️ Safety Features**
  - Built-in rate limiting per platform
  - Session persistence across restarts
  - Stealth mode (anti-detection measures)
  - Automatic error recovery with exponential backoff

- **📊 Platform-Specific**
  - **Instagram**: Follower scraping, post engagement, DMs
  - **LinkedIn**: Connection requests (including 3rd degree via More dropdown), post engagement, search & engage
  - **Twitter/X**: Tweet posting, likes, replies, follows

### Integration Options

| Interface | Description |
|-----------|-------------|
| **CLI** | Command-line interface for quick actions |
| **REST API** | Full HTTP API on port 3847 |
| **WebSocket** | Real-time bidirectional communication on port 3848 |
| **Programmatic** | TypeScript/JavaScript SDK |
| **Notifications** | Telegram, Discord, or webhook notifications on action completion |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        ClawSocial                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                     │
│  │   CLI   │  │  REST   │  │   WS    │    Interfaces       │
│  └────┬────┘  └────┬────┘  └────┬────┘                     │
│       │            │            │                           │
│       └────────────┼────────────┘                           │
│                    ▼                                        │
│  ┌─────────────────────────────────────┐                   │
│  │          Command Router             │                   │
│  └─────────────────┬───────────────────┘                   │
│                    ▼                                        │
│  ┌─────────────────────────────────────┐                   │
│  │           Rate Limiter              │                   │
│  └─────────────────┬───────────────────┘                   │
│                    ▼                                        │
│  ┌──────────┬──────────┬──────────┐                        │
│  │Instagram │ LinkedIn │ Twitter  │   Platform Handlers    │
│  └────┬─────┴────┬─────┴────┬─────┘                        │
│       │          │          │                               │
│       └──────────┼──────────┘                               │
│                  ▼                                          │
│  ┌─────────────────────────────────────┐                   │
│  │         Browser Manager             │                   │
│  │    (Playwright + Stealth Mode)      │                   │
│  └─────────────────────────────────────┘                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key Components:**
- **Interfaces**: Multiple ways to interact (CLI, REST, WebSocket)
- **Command Router**: Routes requests to appropriate handlers
- **Rate Limiter**: Enforces daily limits per platform/action
- **Platform Handlers**: Instagram, LinkedIn, Twitter-specific logic
- **Browser Manager**: Playwright with stealth mode and session persistence

---

## 🔄 Workflow

### Human Simulation

ClawSocial automatically simulates human behavior for every action:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Warm-up    │ ──▶ │  Navigate   │ ──▶ │   Think     │ ──▶ │   Action    │
│  (3-5 scrolls)   │  to Target  │     │  (2-5s)     │     │  + Typing   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

1. **Warm-up**: Scrolls feed 3-5 times with random pauses (mimics checking notifications)
2. **Navigate**: Goes to target with natural page load timing
3. **Think**: Pauses 2-5s (simulates reading/deciding)
4. **Action**: Performs action with natural typing speed (30-100ms/char)

### Rate Limiting

Default daily limits to stay within platform guidelines:

| Platform | Like | Comment | Follow | DM | Connect |
|----------|:----:|:-------:|:------:|:--:|:-------:|
| Instagram | 100 | 30 | 50 | 50 | — |
| LinkedIn | 100 | 30 | 50 | 40 | 15 |
| Twitter | 100 | 50 | 50 | — | — |

---

## 🔐 Security

| Feature | Description |
|---------|-------------|
| **No Hardcoded Credentials** | All secrets via environment variables |
| **Session Encryption** | Optional encryption for stored cookies |
| **Local Binding** | Server binds to `127.0.0.1` by default |
| **API Authentication** | Optional API key for remote access |
| **Stealth Mode** | Browser fingerprint protection, anti-bot detection |
| **Rate Limiting** | Prevents accidental platform bans |

---

## 📦 Installation

### Prerequisites

- Node.js 18+
- npm or pnpm

### Quick Start (Human)

```bash
# Clone the repository
git clone https://github.com/adolfousier/clawsocial.git
cd clawsocial

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Copy environment file and configure
cp .env.example .env
# Edit .env with your credentials

# Build
npm run build

# Start server
npm start
```

### ⚠️ Important Notice

> **This software is for educational and experimental purposes only.**
> **Expect this tool to break without further notice. Follow AUTOMATION_RULES.md for best performance**
> 
> Read **[AUTOMATION_RULES.md](./AUTOMATION_RULES.md)** before using.
> 
> | Platform | Status |
> |----------|--------|
> | Instagram | 🟡 Production - use responsibly |
> | LinkedIn | 🟡 Production - use responsibly |
> | Twitter/X | 🟡 Consider [`bird`](https://github.com/adolfousier/bird) CLI for cookies-based approach |

### 🤖 AI Agent Instructions

> **For AI agents (OpenClaw, Claude, etc.)** — Here's how to use ClawSocial:

#### Quick Commands

```bash
# Login (headless - uses .env credentials)
npm run cli -- session login <platform> --headless

# Check session status
npm run cli -- session status

# Instagram
npm run cli -- ig like <post-url>
npm run cli -- ig comment <post-url> "Your comment"
npm run cli -- ig dm <username> "Your message"
npm run cli -- ig follow <username>
npm run cli -- ig followers <username> -n 10    # Scrape followers
npm run cli -- ig posts <username> -n 3         # Get recent posts

# LinkedIn
npm run cli -- linkedin like <post-url>
npm run cli -- linkedin comment <post-url> "Your comment"
npm run cli -- linkedin dm <profile-url> "Your message"
npm run cli -- linkedin connect <profile-url>   # Works for 3rd degree too
npm run cli -- linkedin search <query>          # Search posts/articles
npm run cli -- linkedin engage --query=<query>  # Full engagement session

# Twitter
npm run cli -- twitter like <tweet-url>
npm run cli -- twitter tweet "Your tweet"
npm run cli -- twitter follow <username>
```

#### Required Environment Variables

```bash
# Instagram
INSTAGRAM_USERNAME=your_username
INSTAGRAM_PASSWORD="your_password"

# LinkedIn (supports MFA - approve in app when prompted)
LINKEDIN_EMAIL=your_email
LINKEDIN_PASSWORD="your_password"

# Twitter (optional - or use bird CLI with cookies)
TWITTER_USERNAME=your_username
TWITTER_PASSWORD="your_password"
```

#### Session Files

| Path | Description |
|------|-------------|
| `./sessions/{platform}.json` | Stored session cookies |
| `./browser-data/` | Browser profile data |
| `./sessions/debug-*.png` | Debug screenshots |
| `./db/` | State files (engaged profiles, etc.) |

#### Multi-Action Sequences

When performing multiple actions on the same profile (e.g., DM then comment), ClawSocial automatically applies a 2-3 minute cooldown between actions.

### Docker

```bash
# Build image
docker build -t clawsocial .

# Run container
docker run -d \
  --name clawsocial \
  -p 3847:3847 \
  -p 3848:3848 \
  -v $(pwd)/sessions:/app/sessions \
  -v $(pwd)/browser-data:/app/browser-data \
  --env-file .env \
  clawsocial
```

---

## 🚀 Usage

### CLI Commands

#### Session Management

```bash
# Interactive login (opens browser)
npm run cli -- session login instagram

# Headless login (uses .env credentials)
npm run cli -- session login linkedin --headless

# Check all sessions
npm run cli -- session status

# Logout
npm run cli -- session logout instagram
```

#### Instagram

```bash
npm run cli -- ig like https://instagram.com/p/ABC123
npm run cli -- ig comment https://instagram.com/p/ABC123 "Great post!"
npm run cli -- ig follow username
npm run cli -- ig dm username "Hello!"
npm run cli -- ig followers username -n 10
npm run cli -- ig posts username -n 5
npm run cli -- ig profile username
```

#### LinkedIn

```bash
npm run cli -- linkedin like https://linkedin.com/posts/xxx
npm run cli -- linkedin comment https://linkedin.com/posts/xxx "Insightful!"
npm run cli -- linkedin connect https://linkedin.com/in/username
npm run cli -- linkedin dm https://linkedin.com/in/username "Hi there"
npm run cli -- linkedin search "AI automation"
npm run cli -- linkedin engage --query="OpenClaw"
npm run cli -- linkedin profile username
```

#### Twitter

```bash
npm run cli -- twitter like https://twitter.com/user/status/123
npm run cli -- twitter tweet "Hello world!"
npm run cli -- twitter reply https://twitter.com/user/status/123 "Great point!"
npm run cli -- twitter follow username
```

### REST API Examples

```bash
# Like an Instagram post
curl -X POST http://localhost:3847/api/instagram/like \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"url": "https://instagram.com/p/ABC123"}'

# Send LinkedIn connection
curl -X POST http://localhost:3847/api/linkedin/connect \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"profileUrl": "https://linkedin.com/in/username"}'

# Get rate limit status
curl http://localhost:3847/api/status \
  -H "X-API-Key: your-api-key"
```

### Programmatic Usage

```typescript
import { ClawSocial } from 'clawsocial';

const claw = new ClawSocial({
  headless: true,
  sessionDir: './sessions',
});

await claw.initialize();

// Instagram
const ig = claw.instagram;
await ig.login();
await ig.like('https://instagram.com/p/ABC123');
await ig.follow('username');
await ig.comment('https://instagram.com/p/ABC123', 'Nice!');

// LinkedIn
const linkedin = claw.linkedin;
await linkedin.login();
await linkedin.connect('https://linkedin.com/in/username');

// Cleanup
await claw.shutdown();
```

---

## 📡 API Reference

### Instagram Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/instagram/like` | Like a post |
| POST | `/api/instagram/comment` | Comment on a post |
| POST | `/api/instagram/follow` | Follow a user |
| POST | `/api/instagram/unfollow` | Unfollow a user |
| POST | `/api/instagram/dm` | Send a direct message |
| GET | `/api/instagram/profile/:username` | Get profile data |

### LinkedIn Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/linkedin/like` | Like a post |
| POST | `/api/linkedin/comment` | Comment on a post |
| POST | `/api/linkedin/connect` | Send connection request |
| POST | `/api/linkedin/message` | Send a message |
| GET | `/api/linkedin/profile/:username` | Get profile data |

### Twitter Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/twitter/like` | Like a tweet |
| POST | `/api/twitter/tweet` | Post a tweet |
| POST | `/api/twitter/reply` | Reply to a tweet |
| POST | `/api/twitter/retweet` | Retweet |
| POST | `/api/twitter/follow` | Follow a user |

### System Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | System and rate limit status |
| GET | `/api/health` | Health check |
| POST | `/api/session/login/:platform` | Initiate login |
| POST | `/api/session/logout/:platform` | Logout |

---

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3847 | HTTP server port |
| `WS_PORT` | 3848 | WebSocket server port |
| `HOST` | 127.0.0.1 | Server bind address |
| `LOG_LEVEL` | info | Logging level |
| `BROWSER_HEADLESS` | true | Run browser headless |
| `BROWSER_DATA_DIR` | ./browser-data | Browser profile directory |
| `SESSION_DIR` | ./sessions | Session storage directory |
| `DELAY_MIN_MS` | 1500 | Minimum delay between actions |
| `DELAY_MAX_MS` | 4000 | Maximum delay between actions |
| `TYPING_SPEED_MIN_MS` | 30 | Min typing delay per character |
| `TYPING_SPEED_MAX_MS` | 100 | Max typing delay per character |

#### Platform Credentials

```bash
# Instagram
INSTAGRAM_USERNAME=your_username
INSTAGRAM_PASSWORD="your_password"

# LinkedIn
LINKEDIN_EMAIL=your_email
LINKEDIN_PASSWORD="your_password"

# Twitter (optional)
TWITTER_USERNAME=your_username
TWITTER_PASSWORD="your_password"
```

> ⚠️ **Note**: For passwords with special characters, wrap in quotes: `PASSWORD="my*pass(word"`

### Rate Limits

> ⚠️ **Important**: New accounts need a warm-up period. See [Warm-Up Guide](docs/WARM_UP_GUIDE.md) for the full 5-week scaling schedule.

#### Production Limits (After 5-Week Warm-Up)

| Platform | Action | Default | Env Variable |
|----------|--------|---------|--------------|
| Instagram | Like | 100/day | `RATE_LIMIT_INSTAGRAM_LIKE` |
| Instagram | Comment | 30/day | `RATE_LIMIT_INSTAGRAM_COMMENT` |
| Instagram | Follow | 50/day | `RATE_LIMIT_INSTAGRAM_FOLLOW` |
| Instagram | DM | 50/day | `RATE_LIMIT_INSTAGRAM_DM` |
| LinkedIn | Like | 100/day | `RATE_LIMIT_LINKEDIN_LIKE` |
| LinkedIn | Comment | 30/day | `RATE_LIMIT_LINKEDIN_COMMENT` |
| LinkedIn | Connect | 15/day | `RATE_LIMIT_LINKEDIN_CONNECT` |
| LinkedIn | Message | 40/day | `RATE_LIMIT_LINKEDIN_MESSAGE` |

#### Week 1 Warm-Up Limits (New Accounts)

| Action | Max/Day |
|--------|---------|
| Likes | 20 |
| Comments | 14 |
| Follows/Connects | 10 |
| DMs | 10 |

Increase by 25% each week until reaching production limits at week 5.

#### Action Timing Rules

- **Minimum 10 minutes** between comments
- **Minimum 15 minutes** between connection requests
- Use **odd minutes** (:03, :17, :33, :51) not round numbers
- **Vary gaps** — don't make timing predictable
- **Distribute** actions across active hours (8am-10pm)

### Notifications

ClawSocial can send notifications via Telegram, Discord, or custom webhooks when actions complete or fail.

#### Notification Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NOTIFY_ENABLED` | false | Enable notifications |
| `NOTIFY_TELEGRAM_BOT_TOKEN` | - | Telegram bot token |
| `NOTIFY_TELEGRAM_CHAT_ID` | - | Telegram chat ID to send to |
| `NOTIFY_DISCORD_WEBHOOK` | - | Discord webhook URL |
| `NOTIFY_WEBHOOK_URL` | - | Custom webhook URL |
| `NOTIFY_WEBHOOK_METHOD` | POST | Webhook HTTP method |
| `NOTIFY_WEBHOOK_HEADERS` | - | JSON headers for webhook |
| `NOTIFY_BRAND_FOOTER` | *ClawSocial Automation* | Footer text for notifications |
| `NOTIFY_ON_COMPLETE` | true | Notify on action success |
| `NOTIFY_ON_ERROR` | true | Notify on action failure |
| `NOTIFY_ON_LOGIN` | false | Notify on login events |
| `NOTIFY_ON_RATELIMIT` | true | Notify on rate limit exceeded |

#### Example .env for Telegram Notifications

```bash
NOTIFY_ENABLED=true
NOTIFY_TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
NOTIFY_TELEGRAM_CHAT_ID=7711740248
NOTIFY_BRAND_FOOTER="*ClawSocial LinkedIn Automation*"
```

#### Notification CLI Commands

```bash
# Check notification status
clawsocial notify status

# Send test notification
clawsocial notify test
clawsocial notify test telegram

# Send custom message
clawsocial notify send "Hello from ClawSocial!"
clawsocial notify send "Testing" --channel telegram
```

---

## ⚖️ Disclaimer

This is an **open-source experimental tool** for educational and research purposes.

**By using this software, you acknowledge:**

- Automating interactions may violate platform Terms of Service
- You accept full responsibility for any account restrictions or bans
- You will not use this for spam, harassment, commercial services, or illegal activities

This project is similar to other browser automation tools (Playwright, Puppeteer, Selenium) used for testing and research. It is not a commercial service.

**The authors are not responsible for any misuse or consequences of use.**

---

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting PRs.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built with ❤️ by [Adolfo Usier](https://github.com/adolfousier)**

[⬆ Back to Top](#-clawsocial)

</div>
