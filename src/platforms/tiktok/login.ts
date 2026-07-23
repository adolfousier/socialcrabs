/**
 * TikTok Login Handler
 * Handles TikTok authentication with anti-bot measures
 */

import type { BrowserManager } from '../../browser/manager.js';
import { log } from '../../utils/logger.js';
import {
  quickDelay,
  preTypeDelay,
  postTypeDelay,
  typingDelay,
  sleep,
} from '../../utils/delays.js';

export class TikTokLoginHandler {
  private browserManager: BrowserManager;

  constructor(browserManager: BrowserManager) {
    this.browserManager = browserManager;
  }

  /**
   * Perform login via username/email + password
   */
  async performLogin(
    page: any,
    username?: string,
    password?: string
  ): Promise<boolean> {
    log.info(`TikTokLogin: Starting login for ${username}`);

    try {
      // Wait for page to load
      await page.waitForLoadState('networkidle', { timeout: 15000 });
      await sleep(2000);

      // Handle cookie consent if shown
      await this.acceptCookies(page);

      // Detect which login option is available
      const loginMethod = await this.detectLoginMethod(page);

      if (loginMethod === 'email') {
        if (!username || !password) {
          log.warn('TikTokLogin: Email login requires username and password');
          return false;
        }
        return await this.loginWithEmail(page, username, password);
      } else if (loginMethod === 'qr') {
        log.info('TikTokLogin: QR code login detected - manual scan required');
        return await this.loginWithQR(page);
      }

      log.warn('TikTokLogin: No supported login method found');
      return false;
    } catch (err) {
      log.error(`TikTokLogin: Login failed - ${String(err)}`);
      return false;
    }
  }

  /**
   * Detect available login methods on TikTok
   */
  private async detectLoginMethod(page: any): Promise<'email' | 'qr' | 'none'> {
    try {
      // Look for email/username login tab
      const emailTab = await page.locator('text=Use phone / email / username').count();
      const phoneTab = await page.locator('text=Use phone / email').count();
      const usernameInput = await page.locator('input[name="username"], input[autocomplete="username"]').count();

      if (emailTab > 0 || phoneTab > 0 || usernameInput > 0) {
        return 'email';
      }

      // Look for QR code option
      const qrTab = await page.locator('text=Use QR code').count();
      if (qrTab > 0) {
        return 'qr';
      }

      return 'none';
    } catch {
      return 'none';
    }
  }

  /**
   * Accept cookie consent banner
   */
  private async acceptCookies(page: any): Promise<void> {
    try {
      const acceptBtn = page.locator('button:has-text("Accept"), button:has-text("Accept all")');
      if (await acceptBtn.count() > 0) {
        await acceptBtn.first().click();
        await sleep(1000);
        log.debug('TikTokLogin: Cookie consent accepted');
      }
    } catch {
      // No cookie banner
    }
  }

  /**
   * Login with email/username + password
   */
  private async loginWithEmail(
    page: any,
    username: string,
    password: string
  ): Promise<boolean> {
    log.info('TikTokLogin: Using email/username login');

    try {
      // Click email/username tab if shown
      const emailTab = await page.locator('text=Use phone / email / username');
      if (await emailTab.count() > 0) {
        await emailTab.click();
        await sleep(1500);
      }

      // Wait for username input
      await page.waitForSelector('input[name="username"], input[autocomplete="username"]', {
        timeout: 10000,
      });

      // Type username with human-like timing
      await this.typeHuman('input[name="username"], input[autocomplete="username"]', username);

      await sleep(800);

      // Click next/continue
      await this.clickElement('button[type="submit"], div[role="button"]:has-text("Next")');
      await sleep(2500);

      // Check for phone verification (TikTok sometimes asks for phone after username)
      const phoneInput = await page.locator('input[type="tel"], input[autocomplete="tel-national"]');
      if (await phoneInput.count() > 0) {
        log.info('TikTokLogin: Phone verification required after username');
        // For now, return false - phone verification needs separate handling
        return false;
      }

      // Wait for password input
      await page.waitForSelector('input[name="password"], input[type="password"]', {
        timeout: 10000,
      });

      // Type password with human-like timing
      await this.typeHuman('input[name="password"], input[type="password"]', password);

      await sleep(800);

      // Submit
      await this.clickElement('button[type="submit"], div[role="button"]:has-text("Log in")');
      await sleep(3000);

      // Handle 2FA if present
      if (await this.handle2FA(page)) {
        log.info('TikTokLogin: 2FA required - manual code entry needed');
        return false;
      }

      // Check for CAPTCHA
      if (await this.detectCAPTCHA(page)) {
        log.warn('TikTokLogin: CAPTCHA detected - manual resolution required');
        return false;
      }

      // Verify login success
      const currentUrl = page.url();
      const isLoggedIn = !currentUrl.includes('/login');

      if (isLoggedIn) {
        log.info('TikTokLogin: Login successful');
        return true;
      }

      // Check for error message
      const errorMsg = await this.getErrorMessage(page);
      if (errorMsg) {
        log.warn(`TikTokLogin: Login error - ${errorMsg}`);
      }

      return false;
    } catch (err) {
      log.error(`TikTokLogin: Email login failed - ${String(err)}`);
      return false;
    }
  }

