import { describe, expect, it, vi } from 'vitest';
import { TwitterHandler } from './twitter.js';
import { BROWSER_TWEET_DISABLED_MESSAGE } from '../utils/twitter-posting-policy.js';

function createNoBrowserHarness() {
  const browserManager = {
    navigate: vi.fn(() => { throw new Error('browser should not be used'); }),
    getPage: vi.fn(() => { throw new Error('browser should not be used'); }),
    closeContext: vi.fn(async () => undefined),
  };
  const rateLimiter = {
    check: vi.fn(() => { throw new Error('rate limiter should not be used'); }),
    record: vi.fn(() => { throw new Error('rate limiter should not be used'); }),
  };
  return { browserManager, rateLimiter, handler: new TwitterHandler(browserManager as any, rateLimiter as any) };
}

describe('TwitterHandler posting policy', () => {
  it('blocks browser-based tweet posting before touching browser or rate limiter', async () => {
    const { browserManager, rateLimiter, handler } = createNoBrowserHarness();

    const result = await handler.post({ text: 'should use api instead' });

    expect(result.success).toBe(false);
    expect(result.error).toBe(BROWSER_TWEET_DISABLED_MESSAGE);
    expect(browserManager.navigate).not.toHaveBeenCalled();
    expect(browserManager.getPage).not.toHaveBeenCalled();
    expect(rateLimiter.check).not.toHaveBeenCalled();
    expect(rateLimiter.record).not.toHaveBeenCalled();
  });

  it('blocks X browser engagement actions before touching browser or rate limiter', async () => {
    const { browserManager, rateLimiter, handler } = createNoBrowserHarness();

    const result = await handler.like({ url: 'https://x.com/example/status/1' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('X browser actions are disabled');
    expect(result.error).toContain('opentwitter/TWITTER_TOKEN');
    expect(browserManager.navigate).not.toHaveBeenCalled();
    expect(browserManager.getPage).not.toHaveBeenCalled();
    expect(rateLimiter.check).not.toHaveBeenCalled();
    expect(rateLimiter.record).not.toHaveBeenCalled();
  });
});
