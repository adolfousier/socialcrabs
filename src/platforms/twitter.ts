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
  TwitterProfile,
  ActionType,
} from '../types/index.js';
import { createBrowserTweetDisabledResult } from '../utils/twitter-posting-policy.js';

export const X_HUMAN_VERIFICATION_MESSAGE =
  'X human verification challenge detected; browser action skipped. Do not bypass it. Complete verification manually in a normal browser session, or use API/xurl-only flows for posting.';

export class TwitterHandler extends BasePlatformHandler {

  constructor(browserManager: BrowserManager, rateLimiter: RateLimiter) {
    super('twitter', browserManager, rateLimiter);
  }

  private createDisabledBrowserActionResult(action: ActionType, target: string, startTime = Date.now()): ActionResult {
    const message = 'X browser actions are disabled. SocialCrabs no longer opens X pages; use opentwitter/TWITTER_TOKEN for read-only collection and xurl/API for publishing.';
    log.warn('Blocked browser-based Twitter/X action', { action, target });
    return this.createErrorResult(action, target, message, startTime);
  }

  /**
   * Check if logged in to Twitter
   */
  async isLoggedIn(): Promise<boolean> {
    log.warn('Blocked browser-based Twitter/X login status check');
    return false;
  }

  /**
   * Login to Twitter (interactive)
   */
  async login(): Promise<boolean> {
    log.warn('Blocked browser-based Twitter/X login');
    return false;
  }

  /**
   * Login with credentials (headless)
   */
  async loginWithCredentials(_username: string, _password: string): Promise<boolean> {
    log.warn('Blocked browser-based Twitter/X credential login');
    return false;
  }

  /**
   * Logout from Twitter
   */
  async logout(): Promise<void> {
    try {
      await this.browserManager.closeContext('twitter');
      log.info('Logged out of Twitter');
    } catch (error) {
      log.error('Error logging out of Twitter', { error: String(error) });
    }
  }

  /**
   * Like a tweet
   */
  async like(payload: LikePayload): Promise<ActionResult> {
    return this.createDisabledBrowserActionResult('like', payload.url);
  }

  /**
   * Reply to a tweet
   */
  async comment(payload: CommentPayload): Promise<ActionResult> {
    return this.createDisabledBrowserActionResult('comment', payload.url);
  }

  /**
   * Follow a Twitter user
   */
  async follow(payload: FollowPayload): Promise<ActionResult> {
    return this.createDisabledBrowserActionResult('follow', payload.username);
  }

  /**
   * Unfollow a Twitter user
   */
  async unfollow(payload: FollowPayload): Promise<ActionResult> {
    return this.createDisabledBrowserActionResult('unfollow', payload.username);
  }

  /**
   * Send a DM on Twitter
   */
  async dm(payload: DMPayload): Promise<ActionResult> {
    return this.createDisabledBrowserActionResult('dm', payload.username);
  }

  /**
   * Post a tweet.
   *
   * Browser-based posting is intentionally disabled. Use the xurl/API path
   * from the CLI queue/scheduler instead, so there is no Playwright click path
   * that can accidentally publish a tweet.
   */
  async post(payload: PostPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const result = createBrowserTweetDisabledResult(payload.text, startTime);
    log.warn('Blocked browser-based Twitter/X tweet posting', { target: result.target });
    return result;
  }

  /**
   * Retweet a tweet
   */
  async retweet(url: string): Promise<ActionResult> {
    return this.createDisabledBrowserActionResult('retweet', url);
  }

  /**
   * Get Twitter profile data
   */
  async getProfile(username: string): Promise<TwitterProfile> {
    log.warn('Blocked browser-based Twitter/X profile lookup', { username });
    return { username };
  }
}
