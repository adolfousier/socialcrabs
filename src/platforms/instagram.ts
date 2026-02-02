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
  InstagramProfile,
} from '../types/index.js';

// Instagram selectors (updated for current Instagram UI)
const SELECTORS = {
  // Login
  loginUsername: 'input[name="username"]',
  loginPassword: 'input[name="password"]',
  loginButton: 'button[type="submit"]',
  loginError: '#slfErrorAlert',
  notNowButton: 'button:has-text("Not Now"), div[role="button"]:has-text("Not now")',
  saveLoginButton: 'button:has-text("Save Info")',
  
  // Profile indicators
  profileIcon: 'svg[aria-label="Home"]',
  loggedInNav: 'nav[role="navigation"]',
  
  // Post interactions
  likeButton: 'svg[aria-label="Like"], span svg[aria-label="Like"]',
  unlikeButton: 'svg[aria-label="Unlike"]',
  commentInput: 'textarea[placeholder*="Add a comment"], textarea[aria-label*="Add a comment"]',
  postButton: 'div[role="button"]:has-text("Post"), button:has-text("Post")',
  
  // Profile page
  followButton: 'button:has-text("Follow"):not(:has-text("Following"))',
  unfollowButton: 'button:has-text("Following")',
  unfollowConfirm: 'button:has-text("Unfollow")',
  messageButton: 'div[role="button"]:has-text("Message")',
  
  // DM
  dmInput: 'textarea[placeholder*="Message"], div[contenteditable="true"][aria-label*="Message"]',
  dmSendButton: 'button[type="submit"] svg, div[role="button"]:has-text("Send")',
  newMessageButton: 'svg[aria-label="New message"]',
  searchUserInput: 'input[placeholder*="Search"]',
  userResult: 'div[role="button"] span',
  nextButton: 'div[role="button"]:has-text("Next")',
  
  // Profile data
  profileUsername: 'header h2',
  profileFullName: 'header section > div:last-child span',
  profileBio: 'header section > div span',
  followerCount: 'a[href*="/followers/"] span, li:has-text("followers") span',
  followingCount: 'a[href*="/following/"] span, li:has-text("following") span',
  postCount: 'li:has-text("posts") span',
  verifiedBadge: 'svg[aria-label="Verified"]',
};

export class InstagramHandler extends BasePlatformHandler {
  private readonly baseUrl = 'https://www.instagram.com';

  constructor(browserManager: BrowserManager, rateLimiter: RateLimiter) {
    super('instagram', browserManager, rateLimiter);
  }

  /**
   * Check if logged in to Instagram
   */
  async isLoggedIn(): Promise<boolean> {
    try {
      await this.navigate(`${this.baseUrl}/`);
      await this.delay();
      
      // Check for logged-in indicators
      const hasNav = await this.elementExists(SELECTORS.loggedInNav);
      const hasProfileIcon = await this.elementExists(SELECTORS.profileIcon);
      
      return hasNav && hasProfileIcon;
    } catch (error) {
      log.error('Error checking Instagram login status', { error: String(error) });
      return false;
    }
  }

