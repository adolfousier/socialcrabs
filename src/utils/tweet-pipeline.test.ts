import { describe, expect, it } from 'vitest';
import {
  buildTweetPipelinePlan,
} from './tweet-pipeline.js';

const sourceTweets = [
  {
    id: 'source-1',
    text: '蓝鸟会成立15个月了，大家一起成长，很多小伙伴在X上从几千粉丝增长到几万粉丝，危机中互相托举。',
    sourceUser: 'NFTCPS',
    sourceName: '鸟哥',
    sourceUrl: 'https://x.com/NFTCPS',
    sourceTweetUrl: 'https://x.com/NFTCPS/status/source-1',
    score: 100,
    status: 'new' as const,
  },
  {
    id: 'source-2',
    text: '创业公司真正重要的不是讲故事，而是产品和增长能不能持续兑现，穿越周期。',
    sourceUser: 'builder',
    sourceName: 'Builder',
    sourceUrl: 'https://x.com/builder',
    sourceTweetUrl: 'https://x.com/builder/status/source-2',
    score: 80,
    status: 'new' as const,
  },
];

describe('tweet pipeline', () => {
  it('creates pending Chinese drafts, image jobs, and marks used source tweets', () => {
    const plan = buildTweetPipelinePlan({
      sourceTweets,
      existingQueue: [],
      draftCount: 2,
    });

    expect(plan.drafts).toHaveLength(2);
    expect(plan.imageJobs).toHaveLength(2);
    expect(plan.nextQueue.map((item) => item.sourceTweetId)).toEqual(['source-1', 'source-2']);
    expect(plan.nextSources.map((tweet) => tweet.status)).toEqual(['used', 'used']);
    expect(plan.drafts[0]).toEqual(expect.objectContaining({
      status: 'pending',
      language: 'zh',
      sourceTweetId: 'source-1',
      imageProvider: 'gpt-image-2',
    }));
    expect(plan.imageJobs[0]).toEqual(expect.objectContaining({
      id: plan.drafts[0].id,
      sourceTweetId: 'source-1',
      status: 'pending',
    }));
  });

  it('does not generate duplicate drafts for source tweets already in queue', () => {
    const plan = buildTweetPipelinePlan({
      sourceTweets,
      existingQueue: [{ id: 'old', text: '旧草稿', status: 'pending', sourceTweetId: 'source-1' }],
      draftCount: 2,
    });

    expect(plan.drafts).toHaveLength(1);
    expect(plan.drafts[0].sourceTweetId).toBe('source-2');
    expect(plan.nextQueue.map((item) => item.sourceTweetId)).toEqual(['source-1', 'source-2']);
    expect(plan.nextSources.find((tweet) => tweet.id === 'source-1')?.status).toBe('used');
  });
});
