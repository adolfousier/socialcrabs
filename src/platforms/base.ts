import type { Page } from 'playwright';
import { log } from '../utils/logger.js';
import {
  humanDelay,
  quickDelay,
  preTypeDelay,
  postTypeDelay,
  typingDelay,
  thinkingPause,
  sleep,
} from '../utils/delays.js';
import { getNotifier } from '../services/notifier.js';
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
  NotificationPayload,
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
   * Create a successful action result and send notification
   */
  protected createResult(
    action: ActionType,
    target: string,
    startTime: number,
    rateLimit?: RateLimitStatus,
    details?: Record<string, unknown>
  ): ActionResult {
    const result: ActionResult = {
      success: true,
      platform: this.platform,
      action,
      target,
      timestamp: Date.now(),
      duration: Date.now() - startTime,
      rateLimit,
    };
    
    // Send notification asynchronously (don't await)
    this.sendNotification('action:complete', result, details);
    
    return result;
  }

  /**
   * Create a failed action result and send notification
   */
  protected createErrorResult(
    action: ActionType,
    target: string,
    error: string,
    startTime: number,
    rateLimit?: RateLimitStatus
  ): ActionResult {
    const result: ActionResult = {
      success: false,
      platform: this.platform,
      action,
      target,
      error,
      timestamp: Date.now(),
      duration: Date.now() - startTime,
      rateLimit,
    };
    
    // Send notification asynchronously (don't await)
    this.sendNotification('action:error', result);
    
    return result;
  }

  /**
   * Send notification for action result
   * Set CLAWSOCIAL_SILENT=1 to suppress auto-notifications (for CLI --context mode)
   */
  protected async sendNotification(
    event: 'action:complete' | 'action:error',
    result: ActionResult,
    details?: Record<string, unknown>
  ): Promise<void> {
    // Skip if silent mode (CLI will send notification with context)
    if (process.env.CLAWSOCIAL_SILENT === '1') {
      log.debug('Notification skipped - CLAWSOCIAL_SILENT=1');
      return;
    }
    
    try {
      const notifier = getNotifier();
      if (!notifier) return;
      
      const payload: NotificationPayload = {
        event,
        platform: result.platform,
        action: result.action,
        success: result.success,
        target: result.target,
        error: result.error,
        details,
        timestamp: result.timestamp,
      };
      
      await notifier.notify(payload);
    } catch (err) {
      log.debug('Notification send failed', { error: String(err) });
    }
  }

  /**
   * Sanitize comment/reply text before posting.
   * Enforces style rules that LLMs sometimes ignore:
   * - Replaces em-dashes (—) with commas
   * - Replaces en-dashes (–) with hyphens
   */
  protected sanitizeText(text: string): string {
    let sanitized = text;
    // Em-dash → comma (matches VOICE.md absolute ban)
    sanitized = sanitized.replace(/\s*—\s*/g, ', ');
    // En-dash → comma (humans don't use dashes mid-sentence in casual comments)
    sanitized = sanitized.replace(/\s*–\s*/g, ', ');
    // Clean up double commas or comma-period
    sanitized = sanitized.replace(/,\s*,/g, ',');
    sanitized = sanitized.replace(/,\s*\./g, '.');
    // Trim trailing/leading whitespace
    sanitized = sanitized.trim();
    
    if (sanitized !== text) {
      log.info('Text sanitized', { original: text, sanitized });
    }
    
    return sanitized;
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

    try {
      await element.click({ timeout: 5000 });
    } catch (err) {
      // Fallback 1: force click (bypasses overlay interception)
      log.warn(`Click intercepted for ${selector}, retrying with force:true`);
      try {
        await element.click({ force: true, timeout: 5000 });
      } catch {
        // Fallback 2: JS-level dispatchEvent (bypasses all Playwright checks)
        log.warn(`Force click failed for ${selector}, using JS dispatchEvent`);
        await element.evaluate((el) => {
          el.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
        });
      }
    }
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

  /**
   * Warm-up behavior: scroll feed, pause to "read", simulate natural browsing
   * Call this before performing any action on Instagram/LinkedIn
   */
  protected async warmUp(options: {
    scrollCount?: number;
    minPauseMs?: number;
    maxPauseMs?: number;
  } = {}): Promise<void> {
    const {
      scrollCount = 3 + Math.floor(Math.random() * 3), // 3-5 scrolls
      minPauseMs = 2000,
      maxPauseMs = 5000,
    } = options;

    const page = await this.getPage();
    log.info('Starting warm-up browsing behavior...');

    for (let i = 0; i < scrollCount; i++) {
      // Random scroll amount
      const scrollAmount = 200 + Math.floor(Math.random() * 400);
      await page.mouse.wheel(0, scrollAmount);
      
      // Random pause to "read" content
      const pauseTime = minPauseMs + Math.floor(Math.random() * (maxPauseMs - minPauseMs));
      await sleep(pauseTime);
      
      log.debug(`Warm-up scroll ${i + 1}/${scrollCount}, paused ${pauseTime}ms`);
    }

    // Final pause before action
    await this.think();
    log.info('Warm-up complete');
  }

  /**
   * Wait between actions (for multi-action sequences)
   * Use this between DM and comment, etc.
   */
  protected async actionCooldown(minMs: number = 120000, maxMs: number = 180000): Promise<void> {
    const waitTime = minMs + Math.floor(Math.random() * (maxMs - minMs));
    log.info(`Action cooldown: waiting ${Math.round(waitTime / 1000)}s before next action...`);
    await sleep(waitTime);
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
