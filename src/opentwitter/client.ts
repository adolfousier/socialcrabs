import { normalizeTwitterUsername } from '../utils/safety.js';
import type { SearchResult, Tweet, UserResult } from '../graphql/types.js';

const OPEN_TWITTER_BASE_URL = 'https://ai.6551.io';

type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

export interface OpenTwitterClientOptions {
  token: string;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
}

export interface OpenTwitterSearchOptions {
  keywords?: string;
  fromUser?: string;
  toUser?: string;
  mentionUser?: string;
  hashtag?: string;
  excludeReplies?: boolean;
  excludeRetweets?: boolean;
  minLikes?: number;
  minRetweets?: number;
  minReplies?: number;
  sinceDate?: string;
  untilDate?: string;
  lang?: string;
  product?: 'Top' | 'Latest';
  maxResults?: number;
}

interface OpenTwitterUser {
  id?: string;
  username: string;
  name: string;
  description?: string;
  followersCount?: number;
  followingCount?: number;
  isBlueVerified?: boolean;
  profileImageUrl?: string;
  createdAt?: string;
}

export class OpenTwitterClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchImpl;

  constructor(options: OpenTwitterClientOptions) {
    if (!options.token) throw new Error('TWITTER_TOKEN environment variable is required for opentwitter');
    this.token = options.token;
    this.baseUrl = options.baseUrl || OPEN_TWITTER_BASE_URL;
    this.fetchImpl = options.fetchImpl || fetch;
  }

  async getUserInfo(username: string): Promise<UserResult> {
    const data = await this.post('twitter_user_info', { username: normalizeTwitterUsername(username) });
    const user = mapUser(findFirstObject(unwrapPayload(data)) ?? {});
    if (!user.username) return { success: false, error: 'User not found in opentwitter response' };
    return { success: true, user: { id: user.id || user.username, username: user.username, name: user.name || user.username } };
  }

  async getUserById(userId: string): Promise<UserResult> {
    const data = await this.post('twitter_user_by_id', { userId });
    const user = mapUser(findFirstObject(unwrapPayload(data)) ?? {});
    if (!user.username) return { success: false, error: 'User not found in opentwitter response' };
    return { success: true, user: { id: user.id || userId, username: user.username, name: user.name || user.username } };
  }

  async getTweetById(tweetId: string): Promise<{ success: boolean; tweet?: Tweet; error?: string }> {
    try {
      const data = await this.post('twitter_tweet_by_id', { twId: tweetId });
      const tweet = mapTweet(findTweetLikeObject(unwrapPayload(data)) ?? {}, undefined);
      if (!tweet.id || !tweet.text) return { success: false, error: 'Tweet not found in opentwitter response' };
      return { success: true, tweet };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async getUserTweets(username: string, maxResults = 20, product: 'Latest' | 'Top' = 'Latest'): Promise<SearchResult> {
    try {
      const normalized = normalizeTwitterUsername(username);
      const data = await this.post('twitter_user_tweets', {
        username: normalized,
        maxResults: clampMaxResults(maxResults),
        product,
        includeReplies: false,
        includeRetweets: false,
      });
      return { success: true, tweets: extractTweets(data, normalized) };
    } catch (error) {
      return { success: false, tweets: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  async search(options: OpenTwitterSearchOptions): Promise<SearchResult> {
    try {
      const data = await this.post('twitter_search', {
        ...options,
        fromUser: options.fromUser ? normalizeTwitterUsername(options.fromUser) : undefined,
        toUser: options.toUser ? normalizeTwitterUsername(options.toUser) : undefined,
        mentionUser: options.mentionUser ? normalizeTwitterUsername(options.mentionUser) : undefined,
        hashtag: options.hashtag?.replace(/^#/, ''),
        product: options.product || 'Top',
        maxResults: clampMaxResults(options.maxResults || 20),
      });
      return { success: true, tweets: extractTweets(data, options.fromUser) };
    } catch (error) {
      return { success: false, tweets: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  async getFollowerEvents(username: string, isFollow = true, maxResults = 20): Promise<unknown> {
    return this.post('twitter_follower_events', { username: normalizeTwitterUsername(username), isFollow, maxResults: clampMaxResults(maxResults) });
  }

  async getArticleById(id: string): Promise<unknown> {
    return this.post('twitter_article_by_id', { id });
  }

  async getQuoteTweetsById(id: string, maxResults = 20): Promise<SearchResult> {
    try {
      const data = await this.post('twitter_quote_tweets_by_id', { id, maxResults: clampMaxResults(maxResults) });
      return { success: true, tweets: extractTweets(data) };
    } catch (error) {
      return { success: false, tweets: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  async getRetweetUsersById(id: string, cursor?: string): Promise<unknown> {
    return this.post('twitter_retweet_users_by_id', { id, cursor });
  }

  async getWatch(): Promise<unknown> {
    return this.post('twitter_watch', {});
  }

  async addWatch(username: string, options: Record<string, unknown> = {}): Promise<unknown> {
    return this.post('twitter_watch_add', { username: normalizeTwitterUsername(username), ...options });
  }

  async deleteWatch(username: string): Promise<unknown> {
    return this.post('twitter_watch_delete', { username: normalizeTwitterUsername(username) });
  }

  private async post(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}/open/${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(removeUndefined(body)),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`opentwitter ${endpoint} HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    const data = await response.json() as unknown;
    const error = extractApiError(data);
    if (error) throw new Error(`opentwitter ${endpoint}: ${error}`);
    return data;
  }
}

export function createOpenTwitterClientFromEnv(): OpenTwitterClient {
  const token = process.env.TWITTER_TOKEN || '';
  if (!token) throw new Error('TWITTER_TOKEN environment variable is required for opentwitter. Get one at https://6551.io/mcp and set it in .env.');
  return new OpenTwitterClient({ token });
}

function clampMaxResults(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 20;
  return Math.min(Math.floor(value), 100);
}

function removeUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function extractApiError(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const record = data as Record<string, unknown>;
  if (typeof record.error === 'string') return record.error;
  if (typeof record.message === 'string' && record.success === false) return record.message;
  if (Array.isArray(record.errors)) return record.errors.map(String).join(', ');
  return undefined;
}

function unwrapPayload(data: unknown): unknown {
  let current = data;
  for (let i = 0; i < 3; i += 1) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) break;
    const record = current as Record<string, unknown>;
    if (record.data !== undefined) { current = record.data; continue; }
    if (record.result !== undefined) { current = record.result; continue; }
    if (record.tweets !== undefined) { current = record.tweets; continue; }
    if (record.items !== undefined) { current = record.items; continue; }
    if (record.list !== undefined) { current = record.list; continue; }
    if (record.statuses !== undefined) { current = record.statuses; continue; }
    break;
  }
  return current;
}

function extractTweets(data: unknown, fallbackUsername?: string): Tweet[] {
  const payload = unwrapPayload(data);
  const rawTweets = Array.isArray(payload) ? payload : collectTweetLikeObjects(payload);
  return rawTweets
    .map((raw) => mapTweet(raw, fallbackUsername))
    .filter((tweet): tweet is Tweet => Boolean(tweet.id && tweet.text && tweet.author.username));
}

function collectTweetLikeObjects(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(collectTweetLikeObjects);
  const record = value as Record<string, unknown>;
  if (isTweetLike(record)) return [record];
  const tweetContainers = ['tweets', 'items', 'list', 'statuses', 'results'];
  for (const key of tweetContainers) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).flatMap(collectTweetLikeObjects);
  }
  return [];
}

function findTweetLikeObject(value: unknown): Record<string, unknown> | undefined {
  return collectTweetLikeObjects(value)[0] ?? (value && typeof value === 'object' && isTweetLike(value as Record<string, unknown>) ? value as Record<string, unknown> : undefined);
}

function findFirstObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) return value.find((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
  return value as Record<string, unknown>;
}

function isTweetLike(record: Record<string, unknown>): boolean {
  return Boolean(record.id || record.idStr || record.id_str || record.twId) && Boolean(record.text || record.fullText || record.full_text || record.content);
}

function mapTweet(raw: Record<string, unknown>, fallbackUsername?: string): Tweet {
  const username = normalizeTwitterUsername(stringField(raw, ['userScreenName', 'screenName', 'username', 'twAccount', 'authorUsername']) || fallbackUsername || 'unknown');
  const authorName = stringField(raw, ['userName', 'name', 'twUserName', 'authorName']) || username;
  const quotedRaw = raw.quotedStatus || raw.quotedTweet;
  return {
    id: stringField(raw, ['id', 'idStr', 'id_str', 'twId']) || '',
    text: stringField(raw, ['text', 'fullText', 'full_text', 'content']) || '',
    createdAt: stringField(raw, ['createdAt', 'created_at', 'created_at_str']),
    replyCount: numberField(raw, ['replyCount', 'reply_count']),
    retweetCount: numberField(raw, ['retweetCount', 'retweet_count']),
    likeCount: numberField(raw, ['favoriteCount', 'likeCount', 'favorites', 'favorite_count']),
    conversationId: stringField(raw, ['conversationId', 'conversation_id']),
    inReplyToStatusId: stringField(raw, ['inReplyToStatusId', 'in_reply_to_status_id_str']),
    author: { username, name: authorName },
    authorId: stringField(raw, ['userIdStr', 'userId', 'authorId']),
    quotedTweet: quotedRaw && typeof quotedRaw === 'object' ? mapTweet(quotedRaw as Record<string, unknown>) : undefined,
  };
}

function mapUser(raw: Record<string, unknown>): OpenTwitterUser {
  const username = normalizeTwitterUsername(stringField(raw, ['screenName', 'username', 'twAccount']) || '');
  return {
    id: stringField(raw, ['userId', 'id', 'idStr', 'twId']),
    username,
    name: stringField(raw, ['name', 'twUserName']) || username,
    description: stringField(raw, ['description', 'desc']),
    followersCount: numberField(raw, ['followersCount', 'followerCount']),
    followingCount: numberField(raw, ['friendsCount', 'followingCount', 'friendCount']),
    isBlueVerified: booleanField(raw, ['verified', 'isBlueVerified', 'userVerified']),
    profileImageUrl: stringField(raw, ['profileImageUrl', 'avatarUrl']),
    createdAt: stringField(raw, ['createdAt', 'created_at']),
  };
}

function stringField(raw: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number') return String(value);
  }
  return undefined;
}

function numberField(raw: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function booleanField(raw: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}
