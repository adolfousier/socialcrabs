import fs from 'fs';
import path from 'path';

export interface TweetSchedulerState {
  nextRunAt?: string;
  lastRunAt?: string;
  minHours?: number;
  maxHours?: number;
  lastStatus?: string;
  lastMessage?: string;
}

export function loadTweetSchedulerState(file: string): TweetSchedulerState {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as TweetSchedulerState;
}

export function saveTweetSchedulerState(file: string, state: TweetSchedulerState): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

export function computeNextRunAt(
  now: Date,
  minHours: number,
  maxHours: number,
  random: () => number = Math.random
): Date {
  const min = Math.min(minHours, maxHours);
  const max = Math.max(minHours, maxHours);
  const hours = min + (max - min) * random();
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

export function isSchedulerDue(state: TweetSchedulerState, now: Date = new Date()): boolean {
  if (!state.nextRunAt) return false;
  const next = new Date(state.nextRunAt).getTime();
  return Number.isFinite(next) && now.getTime() >= next;
}
