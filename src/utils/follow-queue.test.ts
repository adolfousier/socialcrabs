import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  loadFollowQueue,
  saveFollowQueue,
  selectPendingFollowItems,
  markFollowItem,
} from './follow-queue.js';

describe('follow queue', () => {
  it('loads array entries and normalizes usernames', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'follow-queue-'));
    const queuePath = path.join(dir, 'follow.json');
    fs.writeFileSync(queuePath, JSON.stringify([
      '@alice',
      { username: 'https://x.com/bob', reason: 'follows me' },
      { username: 'carol', status: 'followed' },
    ]));

    const queue = loadFollowQueue(queuePath);

    expect(queue.items.map((item) => item.username)).toEqual(['alice', 'bob', 'carol']);
    expect(queue.items[0].status).toBe('pending');
    expect(queue.items[1].reason).toBe('follows me');
    expect(queue.items[2].status).toBe('followed');
  });

  it('selects only pending items up to limit', () => {
    const selected = selectPendingFollowItems([
      { username: 'alice', status: 'pending' },
      { username: 'bob', status: 'followed' },
      { username: 'carol', status: 'pending' },
    ], 1);

    expect(selected.map((item) => item.username)).toEqual(['alice']);
  });

  it('marks an item and preserves the rest of the queue', () => {
    const items = [
      { username: 'alice', status: 'pending' as const },
      { username: 'bob', status: 'pending' as const },
    ];

    const updated = markFollowItem(items, 'alice', 'followed', { error: undefined });

    expect(updated[0].status).toBe('followed');
    expect(updated[0].followedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(updated[1].status).toBe('pending');
  });

  it('saves pretty JSON and creates parent directories', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'follow-queue-save-'));
    const queuePath = path.join(dir, 'nested', 'follow.json');

    saveFollowQueue(queuePath, [{ username: 'alice', status: 'pending' }]);

    const content = fs.readFileSync(queuePath, 'utf-8');
    expect(content).toContain('\n  {');
    expect(JSON.parse(content)[0].username).toBe('alice');
  });
});
