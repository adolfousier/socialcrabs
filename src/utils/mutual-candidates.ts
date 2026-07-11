import { normalizeTwitterUsername } from './safety.js';
import type { FollowQueueItem } from './follow-queue.js';

export interface MutualUser {
  id: string;
  username: string;
  name: string;
  description?: string;
  followersCount?: number;
  followingCount?: number;
  isBlueVerified?: boolean;
  profileImageUrl?: string;
}

export interface BuildMutualCandidatesOptions {
  selfUsername: string;
  followers: MutualUser[];
  following: MutualUser[];
  denylist?: string[];
}

export function buildMutualCandidates(options: BuildMutualCandidatesOptions): FollowQueueItem[] {
  const self = normalizeTwitterUsername(options.selfUsername).toLowerCase();
  const following = new Set(options.following.map((user) => normalizeTwitterUsername(user.username).toLowerCase()));
  const denied = new Set((options.denylist || []).map((name) => normalizeTwitterUsername(name).toLowerCase()));
  const seen = new Set<string>();
  const discoveredAt = new Date().toISOString();

  const candidates: FollowQueueItem[] = [];
  for (const follower of options.followers) {
    const username = normalizeTwitterUsername(follower.username);
    const key = username.toLowerCase();
    if (!username || key === self || following.has(key) || denied.has(key) || seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      username,
      name: follower.name,
      reason: 'follows_me_not_followed_back',
      status: 'pending',
      profileUrl: `https://x.com/${username}`,
      discoveredAt,
      followersCount: follower.followersCount,
      followingCount: follower.followingCount,
      isBlueVerified: follower.isBlueVerified,
    });
  }
  return candidates;
}

export function mergeCandidatesIntoFollowQueue(
  existing: FollowQueueItem[],
  candidates: FollowQueueItem[]
): FollowQueueItem[] {
  const seen = new Set(existing.map((item) => normalizeTwitterUsername(item.username).toLowerCase()));
  const merged = [...existing];

  for (const candidate of candidates) {
    const key = normalizeTwitterUsername(candidate.username).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(candidate);
  }

  return merged;
}
