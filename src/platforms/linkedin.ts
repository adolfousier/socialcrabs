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
  ConnectPayload,
  LinkedInProfile,
} from '../types/index.js';

// LinkedIn selectors (updated for current UI)
const SELECTORS = {
  // Login - multiple selectors for different login page variants
  loginUsername: '#username, input[name="session_key"], input[autocomplete="username"]',
  loginPassword: '#password, input[name="session_password"], input[autocomplete="current-password"]',
  loginButton: 'button[type="submit"], button:has-text("Sign in")',
  
  // Logged in indicators
  navMe: 'button[aria-label*="me"]',
  globalNav: 'nav.global-nav',
  feedSort: 'button[aria-label*="sort"]',
  
  // Post actions
  likeButton: 'button[aria-label*="Like"], span.react-button__text',
  unlikeButton: 'button[aria-pressed="true"][aria-label*="React"]',
  commentButton: 'button[aria-label*="Comment"]',
  commentInput: 'div.ql-editor[data-placeholder*="Add a comment"], div[contenteditable="true"]',
  commentSubmit: 'button.comments-comment-box__submit-button',
  
  // Profile actions
  connectButton: 'button[aria-label*="Connect"]',
  pendingButton: 'button[aria-label*="Pending"]',
  followButton: 'button[aria-label*="Follow"]',
  followingButton: 'button[aria-label*="Following"]',
  messageButton: 'button[aria-label*="Message"]',
  
  // Connection modal
  addNoteButton: 'button[aria-label*="Add a note"]',
  noteInput: 'textarea[name="message"]',
  sendButton: 'button[aria-label*="Send"]',
  
  // DM
  messageInput: 'div.msg-form__contenteditable',
  messageSend: 'button.msg-form__send-button',
  
  // Profile data
  profileName: 'h1.text-heading-xlarge',
  profileHeadline: 'div.text-body-medium',
  profileLocation: 'span.text-body-small',
  connectionCount: 'a[href*="/connections"]',
  aboutSection: 'div.pv-about__summary-text',
  currentCompany: 'div.pv-entity__summary-info h3',
};

export class LinkedInHandler extends BasePlatformHandler {
  private readonly baseUrl = 'https://www.linkedin.com';

  constructor(browserManager: BrowserManager, rateLimiter: RateLimiter) {
    super('linkedin', browserManager, rateLimiter);
  }

  /**
   * Check if logged in to LinkedIn (without navigating away)
   */
  async isLoggedIn(): Promise<boolean> {
    try {
      const page = await this.getPage();
      
      // Primary check: li_at cookie (LinkedIn auth token)
      const cookies = await page.context().cookies();
      const hasAuthCookie = cookies.some(c => c.name === 'li_at');
      if (hasAuthCookie) {
        log.debug('LinkedIn li_at auth cookie found');
        return true;
      }
      
      // Check current URL - must be on feed AND not showing login form
      const url = page.url();
      const isOnLoggedInPage = url.includes('/feed') || url.includes('/mynetwork') || url.includes('/messaging') || url.includes('/in/');
      
      if (isOnLoggedInPage) {
        // Make sure we're not seeing a login prompt
        const hasLoginForm = await this.elementExists('#username, input[name="session_key"]');
        if (!hasLoginForm) {
          log.debug('LinkedIn logged-in URL detected without login form');
          return true;
        }
      }
      
      return false;
    } catch (error) {
      log.error('Error checking LinkedIn login status', { error: String(error) });
      return false;
    }
  }

