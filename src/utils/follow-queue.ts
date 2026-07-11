import fs from 'fs';
import path from 'path';
import { normalizeTwitterUsername } from './safety.js';

export type FollowQueueStatus = 'pending' | 'followed' | 'error' | 'skipped';

export interface FollowQueueItem {
  username: string;
  status?: FollowQueueStatus;
  reason?: string;
  profileUrl?: string;
  discoveredAt?: string;
  followedAt?: string;
  updatedAt?: string;
  error?: string;
  [key: string]: unknown;
}

export interface FollowQueue {
  items: FollowQueueItem[];
}

type RawFollowQueue = Array<string | FollowQueueItem> | { items?: Array<string | FollowQueueItem> };

export function loadFollowQueue(queuePath: string): FollowQueue {
  if (!fs.existsSync(queuePath)) {
    return { items: [] };
  }

  const raw = JSON.parse(fs.readFileSync(queuePath, 'utf-8')) as RawFollowQueue;
  const rawItems = Array.isArray(raw) ? raw : raw.items || [];

  return {
    items: rawItems.map(normalizeFollowQueueItem),
  };
}

export function saveFollowQueue(queuePath: string, items: FollowQueueItem[]): void {
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  fs.writeFileSync(queuePath, `${JSON.stringify(items, null, 2)}\n`);
}

export function selectPendingFollowItems(
  items: FollowQueueItem[],
  limit: number
): FollowQueueItem[] {
  return items
    .filter((item) => (item.status || 'pending') === 'pending')
    .slice(0, Math.max(0, limit));
}

export function markFollowItem(
  items: FollowQueueItem[],
  username: string,
  status: FollowQueueStatus,
  extra: Partial<FollowQueueItem> = {}
): FollowQueueItem[] {
  const normalized = normalizeTwitterUsername(username);
  const now = new Date().toISOString();

  return items.map((item) => {
    if (normalizeTwitterUsername(item.username) !== normalized) {
      return item;
    }

    const updated: FollowQueueItem = {
      ...item,
      ...extra,
      username: normalized,
      status,
      updatedAt: now,
    };

    if (status === 'followed') {
      updated.followedAt = now;
      delete updated.error;
    }

    return updated;
  });
}

function normalizeFollowQueueItem(raw: string | FollowQueueItem): FollowQueueItem {
  const item: FollowQueueItem = typeof raw === 'string' ? { username: raw } : { ...raw };
  const username = normalizeTwitterUsername(item.username);

  return {
    ...item,
    username,
    profileUrl: item.profileUrl || `https://x.com/${username}`,
    status: item.status || 'pending',
  };
}
