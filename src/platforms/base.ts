import type { Page } from 'playwright';
import { log as _log } from '../utils/logger.js';
import {
  humanDelay,
  quickDelay,
  preTypeDelay,
  postTypeDelay,
  typingDelay,
  thinkingPause,
  sleep,
} from '../utils/delays.js';
import type { BrowserManager } from '../browser/manager.js';
import type { RateLimiter } from '../utils/rate-limiter.js';
import type {
  Platform,
  ActionType,
  ActionResult,
  LikePayload,
  CommentPayload,
  FollowPayload,
  DMPayload,
  RateLimitStatus,
} from '../types/index.js';

export abstract class BasePlatformHandler {
  protected platform: Platform;
  protected browserManager: BrowserManager;
  protected rateLimiter: RateLimiter;
  protected page: Page | null = null;

  constructor(
    platform: Platform,
    browserManager: BrowserManager,
    rateLimiter: RateLimiter
  ) {
    this.platform = platform;
    this.browserManager = browserManager;
    this.rateLimiter = rateLimiter;
  }

  /**
   * Get the page for this platform
   */
  protected async getPage(): Promise<Page> {
    if (!this.page || this.page.isClosed()) {
      this.page = await this.browserManager.getPage(this.platform);
    }
    return this.page;
  }

  /**
   * Navigate to a URL
   */
  protected async navigate(url: string): Promise<Page> {
    return this.browserManager.navigate(this.platform, url);
  }

  /**
   * Check rate limit and record action if allowed
   */
  protected async checkAndRecordAction(
    action: ActionType
  ): Promise<{ allowed: boolean; status: RateLimitStatus }> {
    const status = await this.rateLimiter.check(this.platform, action);
    return { allowed: status.allowed, status };
  }

  /**
   * Record an action after it completes
   */
  protected async recordAction(action: ActionType): Promise<void> {
    await this.rateLimiter.record(this.platform, action);
  }

  /**
   * Create a successful action result
   */
  protected createResult(
    action: ActionType,
    target: string,
    startTime: number,
    rateLimit?: RateLimitStatus
  ): ActionResult {
    return {
      success: true,
      platform: this.platform,
      action,
      target,
      timestamp: Date.now(),
      duration: Date.now() - startTime,
      rateLimit,
    };
  }

  /**
   * Create a failed action result
   */
  protected createErrorResult(
    action: ActionType,
    target: string,
    error: string,
    startTime: number,
    rateLimit?: RateLimitStatus
  ): ActionResult {
    return {
      success: false,
      platform: this.platform,
      action,
      target,
      error,
      timestamp: Date.now(),
      duration: Date.now() - startTime,
      rateLimit,
    };
  }

  /**
   * Type text character by character with human-like timing
   */
  protected async typeHuman(
    selector: string,
    text: string,
    options: { clear?: boolean; pressEnter?: boolean } = {}
  ): Promise<void> {
    const page = await this.getPage();

    await preTypeDelay();

    const element = await page.locator(selector).first();
    await element.scrollIntoViewIfNeeded();

    if (options.clear) {
      await element.clear();
    }

    // Type character by character
    for (const char of text) {
      await element.pressSequentially(char, { delay: typingDelay() });
    }

    await postTypeDelay();

    if (options.pressEnter) {
      await element.press('Enter');
    }
  }

  /**
   * Click an element with human-like behavior
   */
  protected async clickHuman(
    selector: string,
    options: { scroll?: boolean; delay?: boolean } = { scroll: true, delay: true }
  ): Promise<void> {
    const page = await this.getPage();

    const element = page.locator(selector).first();

    if (options.scroll !== false) {
      await element.scrollIntoViewIfNeeded();
    }

    if (options.delay !== false) {
      await quickDelay();
    }

    await element.click();
  }

  /**
   * Wait for an element to appear
   */
  protected async waitForElement(
    selector: string,
    timeout: number = 10000
  ): Promise<boolean> {
    const page = await this.getPage();
    try {
      await page.locator(selector).first().waitFor({ timeout });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if an element exists
   */
  protected async elementExists(selector: string): Promise<boolean> {
    const page = await this.getPage();
    return (await page.locator(selector).count()) > 0;
  }

  /**
   * Get text content of an element
   */
  protected async getText(selector: string): Promise<string | null> {
    const page = await this.getPage();
    try {
      return await page.locator(selector).first().textContent();
    } catch {
      return null;
    }
  }

  /**
   * Get attribute value of an element
   */
  protected async getAttribute(
    selector: string,
    attribute: string
  ): Promise<string | null> {
    const page = await this.getPage();
    try {
      return await page.locator(selector).first().getAttribute(attribute);
    } catch {
      return null;
    }
  }

  /**
   * Scroll the page
   */
  protected async scroll(direction: 'up' | 'down', amount: number = 300): Promise<void> {
    const page = await this.getPage();
    const delta = direction === 'down' ? amount : -amount;
    await page.mouse.wheel(0, delta);
    await sleep(500);
  }

  /**
   * Add thinking pause before actions
   */
  protected async think(): Promise<void> {
    await thinkingPause();
  }

  /**
   * Add a quick delay between actions
   */
  protected async pause(): Promise<void> {
    await quickDelay();
  }

  /**
   * Add a human-like delay
   */
  protected async delay(): Promise<void> {
    await humanDelay();
  }

  // Abstract methods that must be implemented by each platform
  abstract isLoggedIn(): Promise<boolean>;
  abstract login(): Promise<boolean>;
  abstract logout(): Promise<void>;
  abstract like(payload: LikePayload): Promise<ActionResult>;
  abstract comment(payload: CommentPayload): Promise<ActionResult>;
  abstract follow(payload: FollowPayload): Promise<ActionResult>;
  abstract unfollow(payload: FollowPayload): Promise<ActionResult>;
  abstract dm(payload: DMPayload): Promise<ActionResult>;
  abstract getProfile(username: string): Promise<unknown>;
}