  /**
   * Login to LinkedIn (interactive)
   */
  async login(): Promise<boolean> {
    try {
      log.info('Starting LinkedIn login...');
      
      await this.navigate(`${this.baseUrl}/login`);
      await this.delay();

      if (await this.isLoggedIn()) {
        log.info('Already logged in to LinkedIn');
        return true;
      }

      const hasLoginForm = await this.waitForElement(SELECTORS.loginUsername, 15000);
      if (!hasLoginForm) {
        log.error('Login form not found');
        return false;
      }

      log.info('LinkedIn login form ready. Please enter credentials manually.');
      log.info('Waiting for login to complete...');

      const startTime = Date.now();
      const timeout = 120000;

      while (Date.now() - startTime < timeout) {
        if (await this.isLoggedIn()) {
          log.info('LinkedIn login successful');
          await this.browserManager.saveSession('linkedin');
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      log.error('LinkedIn login timeout');
      return false;
    } catch (error) {
      log.error('LinkedIn login failed', { error: String(error) });
      return false;
    }
  }

  /**
   * Login with credentials (headless)
   */
  async loginWithCredentials(username: string, password: string): Promise<boolean> {
    try {
      log.info('Starting LinkedIn headless login...');
      
      await this.navigate(`${this.baseUrl}/login`);
      await this.delay();

      if (await this.isLoggedIn()) {
        log.info('Already logged in to LinkedIn');
        return true;
      }

      const page = await this.getPage();
      
      // Take debug screenshot of login page
      await page.screenshot({ path: './sessions/debug-linkedin-form.png' });
      log.info('Login form screenshot saved');
      
      // Try multiple username field selectors
      const usernameSelectors = ['#username', 'input[name="session_key"]', 'input[autocomplete="username"]'];
      let usernameField = null;
      for (const sel of usernameSelectors) {
        if (await this.elementExists(sel)) {
          usernameField = sel;
          log.info(`Found username field: ${sel}`);
          break;
        }
      }
      
      if (!usernameField) {
        log.error('Login form not found - no username field');
        return false;
      }

      // Enter username
      await page.locator(usernameField).first().fill(username);
      log.info('Username entered');
      await this.pause();

      // Try multiple password field selectors
      const passwordSelectors = ['#password', 'input[name="session_password"]', 'input[type="password"]'];
      let passwordField = null;
      for (const sel of passwordSelectors) {
        if (await this.elementExists(sel)) {
          passwordField = sel;
          log.info(`Found password field: ${sel}`);
          break;
        }
      }
      
      if (!passwordField) {
        log.error('Password field not found');
        return false;
      }

      // Enter password
      await page.locator(passwordField).first().fill(password);
      log.info('Password entered');
      await this.pause();

      // Screenshot before login
      await page.screenshot({ path: './sessions/debug-linkedin-before-login.png' });

      // Click login
      const loginSelectors = ['button[type="submit"]', 'button:has-text("Sign in")'];
      for (const sel of loginSelectors) {
        if (await this.elementExists(sel)) {
          log.info(`Clicking login button: ${sel}`);
          await page.locator(sel).first().click();
          break;
        }
      }
      await this.delay();

      // Take screenshot after clicking login
      await page.screenshot({ path: './sessions/debug-linkedin-login.png' });
      log.info('Screenshot saved to ./sessions/debug-linkedin-login.png');

      // Check for MFA/verification page
      const mfaSelectors = [
        'input[name="pin"]',
        'input[id="input__email_verification_pin"]',
        'h1:has-text("verification")',
        'h1:has-text("Verify")',
        'div:has-text("Approve from your")',
        'div:has-text("verify it")',
        'button:has-text("Verify")',
      ];
      
      let mfaDetected = false;
      for (const sel of mfaSelectors) {
        if (await this.elementExists(sel)) {
          mfaDetected = true;
          break;
        }
      }
      
      if (mfaDetected) {
        log.info('🔐 MFA/Verification detected - please approve in your LinkedIn app or enter code');
        await page.screenshot({ path: './sessions/debug-linkedin-mfa.png' });
        log.info('MFA screenshot saved to ./sessions/debug-linkedin-mfa.png');
      }

      // Wait for login (longer timeout for MFA - 2 minutes)
      const startTime = Date.now();
      const timeout = 120000;

      while (Date.now() - startTime < timeout) {
        if (await this.isLoggedIn()) {
          log.info('LinkedIn login successful');
          await this.browserManager.saveSession('linkedin');
          return true;
        }
        
        // Periodic status update
        if ((Date.now() - startTime) % 15000 < 1000) {
          log.info('Waiting for login/MFA approval...', { elapsed: Math.round((Date.now() - startTime) / 1000) });
        }
        
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      await page.screenshot({ path: './sessions/debug-linkedin-timeout.png' });
      log.error('LinkedIn login timeout - check ./sessions/debug-linkedin-timeout.png');
      return false;
    } catch (error) {
      log.error('LinkedIn login failed', { error: String(error) });
      return false;
    }
  }

  /**
   * Logout from LinkedIn
   */
  async logout(): Promise<void> {
    try {
      await this.browserManager.closeContext('linkedin');
      log.info('Logged out of LinkedIn');
    } catch (error) {
      log.error('Error logging out of LinkedIn', { error: String(error) });
    }
  }

  /**
   * Like a LinkedIn post
   */
  async like(payload: LikePayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('like');

    if (!allowed) {
      return this.createErrorResult('like', payload.url, 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Liking LinkedIn post', { url: payload.url });

      await this.navigate(payload.url);
      await this.think();

      // Check if already liked
      if (await this.elementExists(SELECTORS.unlikeButton)) {
        log.info('Post already liked');
        return this.createResult('like', payload.url, startTime, status);
      }

      if (!(await this.elementExists(SELECTORS.likeButton))) {
        return this.createErrorResult('like', payload.url, 'Like button not found', startTime, status);
      }

      await this.clickHuman(SELECTORS.likeButton);
      await this.pause();

      await this.recordAction('like');
      log.info('Successfully liked LinkedIn post');
      return this.createResult('like', payload.url, startTime, status);
    } catch (error) {
      log.error('Error liking LinkedIn post', { error: String(error) });
      return this.createErrorResult('like', payload.url, String(error), startTime, status);
    }
  }

  /**
   * Comment on a LinkedIn post
   */
  async comment(payload: CommentPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('comment');

    if (!allowed) {
      return this.createErrorResult('comment', payload.url, 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Commenting on LinkedIn post', { url: payload.url });

      await this.navigate(payload.url);
      await this.think();

      // Click comment button to expand input
      if (await this.elementExists(SELECTORS.commentButton)) {
        await this.clickHuman(SELECTORS.commentButton);
        await this.pause();
      }

      // Wait for comment input
      if (!(await this.waitForElement(SELECTORS.commentInput, 10000))) {
        return this.createErrorResult('comment', payload.url, 'Comment input not found', startTime, status);
      }

      // Type comment
      await this.clickHuman(SELECTORS.commentInput);
      
      const page = await this.getPage();
      await page.keyboard.type(payload.text, { delay: 50 });
      await this.pause();

      // Submit comment
      if (await this.elementExists(SELECTORS.commentSubmit)) {
        await this.clickHuman(SELECTORS.commentSubmit);
      }

      await this.delay();
      await this.recordAction('comment');
      
      log.info('Successfully commented on LinkedIn post');
      return this.createResult('comment', payload.url, startTime, status);
    } catch (error) {
      log.error('Error commenting on LinkedIn post', { error: String(error) });
      return this.createErrorResult('comment', payload.url, String(error), startTime, status);
    }
  }

  /**
   * Follow a LinkedIn user
   */
  async follow(payload: FollowPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('follow');

    if (!allowed) {
      return this.createErrorResult('follow', payload.username, 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Following LinkedIn user', { username: payload.username });

      const profileUrl = payload.username.startsWith('http')
        ? payload.username
        : `${this.baseUrl}/in/${payload.username}/`;
      
      await this.navigate(profileUrl);
      await this.think();

      // Check if already following
      if (await this.elementExists(SELECTORS.followingButton)) {
        log.info('Already following user');
        return this.createResult('follow', payload.username, startTime, status);
      }

      if (!(await this.elementExists(SELECTORS.followButton))) {
        return this.createErrorResult('follow', payload.username, 'Follow button not found', startTime, status);
      }

      await this.clickHuman(SELECTORS.followButton);
      await this.delay();

      await this.recordAction('follow');
      log.info('Successfully followed LinkedIn user');
      return this.createResult('follow', payload.username, startTime, status);
    } catch (error) {
      log.error('Error following LinkedIn user', { error: String(error) });
      return this.createErrorResult('follow', payload.username, String(error), startTime, status);
    }
  }

  /**
   * Unfollow a LinkedIn user
   */
  async unfollow(payload: FollowPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('follow');

    if (!allowed) {
      return this.createErrorResult('unfollow', payload.username, 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Unfollowing LinkedIn user', { username: payload.username });

      const profileUrl = payload.username.startsWith('http')
        ? payload.username
        : `${this.baseUrl}/in/${payload.username}/`;
      
      await this.navigate(profileUrl);
      await this.think();

      if (!(await this.elementExists(SELECTORS.followingButton))) {
        log.info('Not following user');
        return this.createResult('unfollow', payload.username, startTime, status);
      }

      await this.clickHuman(SELECTORS.followingButton);
      await this.delay();

      await this.recordAction('follow');
      log.info('Successfully unfollowed LinkedIn user');
      return this.createResult('unfollow', payload.username, startTime, status);
    } catch (error) {
      log.error('Error unfollowing LinkedIn user', { error: String(error) });
      return this.createErrorResult('unfollow', payload.username, String(error), startTime, status);
    }
  }

  /**
   * Send a connection request
   */
  async connect(payload: ConnectPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('follow'); // Connect counts against follow limit

    if (!allowed) {
      return this.createErrorResult('connect', payload.profileUrl, 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Sending LinkedIn connection request', { url: payload.profileUrl });

      await this.navigate(payload.profileUrl);
      await this.think();

      // Check if already connected or pending
      if (await this.elementExists(SELECTORS.messageButton)) {
        log.info('Already connected');
        return this.createResult('connect', payload.profileUrl, startTime, status);
      }

      if (await this.elementExists(SELECTORS.pendingButton)) {
        log.info('Connection request already pending');
        return this.createResult('connect', payload.profileUrl, startTime, status);
      }

      if (!(await this.elementExists(SELECTORS.connectButton))) {
        return this.createErrorResult('connect', payload.profileUrl, 'Connect button not found', startTime, status);
      }

      await this.clickHuman(SELECTORS.connectButton);
      await this.pause();

      // Add note if provided
      if (payload.note && await this.elementExists(SELECTORS.addNoteButton)) {
        await this.clickHuman(SELECTORS.addNoteButton);
        await this.pause();

        if (await this.waitForElement(SELECTORS.noteInput, 5000)) {
          const page = await this.getPage();
          await page.fill(SELECTORS.noteInput, payload.note);
          await this.pause();
        }
      }

      // Send connection request
      if (await this.elementExists(SELECTORS.sendButton)) {
        await this.clickHuman(SELECTORS.sendButton);
      }

      await this.delay();
      await this.recordAction('follow');
      
      log.info('Successfully sent LinkedIn connection request');
      return this.createResult('connect', payload.profileUrl, startTime, status);
    } catch (error) {
      log.error('Error sending LinkedIn connection request', { error: String(error) });
      return this.createErrorResult('connect', payload.profileUrl, String(error), startTime, status);
    }
  }

  /**
   * Send a LinkedIn message
   */
  async dm(payload: DMPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('dm');

    if (!allowed) {
      return this.createErrorResult('dm', payload.username, 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Sending LinkedIn message', { username: payload.username });

      const profileUrl = payload.username.startsWith('http')
        ? payload.username
        : `${this.baseUrl}/in/${payload.username}/`;
      
      await this.navigate(profileUrl);
      await this.think();

      // Click message button
      if (!(await this.waitForElement(SELECTORS.messageButton, 10000))) {
        return this.createErrorResult('dm', payload.username, 'Message button not found (not connected?)', startTime, status);
      }

      await this.clickHuman(SELECTORS.messageButton);
      await this.delay();

      // Wait for message input
      if (!(await this.waitForElement(SELECTORS.messageInput, 10000))) {
        return this.createErrorResult('dm', payload.username, 'Message input not found', startTime, status);
      }

      // Type message
      await this.clickHuman(SELECTORS.messageInput);
      
      const page = await this.getPage();
      await page.keyboard.type(payload.message, { delay: 50 });
      await this.pause();

      // Send message
      if (await this.elementExists(SELECTORS.messageSend)) {
        await this.clickHuman(SELECTORS.messageSend);
      }

      await this.delay();
      await this.recordAction('dm');
      
      log.info('Successfully sent LinkedIn message');
      return this.createResult('dm', payload.username, startTime, status);
    } catch (error) {
      log.error('Error sending LinkedIn message', { error: String(error) });
      return this.createErrorResult('dm', payload.username, String(error), startTime, status);
    }
  }

  /**
   * Get LinkedIn profile data
   */
  async getProfile(username: string): Promise<LinkedInProfile> {
    try {
      log.info('Getting LinkedIn profile', { username });

      const profileUrl = username.startsWith('http')
        ? username
        : `${this.baseUrl}/in/${username}/`;
      
      await this.navigate(profileUrl);
      await this.think();

      const profile: LinkedInProfile = {
        username: username.replace(/^.*\/in\/([^/]+).*$/, '$1'),
      };

      // Get full name
      const fullName = await this.getText(SELECTORS.profileName);
      if (fullName) profile.fullName = fullName;

      // Get headline
      const headline = await this.getText(SELECTORS.profileHeadline);
      if (headline) profile.headline = headline;

      // Get location
      const location = await this.getText(SELECTORS.profileLocation);
      if (location) profile.location = location;

      // Get connection count
      const connectionText = await this.getText(SELECTORS.connectionCount);
      if (connectionText) {
        const match = connectionText.match(/(\d+)/);
        if (match) profile.connections = parseInt(match[1], 10);
      }

      // Get about section
      const about = await this.getText(SELECTORS.aboutSection);
      if (about) profile.about = about;

      log.info('Got LinkedIn profile', { profile });
      return profile;
    } catch (error) {
      log.error('Error getting LinkedIn profile', { error: String(error) });
      return { username };
    }
  }
}
