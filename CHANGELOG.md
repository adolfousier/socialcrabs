# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.31] - 2026-02-04

### Added
- **LinkedIn search command**: `linkedin search <query>` - searches for posts/articles mentioning query
- **LinkedIn engage command**: `linkedin engage --query=<query>` - full engagement session with human-like delays
- **Engagement automation script**: `scripts/engage.ts` for batch engagement with 10-25 min random delays
- **State persistence**: Tracks engaged posts/articles to avoid duplicates

### Changed
- LinkedIn search now extracts posts (`urn:li:share`), articles (`/pulse/`), and user profiles
- Improved human-like behavior with warm-up phases before each action

## [0.1.3] - 2026-02-02

### Fixed
- **LinkedIn Message button selector**: Fixed to target visible primary button with `:visible` pseudo-selector
- **LinkedIn DM working**: Successfully tested with session persistence

### Added  
- **LinkedIn comment CLI command**: Added `linkedin comment <url> <text>` to CLI

### Changed
- LinkedIn selectors now use `button.artdeco-button--primary[aria-label^="Message "]:visible` to avoid matching sticky header

## [0.1.2] - 2026-02-02

### Added
- **Warm-up browsing**: Instagram & LinkedIn now scroll feed 3-5 times before any action
- **Action cooldown**: 2-3 minute delay method for multi-action sequences
- **Agent-friendly README**: Added "Agent Instructions" section for OpenClaw/AI usage

### Changed
- Human simulation now includes pre-action warm-up for all Instagram/LinkedIn actions
- README restructured with quick commands for AI agents

## [0.1.1] - 2026-02-02

### Fixed
- **LinkedIn login**: Fixed `isLoggedIn()` false positive that caused session to be saved without auth cookie
- **LinkedIn MFA**: No longer navigates away during MFA approval flow
- **LinkedIn session**: Now correctly checks for `li_at` auth cookie

### Changed
- LinkedIn status upgraded to "Tested & Working"
- Added Reddit to roadmap (Planned)

### Tested
- Instagram: Login, DM, Like, Comment ✅
- LinkedIn: Login, Like ✅

## [0.1.0] - 2026-02-02

### Added

- Initial release of ClawSocial
- **Instagram Support** ✅ Tested
  - Headless login with credentials
  - Like posts
  - Comment on posts
  - Follow/unfollow users
  - Send direct messages ✅ Verified working
  - Profile scraping
- **Twitter/X Support** (Implemented, not yet tested)
  - Like tweets
  - Post tweets
  - Reply to tweets
  - Follow/unfollow users
  - Send direct messages
  - Retweet
- **LinkedIn Support** (Implemented, not yet tested)
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
