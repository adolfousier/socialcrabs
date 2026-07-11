#!/usr/bin/env node
import 'dotenv/config';
import { OpenTwitterClient, createOpenTwitterClientFromEnv } from '../opentwitter/client.js';
import { sendTelegramSuccessNotification } from '../utils/socialcrabs-success-notifications.js';
import { extractUnfollowEvents, type UnfollowEvent } from '../utils/unfollow-monitor.js';
import {
  buildMutualFollowWatchOptions,
  buildMutualFollowWeeklyTelegramMessage,
  computeKnownNonMutualFollowing,
  filterNewFollowerEvents,
  filterNewUnfollowerEvents,
  loadFollowingList,
  loadMutualFollowMonitorState,
  markFollowerEventsSeen,
  markMutualFollowNotificationSent,
  markUnfollowerEventsSeen,
  saveMutualFollowMonitorState,
} from '../utils/mutual-follow-monitor.js';

interface MutualFollowMonitorConfig {
  account: string;
  statePath: string;
  followingPath: string;
  maxResults: number;
  dryRun: boolean;
  json: boolean;
  skipWatchInit: boolean;
  sendEmpty: boolean;
}

const DEFAULT_CONFIG: MutualFollowMonitorConfig = {
  account: 'blockheadchain_',
  statePath: 'queues/mutual-follow-monitor-state.json',
  followingPath: 'queues/blockheadchain-following.json',
  maxResults: 100,
  dryRun: false,
  json: false,
  skipWatchInit: false,
  sendEmpty: true,
};

function parseArgs(argv: string[]): MutualFollowMonitorConfig {
  const config = { ...DEFAULT_CONFIG };
  config.account = value(argv, 'account', config.account).replace(/^@/, '');
  config.statePath = value(argv, 'state', config.statePath);
  config.followingPath = value(argv, 'following', config.followingPath);
  config.maxResults = Number(value(argv, 'max-results', String(config.maxResults)));
  config.dryRun = argv.includes('--dry-run');
  config.json = argv.includes('--json');
  config.skipWatchInit = argv.includes('--skip-watch-init');
  config.sendEmpty = !argv.includes('--no-send-empty');
  return config;
}

function value(argv: string[], name: string, fallback: string): string {
  const idx = argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  if (idx + 1 >= argv.length || argv[idx + 1].startsWith('--')) throw new Error(`Missing value for --${name}`);
  return argv[idx + 1];
}

async function ensureMutualFollowWatch(client: OpenTwitterClient, account: string): Promise<void> {
  try {
    await client.addWatch(account, buildMutualFollowWatchOptions());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/已在监控列表|already.*watch|already.*monitor/i.test(message)) return;
    throw error;
  }
}

async function run(config: MutualFollowMonitorConfig): Promise<{
  account: string;
  totalFollowersFetched: number;
  totalUnfollowersFetched: number;
  newFollowerCount: number;
  newUnfollowerCount: number;
  knownNonMutualCount: number;
  knownNonMutualFollowing: string[];
  newFollowers: UnfollowEvent[];
  newUnfollowers: UnfollowEvent[];
  notified: boolean;
  dryRun: boolean;
}> {
  const client = createOpenTwitterClientFromEnv();
  const now = new Date().toISOString();

  if (!config.skipWatchInit) await ensureMutualFollowWatch(client, config.account);

  const [rawFollowers, rawUnfollowers] = await Promise.all([
    client.getFollowerEvents(config.account, true, config.maxResults),
    client.getFollowerEvents(config.account, false, config.maxResults),
  ]);
  const followers = extractUnfollowEvents(rawFollowers, config.account);
  const unfollowers = extractUnfollowEvents(rawUnfollowers, config.account);
  const state = loadMutualFollowMonitorState(config.statePath);
  const newFollowers = filterNewFollowerEvents(config.account, followers, state);
  const newUnfollowers = filterNewUnfollowerEvents(config.account, unfollowers, state);

  const following = loadFollowingList(config.followingPath);
  const seenFollowerState = markFollowerEventsSeen(config.account, followers, state, now);
  const seenBothState = markUnfollowerEventsSeen(config.account, unfollowers, seenFollowerState, now);
  const knownNonMutualFollowing = computeKnownNonMutualFollowing(config.account, following, seenBothState);
  const message = buildMutualFollowWeeklyTelegramMessage({
    account: config.account,
    newFollowers,
    newUnfollowers,
    knownNonMutualFollowing,
    followingSource: following.length ? config.followingPath : undefined,
    at: now,
  });

  let notified = false;
  if (!config.dryRun && (newFollowers.length > 0 || newUnfollowers.length > 0 || knownNonMutualFollowing.length > 0 || config.sendEmpty)) {
    notified = await sendTelegramSuccessNotification(message);
  }

  if (!config.dryRun) {
    const nextState = notified ? markMutualFollowNotificationSent(config.account, seenBothState, now) : seenBothState;
    saveMutualFollowMonitorState(config.statePath, nextState);
  }

  return {
    account: config.account,
    totalFollowersFetched: followers.length,
    totalUnfollowersFetched: unfollowers.length,
    newFollowerCount: newFollowers.length,
    newUnfollowerCount: newUnfollowers.length,
    knownNonMutualCount: knownNonMutualFollowing.length,
    knownNonMutualFollowing,
    newFollowers,
    newUnfollowers,
    notified,
    dryRun: config.dryRun,
  };
}

const config = parseArgs(process.argv.slice(2));
run(config)
  .then((result) => {
    if (config.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`mutual-follow-monitor account=@${result.account} followers=${result.totalFollowersFetched} unfollowers=${result.totalUnfollowersFetched} newFollowers=${result.newFollowerCount} newUnfollowers=${result.newUnfollowerCount} knownNonMutual=${result.knownNonMutualCount} notified=${result.notified} dryRun=${result.dryRun}`);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
