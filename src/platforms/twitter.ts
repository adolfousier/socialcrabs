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
} from '../types/index.js';

// Twitter/X selectors (updated for current UI)
const SELECTORS = {
  // Login
  loginUsername: 'input[autocomplete="username"]',
  loginPassword: 'input[type="password"]',
  loginButton: 'div[role="button"]:has-text("Log in")',
  nextButton: 'div[role="button"]:has-text("Next")',
  
  // Logged in indicators
  homeTimeline: 'div[aria-label="Timeline: Your Home Timeline"]',
  navHome: 'a[aria-label="Home"]',
  primaryNav: 'nav[role="navigation"]',
  
  // Tweet actions
  likeButton: 'div[data-testid="like"]',
  unlikeButton: 'div[data-testid="unlike"]',
  retweetButton: 'div[data-testid="retweet"]',
  unretweet: 'div[data-testid="unretweet"]',
  retweetConfirm: 'div[role="menuitem"]:has-text("Repost")',
  replyButton: 'div[data-testid="reply"]',
  shareButton: 'div[data-testid="share"]',
  
  // Compose
  tweetInput: 'div[data-testid="tweetTextarea_0"]',
  replyInput: 'div[data-testid="tweetTextarea_0"]',
  tweetButton: 'div[data-testid="tweetButtonInline"]',
  composeTweet: 'a[data-testid="SideNav_NewTweet_Button"]',
  
  // Profile
  followButton: 'div[data-testid="placementTracking"] div[role="button"]:has-text("Follow")',
  unfollowButton: 'div[data-testid="placementTracking"] div[role="button"][aria-label*="Following"]',
  unfollowConfirm: 'div[role="button"][data-testid="confirmationSheetConfirm"]',
  
  // DM
  dmButton: 'div[data-testid="sendDMFromProfile"]',
  dmInput: 'div[data-testid="dmComposerTextInput"]',
  dmSendButton: 'div[data-testid="dmComposerSendButton"]',
  
  // Profile data
  profileName: 'div[data-testid="UserName"] span',
  profileBio: 'div[data-testid="UserDescription"]',
  profileLocation: 'span[data-testid="UserLocation"]',
  profileWebsite: 'a[data-testid="UserUrl"]',
  followersCount: 'a[href$="/verified_followers"] span, a[href$="/followers"] span',
  followingCount: 'a[href$="/following"] span',
  verifiedBadge: 'svg[data-testid="icon-verified"]',
};

export class TwitterHandler extends BasePlatformHandler {
  private readonly baseUrl = 'https://x.com';

  constructor(browserManager: BrowserManager, rateLimiter: RateLimiter) {
    super('twitter', browserManager, rateLimiter);
  }

  /**
   * Check if logged in to Twitter
   */
  async isLoggedIn(): Promise<boolean> {
    try {
      await this.navigate(`${this.baseUrl}/home`);
      await this.delay();
      
      const hasTimeline = await this.elementExists(SELECTORS.homeTimeline);
      const hasNav = await this.elementExists(SELECTORS.primaryNav);
      
      return hasTimeline || hasNav;
    } catch (error) {
      log.error('Error checking Twitter login status', { error: String(error) });
      return false;
    }
  }

