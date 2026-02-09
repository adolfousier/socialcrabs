import { chromium, Browser, BrowserContext, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import { log } from '../utils/logger.js';
import { pageLoadDelay } from '../utils/delays.js';
import type { Platform, BrowserConfig, Session } from '../types/index.js';

export class BrowserManager {
  private browser: Browser | null = null;
  private contexts: Map<Platform, BrowserContext> = new Map();
  private pages: Map<Platform, Page> = new Map();
  private config: BrowserConfig;
  private sessionDir: string;

  constructor(config: BrowserConfig, sessionDir: string) {
    this.config = config;
    this.sessionDir = sessionDir;

    // Ensure directories exist
    if (!fs.existsSync(config.dataDir)) {
      fs.mkdirSync(config.dataDir, { recursive: true });
    }
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
  }

  /**
   * Initialize the browser
   */
  async initialize(): Promise<void> {
    if (this.browser) {
      log.warn('Browser already initialized');
      return;
    }

    log.info('Launching browser...', {
      headless: this.config.headless,
      dataDir: this.config.dataDir,
    });

    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-infobars',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1280,720',
      ],
    });

    log.info('Browser launched successfully');
  }

  /**
   * Get or create a browser context for a platform
   */
  async getContext(platform: Platform): Promise<BrowserContext> {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    let context = this.contexts.get(platform);
    if (context) {
      return context;
    }

    log.info(`Creating browser context for ${platform}`);

    const contextDir = path.join(this.config.dataDir, platform);
    if (!fs.existsSync(contextDir)) {
      fs.mkdirSync(contextDir, { recursive: true });
    }

    context = await this.browser.newContext({
      viewport: this.config.viewport,
      userAgent: this.config.userAgent || this.getDefaultUserAgent(),
      locale: 'en-US',
      timezoneId: 'America/New_York',
      permissions: ['geolocation'],
      geolocation: { latitude: 40.7128, longitude: -74.006 },
      storageState: undefined,
    });

    // Apply stealth modifications
    await this.applyStealthMode(context);

    // Restore session if available
    await this.restoreSession(platform, context);

    this.contexts.set(platform, context);
    log.info(`Browser context created for ${platform}`);

    return context;
  }

  /**
   * Get or create a page for a platform
   */
  async getPage(platform: Platform): Promise<Page> {
    let page = this.pages.get(platform);
    if (page && !page.isClosed()) {
      return page;
    }

    const context = await this.getContext(platform);
    page = await context.newPage();

    // Set default timeout
    page.setDefaultTimeout(this.config.timeout);

    this.pages.set(platform, page);
    return page;
  }

  /**
   * Navigate to a URL with human-like behavior
   */
  async navigate(platform: Platform, url: string): Promise<Page> {
    const page = await this.getPage(platform);

    log.debug(`Navigating to ${url}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (error) {
      log.warn(`Navigation timeout/error for ${url}, retrying with networkidle...`, { error: String(error) });
      // Try again with longer timeout and different wait strategy
      await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
    }
    log.debug(`Navigation complete: ${page.url()}`);
    await pageLoadDelay();

    return page;
  }

  /**
   * Save session (cookies) for a platform
   */
  async saveSession(platform: Platform): Promise<void> {
    const context = this.contexts.get(platform);
    if (!context) {
      log.warn(`No context found for ${platform}`);
      return;
    }

    const cookies = await context.cookies();

    // Guard: don't save logged-out sessions over good ones
    const criticalCookies: Record<string, string> = {
      linkedin: 'li_at',
      twitter: 'auth_token',
      instagram: 'sessionid',
    };
    const requiredCookie = criticalCookies[platform];
    if (requiredCookie && !cookies.some((c) => c.name === requiredCookie && c.value)) {
      log.warn(`Skipping session save for ${platform} — missing ${requiredCookie} cookie (logged out)`);
      return;
    }

    const localStorage = await this.getLocalStorage(platform);

    const session: Session = {
      platform,
      cookies: cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite as 'Strict' | 'Lax' | 'None' | undefined,
      })),
      localStorage,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const sessionPath = path.join(this.sessionDir, `${platform}.json`);
    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
    log.info(`Session saved for ${platform}`);
  }

  /**
   * Restore session for a platform
   */
  private async restoreSession(
    platform: Platform,
    context: BrowserContext
  ): Promise<boolean> {
    const sessionPath = path.join(this.sessionDir, `${platform}.json`);

    if (!fs.existsSync(sessionPath)) {
      log.debug(`No session found for ${platform}`);
      return false;
    }

    try {
      const sessionData = fs.readFileSync(sessionPath, 'utf-8');
      const session: Session = JSON.parse(sessionData);

      // Check if session is too old (7 days)
      const maxAge = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - session.updatedAt > maxAge) {
        log.warn(`Session expired for ${platform}`);
        return false;
      }

      // Restore cookies
      await context.addCookies(
        session.cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          expires: c.expires,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite: c.sameSite,
        }))
      );

      log.info(`Session restored for ${platform}`);
      return true;
    } catch (error) {
      log.error(`Failed to restore session for ${platform}`, {
        error: String(error),
      });
      return false;
    }
  }

  /**
   * Get localStorage data from a page
   */
  private async getLocalStorage(platform: Platform): Promise<Record<string, string>> {
    const page = this.pages.get(platform);
    if (!page || page.isClosed()) {
      return {};
    }

    try {
      return await page.evaluate(() => {
        const data: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            const value = localStorage.getItem(key);
            if (value) {
              data[key] = value;
            }
          }
        }
        return data;
      });
    } catch {
      return {};
    }
  }

  /**
   * Apply stealth mode to avoid detection
   */
  private async applyStealthMode(context: BrowserContext): Promise<void> {
    await context.addInitScript(`
      // Override webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Override chrome property
      window.chrome = { runtime: {} };

      // Override permissions
      const originalQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (parameters) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: 'denied', onchange: null })
          : originalQuery(parameters);

      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      // Override platform
      Object.defineProperty(navigator, 'platform', {
        get: () => 'Win32',
      });

      // Hide automation indicators
      delete window.__playwright;
      delete window.__pw_manual;
    `);
  }

  /**
   * Get default user agent
   */
  private getDefaultUserAgent(): string {
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }

  /**
   * Close a specific platform context
   */
  async closeContext(platform: Platform): Promise<void> {
    const page = this.pages.get(platform);
    if (page && !page.isClosed()) {
      await page.close();
    }
    this.pages.delete(platform);

    const context = this.contexts.get(platform);
    if (context) {
      await context.close();
    }
    this.contexts.delete(platform);

    log.info(`Closed context for ${platform}`);
  }

  /**
   * Shutdown the browser completely
   */
  async shutdown(): Promise<void> {
    log.info('Shutting down browser...');

    // Save all sessions before closing
    for (const platform of this.contexts.keys()) {
      await this.saveSession(platform);
    }

    // Close all pages
    for (const page of this.pages.values()) {
      if (!page.isClosed()) {
        await page.close();
      }
    }
    this.pages.clear();

    // Close all contexts
    for (const context of this.contexts.values()) {
      await context.close();
    }
    this.contexts.clear();

    // Close browser
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    log.info('Browser shutdown complete');
  }

  /**
   * Check if browser is running
   */
  isRunning(): boolean {
    return this.browser !== null && this.browser.isConnected();
  }

  /**
   * Take a screenshot of a platform page
   */
  async screenshot(platform: Platform, outputPath?: string): Promise<Buffer> {
    const page = await this.getPage(platform);
    const buffer = await page.screenshot({
      path: outputPath,
      fullPage: false,
    });
    return buffer;
  }
}
