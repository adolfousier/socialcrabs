import fs from 'fs';
import path from 'path';
import { normalizeTwitterUsername } from './safety.js';

export interface UnfollowEvent {
  id: string;
  username: string;
  name?: string;
  description?: string;
  profileUrl: string;
  followerCount?: number;
  followingCount?: number;
  eventAt?: string;
  rawId?: string;
}

export interface UnfollowMonitorAccountState {
  lastCheckedAt?: string;
  lastNotifiedAt?: string;
  seenUnfollowerIds: Record<string, { username: string; firstSeenAt: string }>;
}

export interface UnfollowMonitorState {
  accounts: Record<string, UnfollowMonitorAccountState>;
}

type JsonRecord = Record<string, unknown>;

export function loadUnfollowMonitorState(file: string): UnfollowMonitorState {
  if (!fs.existsSync(file)) return { accounts: {} };
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as UnfollowMonitorState;
}

export function saveUnfollowMonitorState(file: string, state: UnfollowMonitorState): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

export function buildUnfollowWatchOptions(): Record<string, boolean> {
  return {
    newTweetBol: false,
    newFlwBol: false,
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

export function extractUnfollowEvents(response: unknown, monitoredAccount: string): UnfollowEvent[] {
  const rows = collectUserLikeObjects(unwrapPayload(response));
  const normalizedMonitor = normalizeTwitterUsername(monitoredAccount);
  return rows
    .map((row) => mapUnfollowEvent(row, normalizedMonitor))
    .filter((event): event is UnfollowEvent => Boolean(event?.id && event.username));
}

export function filterNewUnfollowers(account: string, events: UnfollowEvent[], state: UnfollowMonitorState): UnfollowEvent[] {
  const accountState = getAccountState(state, account);
  return events.filter((event) => !accountState.seenUnfollowerIds[event.id] && !accountState.seenUnfollowerIds[event.username]);
}

export function markUnfollowersSeen(account: string, events: UnfollowEvent[], state: UnfollowMonitorState, at = new Date().toISOString()): UnfollowMonitorState {
  const normalized = normalizeTwitterUsername(account);
  const next: UnfollowMonitorState = { accounts: { ...state.accounts } };
  const accountState = getAccountState(next, normalized);
  const seenUnfollowerIds = { ...accountState.seenUnfollowerIds };
  for (const event of events) {
    seenUnfollowerIds[event.id] = { username: event.username, firstSeenAt: seenUnfollowerIds[event.id]?.firstSeenAt || at };
  }
  next.accounts[normalized] = { ...accountState, seenUnfollowerIds, lastCheckedAt: at };
  return next;
}

export function markUnfollowNotificationSent(account: string, state: UnfollowMonitorState, at = new Date().toISOString()): UnfollowMonitorState {
  const normalized = normalizeTwitterUsername(account);
  const next: UnfollowMonitorState = { accounts: { ...state.accounts } };
  const accountState = getAccountState(next, normalized);
  next.accounts[normalized] = { ...accountState, lastNotifiedAt: at };
  return next;
}

export function buildUnfollowDailyTelegramMessage(account: string, newUnfollowers: UnfollowEvent[], at = new Date().toISOString()): string {
  const normalized = normalizeTwitterUsername(account);
  if (newUnfollowers.length === 0) {
    return [
      '📉 X 取消关注周报',
      '',
      `监控账号：@${normalized}`,
      '新增取消关注：0',
      '',
      `时间：${at}`,
    ].join('\n');
  }

  const rows = newUnfollowers.slice(0, 50).map((event, index) => {
    const name = event.name && event.name !== event.username ? `（${event.name}）` : '';
    const followers = event.followerCount === undefined ? '' : ` · followers ${event.followerCount}`;
    return `${index + 1}. @${event.username}${name}${followers}\n   ${event.profileUrl}`;
  });
  const truncated = newUnfollowers.length > 50 ? [`…另有 ${newUnfollowers.length - 50} 个未展示`] : [];

  return [
    '📉 X 取消关注周报',
    '',
    `监控账号：@${normalized}`,
    `新增取消关注：${newUnfollowers.length}`,
    '',
    ...rows,
    ...truncated,
    '',
    `时间：${at}`,
  ].join('\n');
}

function getAccountState(state: UnfollowMonitorState, account: string): UnfollowMonitorAccountState {
  const normalized = normalizeTwitterUsername(account);
  return state.accounts[normalized] || { seenUnfollowerIds: {} };
}

function unwrapPayload(data: unknown): unknown {
  let current = data;
  for (let i = 0; i < 4; i += 1) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) break;
    const record = current as JsonRecord;
    if (record.data !== undefined) { current = record.data; continue; }
    if (record.result !== undefined) { current = record.result; continue; }
    if (record.list !== undefined) { current = record.list; continue; }
    if (record.items !== undefined) { current = record.items; continue; }
    if (record.records !== undefined) { current = record.records; continue; }
    break;
  }
  return current;
}

function collectUserLikeObjects(value: unknown): JsonRecord[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(collectUserLikeObjects);
  const record = value as JsonRecord;
  if (hasAnyKey(record, ['twAccount', 'screenName', 'username', 'userScreenName', 'twId', 'userIdStr'])) return [record];
  return Object.values(record).flatMap(collectUserLikeObjects);
}

function mapUnfollowEvent(row: JsonRecord, monitoredAccount: string): UnfollowEvent | undefined {
  const username = normalizeTwitterUsername(stringField(row, ['twAccount', 'screenName', 'username', 'userScreenName']));
  const id = stringField(row, ['twId', 'userIdStr', 'userId']) || username;
  if (!username || username === monitoredAccount) return undefined;
  const rawId = stringField(row, ['id']);
  return removeUndefinedFields({
    id,
    username,
    name: stringField(row, ['twUserName', 'name', 'userName']) || undefined,
    description: stringField(row, ['description', 'bio']) || undefined,
    profileUrl: `https://x.com/${username}`,
    followerCount: numberField(row, ['followerCount', 'followersCount', 'userFollowers']),
    followingCount: numberField(row, ['friendCount', 'followingCount', 'friendsCount']),
    eventAt: stringField(row, ['createdAt', 'created_at', 'eventAt']) || undefined,
    rawId: rawId && rawId !== id && id !== username ? rawId : undefined,
  });
}

function removeUndefinedFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T;
}

function hasAnyKey(record: JsonRecord, keys: string[]): boolean {
  return keys.some((key) => record[key] !== undefined);
}

function stringField(record: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function numberField(record: JsonRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}