  /**
   * Login to Twitter (interactive)
   */
  async login(): Promise<boolean> {
    try {
      log.info('Starting Twitter login...');
      
      await this.navigate(`${this.baseUrl}/login`);
      await this.delay();

      if (await this.isLoggedIn()) {
        log.info('Already logged in to Twitter');
        return true;
      }

      const hasLoginForm = await this.waitForElement(SELECTORS.loginUsername, 15000);
      if (!hasLoginForm) {
        log.error('Login form not found');
        return false;
      }

      log.info('Twitter login form ready. Please enter credentials manually.');
      log.info('Waiting for login to complete...');

      const startTime = Date.now();
      const timeout = 120000;

      while (Date.now() - startTime < timeout) {
        if (await this.isLoggedIn()) {
          log.info('Twitter login successful');
          await this.browserManager.saveSession('twitter');
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      log.error('Twitter login timeout');
      return false;
    } catch (error) {
      log.error('Twitter login failed', { error: String(error) });
      return false;
    }
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
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('like');

    if (!allowed) {
      return this.createErrorResult('like', payload.url, 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Liking tweet', { url: payload.url });

      await this.navigate(payload.url);
      await this.think();

      // Check if already liked
      if (await this.elementExists(SELECTORS.unlikeButton)) {
        log.info('Tweet already liked');
        return this.createResult('like', payload.url, startTime, status);
      }

      if (!(await this.elementExists(SELECTORS.likeButton))) {
        return this.createErrorResult('like', payload.url, 'Like button not found', startTime, status);
      }

      await this.clickHuman(SELECTORS.likeButton);
      await this.pause();

      if (await this.elementExists(SELECTORS.unlikeButton)) {
        await this.recordAction('like');
        log.info('Successfully liked tweet');
        return this.createResult('like', payload.url, startTime, status);
      }

      return this.createErrorResult('like', payload.url, 'Like action failed', startTime, status);
    } catch (error) {
      log.error('Error liking tweet', { error: String(error) });
      return this.createErrorResult('like', payload.url, String(error), startTime, status);
    }
  }

  /**
   * Reply to a tweet
   */
  async comment(payload: CommentPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('comment');

    if (!allowed) {
      return this.createErrorResult('comment', payload.url, 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Replying to tweet', { url: payload.url });

      await this.navigate(payload.url);
      await this.think();

      // Click reply button
      if (!(await this.waitForElement(SELECTORS.replyButton, 10000))) {
        return this.createErrorResult('comment', payload.url, 'Reply button not found', startTime, status);
      }

      await this.clickHuman(SELECTORS.replyButton);
      await this.pause();

      // Wait for reply input
      if (!(await this.waitForElement(SELECTORS.replyInput, 10000))) {
        return this.createErrorResult('comment', payload.url, 'Reply input not found', startTime, status);
      }

      // Type reply
      await this.clickHuman(SELECTORS.replyInput);
      
      const page = await this.getPage();
      await page.keyboard.type(payload.text, { delay: 50 });
      await this.pause();

      // Submit reply
      if (await this.elementExists(SELECTORS.tweetButton)) {
        await this.clickHuman(SELECTORS.tweetButton);
      }

      await this.delay();
      await this.recordAction('comment');
      
      log.info('Successfully replied to tweet');
      return this.createResult('comment', payload.url, startTime, status);
    } catch (error) {
      log.error('Error replying to tweet', { error: String(error) });
      return this.createErrorResult('comment', payload.url, String(error), startTime, status);
    }
  }

  /**
   * Follow a Twitter user
   */
  async follow(payload: FollowPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('follow');

    if (!allowed) {
      return this.createErrorResult('follow', payload.username, 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Following Twitter user', { username: payload.username });

      const profileUrl = `${this.baseUrl}/${payload.username}`;
      await this.navigate(profileUrl);
      await this.think();

      // Check if already following
      if (await this.elementExists(SELECTORS.unfollowButton)) {
        log.info('Already following user');
        return this.createResult('follow', payload.username, startTime, status);
      }

      if (!(await this.elementExists(SELECTORS.followButton))) {
        return this.createErrorResult('follow', payload.username, 'Follow button not found', startTime, status);
      }

      await this.clickHuman(SELECTORS.followButton);
      await this.delay();

      if (await this.elementExists(SELECTORS.unfollowButton)) {
        await this.recordAction('follow');
        log.info('Successfully followed Twitter user');
        return this.createResult('follow', payload.username, startTime, status);
      }

      return this.createErrorResult('follow', payload.username, 'Follow action failed', startTime, status);
    } catch (error) {
      log.error('Error following Twitter user', { error: String(error) });
      return this.createErrorResult('follow', payload.username, String(error), startTime, status);
    }
  }

  /**
   * Unfollow a Twitter user
   */
  async unfollow(payload: FollowPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('follow');

    if (!allowed) {
      return this.createErrorResult('unfollow', payload.username, 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Unfollowing Twitter user', { username: payload.username });

      const profileUrl = `${this.baseUrl}/${payload.username}`;
      await this.navigate(profileUrl);
      await this.think();

      if (!(await this.elementExists(SELECTORS.unfollowButton))) {
        log.info('Not following user');
        return this.createResult('unfollow', payload.username, startTime, status);
      }

      await this.clickHuman(SELECTORS.unfollowButton);
      await this.pause();

      // Confirm unfollow
      if (await this.waitForElement(SELECTORS.unfollowConfirm, 5000)) {
        await this.clickHuman(SELECTORS.unfollowConfirm);
        await this.delay();
      }

      if (await this.elementExists(SELECTORS.followButton)) {
        await this.recordAction('follow');
        log.info('Successfully unfollowed Twitter user');
        return this.createResult('unfollow', payload.username, startTime, status);
      }

      return this.createErrorResult('unfollow', payload.username, 'Unfollow action failed', startTime, status);
    } catch (error) {
      log.error('Error unfollowing Twitter user', { error: String(error) });
      return this.createErrorResult('unfollow', payload.username, String(error), startTime, status);
    }
  }

  /**
   * Send a DM on Twitter
   */
  async dm(payload: DMPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('dm');

    if (!allowed) {
      return this.createErrorResult('dm', payload.username, 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Sending Twitter DM', { username: payload.username });

      const profileUrl = `${this.baseUrl}/${payload.username}`;
      await this.navigate(profileUrl);
      await this.think();

      // Click DM button
      if (!(await this.waitForElement(SELECTORS.dmButton, 10000))) {
        return this.createErrorResult('dm', payload.username, 'DM button not found', startTime, status);
      }

      await this.clickHuman(SELECTORS.dmButton);
      await this.delay();

      // Wait for DM input
      if (!(await this.waitForElement(SELECTORS.dmInput, 10000))) {
        return this.createErrorResult('dm', payload.username, 'DM input not found', startTime, status);
      }

      // Type message
      await this.clickHuman(SELECTORS.dmInput);
      
      const page = await this.getPage();
      await page.keyboard.type(payload.message, { delay: 50 });
      await this.pause();

      // Send message
      if (await this.elementExists(SELECTORS.dmSendButton)) {
        await this.clickHuman(SELECTORS.dmSendButton);
      }

      await this.delay();
      await this.recordAction('dm');
      
      log.info('Successfully sent Twitter DM');
      return this.createResult('dm', payload.username, startTime, status);
    } catch (error) {
      log.error('Error sending Twitter DM', { error: String(error) });
      return this.createErrorResult('dm', payload.username, String(error), startTime, status);
    }
  }

  /**
   * Post a tweet
   */
  async post(payload: PostPayload): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('post');

    if (!allowed) {
      return this.createErrorResult('post', payload.text.substring(0, 50), 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Posting tweet', { text: payload.text.substring(0, 50) });

      await this.navigate(`${this.baseUrl}/compose/tweet`);
      await this.think();

      // Wait for tweet input
      if (!(await this.waitForElement(SELECTORS.tweetInput, 10000))) {
        return this.createErrorResult('post', payload.text, 'Tweet input not found', startTime, status);
      }

      // Type tweet
      await this.clickHuman(SELECTORS.tweetInput);
      
      const page = await this.getPage();
      await page.keyboard.type(payload.text, { delay: 50 });
      await this.pause();

      // Post tweet
      if (await this.elementExists(SELECTORS.tweetButton)) {
        await this.clickHuman(SELECTORS.tweetButton);
      }

      await this.delay();
      await this.recordAction('post');
      
      log.info('Successfully posted tweet');
      return this.createResult('post', payload.text.substring(0, 50), startTime, status);
    } catch (error) {
      log.error('Error posting tweet', { error: String(error) });
      return this.createErrorResult('post', payload.text, String(error), startTime, status);
    }
  }

  /**
   * Retweet a tweet
   */
  async retweet(url: string): Promise<ActionResult> {
    const startTime = Date.now();
    const { allowed, status } = await this.checkAndRecordAction('like'); // Retweets count against likes

    if (!allowed) {
      return this.createErrorResult('retweet', url, 'Rate limit exceeded', startTime, status);
    }

    try {
      log.info('Retweeting', { url });

      await this.navigate(url);
      await this.think();

      // Check if already retweeted
      if (await this.elementExists(SELECTORS.unretweet)) {
        log.info('Already retweeted');
        return this.createResult('retweet', url, startTime, status);
      }

      if (!(await this.elementExists(SELECTORS.retweetButton))) {
        return this.createErrorResult('retweet', url, 'Retweet button not found', startTime, status);
      }

      await this.clickHuman(SELECTORS.retweetButton);
      await this.pause();

      // Confirm retweet
      if (await this.waitForElement(SELECTORS.retweetConfirm, 5000)) {
        await this.clickHuman(SELECTORS.retweetConfirm);
      }

      await this.delay();
      await this.recordAction('like');
      
      log.info('Successfully retweeted');
      return this.createResult('retweet', url, startTime, status);
    } catch (error) {
      log.error('Error retweeting', { error: String(error) });
      return this.createErrorResult('retweet', url, String(error), startTime, status);
    }
  }

  /**
   * Get Twitter profile data
   */
  async getProfile(username: string): Promise<TwitterProfile> {
    try {
      log.info('Getting Twitter profile', { username });

      const profileUrl = `${this.baseUrl}/${username}`;
      await this.navigate(profileUrl);
      await this.think();

      const profile: TwitterProfile = {
        username,
      };

      // Get display name
      const displayName = await this.getText(SELECTORS.profileName);
      if (displayName) profile.displayName = displayName;

      // Get bio
      const bio = await this.getText(SELECTORS.profileBio);
      if (bio) profile.bio = bio;

      // Get location
      const location = await this.getText(SELECTORS.profileLocation);
      if (location) profile.location = location;

      // Get website
      const website = await this.getAttribute(SELECTORS.profileWebsite, 'href');
      if (website) profile.website = website;

      // Get followers count
      const followerText = await this.getText(SELECTORS.followersCount);
      if (followerText) {
        profile.followers = this.parseCount(followerText);
      }

      // Get following count
      const followingText = await this.getText(SELECTORS.followingCount);
      if (followingText) {
        profile.following = this.parseCount(followingText);
      }

      // Check if verified
      profile.isVerified = await this.elementExists(SELECTORS.verifiedBadge);

      log.info('Got Twitter profile', { profile });
      return profile;
    } catch (error) {
      log.error('Error getting Twitter profile', { error: String(error) });
      return { username };
    }
  }

  /**
   * Parse count strings
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
