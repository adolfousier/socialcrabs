import type { ActionResult } from '../types/index.js';

export type TweetPostingMethod = 'api';

export const BROWSER_TWEET_DISABLED_MESSAGE =
  'Browser-based X/Twitter tweet posting is disabled. Use the API/xurl path instead.';

export function normalizeTweetPostingMethod(method?: string): TweetPostingMethod {
  const normalized = (method || 'api').toLowerCase();
  if (normalized === 'api') return 'api';
  if (normalized === 'browser') {
    throw new Error(BROWSER_TWEET_DISABLED_MESSAGE);
  }
  throw new Error(`Unsupported tweet posting method: ${method}. Only api is allowed.`);
}

export function createBrowserTweetDisabledResult(text: string, startedAt: number = Date.now()): ActionResult {
  return {
    success: false,
    platform: 'twitter',
    action: 'post',
    target: text.substring(0, 50),
    error: BROWSER_TWEET_DISABLED_MESSAGE,
    timestamp: Date.now(),
    duration: Date.now() - startedAt,
  };
}

export function createApiTweetActionResult(
  text: string,
  result: { success: boolean; postedUrl?: string; error?: string },
  startedAt: number = Date.now()
): ActionResult {
  return {
    success: result.success,
    platform: 'twitter',
    action: 'post',
    target: text.substring(0, 50),
    error: result.success ? undefined : result.error,
    timestamp: Date.now(),
    duration: Date.now() - startedAt,
    data: result.postedUrl ? { postUrl: result.postedUrl } : undefined,
  };
}
