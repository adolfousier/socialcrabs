/**
 * TikTok Post Handler
 * Handles video and carousel post creation
 */

import { log } from '../../utils/logger.js';
import { quickDelay, thinkingPause, sleep } from '../../utils/delays.js';
import type { PostPayload, TikTokPostPayload } from '../../types/index.js';

export class TikTokPostHandler {
  constructor() {}

  /**
   * Create a video post
   */
  async createPost(
    page: any,
    SELECTORS: Record<string, string>,
    payload: PostPayload
  ): Promise<boolean> {
    log.info('TikTokPost: Creating video post');

    try {
      // Wait for upload page to fully load
      await page.waitForLoadState('networkidle');
      await sleep(2000);

      // Find file input
      const fileInput = await page.locator(SELECTORS.uploadInput || 'input[type="file"]').first();
      if (!(await fileInput.count())) {
        log.error('TikTokPost: File upload input not found');
        return false;
      }

      // Upload video file
      if (payload.media && payload.media.length > 0) {
        await fileInput.setInputFiles(payload.media[0]);
        await log.debug(`TikTokPost: Uploaded ${payload.media[0]}`);
      }

      // Wait for video processing
      await sleep(5000);

      // Wait for caption input to appear (video processing indicator)
      const captionInput = page.locator(SELECTORS.captionInput || 'div[contenteditable="true"]');
      await captionInput.waitFor({ timeout: 30000 });

      await sleep(2000);

      // Add caption
      if (payload.text) {
        await captionInput.click();
        await thinkingPause();

        // Type caption with human timing
        for (const char of payload.text) {
          await captionInput.pressSequentially(char, { delay: 80 + Math.random() * 60 });
        }

        await sleep(1000);
      }

      // Wait a moment then click post
      await quickDelay();
      await quickDelay();

      // Find and click post button
      const postBtn = page.locator(SELECTORS.postButton || 'button:has-text("Post")');
      if (await postBtn.count() > 0) {
        await postBtn.first().click();
        await sleep(3000);

        // Check for success (redirect to the new post)
        const currentUrl = page.url();
        if (currentUrl.includes('/video/') || !currentUrl.includes('/upload')) {
          log.info(`TikTokPost: Post created successfully - ${currentUrl}`);
          return true;
        }
      }

      log.warn('TikTokPost: Post button not found or post did not appear');
      return false;
    } catch (err) {
      log.error(`TikTokPost: Create post failed - ${String(err)}`);
      return false;
    }
  }

  /**
   * Create a carousel post (image post with multiple images)
   * TikTok supports up to 35 images in a carousel
   */
  async createCarouselPost(
    page: any,
    SELECTORS: Record<string, string>,
    imagePaths: string[],
    caption: string,
    options?: Partial<TikTokPostPayload>
  ): Promise<boolean> {
    log.info(`TikTokPost: Creating carousel post with ${imagePaths.length} images`);

    try {
      await page.waitForLoadState('networkidle');
      await sleep(2000);

      // Upload first image
      const fileInput = page.locator(
        'input[type="file"][accept*="image"], input[type="file"][accept*="jpg"], input[type="file"]'
      ).first();

      if (!(await fileInput.count())) {
        log.error('TikTokPost: File upload input not found');
        return false;
      }

      // Upload first image (TikTok carousel: upload first, then add more)
      await fileInput.setInputFiles(imagePaths[0]);
      log.debug(`TikTokPost: Uploaded first image`);

      // Wait for processing
      await sleep(3000);

      // If multiple images, click "add more" button for each
      if (imagePaths.length > 1) {
        for (let i = 1; i < imagePaths.length; i++) {
          // Look for add image button (may appear after first upload)
          const addBtn = page.locator(
            SELECTORS.addImageButton ||
            'div:has-text("Add"), button:has-text("Add photo"), button:has-text("Add more")'
          );

          if (await addBtn.count() > 0) {
            await addBtn.first().click();
            await sleep(1500);

            // Upload next image
            const nextInput = page.locator(
              'input[type="file"][accept*="image"], input[type="file"]'
            ).last();
            await nextInput.setInputFiles(imagePaths[i]);
            log.debug(`TikTokPost: Uploaded image ${i + 1}/${imagePaths.length}`);
            await sleep(2000);
          }
        }
      }

      // Wait for all images to process
      await sleep(2000);

      // Add caption
      const captionInput = page.locator(
        SELECTORS.captionInput || 'div[contenteditable="true"]'
      );
      if (await captionInput.count() > 0) {
        await captionInput.first().click();
        await thinkingPause();

        // Build caption with hashtags
        let fullCaption = caption;
        if (options?.hashtags && options.hashtags.length > 0) {
          fullCaption += '\n\n' + options.hashtags.map((h) => `#${h}`).join(' ');
        }

        for (const char of fullCaption) {
          await captionInput.pressSequentially(char, { delay: 60 + Math.random() * 50 });
        }

        await sleep(1000);
      }

      // Post
      await quickDelay();
      const postBtn = page.locator(
        SELECTORS.postButton || 'button:has-text("Post"), button:has-text("Publish")'
      );
      if (await postBtn.count() > 0) {
        await postBtn.first().click();
        await sleep(3000);

        const currentUrl = page.url();
        if (!currentUrl.includes('/upload')) {
          log.info(`TikTokPost: Carousel post created - ${currentUrl}`);
          return true;
        }
      }

      log.warn('TikTokPost: Carousel post may not have succeeded');
      return false;
    } catch (err) {
      log.error(`TikTokPost: Carousel post failed - ${String(err)}`);
      return false;
    }
  }
}
