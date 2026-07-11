import { describe, expect, it } from 'vitest';
import {
  buildUnfollowWatchOptions,
  buildUnfollowDailyTelegramMessage,
  extractUnfollowEvents,
  filterNewUnfollowers,
  markUnfollowersSeen,
  type UnfollowMonitorState,
} from './unfollow-monitor.js';

describe('unfollow monitor helpers', () => {
  it('extracts unfollower users from common opentwitter response shapes', () => {
    const events = extractUnfollowEvents({
      success: true,
      data: [
        {
          id: 1,
          twId: 123,
          twAccount: 'alice',
          twUserName: 'Alice',
          description: 'builder',
          profileUrl: 'https://pbs.twimg.com/profile_images/a.jpg',
          followerCount: 1200,
          friendCount: 88,
          createdAt: '2026-07-08T00:00:00Z',
        },
        {
          id: 2,
          screenName: '@bob',
          name: 'Bob',
          followersCount: 34,
        },
      ],
    }, 'blockheadchain_');

    expect(events).toEqual([
      {
        id: '123',
        username: 'alice',
        name: 'Alice',
        description: 'builder',
        profileUrl: 'https://x.com/alice',
        followerCount: 1200,
        followingCount: 88,
        eventAt: '2026-07-08T00:00:00Z',
        rawId: '1',
      },
      {
        id: 'bob',
        username: 'bob',
        name: 'Bob',
        profileUrl: 'https://x.com/bob',
        followerCount: 34,
      },
    ]);
  });

  it('deduplicates already reported unfollowers per monitored account', () => {
    const state: UnfollowMonitorState = {
      accounts: {
        blockheadchain_: {
          seenUnfollowerIds: {
            alice: { username: 'alice', firstSeenAt: '2026-07-07T00:00:00Z' },
          },
          lastCheckedAt: '2026-07-07T00:00:00Z',
        },
      },
    };
    const events = extractUnfollowEvents({ data: [
      { twId: 123, twAccount: 'alice', twUserName: 'Alice' },
      { twId: 456, twAccount: 'carol', twUserName: 'Carol' },
    ] }, 'blockheadchain_');

    expect(filterNewUnfollowers('blockheadchain_', events, state).map((event) => event.username)).toEqual(['carol']);

    const next = markUnfollowersSeen('blockheadchain_', events, state, '2026-07-08T10:00:00Z');
    expect(Object.keys(next.accounts.blockheadchain_.seenUnfollowerIds).sort()).toEqual(['123', '456', 'alice']);
    expect(next.accounts.blockheadchain_.lastCheckedAt).toBe('2026-07-08T10:00:00Z');
  });

  it('builds a concise Chinese Telegram daily report', () => {
    const message = buildUnfollowDailyTelegramMessage('blockheadchain_', [
      { id: '123', username: 'alice', name: 'Alice', profileUrl: 'https://x.com/alice', followerCount: 1200 },
      { id: '456', username: 'bob', name: 'Bob', profileUrl: 'https://x.com/bob' },
    ], '2026-07-08T10:00:00Z');

    expect(message).toContain('📉 X 取消关注周报');
    expect(message).toContain('监控账号：@blockheadchain_');
    expect(message).toContain('新增取消关注：2');
    expect(message).toContain('@alice');
    expect(message).toContain('followers 1200');
    expect(message).toContain('https://x.com/bob');
  });

  it('builds watch options that monitor only unfollow events by default', () => {
    expect(buildUnfollowWatchOptions()).toEqual({
      newTweetBol: false,
      newFlwBol: false,
      newUnFlwBol: true,
      newTweetReplyBol: false,
      newTweetQuoteBol: false,
      newRetweetBol: false,
      updateNameBol: false,
      updateDescBol: false,
      updateAvatarBol: false,
      updateBannerBol: false,
      newCaBol: false,
      tweetToppingBol: false,
    });
  });
});