  /**
   * Login to Instagram (interactive - requires manual input)
   */
  async login(): Promise<boolean> {
    try {
      log.info('Starting Instagram login...');
      
      await this.navigate(`${this.baseUrl}/accounts/login/`);
      await this.delay();

      // Check if already logged in
      if (await this.isLoggedIn()) {
        log.info('Already logged in to Instagram');
        return true;
      }

      // Wait for login form
      const hasLoginForm = await this.waitForElement(SELECTORS.loginUsername, 15000);
      if (!hasLoginForm) {
        log.error('Login form not found');
        return false;
      }

      log.info('Instagram login form ready. Please enter credentials manually in the browser.');
      log.info('Waiting for login to complete...');

      // Wait for successful login (up to 2 minutes for manual input)
      const startTime = Date.now();
      const timeout = 120000;

      while (Date.now() - startTime < timeout) {
        if (await this.isLoggedIn()) {
          log.info('Instagram login successful');
          await this.browserManager.saveSession('instagram');
          
          // Handle "Save Login Info" popup
          if (await this.elementExists(SELECTORS.saveLoginButton)) {
            await this.clickHuman(SELECTORS.saveLoginButton);
            await this.delay();
          }
          
          // Handle "Turn on Notifications" popup
          if (await this.elementExists(SELECTORS.notNowButton)) {
            await this.clickHuman(SELECTORS.notNowButton);
            await this.delay();
          }
          
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      log.error('Instagram login timeout');
      return false;
    } catch (error) {
      log.error('Instagram login failed', { error: String(error) });
      return false;
    }
  }

  /**
   * Logout from Instagram
   */
  async logout(): Promise<void> {
    try {
      await this.browserManager.closeContext('instagram');
      log.info('Logged out of Instagram');
    } catch (error) {
      log.error('Error logging out of Instagram', { error: String(error) });
    }
  }

  /**
   * Like an Instagram post
   */
  async like(payload: LikePayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('like');

    if (!allowed) {
      return this.createErrorResult('like', payload.url, 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Liking Instagram post', { url: payload.url });

      // Navigate to post
      await this.navigate(payload.url);
      await this.think();

      // Check if already liked
      if (await this.elementExists(SELECTORS.unlikeButton)) {
        log.info('Post already liked');
        return this.createResult('like', payload.url, startTime, status);
      }

      // Find and click like button
      if (!(await this.elementExists(SELECTORS.likeButton))) {
        return this.createErrorResult('like', payload.url, 'Like button not found', startTime, status);
      }

      await this.clickHuman(SELECTORS.likeButton);
      await this.pause();

      // Verify like was successful
      if (await this.elementExists(SELECTORS.unlikeButton)) {
        await this.recordAction('like');
        log.info('Successfully liked Instagram post');
        return this.createResult('like', payload.url, startTime, status);
      }

      return this.createErrorResult('like', payload.url, 'Like action failed', startTime, status);
    } catch (error) {
      log.error('Error liking Instagram post', { error: String(error) });
      return this.createErrorResult('like', payload.url, String(error), startTime, status);
    }
  }

  /**
   * Comment on an Instagram post
   */
  async comment(payload: CommentPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('comment');

    if (!allowed) {
      return this.createErrorResult('comment', payload.url, 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Commenting on Instagram post', { url: payload.url });

      // Navigate to post
      await this.navigate(payload.url);
      await this.think();

      // Find comment input
      if (!(await this.waitForElement(SELECTORS.commentInput, 10000))) {
        return this.createErrorResult('comment', payload.url, 'Comment input not found', startTime, status);
      }

      // Click on comment input to focus
      await this.clickHuman(SELECTORS.commentInput);
      await this.pause();

      // Type comment
      await this.typeHuman(SELECTORS.commentInput, payload.text);
      await this.pause();

      // Submit comment
      const page = await this.getPage();
      const postButton = page.locator(SELECTORS.postButton).first();
      
      if (await postButton.isVisible()) {
        await postButton.click();
      } else {
        // Try pressing Enter as fallback
        await page.keyboard.press('Enter');
      }

      await this.delay();
      await this.recordAction('comment');
      
      log.info('Successfully commented on Instagram post');
      return this.createResult('comment', payload.url, startTime, status);
    } catch (error) {
      log.error('Error commenting on Instagram post', { error: String(error) });
      return this.createErrorResult('comment', payload.url, String(error), startTime, status);
    }
  }

  /**
   * Follow an Instagram user
   */
  async follow(payload: FollowPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('follow');

    if (!allowed) {
      return this.createErrorResult('follow', payload.username, 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Following Instagram user', { username: payload.username });

      // Navigate to user profile
      const profileUrl = `${this.baseUrl}/${payload.username}/`;
      await this.navigate(profileUrl);
      await this.think();

      // Check if already following
      if (await this.elementExists(SELECTORS.unfollowButton)) {
        log.info('Already following user');
        return this.createResult('follow', payload.username, startTime, status);
      }

      // Find and click follow button
      if (!(await this.elementExists(SELECTORS.followButton))) {
        return this.createErrorResult('follow', payload.username, 'Follow button not found', startTime, status);
      }

      await this.clickHuman(SELECTORS.followButton);
      await this.delay();

      // Verify follow was successful
      if (await this.elementExists(SELECTORS.unfollowButton)) {
        await this.recordAction('follow');
        log.info('Successfully followed Instagram user');
        return this.createResult('follow', payload.username, startTime, status);
      }

      return this.createErrorResult('follow', payload.username, 'Follow action failed', startTime, status);
    } catch (error) {
      log.error('Error following Instagram user', { error: String(error) });
      return this.createErrorResult('follow', payload.username, String(error), startTime, status);
    }
  }

  /**
   * Unfollow an Instagram user
   */
  async unfollow(payload: FollowPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('follow');

    if (!allowed) {
      return this.createErrorResult('unfollow', payload.username, 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Unfollowing Instagram user', { username: payload.username });

      // Navigate to user profile
      const profileUrl = `${this.baseUrl}/${payload.username}/`;
      await this.navigate(profileUrl);
      await this.think();

      // Check if not following
      if (!(await this.elementExists(SELECTORS.unfollowButton))) {
        log.info('Not following user');
        return this.createResult('unfollow', payload.username, startTime, status);
      }

      // Click following button
      await this.clickHuman(SELECTORS.unfollowButton);
      await this.pause();

      // Confirm unfollow
      if (await this.waitForElement(SELECTORS.unfollowConfirm, 5000)) {
        await this.clickHuman(SELECTORS.unfollowConfirm);
        await this.delay();
      }

      // Verify unfollow was successful
      if (await this.elementExists(SELECTORS.followButton)) {
        await this.recordAction('follow');
        log.info('Successfully unfollowed Instagram user');
        return this.createResult('unfollow', payload.username, startTime, status);
      }

      return this.createErrorResult('unfollow', payload.username, 'Unfollow action failed', startTime, status);
    } catch (error) {
      log.error('Error unfollowing Instagram user', { error: String(error) });
      return this.createErrorResult('unfollow', payload.username, String(error), startTime, status);
    }
  }

  /**
   * Send a direct message on Instagram
   */
  async dm(payload: DMPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('dm');

    if (!allowed) {
      return this.createErrorResult('dm', payload.username, 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Sending Instagram DM', { username: payload.username });

      // Navigate to user profile first
      const profileUrl = `${this.baseUrl}/${payload.username}/`;
      await this.navigate(profileUrl);
      await this.think();

      // Click message button
      if (!(await this.waitForElement(SELECTORS.messageButton, 10000))) {
        return this.createErrorResult('dm', payload.username, 'Message button not found', startTime, status);
      }

      await this.clickHuman(SELECTORS.messageButton);
      await this.delay();

      // Wait for DM input
      if (!(await this.waitForElement(SELECTORS.dmInput, 10000))) {
        return this.createErrorResult('dm', payload.username, 'DM input not found', startTime, status);
      }

      // Type message
      await this.clickHuman(SELECTORS.dmInput);
      await this.typeHuman(SELECTORS.dmInput, payload.message);
      await this.pause();

      // Send message
      const page = await this.getPage();
      await page.keyboard.press('Enter');
      
      await this.delay();
      await this.recordAction('dm');
      
      log.info('Successfully sent Instagram DM');
      return this.createResult('dm', payload.username, startTime, status);
    } catch (error) {
      log.error('Error sending Instagram DM', { error: String(error) });
      return this.createErrorResult('dm', payload.username, String(error), startTime, status);
    }
  }

  /**
   * Get Instagram profile data
   */
  async getProfile(username: string): Promise<InstagramProfile> {
    try {
      log.info('Getting Instagram profile', { username });

      const profileUrl = `${this.baseUrl}/${username}/`;
      await this.navigate(profileUrl);
      await this.think();

      // Extract profile data
      const profile: InstagramProfile = {
        username,
      };

      // Get full name
      const fullName = await this.getText('header section > div:first-child span');
      if (fullName) profile.fullName = fullName;

      // Get bio
      const bio = await this.getText('header section > div:last-child span');
      if (bio && bio !== fullName) profile.bio = bio;

      // Get follower count
      const followerText = await this.getText(SELECTORS.followerCount);
      if (followerText) {
        profile.followers = this.parseCount(followerText);
      }

      // Get following count
      const followingText = await this.getText(SELECTORS.followingCount);
      if (followingText) {
        profile.following = this.parseCount(followingText);
      }

      // Get post count
      const postText = await this.getText(SELECTORS.postCount);
      if (postText) {
        profile.posts = this.parseCount(postText);
      }

      // Check if verified
      profile.isVerified = await this.elementExists(SELECTORS.verifiedBadge);

      // Check if private
      profile.isPrivate = await this.elementExists('h2:has-text("This Account is Private")');

      log.info('Got Instagram profile', { profile });
      return profile;
    } catch (error) {
      log.error('Error getting Instagram profile', { error: String(error) });
      return { username };
    }
  }

  /**
   * Parse count strings like "1.5M", "10K", "1,234"
   */
  private parseCount(text: string): number {
    const cleaned = text.replace(/,/g, '').trim();
    const match = cleaned.match(/^([\d.]+)([KMB])?$/i);
    
    if (!match) return 0;
    
    let num = parseFloat(match[1]);
    const suffix = match[2]?.toUpperCase();
    
    if (suffix === 'K') num *= 1000;
    else if (suffix === 'M') num *= 1000000;
    else if (suffix === 'B') num *= 1000000000;
    
    return Math.round(num);
  }
}
