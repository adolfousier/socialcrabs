import { describe, expect, it } from 'vitest';
import {
  buildMutualFollowWeeklyTelegramMessage,
  buildMutualFollowWatchOptions,
  computeKnownNonMutualFollowing,
  filterNewFollowerEvents,
  markFollowerEventsSeen,
  normalizeFollowingList,
  type MutualFollowMonitorState,
} from './mutual-follow-monitor.js';
import type { UnfollowEvent } from './unfollow-monitor.js';

describe('mutual follow monitor helpers', () => {
  const alice: UnfollowEvent = { id: '1', username: 'alice', name: 'Alice', profileUrl: 'https://x.com/alice', followerCount: 100 };
  const bob: UnfollowEvent = { id: '2', username: 'bob', name: 'Bob', profileUrl: 'https://x.com/bob', followerCount: 200 };
  const carol: UnfollowEvent = { id: '3', username: 'carol', name: 'Carol', profileUrl: 'https://x.com/carol', followerCount: 300 };

  it('normalizes manually supplied following lists from arrays and objects', () => {
    expect(normalizeFollowingList([' @Alice ', 'bob'])).toEqual(['alice', 'bob']);
    expect(normalizeFollowingList([{ username: '@Carol' }, { screenName: 'dave' }, { twAccount: 'eve' }])).toEqual(['carol', 'dave', 'eve']);
    expect(normalizeFollowingList({ following: ['alice'], data: ['ignored'] })).toEqual(['alice']);
  });

  it('deduplicates new follower events and updates known follower state', () => {
    const state: MutualFollowMonitorState = {
      accounts: {
        blockheadchain_: {
          knownFollowers: { '1': { username: 'alice', firstSeenAt: '2026-07-01T00:00:00Z' } },
          knownUnfollowers: {},
        },
      },
    };

    expect(filterNewFollowerEvents('blockheadchain_', [alice, bob], state).map((event) => event.username)).toEqual(['bob']);
    const next = markFollowerEventsSeen('blockheadchain_', [alice, bob], state, '2026-07-08T00:00:00Z');

    expect(Object.keys(next.accounts.blockheadchain_.knownFollowers).sort()).toEqual(['1', '2']);
    expect(next.accounts.blockheadchain_.lastCheckedAt).toBe('2026-07-08T00:00:00Z');
  });

  it('computes known non-mutual following from manual following minus known followers', () => {
    const state: MutualFollowMonitorState = {
      accounts: {
        blockheadchain_: {
          knownFollowers: { '1': { username: 'alice', firstSeenAt: '2026-07-01T00:00:00Z' } },
          knownUnfollowers: { '3': { username: 'carol', firstSeenAt: '2026-07-02T00:00:00Z' } },
        },
      },
    };

    expect(computeKnownNonMutualFollowing('blockheadchain_', ['alice', 'bob', 'carol'], state)).toEqual(['bob', 'carol']);
  });

  it('builds a weekly Chinese mutual follow report with scope caveat', () => {
    const message = buildMutualFollowWeeklyTelegramMessage({
      account: 'blockheadchain_',
      newFollowers: [alice],
      newUnfollowers: [carol],
      knownNonMutualFollowing: ['bob', 'carol'],
      followingSource: 'queues/blockheadchain-following.json',
      at: '2026-07-08T00:00:00Z',
    });

    expect(message).toContain('👥 X 互关状态周报');
    expect(message).toContain('监控账号：@blockheadchain_');
    expect(message).toContain('新增关注我的：1');
    expect(message).toContain('取消关注我的：1');
    expect(message).toContain('已知疑似未回关：2');
    expect(message).toContain('@bob');
    expect(message).toContain('基于 opentwitter 事件增量');
  });

  it('builds watch options for both new follower and unfollower events', () => {
    expect(buildMutualFollowWatchOptions()).toMatchObject({
      newTweetBol: false,
      newFlwBol: true,
      newUnFlwBol: true,
      newTweetReplyBol: false,
      newTweetQuoteBol: false,
    });
  });
});
