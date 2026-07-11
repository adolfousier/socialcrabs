import fs from 'fs';
import path from 'path';
import { normalizeTwitterUsername } from './safety.js';
import type { UnfollowEvent } from './unfollow-monitor.js';

export interface MutualFollowMonitorAccountState {
  lastCheckedAt?: string;
  lastNotifiedAt?: string;
  knownFollowers: Record<string, { username: string; firstSeenAt: string }>;
  knownUnfollowers: Record<string, { username: string; firstSeenAt: string }>;
}

export interface MutualFollowMonitorState {
  accounts: Record<string, MutualFollowMonitorAccountState>;
}

export interface MutualFollowWeeklyReportInput {
  account: string;
  newFollowers: UnfollowEvent[];
  newUnfollowers: UnfollowEvent[];
  knownNonMutualFollowing: string[];
  followingSource?: string;
  at?: string;
}

type FollowingRecord = Record<string, unknown>;

export function loadMutualFollowMonitorState(file: string): MutualFollowMonitorState {
  if (!fs.existsSync(file)) return { accounts: {} };
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as MutualFollowMonitorState;
}

export function saveMutualFollowMonitorState(file: string, state: MutualFollowMonitorState): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

export function loadFollowingList(file: string): string[] {
  if (!fs.existsSync(file)) return [];
  return normalizeFollowingList(JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown);
}

export function normalizeFollowingList(input: unknown): string[] {
  const values = collectFollowingValues(input);
  return Array.from(new Set(values.map((value) => normalizeTwitterUsername(value).toLowerCase()).filter(Boolean))).sort();
}

export function buildMutualFollowWatchOptions(): Record<string, boolean> {
  return {
    newTweetBol: false,
    newFlwBol: true,
    newUnFlwBol: true,
    newTweetReplyBol: false,
    newTweetQuoteBol: false,
    newRetweetBol: false,
    updateNameBol: false,
    updateDescBol: false,
    updateAvatarBol: false,
    updateBannerBol: false,
    newCaBol: false,
    tweetToppingBol: false,
  };
}

export function filterNewFollowerEvents(account: string, events: UnfollowEvent[], state: MutualFollowMonitorState): UnfollowEvent[] {
  const accountState = getAccountState(state, account);
  return events.filter((event) => !accountState.knownFollowers[event.id] && !accountState.knownFollowers[event.username]);
}

export function filterNewUnfollowerEvents(account: string, events: UnfollowEvent[], state: MutualFollowMonitorState): UnfollowEvent[] {
  const accountState = getAccountState(state, account);
  return events.filter((event) => !accountState.knownUnfollowers[event.id] && !accountState.knownUnfollowers[event.username]);
}

export function markFollowerEventsSeen(account: string, events: UnfollowEvent[], state: MutualFollowMonitorState, at = new Date().toISOString()): MutualFollowMonitorState {
  const normalized = normalizeTwitterUsername(account);
  const next: MutualFollowMonitorState = { accounts: { ...state.accounts } };
  const accountState = getAccountState(next, normalized);
  const knownFollowers = { ...accountState.knownFollowers };
  for (const event of events) {
    knownFollowers[event.id] = { username: event.username, firstSeenAt: knownFollowers[event.id]?.firstSeenAt || at };
  }
  next.accounts[normalized] = { ...accountState, knownFollowers, lastCheckedAt: at };
  return next;
}

export function markUnfollowerEventsSeen(account: string, events: UnfollowEvent[], state: MutualFollowMonitorState, at = new Date().toISOString()): MutualFollowMonitorState {
  const normalized = normalizeTwitterUsername(account);
  const next: MutualFollowMonitorState = { accounts: { ...state.accounts } };
  const accountState = getAccountState(next, normalized);
  const knownUnfollowers = { ...accountState.knownUnfollowers };
  const knownFollowers = { ...accountState.knownFollowers };
  for (const event of events) {
    knownUnfollowers[event.id] = { username: event.username, firstSeenAt: knownUnfollowers[event.id]?.firstSeenAt || at };
    delete knownFollowers[event.id];
    delete knownFollowers[event.username];
  }
  next.accounts[normalized] = { ...accountState, knownFollowers, knownUnfollowers, lastCheckedAt: at };
  return next;
}

