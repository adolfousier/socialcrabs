# ClawSocial

<div align="center">

![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)
![Node](https://img.shields.io/badge/Node-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-1.48+-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)

**Production-ready social media automation with human-like behavior simulation**

[Features](#features) • [Installation](#installation) • [Usage](#usage) • [API](#api) • [Configuration](#configuration)

> ✅ **Tested & Working**: Instagram login, DM, like, comment, follow (Feb 2026)



</div>

---

## Overview

ClawSocial is a robust, production-ready social media automation platform built with Playwright. It simulates human-like behavior to interact with Instagram, Twitter/X, and LinkedIn safely and efficiently.

### Key Principles

- **Human-like Behavior**: Random delays, natural typing speed, realistic interaction patterns
- **Rate Limiting**: Built-in protection against platform restrictions
- **Stealth Mode**: Anti-detection measures to avoid automated behavior flags
- **Session Persistence**: Maintain login sessions across restarts
- **Multi-Platform**: Unified API for Instagram, Twitter, and LinkedIn

---

## Features

### Platforms

| Platform | Like | Comment | Follow | DM | Post | Scrape |
|----------|------|---------|--------|-----|------|--------|
| Instagram | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Twitter/X | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| LinkedIn | ✅ | ✅ | ✅* | ✅ | ❌ | ✅ |

*Connection requests

### Automation Features

- **Human Simulation**: Randomized delays (1.5-4s), natural typing (30-100ms/char)
- **Rate Limiting**: Configurable daily limits per action type
- **Session Management**: Encrypted cookie storage, auto-restore sessions
- **Stealth Mode**: Browser fingerprint protection, anti-bot detection
- **Error Recovery**: Automatic retries with exponential backoff
- **Logging**: Structured logging with Winston

### Integration

- **REST API**: Full HTTP API for programmatic control
- **WebSocket**: Real-time bidirectional communication
- **CLI**: Command-line interface for quick actions
- **Webhooks**: Event notifications (coming soon)

---

## Installation

### Prerequisites

- Node.js 18+
- npm or pnpm

### Quick Start

```bash
# Clone the repository
git clone https://github.com/adolfousier/clawsocial.git
cd clawsocial

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Copy environment file
cp .env.example .env

# Build
npm run build

# Start server
npm start
```

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

## Usage

### CLI

```bash
# Start the server
npm run cli -- serve

# Login (headless - uses credentials from .env)
npm run cli -- session login instagram --headless

# Login (interactive - opens browser for manual login)
npm run cli -- session login instagram

# Check session status
npm run cli -- session status

# Instagram actions
npm run cli -- ig like https://instagram.com/p/ABC123
npm run cli -- ig follow username
npm run cli -- ig comment https://instagram.com/p/ABC123 "Great post!"
npm run cli -- ig dm username "Hello from ClawSocial!"

# Twitter actions
npm run cli -- twitter like https://twitter.com/user/status/123
npm run cli -- twitter tweet "Hello world!"
npm run cli -- twitter follow username

# LinkedIn actions
npm run cli -- linkedin connect https://linkedin.com/in/username
npm run cli -- linkedin message https://linkedin.com/in/username "Hi there"

# Logout
npm run cli -- session logout instagram
```

### REST API

```bash
# Like an Instagram post
curl -X POST http://localhost:3847/api/instagram/like \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"url": "https://instagram.com/p/ABC123"}'

# Follow a Twitter user
curl -X POST http://localhost:3847/api/twitter/follow \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"username": "elonmusk"}'

# Get rate limit status
curl http://localhost:3847/api/status \
  -H "X-API-Key: your-api-key"
```

### Programmatic

```typescript
import { ClawSocial } from 'clawsocial';

const claw = new ClawSocial({
  headless: true,
  sessionDir: './sessions',
});

await claw.initialize();

// Instagram
const ig = claw.instagram;
await ig.login(); // Interactive login if no session
await ig.like('https://instagram.com/p/ABC123');
await ig.follow('username');
await ig.comment('https://instagram.com/p/ABC123', 'Nice!');

// Twitter
const twitter = claw.twitter;
await twitter.like('https://twitter.com/user/status/123');
await twitter.tweet('Hello from ClawSocial!');

// Cleanup
await claw.shutdown();
```

---

## API Reference

### REST Endpoints

#### Instagram

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/instagram/like` | Like a post |
| POST | `/api/instagram/comment` | Comment on a post |
| POST | `/api/instagram/follow` | Follow a user |
| POST | `/api/instagram/unfollow` | Unfollow a user |
| POST | `/api/instagram/dm` | Send a direct message |
| GET | `/api/instagram/profile/:username` | Get profile data |

#### Twitter

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/twitter/like` | Like a tweet |
| POST | `/api/twitter/tweet` | Post a tweet |
| POST | `/api/twitter/reply` | Reply to a tweet |
| POST | `/api/twitter/retweet` | Retweet |
| POST | `/api/twitter/follow` | Follow a user |
| POST | `/api/twitter/dm` | Send a direct message |

#### LinkedIn

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/linkedin/connect` | Send connection request |
| POST | `/api/linkedin/message` | Send a message |
| POST | `/api/linkedin/like` | Like a post |
| GET | `/api/linkedin/profile/:username` | Get profile data |

#### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Get system and rate limit status |
| GET | `/api/health` | Health check |
| POST | `/api/session/login/:platform` | Initiate login |
| POST | `/api/session/logout/:platform` | Logout |

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3847 | HTTP server port |
| `WS_PORT` | 3848 | WebSocket server port |
| `HOST` | 127.0.0.1 | Server bind address |
| `LOG_LEVEL` | info | Logging level (debug, info, warn, error) |
| `BROWSER_HEADLESS` | true | Run browser in headless mode |
| `BROWSER_DATA_DIR` | ./browser-data | Browser profile directory |
| `SESSION_DIR` | ./sessions | Session storage directory |
| `DELAY_MIN_MS` | 1500 | Minimum delay between actions |
| `DELAY_MAX_MS` | 4000 | Maximum delay between actions |
| `TYPING_SPEED_MIN_MS` | 30 | Minimum typing delay per character |
| `TYPING_SPEED_MAX_MS` | 100 | Maximum typing delay per character |
| `INSTAGRAM_USERNAME` | - | Instagram username (for headless login) |
| `INSTAGRAM_PASSWORD` | - | Instagram password (for headless login) |
| `TWITTER_USERNAME` | - | Twitter username (for headless login) |
| `TWITTER_PASSWORD` | - | Twitter password (for headless login) |
| `LINKEDIN_EMAIL` | - | LinkedIn email (for headless login) |
| `LINKEDIN_PASSWORD` | - | LinkedIn password (for headless login) |

> ⚠️ **Note**: For passwords with special characters, wrap in quotes: `INSTAGRAM_PASSWORD="my*pass(word"`

### Rate Limits

Default daily limits (configurable via environment):

| Platform | Action | Default Limit |
|----------|--------|---------------|
| Instagram | Like | 100/day |
| Instagram | Comment | 30/day |
| Instagram | Follow | 50/day |
| Instagram | DM | 50/day |
| Twitter | Like | 100/day |
| Twitter | Tweet | 10/day |
| Twitter | Follow | 50/day |
| LinkedIn | Connect | 15/day |
| LinkedIn | Message | 40/day |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        ClawSocial                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                     │
│  │   CLI   │  │  REST   │  │   WS    │    Interfaces       │
│  └────┬────┘  └────┬────┘  └────┬────┘                     │
│       │            │            │                           │
│  ┌────┴────────────┴────────────┴────┐                     │
│  │           Command Router           │                     │
│  └────────────────┬───────────────────┘                     │
│                   │                                         │
│  ┌────────────────┴───────────────────┐                     │
│  │           Rate Limiter             │                     │
│  └────────────────┬───────────────────┘                     │
│                   │                                         │
│  ┌────────┬───────┴───────┬────────┐                       │
│  │Instagram│   Twitter    │LinkedIn│   Platform Handlers   │
│  └────┬───┘└──────┬───────┘└───┬───┘                       │
│       │           │            │                           │
│  ┌────┴───────────┴────────────┴────┐                      │
│  │         Browser Manager          │                      │
│  │      (Playwright + Stealth)      │                      │
│  └──────────────────────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Security

- **No credentials in code**: All secrets via environment variables
- **Session encryption**: Optional encryption for stored cookies
- **Local binding**: Server binds to localhost by default
- **API authentication**: Optional API key for remote access
- **Rate limiting**: Prevents accidental platform bans

---

## Disclaimer

This software is provided for educational and research purposes. Users are responsible for:

1. Complying with the Terms of Service of each platform
2. Respecting rate limits and usage policies
3. Not using this software for spam, harassment, or illegal activities

The authors are not responsible for any misuse or violations of platform policies.

---

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting PRs.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built with ❤️ by [Adolfo Usier](https://github.com/adolfousier)**

</div>
