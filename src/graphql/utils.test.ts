import { describe, expect, it } from 'vitest';
import { parseUsersFromInstructions } from './utils.js';

describe('parseUsersFromInstructions', () => {
  it('extracts users from timeline entries and deduplicates by id', () => {
    const instructions = [
      {
        entries: [
          {
            content: {
              itemContent: {
                user_results: {
                  result: {
                    __typename: 'User',
                    rest_id: '1',
                    legacy: {
                      screen_name: 'alice',
                      name: 'Alice',
                      description: 'hello',
                      followers_count: 10,
                      friends_count: 5,
                    },
                    is_blue_verified: true,
                  },
                },
              },
            },
          },
          {
            content: {
              items: [
                {
                  item: {
                    itemContent: {
                      user_results: {
                        result: {
                          __typename: 'User',
                          rest_id: '1',
                          legacy: { screen_name: 'alice', name: 'Alice' },
                        },
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    ];

    expect(parseUsersFromInstructions(instructions)).toEqual([
      expect.objectContaining({
        id: '1',
        username: 'alice',
        name: 'Alice',
        description: 'hello',
        followersCount: 10,
        followingCount: 5,
        isBlueVerified: true,
      }),
    ]);
  });
});
