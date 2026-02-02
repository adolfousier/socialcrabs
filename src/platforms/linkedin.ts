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
  // Login
  loginUsername: '#username',
  loginPassword: '#password',
  loginButton: 'button[type="submit"]',
  
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
   * Check if logged in to LinkedIn
   */
  async isLoggedIn(): Promise<boolean> {
    try {
      await this.navigate(`${this.baseUrl}/feed/`);
      await this.delay();
      
      const hasNav = await this.elementExists(SELECTORS.globalNav);
      const hasFeed = await this.elementExists(SELECTORS.feedSort);
      
      return hasNav || hasFeed;
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
