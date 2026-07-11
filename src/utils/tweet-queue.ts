import fs from 'fs';
import path from 'path';

export type TweetQueueStatus = 'pending' | 'posted' | 'error' | 'skipped';

export interface TweetQueueItem {
  id: string;
  text: string;
  status?: TweetQueueStatus;
  language?: string;
  sourceTweetId?: string;
  sourceUrl?: string;
  sourceUser?: string;
  imagePath?: string;
  imagePrompt?: string;
  imageProvider?: string;
  imageModel?: string;
  createdAt?: string;
  postedAt?: string;
  postedUrl?: string;
  updatedAt?: string;
  error?: string;
  [key: string]: unknown;
}

export interface TweetQueue {
  items: TweetQueueItem[];
}

export function loadTweetQueue(queuePath: string): TweetQueue {
  if (!fs.existsSync(queuePath)) return { items: [] };
  const raw = JSON.parse(fs.readFileSync(queuePath, 'utf-8')) as TweetQueueItem[] | { items?: TweetQueueItem[] };
  const items = Array.isArray(raw) ? raw : raw.items || [];
  return { items: items.map((item) => ({ ...item, status: item.status || 'pending' })) };
}

export function saveTweetQueue(queuePath: string, items: TweetQueueItem[]): void {
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  fs.writeFileSync(queuePath, `${JSON.stringify(items, null, 2)}\n`);
}

export function selectPendingTweetItems(items: TweetQueueItem[], limit: number): TweetQueueItem[] {
  return items
    .filter((item) => (item.status || 'pending') === 'pending')
    .slice(0, Math.max(0, limit));
}

export function markTweetItem(
  items: TweetQueueItem[],
  id: string,
  status: TweetQueueStatus,
  extra: Partial<TweetQueueItem> = {}
): TweetQueueItem[] {
  const now = new Date().toISOString();
  return items.map((item) => {
    if (item.id !== id) return item;
    const updated: TweetQueueItem = {
      ...item,
      ...extra,
      status,
      updatedAt: now,
    };
    if (status === 'posted') {
      updated.postedAt = now;
      delete updated.error;
    }
    return updated;
  });
}
