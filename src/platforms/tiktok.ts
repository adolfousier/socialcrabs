/**
 * TikTok Platform Handler
 * SocialCrabs - Playwright-based TikTok automation
 * 
 * @see https://github.com/adolfousier/socialcrabs/issues/5
 */

import { BasePlatformHandler } from './base.js';
import { log } from '../utils/logger.js';
import type { BrowserManager } from '../browser/manager.js';
import type { RateLimiter } from '../utils/rate-limiter.js';
import type {
  ActionResult,
  LikePayload,
  CommentPayload,
  FollowPayload,
  DMPayload,
  PostPayload,
  TikTokPostPayload,
  TikTokProfile,
} from '../types/index.js';
import { TikTokLoginHandler } from './tiktok/login.js';
import { TikTokPostHandler } from './tiktok/post.js';
import { TikTokEngagementHandler } from './tiktok/engagement.js';

// TikTok UI selectors (current as of 2025)
const SELECTORS = {
  // Cookie consent
  cookieAccept: 'button:has-text("Accept"), button:has-text("Accept all")',

  // Login
  loginUsername: 'input[name="username"], input[autocomplete="username"]',
  loginPassword: 'input[name="password"], input[type="password"]',
  loginButton: 'button[type="submit"], div[role="button"]:has-text("Log in")',
  loginError: 'p[data-e2e="login-error"], div[role="alert"]',
  qrTab: 'text=Use QR code',

  // Logged in indicators
  loggedInNav: 'nav[role="navigation"]',
  uploadButton: 'div[data-e2e="upload-button"], a[href="/upload"]',

  // Like
  likeButton: 'div[data-e2e="like-button"] svg, span[data-e2e="unlike-button"]',
  unlikeButton: 'div[data-e2e="like-button"]:has(svg[fill="currentColor"])',

  // Comment
  commentInput: 'div[contenteditable="true"][data-e2e="comment-input"]',
  commentPostButton: 'button[data-e2e="comment-post-button"]',
  commentButton: 'div[data-e2e="comment-button"]',

  // Follow
  followButton: 'button[data-e2e="follow-button"], div[data-e2e="follow-button"]',
  followingButton: 'button[data-e2e="following-button"]',

  // Post/Upload
  uploadInput: 'input[type="file"][accept*="video"], input[type="file"][accept*="image"]',
  postButton: 'button[data-e2e="publish-button"], button:has-text("Post")',
  captionInput: 'div[contenteditable="true"][data-e2e="caption-input"]',

  // Profile
  profileAvatar: 'img[data-e2e="user-avatar"]',
  profileStats: 'h2[data-e2e="profile-title"], span[data-e2e="profile-subtitle"]',
  followersCount: 'strong[data-e2e="followers-count"]',
  followingCount: 'strong[data-e2e="following-count"]',
  likesCount: 'strong[data-e2e="likes-count"]',

  // Carousel (image post)
  addImageButton: 'div[data-e2e="add-image-button"]',
  imageIndicator: 'div[data-e2e="upload-media-indicator"]',

  // DM
  inboxButton: 'a[href="/messages"], div[data-e2e="direct-message-icon"]',
  dmInput: 'div[contenteditable="true"]',
  dmSendButton: 'button[data-e2e="send-message-button"]',
};

export class TikTokHandler extends BasePlatformHandler {
  private readonly baseUrl = 'https://www.tiktok.com';
  private loginHandler: TikTokLoginHandler;
  private postHandler: TikTokPostHandler;
  private engagementHandler: TikTokEngagementHandler;

  constructor(browserManager: BrowserManager, rateLimiter: RateLimiter) {
    super('tiktok', browserManager, rateLimiter);
    this.loginHandler = new TikTokLoginHandler(this.browserManager);
    this.postHandler = new TikTokPostHandler();
    this.engagementHandler = new TikTokEngagementHandler();
  }

  // ========================================================================
  // Login / Auth
  // ========================================================================

  async login(username?: string, password?: string): Promise<boolean> {
    if (username && password) {
      return this.loginWithCredentials(username, password);
    }

    // Use stored credentials from config (placeholder - implement credential storage)
    log.info('TikTok: Starting login...');
    try {
      await this.navigate(`${this.baseUrl}/login`);
      await this.handleCookieConsent();
      await this.think();
      const page = await this.getPage();
      return await this.loginHandler.performLogin(page);
    } catch (err) {
      log.error(`TikTok: Login failed - ${String(err)}`);
      return false;
    }
  }

