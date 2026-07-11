import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  loadTweetQueue,
  markTweetItem,
  saveTweetQueue,
  selectPendingTweetItems,
} from './tweet-queue.js';

describe('tweet queue', () => {
  it('loads pending tweet drafts from json', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweet-queue-load-'));
    const queuePath = path.join(dir, 'tweets.json');
    fs.writeFileSync(queuePath, JSON.stringify([
      { id: 'a', text: '第一条中文草稿', status: 'pending', imagePath: '/tmp/a.png' },
      { id: 'b', text: '第二条中文草稿', status: 'posted' },
    ]));

    const queue = loadTweetQueue(queuePath);

    expect(queue.items).toHaveLength(2);
    expect(queue.items[0]).toEqual(expect.objectContaining({ id: 'a', status: 'pending', imagePath: '/tmp/a.png' }));
  });

  it('selects only pending items up to limit', () => {
    const selected = selectPendingTweetItems([
      { id: 'a', text: '一', status: 'pending' },
      { id: 'b', text: '二', status: 'posted' },
      { id: 'c', text: '三', status: 'pending' },
    ], 1);

    expect(selected.map((item) => item.id)).toEqual(['a']);
  });

  it('marks a tweet as posted and stores url/image metadata', () => {
    const updated = markTweetItem([
      { id: 'a', text: '一', status: 'pending', imagePath: '/tmp/a.png' },
      { id: 'b', text: '二', status: 'pending' },
    ], 'a', 'posted', { postedUrl: 'https://x.com/me/status/1' });

    expect(updated[0]).toEqual(expect.objectContaining({
      id: 'a',
      status: 'posted',
      postedUrl: 'https://x.com/me/status/1',
    }));
    expect(updated[0].postedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(updated[1].status).toBe('pending');
  });

  it('saves pretty json and creates parent directories', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweet-queue-save-'));
    const queuePath = path.join(dir, 'nested', 'tweets.json');

    saveTweetQueue(queuePath, [{ id: 'a', text: '中文草稿', status: 'pending' }]);

    const content = fs.readFileSync(queuePath, 'utf-8');
    expect(content).toContain('\n  {');
    expect(JSON.parse(content)[0].id).toBe('a');
  });
});
