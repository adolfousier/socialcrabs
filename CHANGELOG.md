# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-02

### Added

- Initial release of ClawSocial
- **Instagram Support**
  - Like posts
  - Comment on posts
  - Follow/unfollow users
  - Send direct messages
  - View stories
  - Profile scraping
- **Twitter/X Support**
  - Like tweets
  - Post tweets
  - Reply to tweets
  - Follow/unfollow users
  - Send direct messages
  - Retweet
- **LinkedIn Support**
  - View profiles
  - Send connection requests
  - Send messages
  - Like posts
  - Comment on posts
- **Core Features**
  - Human-like behavior simulation (random delays, natural typing)
  - Built-in rate limiting per platform
  - Session persistence (cookie management)
  - Stealth mode (anti-detection measures)
  - REST API server
  - WebSocket real-time control
  - CLI interface
  - Activity logging
  - Multi-account support
- **Infrastructure**
  - Docker support
  - TypeScript codebase
  - Comprehensive logging
  - Graceful shutdown handling

### Security

- Session encryption support
- No credentials stored in code
- Secure cookie handling
- API key authentication for remote access
