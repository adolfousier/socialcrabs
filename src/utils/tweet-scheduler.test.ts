import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  computeNextRunAt,
  isSchedulerDue,
  loadTweetSchedulerState,
  saveTweetSchedulerState,
} from './tweet-scheduler.js';

describe('tweet scheduler', () => {
  it('computes a next run time between min and max hours', () => {
    const now = new Date('2026-07-04T00:00:00.000Z');
    const next = computeNextRunAt(now, 6, 8, () => 0.5);

    expect(next.toISOString()).toBe('2026-07-04T07:00:00.000Z');
  });

  it('is due only when now is at or after nextRunAt', () => {
    expect(isSchedulerDue({ nextRunAt: '2026-07-04T07:00:00.000Z' }, new Date('2026-07-04T06:59:59.000Z'))).toBe(false);
    expect(isSchedulerDue({ nextRunAt: '2026-07-04T07:00:00.000Z' }, new Date('2026-07-04T07:00:00.000Z'))).toBe(true);
  });

  it('treats missing nextRunAt as not due until initialized', () => {
    expect(isSchedulerDue({}, new Date('2026-07-04T07:00:00.000Z'))).toBe(false);
  });

  it('loads and saves scheduler state', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweet-scheduler-'));
    const file = path.join(dir, 'nested', 'state.json');

    saveTweetSchedulerState(file, {
      nextRunAt: '2026-07-04T07:00:00.000Z',
      minHours: 6,
      maxHours: 8,
    });

    expect(loadTweetSchedulerState(file)).toEqual({
      nextRunAt: '2026-07-04T07:00:00.000Z',
      minHours: 6,
      maxHours: 8,
    });
  });
});