  async loginWithCredentials(username: string, password: string): Promise<boolean> {
    log.info(`TikTok: Attempting login for ${username}`);

    try {
      await this.navigate(`${this.baseUrl}/login`);
      await this.handleCookieConsent();
      await this.think();

      const success = await this.loginHandler.performLogin(
        await this.getPage(),
        username,
        password
      );

      if (success) {
        log.info(`TikTok: Login successful for ${username}`);
      }

      return success;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error(`TikTok: Login failed - ${errorMsg}`);
      return false;
    }
  }

  async isLoggedIn(): Promise<boolean> {
    try {
      await this.navigate(`${this.baseUrl}/`);
      await this.pause();

      // Check for login button (not logged in) or profile nav (logged in)
      const loginButton = await this.elementExists('a[href="/login"]');
      const profileNav = await this.elementExists(SELECTORS.uploadButton);
      return !loginButton || !!profileNav;
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.navigate(`${this.baseUrl}/`);
      await this.think();

      // Navigate to settings/logout
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // @ts-expect-error - Playwright $() returns ElementHandle | null
      const profileBtn = await this.page.$('[data-e2e="profile-avatar"]');
      if (profileBtn !== null) {
        await profileBtn.click();
        await this.pause();

        // Look for logout in dropdown
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // @ts-expect-error - Playwright $() returns ElementHandle | null
        const logoutBtn = await this.page.$('text=Log out');
        if (logoutBtn !== null) {
          await logoutBtn.click();
          await this.pause();
          log.info('TikTok: Logged out');
        }
      }
    } catch (err) {
      log.warn(`TikTok: Logout error - ${String(err)}`);
    }
  }

  // ========================================================================
  // Cookie Consent Handler
  // ========================================================================