  /**
   * Login with QR code (manual scan required)
   */
  private async loginWithQR(page: any): Promise<boolean> {
    log.info('TikTokLogin: QR code login');

    try {
      const qrTab = page.locator('text=Use QR code');
      if (await qrTab.count() > 0) {
        await qrTab.click();
        await sleep(2000);
      }

      // Wait for QR code to appear
      const qrImg = await page.waitForSelector('img[alt="QR Code"]', { timeout: 10000 });
      if (qrImg) {
        // Save QR code screenshot for user to scan
        await qrImg.screenshot({ path: 'tiktok_qr.png' });
        log.info('TikTokLogin: QR code saved to tiktok_qr.png - scan with TikTok app');

        // Poll for login completion (2 min timeout)
        for (let i = 0; i < 60; i++) {
          await sleep(2000);

          const loginLink = await page.locator('a[href*="/login"]').count();
          if (loginLink === 0) {
            log.info('TikTokLogin: QR scan successful');
            return true;
          }
        }

        log.warn('TikTokLogin: QR scan timeout (2 minutes)');
      }

      return false;
    } catch (err) {
      log.error(`TikTokLogin: QR login failed - ${String(err)}`);
      return false;
    }
  }

  /**
   * Handle 2FA/Two-factor authentication
   */
  private async handle2FA(page: any): Promise<boolean> {
    try {
      // Look for 6-digit OTP input
      const otpInput = await page.locator('input[maxlength="6"], input[aria-label*="code"]');
      if (await otpInput.count() > 0) {
        log.info('TikTokLogin: 2FA code input detected');
        // 2FA requires manual code entry or external service
        // For automated flow, this would need integration with
        // an authenticator app or SMS service
        return true;
      }

      // Look for "We sent you an email" message
      const emailMsg = await page.locator('text=We sent you an email').count();
      if (emailMsg > 0) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Detect CAPTCHA challenge
   */
  private detectCAPTCHA(page: any): Promise<boolean> {
    return page.locator('text=verify you are human, text=Prove you are human').count().then((c: any) => c > 0);
  }

  /**
   * Get login error message from page
   */
  private async getErrorMessage(page: any): Promise<string | null> {
    try {
      const errorSelectors = [
        'p[data-e2e="login-error"]',
        'div[role="alert"]',
        'text=Incorrect username',
        'text=Incorrect password',
        'text=Account does not exist',
        'text=Too many attempts',
      ];

      for (const selector of errorSelectors) {
        const el = await page.locator(selector).first();
        if (await el.count() > 0) {
          const text = await el.textContent();
          if (text && text.trim()) {
            return text.trim();
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Type text character by character with human timing
   */
  private async typeHuman(selector: string, text: string): Promise<void> {
    const element = await this.browserManager.getPage('tiktok');
    const locator = element.locator(selector).first();

    await locator.scrollIntoViewIfNeeded();
    await preTypeDelay();
    await locator.click();

    for (const char of text) {
      await locator.pressSequentially(char, { delay: typingDelay() });
    }

    await postTypeDelay();
  }

  /**
   * Click element with fallback strategies
   */
  private async clickElement(selector: string): Promise<void> {
    const element = await this.browserManager.getPage('tiktok');
    const locator = element.locator(selector).first();

    await locator.scrollIntoViewIfNeeded();
    await quickDelay();

    try {
      await locator.click({ timeout: 5000 });
    } catch {
      // Fallback: JS-level click
      await locator.evaluate((el: any) => {
        el.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
      });
    }
  }
}
