import { describe, expect, it, vi } from 'vitest';
import { OpenTwitterClient, createOpenTwitterClientFromEnv } from './client.js';

describe('OpenTwitterClient', () => {
  it('fetches recent user tweets from the 6551 opentwitter API and maps them to SocialCrabs tweets', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      expect(_url).toBe('https://ai.6551.io/open/twitter_user_tweets');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-123');
      expect(JSON.parse(String(init.body))).toEqual({
        username: 'paulg',
        maxResults: 5,
        product: 'Latest',
        includeReplies: false,
        includeRetweets: false,
      });
      return new Response(JSON.stringify({
        data: {
          tweets: [
            {
              id: 'tweet1',
              text: 'This is a useful tweet from the opentwitter API.',
              createdAt: '2026-07-06T00:00:00Z',
              favoriteCount: 10,
              retweetCount: 2,
              replyCount: 1,
              userScreenName: 'paulg',
              userName: 'Paul Graham',
            },
          ],
        },
      }));
    });

    const client = new OpenTwitterClient({ token: 'token-123', fetchImpl });
    const result = await client.getUserTweets('paulg', 5);

    expect(result).toEqual({
      success: true,
      tweets: [
        {
          id: 'tweet1',
          text: 'This is a useful tweet from the opentwitter API.',
          createdAt: '2026-07-06T00:00:00Z',
          likeCount: 10,
          retweetCount: 2,
          replyCount: 1,
          author: { username: 'paulg', name: 'Paul Graham' },
        },
      ],
    });
  });

  it('searches tweets through opentwitter without x.com browser or GraphQL cookies', async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://ai.6551.io/open/twitter_search');
      expect(String(init.body)).toContain('bitcoin');
      return new Response(JSON.stringify({ result: [{ id: '1', content: 'bitcoin tweet long enough', username: 'satoshi', name: 'Satoshi' }] }));
    });

    const client = new OpenTwitterClient({ token: 'token-123', fetchImpl });
    const result = await client.search({ keywords: 'bitcoin', maxResults: 10, product: 'Top' });

    expect(result.success).toBe(true);
    expect(result.tweets[0]).toMatchObject({ id: '1', text: 'bitcoin tweet long enough', author: { username: 'satoshi', name: 'Satoshi' } });
  });

  it('calls the remaining opentwitter data endpoints with normalized request bodies', async () => {
    const calls: Array<{ endpoint: string; body: unknown }> = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ endpoint: url.split('/open/')[1], body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ success: true, data: [{ id: '1', text: 'tweet text long enough', userScreenName: 'paulg' }] }));
    });

    const client = new OpenTwitterClient({ token: 'token-123', fetchImpl });
    await client.getUserById('44196397');
    await client.getFollowerEvents(' @paulg ', true, 7);
    await client.getArticleById('article-1');
    await client.getQuoteTweetsById('tweet-1', 6);
    await client.getRetweetUsersById('tweet-1', 'cursor-1');
    await client.getWatch();
    await client.addWatch(' @paulg ', { newTweetBol: true, newFlwBol: false });
    await client.deleteWatch(' @paulg ');

    expect(calls.map((call) => call.endpoint)).toEqual([
      'twitter_user_by_id',
      'twitter_follower_events',
      'twitter_article_by_id',
      'twitter_quote_tweets_by_id',
      'twitter_retweet_users_by_id',
      'twitter_watch',
      'twitter_watch_add',
      'twitter_watch_delete',
    ]);
    expect(calls.map((call) => call.body)).toEqual([
      { userId: '44196397' },
      { username: 'paulg', isFollow: true, maxResults: 7 },
      { id: 'article-1' },
      { id: 'tweet-1', maxResults: 6 },
      { id: 'tweet-1', cursor: 'cursor-1' },
      {},
      { username: 'paulg', newTweetBol: true, newFlwBol: false },
      { username: 'paulg' },
    ]);
  });

  it('requires TWITTER_TOKEN for env construction', () => {
    const oldToken = process.env.TWITTER_TOKEN;
    delete process.env.TWITTER_TOKEN;
    expect(() => createOpenTwitterClientFromEnv()).toThrow('TWITTER_TOKEN environment variable is required');
    if (oldToken) process.env.TWITTER_TOKEN = oldToken;
  });
});
