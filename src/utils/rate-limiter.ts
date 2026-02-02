import fs from 'fs';
import path from 'path';
import { log } from './logger.js';
import type { Platform, ActionType, RateLimitStatus } from '../types/index.js';

interface ActionRecord {
  timestamp: number;
  action: ActionType;
}

interface PlatformActions {
  [key: string]: ActionRecord[];
}

interface RateLimitStore {
  [platform: string]: PlatformActions;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class RateLimiter {
  private store: RateLimitStore = {};
  private limits: Record<Platform, Record<string, number>>;
  private persistPath: string;

  constructor(
    limits: Record<Platform, Record<string, number>>,
    persistPath?: string
  ) {
    this.limits = limits;
    this.persistPath = persistPath || './rate-limits.json';
    this.load();
  }

  /**
   * Check if an action is allowed and record it if so
   */
  async check(platform: Platform, action: ActionType): Promise<RateLimitStatus> {
    const key = this.getKey(action);
    const limit = this.getLimit(platform, key);
    const now = Date.now();

    // Initialize platform store if needed
    if (!this.store[platform]) {
      this.store[platform] = {};
    }
    if (!this.store[platform][key]) {
      this.store[platform][key] = [];
    }

    // Filter to only actions in the last 24 hours
    const dayAgo = now - DAY_MS;
    this.store[platform][key] = this.store[platform][key].filter(
      (record) => record.timestamp > dayAgo
    );

    const count = this.store[platform][key].length;
    const remaining = Math.max(0, limit - count);
    const resetAt = this.store[platform][key].length > 0
      ? this.store[platform][key][0].timestamp + DAY_MS
      : now + DAY_MS;

    const status: RateLimitStatus = {
      remaining,
      total: limit,
      resetAt,
      allowed: remaining > 0,
    };

    if (!status.allowed) {
      log.warn(`Rate limit exceeded for ${platform}/${action}`, {
        platform,
        action,
        count,
        limit,
      });
    }

    return status;
  }

  /**
   * Record an action
   */
  async record(platform: Platform, action: ActionType): Promise<void> {
    const key = this.getKey(action);

    if (!this.store[platform]) {
      this.store[platform] = {};
    }
    if (!this.store[platform][key]) {
      this.store[platform][key] = [];
    }

    this.store[platform][key].push({
      timestamp: Date.now(),
      action,
    });

    await this.persist();

    log.debug(`Recorded action ${platform}/${action}`, {
      platform,
      action,
      count: this.store[platform][key].length,
    });
  }

  /**
   * Get remaining actions for a specific action type
   */
  getRemaining(platform: Platform, action: ActionType): number {
    const key = this.getKey(action);
    const limit = this.getLimit(platform, key);
    const now = Date.now();
    const dayAgo = now - DAY_MS;

    if (!this.store[platform]?.[key]) {
      return limit;
    }

    const count = this.store[platform][key].filter(
      (record) => record.timestamp > dayAgo
    ).length;

    return Math.max(0, limit - count);
  }

  /**
   * Get all rate limit statuses for a platform
   */
  getStatus(platform: Platform): Record<string, RateLimitStatus> {
    const now = Date.now();
    const dayAgo = now - DAY_MS;
    const result: Record<string, RateLimitStatus> = {};

    const platformLimits = this.limits[platform] || {};

    for (const [key, limit] of Object.entries(platformLimits)) {
      const actions = this.store[platform]?.[key]?.filter(
        (record) => record.timestamp > dayAgo
      ) || [];

      const count = actions.length;
      const remaining = Math.max(0, limit - count);

      result[key] = {
        remaining,
        total: limit,
        resetAt: actions.length > 0 ? actions[0].timestamp + DAY_MS : now + DAY_MS,
        allowed: remaining > 0,
      };
    }

    return result;
  }

  /**
   * Reset rate limits for a platform (use sparingly)
   */
  reset(platform: Platform, action?: ActionType): void {
    if (action) {
      const key = this.getKey(action);
      if (this.store[platform]?.[key]) {
        this.store[platform][key] = [];
      }
    } else {
      this.store[platform] = {};
    }
    this.persist();
    log.info(`Reset rate limits for ${platform}${action ? `/${action}` : ''}`);
  }

  private getKey(action: ActionType): string {
    // Normalize action names to match limit keys
    const keyMap: Record<string, string> = {
      view_story: 'like', // Count story views against likes
      view_profile: 'like', // Profile views are lightweight
      retweet: 'like',
      reply: 'comment',
      connect: 'follow',
    };
    return keyMap[action] || action;
  }

  private getLimit(platform: Platform, key: string): number {
    return this.limits[platform]?.[key] || 50; // Default limit
  }

  private async persist(): Promise<void> {
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.persistPath, JSON.stringify(this.store, null, 2));
    } catch (error) {
      log.error('Failed to persist rate limits', { error: String(error) });
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(this.persistPath)) {
        const data = fs.readFileSync(this.persistPath, 'utf-8');
        this.store = JSON.parse(data);
        log.debug('Loaded rate limit state from disk');
      }
    } catch (error) {
      log.error('Failed to load rate limits', { error: String(error) });
      this.store = {};
    }
  }
}

// Default rate limits
export const DEFAULT_RATE_LIMITS: Record<Platform, Record<string, number>> = {
  instagram: {
    like: 100,
    comment: 30,
    follow: 50,
    dm: 50,
    post: 10,
  },
  twitter: {
    like: 100,
    comment: 50,
    follow: 50,
    dm: 20,
    post: 10,
  },
  linkedin: {
    like: 100,
    comment: 30,
    follow: 15,
    dm: 40,
    post: 5,
  },
};
