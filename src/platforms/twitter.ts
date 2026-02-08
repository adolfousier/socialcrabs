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
  
  // Tweet actions (use [data-testid] without element type — Twitter uses button/div interchangeably)
  likeButton: '[data-testid="like"]',
  unlikeButton: '[data-testid="unlike"]',
  retweetButton: '[data-testid="retweet"]',
  unretweet: '[data-testid="unretweet"]',
  retweetConfirm: '[role="menuitem"]:has-text("Repost")',
  replyButton: '[data-testid="reply"]',
  shareButton: '[data-testid="share"]',
  
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
   * Login with credentials (headless)
   */
  async loginWithCredentials(username: string, password: string): Promise<boolean> {
    try {
      log.info('Starting Twitter headless login...');
      
      await this.navigate(`${this.baseUrl}/login`);
      await this.delay();

      if (await this.isLoggedIn()) {
        log.info('Already logged in to Twitter');
        return true;
      }

      // Wait for username input
      if (!(await this.waitForElement(SELECTORS.loginUsername, 15000))) {
        log.error('Login form not found');
        return false;
      }

      // Enter username
      await this.typeHuman(SELECTORS.loginUsername, username, { clear: true });
      await this.pause();

      // Click next
      if (await this.elementExists(SELECTORS.nextButton)) {
        await this.clickHuman(SELECTORS.nextButton);
        await this.delay();
      }

      // Wait for password input
      if (!(await this.waitForElement(SELECTORS.loginPassword, 10000))) {
        log.error('Password field not found');
        return false;
      }

      // Enter password
      await this.typeHuman(SELECTORS.loginPassword, password, { clear: true });
      await this.pause();

      // Click login
      if (await this.elementExists(SELECTORS.loginButton)) {
        await this.clickHuman(SELECTORS.loginButton);
      } else {
        const page = await this.getPage();
        await page.keyboard.press('Enter');
      }
      
      await this.delay();

      // Wait for login
      const startTime = Date.now();
      const timeout = 30000;

      while (Date.now() - startTime < timeout) {
        if (await this.isLoggedIn()) {
          log.info('Twitter login successful');
          await this.browserManager.saveSession('twitter');
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
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
      
      const page = await this.getPage();
      
      // Wait for page to load properly
      await page.waitForTimeout(3000);
      
      // Check if redirected to login
      const currentUrl = page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/i/flow/login')) {
        log.error('Redirected to login - session may be invalid');
        await page.screenshot({ path: './sessions/debug-x-login-redirect.png' });
        return this.createErrorResult('like', payload.url, 'Session expired - redirected to login', startTime, status);
      }
      
      // Handle cookie consent banner
      const cookieAccept = page.locator('button:has-text("Accept all cookies"), div[role="button"]:has-text("Accept all")');
      if (await cookieAccept.isVisible().catch(() => false)) {
        log.info('Dismissing cookie banner');
        await cookieAccept.first().click();
        await page.waitForTimeout(1000);
      }
      
      // Extract tweet details for notification
      let author = '';
      let preview = '';
      try {
        // Get author from tweet article
        const authorEl = page.locator('article div[data-testid="User-Name"] a[role="link"]').first();
        const authorHref = await authorEl.getAttribute('href').catch(() => null);
        if (authorHref) {
          author = authorHref.replace('/', '').split('/')[0];
        }
        // Get tweet text
        const tweetTextEl = page.locator('article div[data-testid="tweetText"]').first();
        preview = await tweetTextEl.textContent().catch(() => '') || '';
        preview = preview.substring(0, 100);
      } catch {
        log.debug('Could not extract tweet details');
      }
      
      await this.think();

      // Check if already liked - look for filled heart (unlike button)
      // X uses data-testid="unlike" for already-liked state
      // Try multiple selectors for the main tweet
      const unlikeSelectors = [
        'div[data-testid="unlike"]',
        'article div[data-testid="unlike"]',
        '[data-testid="unlike"]'
      ];
      
      for (const sel of unlikeSelectors) {
        const alreadyLiked = await page.locator(sel).first().isVisible().catch(() => false);
        if (alreadyLiked) {
          log.info('Tweet already liked');
          return this.createResult('like', payload.url, startTime, status, {
            postUrl: payload.url,
            author,
            preview,
            actions: ['❤️ Already Liked'],
          });
        }
      }

      // Wait a bit more for like button - try multiple selectors
      const likeSelectors = [
        'div[data-testid="like"]',
        'article div[data-testid="like"]',
        '[data-testid="like"]'
      ];
      
      let likeButton = null;
      for (const sel of likeSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible().catch(() => false)) {
          likeButton = btn;
          break;
        }
      }
      
      if (!likeButton) {
        await page.screenshot({ path: './sessions/debug-x-like-not-found.png' });
        log.error('Like button not found - screenshot saved');
        return this.createErrorResult('like', payload.url, 'Like button not found', startTime, status);
      }

      await likeButton.click();
      await page.waitForTimeout(1500);

      // Verify like worked - check for unlike button
      let likeSuccess = false;
      for (const sel of unlikeSelectors) {
        const unlikeBtn = await page.locator(sel).first().isVisible().catch(() => false);
        if (unlikeBtn) {
          likeSuccess = true;
          break;
        }
      }
      
      if (likeSuccess) {
        await this.recordAction('like');
        log.info('Successfully liked tweet');
        return this.createResult('like', payload.url, startTime, status, {
          postUrl: payload.url,
          author,
          preview,
          actions: ['❤️ Liked'],
        });
      }

      await page.screenshot({ path: './sessions/debug-x-like-verify-failed.png' });
      log.error('Like verification failed - screenshot saved');
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
      return this.createResult('comment', payload.url, startTime, status, {
        postUrl: payload.url,
        commentText: payload.text,
        actions: ['💬 Replied'],
      });
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
      
      const page = await this.getPage();
      await page.waitForTimeout(3000);
      
      // Handle cookie consent banner
      const cookieAccept = page.locator('button:has-text("Accept all cookies"), div[role="button"]:has-text("Accept all")');
      if (await cookieAccept.isVisible().catch(() => false)) {
        log.info('Dismissing cookie banner');
        await cookieAccept.first().click();
        await page.waitForTimeout(1000);
      }
      
      await this.think();

      // Check if already following - multiple selectors
      const followingSelectors = [
        'div[data-testid="placementTracking"] div[role="button"][data-testid*="unfollow"]',
        'div[role="button"][aria-label*="Following"]',
        'div[data-testid="userActions"] div[role="button"]:has-text("Following")',
        '[data-testid*="unfollow"]'
      ];
      
      for (const sel of followingSelectors) {
        const isFollowing = await page.locator(sel).first().isVisible().catch(() => false);
        if (isFollowing) {
          log.info('Already following user');
          return this.createResult('follow', payload.username, startTime, status, {
            profileUrl: `https://x.com/${payload.username}`,
            actions: ['👥 Already Following'],
          });
        }
      }

      // Find follow button - multiple selectors
      const followSelectors = [
        'div[data-testid="placementTracking"] div[role="button"]:has-text("Follow")',
        'div[role="button"][aria-label*="Follow @"]',
        'div[data-testid="userActions"] div[role="button"]:has-text("Follow")',
        '[data-testid*="follow"]:not([data-testid*="unfollow"])'
      ];
      
      let followButton = null;
      for (const sel of followSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible().catch(() => false)) {
          followButton = btn;
          log.info('Found follow button', { selector: sel });
          break;
        }
      }
      
      if (!followButton) {
        await page.screenshot({ path: './sessions/debug-x-follow-not-found.png' });
        log.error('Follow button not found - screenshot saved');
        return this.createErrorResult('follow', payload.username, 'Follow button not found', startTime, status);
      }

      await followButton.click();
      await page.waitForTimeout(1500);

      // Verify follow worked
      let followSuccess = false;
      for (const sel of followingSelectors) {
        const isNowFollowing = await page.locator(sel).first().isVisible().catch(() => false);
        if (isNowFollowing) {
          followSuccess = true;
          break;
        }
      }
      
      if (followSuccess) {
        await this.recordAction('follow');
        log.info('Successfully followed Twitter user');
        return this.createResult('follow', payload.username, startTime, status, {
          profileUrl: `https://x.com/${payload.username}`,
          actions: ['👥 Followed'],
        });
      }

      await page.screenshot({ path: './sessions/debug-x-follow-verify-failed.png' });
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
        return this.createResult('unfollow', payload.username, startTime, status, {
          profileUrl: `https://x.com/${payload.username}`,
          actions: ['👋 Unfollowed'],
        });
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
      const page = await this.getPage();
      if (!(await this.waitForElement(SELECTORS.dmButton, 10000))) {
        // Debug: save screenshot to see what's on the page
        await page.screenshot({ path: `sessions/debug-dm-${payload.username}.png` });
        log.warn('DM button not found, saved debug screenshot', { username: payload.username });
        
        // Try alternative: click the "Message" link in the actions menu
        const messageLink = await page.$('a[href*="/messages/compose"]');
        if (messageLink) {
          log.info('Found message link, clicking...');
          await messageLink.click();
          await this.delay();
        } else {
          return this.createErrorResult('dm', payload.username, 'DM button not found', startTime, status);
        }
      } else {
        await this.clickHuman(SELECTORS.dmButton);
        await this.delay();
      }

      // Wait for DM input
      if (!(await this.waitForElement(SELECTORS.dmInput, 10000))) {
        return this.createErrorResult('dm', payload.username, 'DM input not found', startTime, status);
      }

      // Type message
      await this.clickHuman(SELECTORS.dmInput);
      await page.keyboard.type(payload.message, { delay: 50 });
      await this.pause();

      // Send message
      if (await this.elementExists(SELECTORS.dmSendButton)) {
        await this.clickHuman(SELECTORS.dmSendButton);
      }

      await this.delay();
      await this.recordAction('dm');
      
      log.info('Successfully sent Twitter DM');
      return this.createResult('dm', payload.username, startTime, status, {
        profileUrl: `https://x.com/${payload.username}`,
        messagePreview: payload.message,
        actions: ['✉️ DM Sent'],
      });
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
      return this.createResult('post', payload.text.substring(0, 50), startTime, status, {
        commentText: payload.text,
        actions: ['📝 Posted'],
      });
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
        return this.createResult('retweet', url, startTime, status, {
          postUrl: url,
          actions: ['🔁 Already Retweeted'],
        });
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
      return this.createResult('retweet', url, startTime, status, {
        postUrl: url,
        actions: ['🔁 Retweeted'],
      });
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
