import fs from 'fs';
import path from 'path';
import { normalizeTwitterUsername } from './safety.js';
import type { Tweet } from '../graphql/types.js';

export interface SourceUser {
  username: string;
  url: string;
  weight: number;
  enabled: boolean;
}

export interface RankedSourceTweet {
  id: string;
  text: string;
  sourceUser: string;
  sourceName?: string;
  sourceUrl: string;
  sourceTweetUrl: string;
  score: number;
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
  createdAt?: string;
  status: 'new' | 'used' | 'skipped';
  scannedAt?: string;
}

export interface SourceTweetBatch {
  sourceUser: string;
  weight: number;
  tweets: Tweet[];
}

export interface SourceScanState {
  users: Record<string, { lastScannedAt: string }>;
}

type RawSourceUser = string | Partial<SourceUser>;

export function loadSourceUsers(file: string): SourceUser[] {
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as RawSourceUser[] | { items?: RawSourceUser[] };
  const entries = Array.isArray(raw) ? raw : raw.items || [];
  return entries
    .map(normalizeSourceUser)
    .filter((user): user is SourceUser => Boolean(user && user.enabled))
    .slice(0, 10);
}

export function normalizeSourceUser(raw: RawSourceUser): SourceUser | undefined {
  const value = typeof raw === 'string' ? { username: raw } : raw;
  const username = normalizeTwitterUsername(value.username || value.url || '');
  if (!username) return undefined;
  return {
    username,
    url: value.url || `https://x.com/${username}`,
    weight: typeof value.weight === 'number' && value.weight > 0 ? value.weight : 1,
    enabled: value.enabled !== false,
  };
}

export function scoreTweet(tweet: Tweet, sourceWeight = 1): number {
  const likes = tweet.likeCount || 0;
  const retweets = tweet.retweetCount || 0;
  const replies = tweet.replyCount || 0;
  return (likes + retweets * 3 + replies * 2) * sourceWeight;
}

export function rankSourceTweets(batches: SourceTweetBatch[]): RankedSourceTweet[] {
  const scannedAt = new Date().toISOString();
  const seen = new Set<string>();
  const ranked: RankedSourceTweet[] = [];

  for (const batch of batches) {
    for (const tweet of batch.tweets) {
      if (!isUsableSourceTweet(tweet) || seen.has(tweet.id)) continue;
      seen.add(tweet.id);
      const sourceUser = normalizeTwitterUsername(batch.sourceUser || tweet.author.username);
      ranked.push({
        id: tweet.id,
        text: tweet.text,
        sourceUser,
        sourceName: tweet.author.name,
        sourceUrl: `https://x.com/${sourceUser}`,
        sourceTweetUrl: `https://x.com/${sourceUser}/status/${tweet.id}`,
        score: scoreTweet(tweet, batch.weight),
        likeCount: tweet.likeCount,
        retweetCount: tweet.retweetCount,
        replyCount: tweet.replyCount,
        createdAt: tweet.createdAt,
        status: 'new',
        scannedAt,
      });
    }
  }

  return ranked.sort((a, b) => b.score - a.score);
}

export function saveSourceTweets(file: string, tweets: RankedSourceTweet[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(tweets, null, 2)}\n`);
}

export function capLimitPerUser(value: string | undefined): number {
  const parsed = parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 10;
  return Math.min(parsed, 10);
}

export function filterTweetsSince(tweets: Tweet[], lastScannedAt?: string): Tweet[] {
  if (!lastScannedAt) return tweets;
  const cutoff = new Date(lastScannedAt).getTime();
  if (!Number.isFinite(cutoff)) return tweets;

  return tweets.filter((tweet) => {
    if (!tweet.createdAt) return false;
    const createdAt = new Date(tweet.createdAt).getTime();
    return Number.isFinite(createdAt) && createdAt > cutoff;
  });
}

export function loadSourceScanState(file: string): SourceScanState {
  if (!fs.existsSync(file)) return { users: {} };
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as SourceScanState;
}

export function saveSourceScanState(file: string, state: SourceScanState): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

function isUsableSourceTweet(tweet: Tweet): boolean {
  const text = tweet.text.trim();
  if (text.length < 30 || text.length > 280) return false;
  if (tweet.inReplyToStatusId) return false;
  if (/https?:\/\//i.test(text)) return false;
  if (/giveaway|airdrop|抽奖|空投/i.test(text)) return false;
  return true;
}
