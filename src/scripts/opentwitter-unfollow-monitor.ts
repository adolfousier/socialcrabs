#!/usr/bin/env node
import 'dotenv/config';
import {
  OpenTwitterClient,
  createOpenTwitterClientFromEnv,
} from '../opentwitter/client.js';
import { sendTelegramSuccessNotification } from '../utils/socialcrabs-success-notifications.js';
import {
  buildUnfollowDailyTelegramMessage,
  buildUnfollowWatchOptions,
  extractUnfollowEvents,
  filterNewUnfollowers,
  loadUnfollowMonitorState,
  markUnfollowNotificationSent,
  markUnfollowersSeen,
  saveUnfollowMonitorState,
  type UnfollowEvent,
} from '../utils/unfollow-monitor.js';

interface UnfollowMonitorConfig {
  account: string;
  statePath: string;
  maxResults: number;
  dryRun: boolean;
  json: boolean;
  skipWatchInit: boolean;
  sendEmpty: boolean;
}

const DEFAULT_CONFIG: UnfollowMonitorConfig = {
  account: 'blockheadchain_',
  statePath: 'queues/unfollow-monitor-state.json',
  maxResults: 100,
  dryRun: false,
  json: false,
  skipWatchInit: false,
  sendEmpty: true,
};

function parseArgs(argv: string[]): UnfollowMonitorConfig {
  const config = { ...DEFAULT_CONFIG };
  config.account = value(argv, 'account', config.account).replace(/^@/, '');
  config.statePath = value(argv, 'state', config.statePath);
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

async function ensureUnfollowWatch(client: OpenTwitterClient, account: string): Promise<void> {
  try {
    await client.addWatch(account, buildUnfollowWatchOptions());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/已在监控列表|already.*watch|already.*monitor/i.test(message)) return;
    throw error;
  }
}

async function run(config: UnfollowMonitorConfig): Promise<{
  account: string;
  totalFetched: number;
  newCount: number;
  newUnfollowers: UnfollowEvent[];
  notified: boolean;
  dryRun: boolean;
}> {
  const client = createOpenTwitterClientFromEnv();
  const now = new Date().toISOString();

  if (!config.skipWatchInit) await ensureUnfollowWatch(client, config.account);

  const raw = await client.getFollowerEvents(config.account, false, config.maxResults);
  const events = extractUnfollowEvents(raw, config.account);
  const state = loadUnfollowMonitorState(config.statePath);
  const newUnfollowers = filterNewUnfollowers(config.account, events, state);
  const message = buildUnfollowDailyTelegramMessage(config.account, newUnfollowers, now);

  let notified = false;
  if (!config.dryRun && (newUnfollowers.length > 0 || config.sendEmpty)) {
    notified = await sendTelegramSuccessNotification(message);
  }

  if (!config.dryRun) {
    const seenState = markUnfollowersSeen(config.account, events, state, now);
    const nextState = notified ? markUnfollowNotificationSent(config.account, seenState, now) : seenState;
    saveUnfollowMonitorState(config.statePath, nextState);
  }

  return {
    account: config.account,
    totalFetched: events.length,
    newCount: newUnfollowers.length,
    newUnfollowers,
    notified,
    dryRun: config.dryRun,
  };
}

const config = parseArgs(process.argv.slice(2));
run(config)
  .then((result) => {
    if (config.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`unfollow-monitor account=@${result.account} fetched=${result.totalFetched} new=${result.newCount} notified=${result.notified} dryRun=${result.dryRun}`);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
