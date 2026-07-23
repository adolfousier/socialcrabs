/**
 * TikTok Engagement Handler
 * Handles like, comment, follow, unfollow, and profile scraping
 */

import { log } from '../../utils/logger.js';
import { quickDelay, thinkingPause, sleep } from '../../utils/delays.js';
import type { TikTokProfile } from '../../types/index.js';

export class TikTokEngagementHandler {
  constructor() {}

  // ========================================================================
  // Like
  // ========================================================================

  async like(page: any, SELECTORS: Record<string, string>): Promise<boolean> {
    try {
      // Wait for like button to appear
      const likeBtn = page.locator(
        SELECTORS.likeButton || 'div[data-e2e="like-button"]'
      );
      await likeBtn.waitFor({ timeout: 10000 });

      // Click like
      await likeBtn.first().click();
      await quickDelay();

      // Verify like state changed
      const likedState = await page.locator(
        SELECTORS.unlikeButton || 'div[data-e2e="like-button"]:has(svg[fill="currentColor"])'
      );
      if (await likedState.count() > 0) {
        log.debug('TikTokEngagement: Post liked');
        return true;
      }

      return true; // Assume success even without visual confirmation
    } catch (err) {
      log.error(`TikTokEngagement: Like failed - ${String(err)}`);
      return false;
    }
  }

  // ========================================================================
  // Comment
  // ========================================================================

  async comment(
    page: any,
    SELECTORS: Record<string, string>,
    text: string
  ): Promise<boolean> {
    try {
      // Click comment button to open comment box
      const commentBtn = page.locator(
        SELECTORS.commentButton || 'div[data-e2e="comment-button"]'
      );
      if (await commentBtn.count() > 0) {
        await commentBtn.first().click();
        await sleep(1500);
      }

      // Find and fill comment input
      const commentInput = page.locator(
        SELECTORS.commentInput ||
        'div[contenteditable="true"][data-e2e="comment-input"], textarea[placeholder*="Add comment"]'
      );
      await commentInput.waitFor({ timeout: 10000 });

      await commentInput.first().click();
      await thinkingPause();

      // Type comment with human timing
      for (const char of text) {
        await commentInput.pressSequentially(char, { delay: 60 + Math.random() * 80 });
      }
      await sleep(500);

      // Post comment
      const postBtn = page.locator(
        SELECTORS.commentPostButton || 'button[data-e2e="comment-post-button"]'
      );
      if (await postBtn.count() > 0) {
        await postBtn.first().click();
        await sleep(2000);
        log.debug(`TikTokEngagement: Comment posted: "${text.slice(0, 30)}..."`);
        return true;
      }

      return false;
    } catch (err) {
      log.error(`TikTokEngagement: Comment failed - ${String(err)}`);
      return false;
    }
  }

  // ========================================================================
  // Follow / Unfollow
  // ========================================================================

  async follow(page: any, SELECTORS: Record<string, string>): Promise<boolean> {
    try {
      const followBtn = page.locator(
        SELECTORS.followButton || 'button[data-e2e="follow-button"]'
      );
      await followBtn.waitFor({ timeout: 10000 });

      await followBtn.first().click();
      await quickDelay();

      // Verify follow state
      const followingBtn = page.locator(
        SELECTORS.followingButton || 'button[data-e2e="following-button"]'
      );
      if (await followingBtn.count() > 0) {
        log.debug('TikTokEngagement: User followed');
        return true;
      }

      return true; // Assume success
    } catch (err) {
      log.error(`TikTokEngagement: Follow failed - ${String(err)}`);
      return false;
    }
  }

  async unfollow(page: any, SELECTORS: Record<string, string>): Promise<boolean> {
    try {
      // First click to open unfollow confirm dialog
      const followingBtn = page.locator(
        SELECTORS.followingButton || 'button[data-e2e="following-button"]'
      );
      await followingBtn.waitFor({ timeout: 10000 });
      await followingBtn.first().click();
      await sleep(1500);

      // Confirm unfollow
      const confirmBtn = page.locator(
        'button:has-text("Unfollow"), button:has-text("Following")'
      );
      if (await confirmBtn.count() > 0) {
        await confirmBtn.first().click();
        await quickDelay();
        log.debug('TikTokEngagement: User unfollowed');
        return true;
      }

      return false;
    } catch (err) {
      log.error(`TikTokEngagement: Unfollow failed - ${String(err)}`);
      return false;
    }
  }

  // ========================================================================
  // Profile Data Scraping
  // ========================================================================

  async getProfileData(
    page: any,
    _SELECTORS: Record<string, string>
  ): Promise<TikTokProfile | null> {
    try {
      await page.waitForLoadState('networkidle');
      await sleep(2000);

      // Wait for profile section to load
      await page.waitForSelector('h2[data-e2e="profile-title"]', { timeout: 15000 });

      const getText = async (selector: string): Promise<string> => {
        const el = page.locator(selector).first();
        return (await el.count()) > 0 ? (await el.textContent()) || '' : '';
      };

      const getNumber = async (selector: string): Promise<number> => {
        const el = page.locator(selector).first();
        if ((await el.count()) === 0) return 0;
        const text = (await el.textContent()) || '0';
        // Convert TikTok number format (1.2M, 500K, etc.)
        return this.parseTikTokNumber(text);
      };

      // Extract profile data
      const username = page.url().split('@')[1]?.split('?')[1]?.split('/')[0] || '';
      const displayName = await getText('h2[data-e2e="profile-title"]');
      const bio = await getText('h2[data-e2e="user-bio"]');
      const avatar = await page
        .locator('img[data-e2e="user-avatar"]')
        .first()
        .getAttribute('src')
        .catch(() => '');

      const followers = await getNumber('strong[data-e2e="followers-count"]');
      const following = await getNumber('strong[data-e2e="following-count"]');
      const likes = await getNumber('strong[data-e2e="likes-count"]');

      // Check for verified badge and private account
      const verifiedBadge = await page.locator('svg[data-e2e="verified-badge"]').count();
      const privateIndicator = await page.locator('text=This account is private').count();

      const profile: TikTokProfile = {
        username,
        displayName,
        bio,
        avatar: avatar || '',
        followers,
        following,
        likes,
        verified: verifiedBadge > 0,
        isPrivate: privateIndicator > 0,
        posts: 0, // TikTok doesn't always show post count on profile
      };

      log.debug(`TikTokEngagement: Scraped profile @${username}`);
      return profile;
    } catch (err) {
      log.error(`TikTokEngagement: Profile scrape failed - ${String(err)}`);
      return null;
    }
  }

  /**
   * Parse TikTok number format (1.2M, 500K, 1234)
   */
  private parseTikTokNumber(text: string): number {
    const cleaned = text.trim().replace(/,/g, '');
    const match = cleaned.match(/([\d.]+)\s*([MMBKT]?)/i);

    if (!match) {
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    }

    const value = parseFloat(match[1]);
    const suffix = (match[2] || '').toUpperCase();

    switch (suffix) {
      case 'M':
        return value * 1_000_000;
      case 'B':
        return value * 1_000_000_000;
      case 'K':
        return value * 1_000;
      default:
        return value;
    }
  }
}
