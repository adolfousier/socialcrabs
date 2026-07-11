import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  loadSourceUsers,
  normalizeSourceUser,
  scoreTweet,
  rankSourceTweets,
  saveSourceTweets,
  filterTweetsSince,
  capLimitPerUser,
  loadSourceScanState,
  saveSourceScanState,
} from './source-scan.js';

describe('source scan helpers', () => {
  it('normalizes source users from strings and objects, capped at 10 enabled users', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-users-'));
    const file = path.join(dir, 'source-users.json');
    fs.writeFileSync(file, JSON.stringify([
      'https://x.com/paulg',
      { username: '@naval', weight: 2, enabled: true },
      { url: 'https://twitter.com/sama', enabled: false },
      'user4', 'user5', 'user6', 'user7', 'user8', 'user9', 'user10', 'user11', 'user12'
    ]));

    const users = loadSourceUsers(file);

    expect(users).toHaveLength(10);
    expect(users[0]).toEqual({ username: 'paulg', url: 'https://x.com/paulg', weight: 1, enabled: true });
    expect(users[1]).toEqual({ username: 'naval', url: 'https://x.com/naval', weight: 2, enabled: true });
    expect(users.find((user) => user.username === 'sama')).toBeUndefined();
  });

  it('normalizes one source user object using url when username is omitted', () => {
    expect(normalizeSourceUser({ url: 'https://x.com/paulg' })).toEqual({
      username: 'paulg',
      url: 'https://x.com/paulg',
      weight: 1,
      enabled: true,
    });
  });

  it('scores tweets by engagement and source weight', () => {
    const score = scoreTweet({
      id: '1',
      text: 'A useful tweet that is long enough to be considered for rewrite.',
      author: { username: 'paulg', name: 'Paul Graham' },
      likeCount: 10,
      retweetCount: 2,
      replyCount: 3,
    }, 2);

    expect(score).toBe((10 + 2 * 3 + 3 * 2) * 2);
  });

  it('ranks valid source tweets and skips low-quality ones', () => {
    const ranked = rankSourceTweets([
      {
        sourceUser: 'paulg',
        weight: 1,
        tweets: [
          { id: '1', text: 'too short', author: { username: 'paulg', name: 'Paul' }, likeCount: 999 },
          { id: '2', text: 'This is a strong source tweet with enough length to rewrite later.', author: { username: 'paulg', name: 'Paul' }, likeCount: 5, retweetCount: 2, replyCount: 1 },
        ],
      },
    ]);

    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toEqual(expect.objectContaining({
      id: '2',
      sourceUser: 'paulg',
      score: 13,
      status: 'new',
    }));
  });

  it('saves scan output as pretty json', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-tweets-'));
    const file = path.join(dir, 'nested', 'source-tweets.json');

    saveSourceTweets(file, [{ id: '1', text: 'hello world long enough for storage', sourceUser: 'paulg', score: 1, status: 'new' }]);

    const content = fs.readFileSync(file, 'utf-8');
    expect(content).toContain('\n  {');
    expect(JSON.parse(content)[0].sourceUser).toBe('paulg');
  });

  it('caps source scan limit per user at 10', () => {
    expect(capLimitPerUser('25')).toBe(10);
    expect(capLimitPerUser('8')).toBe(8);
    expect(capLimitPerUser(undefined)).toBe(10);
  });

  it('keeps all tweets on first scan and only newer tweets after lastScannedAt', () => {
    const tweets = [
      { id: 'old', text: 'This is an old tweet with enough text to pass filters.', author: { username: 'paulg', name: 'Paul' }, createdAt: 'Fri Jul 03 08:00:00 +0000 2026' },
      { id: 'new', text: 'This is a new tweet with enough text to pass filters.', author: { username: 'paulg', name: 'Paul' }, createdAt: 'Fri Jul 03 13:00:00 +0000 2026' },
    ];

    expect(filterTweetsSince(tweets, undefined).map((tweet) => tweet.id)).toEqual(['old', 'new']);
    expect(filterTweetsSince(tweets, '2026-07-03T12:00:00.000Z').map((tweet) => tweet.id)).toEqual(['new']);
  });

  it('loads and saves per-user source scan state', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-state-'));
    const file = path.join(dir, 'nested', 'source-scan-state.json');

    saveSourceScanState(file, { users: { paulg: { lastScannedAt: '2026-07-03T12:00:00.000Z' } } });

    expect(loadSourceScanState(file)).toEqual({ users: { paulg: { lastScannedAt: '2026-07-03T12:00:00.000Z' } } });
  });
});
