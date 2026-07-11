import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildMultiAccountPosts,
  loadMultiAccountConfig,
  normalizeOpenTwitterTweets,
  selectTextOnlyTweets,
  buildOpenTwitterSourceSearchOptions,
} from './multi-account-pipeline.js';

describe('multi-account pipeline helpers', () => {
  it('loads enabled accounts with per-account style and daily limits', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounts-'));
    const file = path.join(dir, 'accounts.json');
    fs.writeFileSync(file, JSON.stringify({
      accounts: [
        { username: '@yoyo_aigo', enabled: true, style: '财经科技', maxPostsPerDay: 2, topics: ['AI'], imageSkill: 'guizang-social-card-skill', squareAlias: 'guicai', xurlApp: 'socialcrabs' },
        { username: 'disabled_user', enabled: false },
      ],
    }));

    const config = loadMultiAccountConfig(file);

    expect(config.accounts).toEqual([
      { username: 'yoyo_aigo', enabled: true, style: '财经科技', maxPostsPerDay: 2, topics: ['AI'], imageSkill: 'guizang-social-card-skill', squareAlias: 'guicai', xurlApp: 'socialcrabs' },
    ]);
  });

  it('builds opentwitter source search options for original posts from one source account', () => {
    expect(buildOpenTwitterSourceSearchOptions('https://x.com/LuBtc888', 10)).toEqual({
      fromUser: 'LuBtc888',
      maxResults: 10,
      product: 'Latest',
      excludeReplies: true,
      excludeRetweets: true,
    });
  });

  it('normalizes opentwitter tweets and keeps only pure text tweets', () => {
    const tweets = normalizeOpenTwitterTweets([
      { id: '1', text: '纯文字观点，足够长，可以作为改写素材。', likeCount: 10, retweetCount: 1, replyCount: 2 },
      { id: '2', text: '带图内容 https://t.co/abc', likeCount: 999 },
      { id: '3', text: '太短', likeCount: 999 },
    ], 'LuBtc888');
    const selected = selectTextOnlyTweets(tweets, 5);

    expect(selected.map((tweet) => tweet.id)).toEqual(['1']);
    expect(selected[0].score).toBe(15);
  });

  it('creates distinct short drafts for each target account', () => {
    const posts = buildMultiAccountPosts({
      sourceTweet: {
        id: '1',
        sourceUser: 'LuBtc888',
        text: '长鑫上市以后会是中国一个标志性的事件，这其实也是时代机遇的一个里程碑。上市后利润和估值都会被市场重新定价。',
        score: 20,
        url: 'https://x.com/LuBtc888/status/1',
      },
      accounts: [
        { username: 'yoyo_aigo', enabled: true, style: '财经科技' },
        { username: 'alt_account', enabled: true, style: '口语化' },
      ],
      maxChars: 180,
    });

    expect(posts).toHaveLength(2);
    expect(posts[0].account).toBe('yoyo_aigo');
    expect(posts[1].account).toBe('alt_account');
    expect(posts[0].text).not.toBe(posts[1].text);
    expect(posts.map((post) => post.text).join('\n')).not.toMatch(/别只盯短线情绪|短期看情绪，长期看兑现|真正值得看的/);
    expect(posts.every((post) => post.text.length <= 180)).toBe(true);
    expect(posts.every((post) => post.sourceUrl === 'https://x.com/LuBtc888/status/1')).toBe(true);
  });

  it('runs Chinese post variants through humanizer-zh style cleanup per account', () => {
    const posts = buildMultiAccountPosts({
      sourceTweet: {
        id: '2',
        sourceUser: 'LuBtc888',
        text: '这不仅是一个标志性事件，更是产业链深度重估的重要里程碑。真正值得看的，是后面能不能兑现。',
        score: 20,
        url: 'https://x.com/LuBtc888/status/2',
      },
      accounts: [
        { username: 'yoyo_aigo', enabled: true, style: '财经科技' },
        { username: 'blockheadchain_', enabled: true, style: '口语化，真实感受' },
      ],
      maxChars: 180,
    });

    expect(posts).toHaveLength(2);
    expect(posts[0].text).not.toBe(posts[1].text);
    expect(posts.map((post) => post.text).join('\n')).not.toMatch(/不仅|更是|标志性|里程碑|真正值得看的|后面能不能兑现/);
  });

  it('uses source-specific views instead of generic fallback endings for tax posts', () => {
    const posts = buildMultiAccountPosts({
      sourceTweet: {
        id: 'tax-1',
        sourceUser: 'erchenlu1',
        text: '有些国家的税制，明显是在鼓励创业、经商和资本积累，不太鼓励单纯打工。',
        score: 20,
        url: 'https://x.com/erchenlu1/status/tax-1',
      },
      accounts: [{ username: 'yoyo_aigo', enabled: true, style: '财经科技' }],
      maxChars: 180,
    });

    expect(posts).toHaveLength(1);
    expect(posts[0].text).toContain('税制');
    expect(posts[0].text).toMatch(/收入|资产|资本|打工|创业|经商/);
    expect(posts[0].text).not.toMatch(/这个点值得先记下来|先记一笔|落到具体场景|过几天再看大家怎么消化|先看后续反馈|急着下判断/);
  });
});
