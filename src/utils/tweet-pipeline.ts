import fs from 'fs';
import path from 'path';
import type { RankedSourceTweet } from './source-scan.js';
import { buildChineseTweetDrafts, type TweetDraft } from './tweet-drafts.js';
import type { TweetQueueItem } from './tweet-queue.js';

export interface TweetImageJob {
  id: string;
  draftId: string;
  sourceTweetId: string;
  sourceUrl: string;
  sourceUser: string;
  prompt: string;
  provider: string;
  status: 'pending' | 'generated' | 'skipped' | 'error';
  imagePath?: string;
  createdAt: string;
  error?: string;
}

export interface TweetPipelinePlanInput {
  sourceTweets: RankedSourceTweet[];
  existingQueue: TweetQueueItem[];
  draftCount: number;
}

export interface TweetPipelinePlan {
  drafts: TweetDraft[];
  imageJobs: TweetImageJob[];
  nextQueue: TweetQueueItem[];
  nextSources: RankedSourceTweet[];
}

export function buildTweetPipelinePlan(input: TweetPipelinePlanInput): TweetPipelinePlan {
  const existingSourceIds = new Set(
    input.existingQueue
      .map((item) => item.sourceTweetId)
      .filter((id): id is string => Boolean(id))
  );
  const sourceById = new Map(input.sourceTweets.map((tweet) => [tweet.id, tweet]));

  const availableSources = input.sourceTweets
    .filter((tweet) => tweet.status === 'new')
    .filter((tweet) => !existingSourceIds.has(tweet.id));

  const drafts = buildChineseTweetDrafts(availableSources, input.draftCount);
  const draftedSourceIds = new Set(drafts.map((draft) => draft.sourceTweetId));

  const imageJobs = drafts.map((draft) => ({
    id: draft.id,
    draftId: draft.id,
    sourceTweetId: draft.sourceTweetId,
    sourceUrl: draft.sourceUrl,
    sourceUser: draft.sourceUser,
    prompt: draft.imagePrompt,
    provider: draft.imageProvider,
    status: 'pending' as const,
    imagePath: draft.imagePath,
    createdAt: draft.createdAt,
  }));

  const nextQueue: TweetQueueItem[] = [
    ...input.existingQueue,
    ...drafts.map((draft) => ({ ...draft })),
  ];

  const nextSources = input.sourceTweets.map((tweet) => {
    if (draftedSourceIds.has(tweet.id) || existingSourceIds.has(tweet.id)) {
      const existing = sourceById.get(tweet.id) || tweet;
      return { ...existing, status: 'used' as const };
    }
    return tweet;
  });

  return { drafts, imageJobs, nextQueue, nextSources };
}

export function saveTweetImageJobs(file: string, jobs: TweetImageJob[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(jobs, null, 2)}\n`);
}

export function loadTweetImageJobs(file: string): TweetImageJob[] {
  if (!fs.existsSync(file)) return [];
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as TweetImageJob[] | { items?: TweetImageJob[] };
  return Array.isArray(raw) ? raw : raw.items || [];
}