  private async handleCookieConsent(): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // @ts-expect-error - Playwright waitForSelector returns nullable in strict mode
      const acceptBtn = await this.page.waitForSelector(SELECTORS.cookieAccept);
      await acceptBtn.click();
      if (acceptBtn !== null) {
        await acceptBtn!.click();
        await this.pause();
        log.debug('TikTok: Cookie consent accepted');
      }
    } catch {
      // No cookie consent shown
    }
  }

  // ========================================================================
  // Engagement Actions
  // ========================================================================

  async like(payload: LikePayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('like');

    if (!allowed) {
      return this.createErrorResult(
        'like',
        payload.url,
        `Rate limited - ${status.remaining} remaining, resets at ${new Date(status.resetAt).toISOString()}`,
        startTime,
        status
      );
    }

    try {
      await this.navigate(payload.url);
      await this.warmUp({ scrollCount: 2, minPauseMs: 1000, maxPauseMs: 2000 });
      await this.think();

      const success = await this.engagementHandler.like(await this.getPage(), SELECTORS);

      await this.recordAction('like');

      return success
        ? this.createResult('like', payload.url, startTime, status)
        : this.createErrorResult('like', payload.url, 'Like action failed', startTime, status);
    } catch (err) {
      return this.createErrorResult(
        'like',
        payload.url,
        err instanceof Error ? err.message : String(err),
        startTime
      );
    }
  }

  async comment(payload: CommentPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('comment');

    if (!allowed) {
      return this.createErrorResult(
        'comment',
        payload.url,
        `Rate limited - ${status.remaining} remaining, resets at ${new Date(status.resetAt).toISOString()}`,
        startTime,
        status
      );
    }

    try {
      await this.navigate(payload.url);
      await this.warmUp({ scrollCount: 2, minPauseMs: 1500, maxPauseMs: 3000 });
      await this.think();

      // Scroll to comments
      await this.scroll('down', 400);
      await this.pause();

      const text = this.sanitizeText(payload.text);
      const success = await this.engagementHandler.comment(
        await this.getPage(),
        SELECTORS,
        text
      );

      await this.recordAction('comment');

      return success
        ? this.createResult('comment', payload.url, startTime, status, { text })
        : this.createErrorResult('comment', payload.url, 'Comment failed', startTime, status);
    } catch (err) {
      return this.createErrorResult(
        'comment',
        payload.url,
        err instanceof Error ? err.message : String(err),
        startTime
      );
    }
  }

  async follow(payload: FollowPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('follow');

    if (!allowed) {
      return this.createErrorResult(
        'follow',
        payload.username,
        `Rate limited - ${status.remaining} remaining, resets at ${new Date(status.resetAt).toISOString()}`,
        startTime,
        status
      );
    }

    try {
      await this.navigate(`${this.baseUrl}/@${payload.username}`);
      await this.warmUp({ scrollCount: 2, minPauseMs: 2000, maxPauseMs: 4000 });
      await this.think();

      const success = await this.engagementHandler.follow(await this.getPage(), SELECTORS);

      await this.recordAction('follow');

      return success
        ? this.createResult('follow', payload.username, startTime, status)
        : this.createErrorResult('follow', payload.username, 'Follow failed', startTime, status);
    } catch (err) {
      return this.createErrorResult(
        'follow',
        payload.username,
        err instanceof Error ? err.message : String(err),
        startTime
      );
    }
  }

  async unfollow(payload: FollowPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('follow');

    if (!allowed) {
      return this.createErrorResult(
        'unfollow',
        payload.username,
        `Rate limited - ${status.remaining} remaining, resets at ${new Date(status.resetAt).toISOString()}`,
        startTime,
        status
      );
    }

    try {
      await this.navigate(`${this.baseUrl}/@${payload.username}`);
      await this.think();

      const success = await this.engagementHandler.unfollow(await this.getPage(), SELECTORS);

      await this.recordAction('follow');

      return success
        ? this.createResult('unfollow', payload.username, startTime, status)
        : this.createErrorResult('unfollow', payload.username, 'Unfollow failed', startTime, status);
    } catch (err) {
      return this.createErrorResult(
        'unfollow',
        payload.username,
        err instanceof Error ? err.message : String(err),
        startTime
      );
    }
  }

  async dm(_payload: DMPayload): Promise<ActionResult> {
    // TikTok DMs work differently - use inbox navigation
    return this.createErrorResult(
      'dm',
      _payload.username,
      'TikTok DM automation not yet implemented - requires inbox navigation',
      Date.now()
    );
  }

  // ========================================================================
  // Post Creation
  // ========================================================================

  async post(payload: PostPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('post');

    if (!allowed) {
      return this.createErrorResult(
        'post',
        payload.text.slice(0, 50),
        `Rate limited - ${status.remaining} remaining, resets at ${new Date(status.resetAt).toISOString()}`,
        startTime,
        status
      );
    }

    try {
      await this.navigate(`${this.baseUrl}/upload`);
      await this.pause();
      await this.handleCookieConsent();

      // TikTok primarily uses video. For image posts, use the carousel endpoint.
      const success = await this.postHandler.createPost(
        await this.getPage(),
        SELECTORS,
        payload
      );

      await this.recordAction('post');

      return success
        ? this.createResult('post', payload.text.slice(0, 50), startTime, status)
        : this.createErrorResult('post', payload.text.slice(0, 50), 'Post failed', startTime, status);
    } catch (err) {
      return this.createErrorResult(
        'post',
        payload.text.slice(0, 50),
        err instanceof Error ? err.message : String(err),
        startTime
      );
    }
  }

  // ========================================================================
  // TikTok-specific: Carousel Post
  // ========================================================================

  async postCarousel(
    imagePaths: string[],
    caption: string,
    options?: Partial<TikTokPostPayload>
  ): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      await this.navigate(`${this.baseUrl}/upload`);
      await this.pause();
      await this.handleCookieConsent();

      const success = await this.postHandler.createCarouselPost(
        await this.getPage(),
        SELECTORS,
        imagePaths,
        this.sanitizeText(caption),
        options
      );

      return success
        ? this.createResult('post', 'carousel', startTime)
        : this.createErrorResult('post', 'carousel', 'Carousel post failed', startTime);
    } catch (err) {
      return this.createErrorResult(
        'post',
        'carousel',
        err instanceof Error ? err.message : String(err),
        startTime
      );
    }
  }

  // ========================================================================
  // Profile
  // ========================================================================

  async getProfile(username: string): Promise<TikTokProfile | null> {
    try {
      await this.navigate(`${this.baseUrl}/@${username}`);
      await this.waitForElement(SELECTORS.profileAvatar, 10000);

      const profile = await this.engagementHandler.getProfileData(await this.getPage(), SELECTORS);
      return profile as TikTokProfile;
    } catch (err) {
      log.warn(`TikTok: Failed to get profile for @${username} - ${String(err)}`);
      return null;
    }
  }
}
