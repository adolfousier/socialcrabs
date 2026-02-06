# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.38] - 2026-02-06

### Removed
- **Deleted hardcoded comment scripts**: `ig-engage.ts` and `engage.ts`
  - These used hardcoded templates like "This is fire! 🔥" — obvious bot behavior
  - Agent-driven approach is now the only way: read content → generate contextual comment

### Changed
- **Agent-driven comment system**: All engagement is now fully dynamic
  - Agent reads the actual post/article content
  - Agent reads user's `VOICE.md` style guide
  - Agent generates unique, contextual comments
  - Comments logged to prevent repetition
- **Updated CRONJOB_TEMPLATE.md**: Complete rewrite for agent-driven workflow
- **Updated NOTIFICATION_TEMPLATES.md**: Added VOICE.md documentation and comment quality examples
- **Updated README.md**: Added "Agent-Driven Comments" section in best practices

### Documentation
- **Anti-patterns section**: Documents what NOT to do (hardcoded templates, generic AI phrases)
- **VOICE.md examples**: Shows how to structure a style guide
- **Comment storage**: How to log comments to avoid repetition

## [0.0.37] - 2026-02-06

### Fixed
- **X ENGAGEMENT notifications**: Now extract author and tweet preview directly from page
  - Author extracted from tweet article metadata
  - Preview shows first 100 characters of tweet text
- **Notification naming**: Changed "X LIKE" → "X ENGAGEMENT" for consistency across platform
- **Notification format**: Actions now use bullet list format (`• ❤️ Liked: ✅`)

## [0.0.36] - 2026-02-06

### Changed
- **Project restructure**: Moved `docs/`, `examples/`, `scripts/` into `src/`
  - `src/docs/` - Documentation files
  - `src/examples/` - Example templates including CRONJOB_TEMPLATE.md
  - `src/scripts/` - Automation scripts (engage.ts, ig-engage.ts, sync-bird-cookies.ts)
- **Updated all references**: CLI, cron jobs, and documentation now use `src/scripts/` paths

### Added
- **Automatic retries**: All CLI commands now include automatic retry logic
  - Default: 3 attempts with 5s delay between retries
  - Configurable via `--retries <n>` flag (1-10)
  - Console output shows retry progress
  - Error notifications sent after all retries exhausted
- **`notify report` command**: Agents can send formatted notifications directly
  - Usage: `npm run cli -- notify report <platform> <action> <target> --context='<json>'`
  - Supports all platforms: twitter, linkedin, instagram
  - Supports all actions: like, comment, follow, connect
- **`--context` flag for all actions**: Pass JSON context to merge with notifications
- **`CLAWSOCIAL_SILENT=1` env var**: Suppress auto-notifications when using combined reports

### Changed
- **Notification templates standardized**: All notifications now include:
  - Language field (when provided)
  - Behaviors field (when provided)
  - Time field (always, UTC timestamp)
  - Italic footer: `_ClawSocial [Platform] Automation_`
- **Cron jobs updated**: All 44 jobs now use ClawSocial's centralized notification system

### Documentation
- **`examples/CRONJOB_TEMPLATE.md`**: Complete reference for all cron job patterns
- **`docs/NOTIFICATION_TEMPLATES.md`**: Exact notification output formats

## [0.0.35] - 2026-02-06

### Added
- **Automatic retries**: All CLI commands now include automatic retry logic
  - Default: 3 attempts with 5s delay between retries
  - Configurable via `--retries <n>` flag (1-10)
  - Console output shows retry progress
  - Error notifications sent after all retries exhausted
- **`notify report` command**: Agents can send formatted notifications directly
  - Usage: `npm run cli -- notify report <platform> <action> <target> --context='<json>'`
  - Supports all platforms: twitter, linkedin, instagram
  - Supports all actions: like, comment, follow, connect
- **`--context` flag for all actions**: Pass JSON context to merge with notifications
- **`CLAWSOCIAL_SILENT=1` env var**: Suppress auto-notifications when using combined reports

### Changed
- **Notification templates standardized**: All notifications now include:
  - Language field (when provided)
  - Behaviors field (when provided)
  - Time field (always, UTC timestamp)
  - Italic footer: `_ClawSocial [Platform] Automation_`
- **Cron jobs updated**: All 44 jobs now use ClawSocial's centralized notification system

### Documentation
- **`examples/CRONJOB_TEMPLATE.md`**: Complete reference for all cron job patterns
- **`docs/NOTIFICATION_TEMPLATES.md`**: Exact notification output formats

## [0.0.35] - 2026-02-06

### Changed
- **Dependencies upgraded to latest**: All packages updated to current versions
  - Node.js 24+ (LTS) requirement
  - TypeScript 5.9.3
  - Playwright 1.58.1
  - Express 5.2.1
  - Zod 4.3.6
  - Commander 14.0.3
  - And 12 more packages

### Fixed
- **Express 5 compatibility**: Fixed TypeScript errors with `req.params` type assertions

## [0.0.34] - 2026-02-06

### Removed
- **X/Twitter DM support**: Removed due to X's encrypted DM passcode requirement that cannot be automated

### Fixed
- **X Follow URL handling**: `x follow` now accepts both usernames and full URLs (e.g., `x follow vutruso` or `x follow https://x.com/vutruso`)

### Changed
- Twitter/X status updated to "Production Ready" for likes, replies, and follows

## [0.0.33] - 2026-02-04

### Fixed
- **LinkedIn Connect modal handling**: Fixed "Send without a note?" confirmation dialog blocking connection requests
- **3rd degree connections**: Connect via More dropdown now properly handles LinkedIn's confirmation modal
- **Direct Connect**: Added modal detection for standard Connect button flow

### Changed
- LinkedIn connect now checks for and clicks confirmation buttons after initiating connection request
- Improved logging for modal detection flow

## [0.0.32] - 2026-02-04

### Added
- **Instagram follower scraping**: `ig followers <username>` - scrapes followers from a profile's popup
- **Instagram posts command**: `ig posts <username>` - gets recent posts from a profile
- **Instagram engagement script**: `scripts/ig-engage.ts` - automated engagement with followers
- **Fallback to follow**: If no posts found, follows the user instead of skipping
- **Instagram state tracking**: `db/instagram_state.json` for tracking engaged followers

### Changed
- Instagram selectors updated for followers popup and posts grid
- Added support for both posts (`/p/`) and reels (`/reel/`) in post detection

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
