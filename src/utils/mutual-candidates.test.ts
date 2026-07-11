import { describe, expect, it } from 'vitest';
import { buildMutualCandidates, mergeCandidatesIntoFollowQueue } from './mutual-candidates.js';

describe('buildMutualCandidates', () => {
  it('returns followers that are not already followed and skips self/denylist', () => {
    const candidates = buildMutualCandidates({
      selfUsername: 'me',
      followers: [
        { id: '1', username: 'alice', name: 'Alice' },
        { id: '2', username: 'bob', name: 'Bob' },
        { id: '3', username: 'me', name: 'Me' },
        { id: '4', username: 'spam', name: 'Spam' },
      ],
      following: [
        { id: '2', username: 'bob', name: 'Bob' },
      ],
      denylist: ['spam'],
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        username: 'alice',
        name: 'Alice',
        status: 'pending',
        reason: 'follows_me_not_followed_back',
      }),
    ]);
  });
});

describe('mergeCandidatesIntoFollowQueue', () => {
  it('adds new candidates without replacing existing queue items', () => {
    const merged = mergeCandidatesIntoFollowQueue(
      [
        { username: 'alice', status: 'followed' },
        { username: 'carol', status: 'pending' },
      ],
      [
        { username: 'alice', name: 'Alice', status: 'pending', reason: 'candidate' },
        { username: 'bob', name: 'Bob', status: 'pending', reason: 'candidate' },
      ]
    );

    expect(merged.map((item) => item.username)).toEqual(['alice', 'carol', 'bob']);
    expect(merged[0].status).toBe('followed');
    expect(merged[2]).toEqual(expect.objectContaining({ username: 'bob', status: 'pending' }));
  });
});