export function markMutualFollowNotificationSent(account: string, state: MutualFollowMonitorState, at = new Date().toISOString()): MutualFollowMonitorState {
  const normalized = normalizeTwitterUsername(account);
  const next: MutualFollowMonitorState = { accounts: { ...state.accounts } };
  const accountState = getAccountState(next, normalized);
  next.accounts[normalized] = { ...accountState, lastNotifiedAt: at };
  return next;
}

export function computeKnownNonMutualFollowing(account: string, following: string[], state: MutualFollowMonitorState): string[] {
  const accountState = getAccountState(state, account);
  const knownFollowerNames = new Set(Object.values(accountState.knownFollowers).map((item) => item.username));
  const knownUnfollowerNames = new Set(Object.values(accountState.knownUnfollowers).map((item) => item.username));
  return normalizeFollowingList(following)
    .filter((username) => !knownFollowerNames.has(username) || knownUnfollowerNames.has(username));
}

export function buildMutualFollowWeeklyTelegramMessage(input: MutualFollowWeeklyReportInput): string {
  const at = input.at || new Date().toISOString();
  const account = normalizeTwitterUsername(input.account);
  const rows = [
    '👥 X 互关状态周报',
    '',
    `监控账号：@${account}`,
    `新增关注我的：${input.newFollowers.length}`,
    `取消关注我的：${input.newUnfollowers.length}`,
    `已知疑似未回关：${input.knownNonMutualFollowing.length}`,
    input.followingSource ? `Following 来源：${input.followingSource}` : 'Following 来源：未提供；疑似未回关只基于已知增量状态',
    '',
    '说明：基于 opentwitter 事件增量，不代表历史全量互关列表。',
    '',
  ];
  rows.push(...section('新增关注我的', input.newFollowers.map(formatEventRow)));
  rows.push(...section('取消关注我的', input.newUnfollowers.map(formatEventRow)));
  rows.push(...section('已知疑似未回关', input.knownNonMutualFollowing.slice(0, 50).map((username, index) => `${index + 1}. @${username}\n   https://x.com/${username}`)));
  if (input.knownNonMutualFollowing.length > 50) rows.push(`…另有 ${input.knownNonMutualFollowing.length - 50} 个未展示`);
  rows.push('', `时间：${at}`);
  return rows.join('\n');
}

function section(title: string, lines: string[]): string[] {
  return [`${title}：`, ...(lines.length ? lines : ['无']), ''];
}

function formatEventRow(event: UnfollowEvent, index: number): string {
  const name = event.name && event.name !== event.username ? `（${event.name}）` : '';
  const followers = event.followerCount === undefined ? '' : ` · followers ${event.followerCount}`;
  return `${index + 1}. @${event.username}${name}${followers}\n   ${event.profileUrl}`;
}

function getAccountState(state: MutualFollowMonitorState, account: string): MutualFollowMonitorAccountState {
  const normalized = normalizeTwitterUsername(account);
  return state.accounts[normalized] || { knownFollowers: {}, knownUnfollowers: {} };
}

function collectFollowingValues(input: unknown): string[] {
  if (!input) return [];
  if (typeof input === 'string' || typeof input === 'number') return [String(input)];
  if (Array.isArray(input)) return input.flatMap(collectFollowingValues);
  if (typeof input !== 'object') return [];
  const record = input as FollowingRecord;
  const direct = stringField(record, ['username', 'screenName', 'twAccount', 'userScreenName']);
  if (direct) return [direct];
  if (record.following !== undefined) return collectFollowingValues(record.following);
  if (record.users !== undefined) return collectFollowingValues(record.users);
  if (record.items !== undefined) return collectFollowingValues(record.items);
  return [];
}

function stringField(record: FollowingRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}
