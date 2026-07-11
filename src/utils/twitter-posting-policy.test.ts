import { describe, expect, it } from 'vitest';
import {
  BROWSER_TWEET_DISABLED_MESSAGE,
  normalizeTweetPostingMethod,
} from './twitter-posting-policy.js';

describe('twitter posting policy', () => {
  it('defaults queued tweet posting to api', () => {
    expect(normalizeTweetPostingMethod(undefined)).toBe('api');
  });

  it('rejects browser tweet posting explicitly', () => {
    expect(() => normalizeTweetPostingMethod('browser')).toThrow(BROWSER_TWEET_DISABLED_MESSAGE);
  });

  it('accepts api tweet posting explicitly', () => {
    expect(normalizeTweetPostingMethod('api')).toBe('api');
  });
});
