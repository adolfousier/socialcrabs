#!/usr/bin/env node
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import WebSocket from 'ws';
import {
  buildHotReplyPrompt,
  buildTelegramHotReplyNotification,
  buildTelegramReplyCopyMessage,
  cleanGeneratedReplyOutput,
  fallbackReply,
  getReplyHumanizerSkill,
  normalizeOpenTwitterEvent,
  shouldReplyToEvent,
  truncateReply,
  type NormalizedHotReplyEvent,
} from '../utils/hot-reply-flow.js';
import {
  sendTelegramSuccessNotification,
} from '../utils/socialcrabs-success-notifications.js';

interface HotReplyState {
  repliedTweetIds: Record<string, {
    sourceUrl: string;
    replyText?: string;
    replyUrl?: string;
    status: 'posted' | 'error' | 'skipped' | 'notified';
    at: string;
    error?: string;
  }>;
}

interface HotReplyConfig {
  accounts: string[];
  eventTypes: string[];
  minHotScore: number;
  minReplyScore: number;
  eventLogPath: string;
  statePath: string;
  replyDebugLogPath: string;
  replyAccount: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  dryRun: boolean;
}

const DEFAULT_CONFIG: HotReplyConfig = {
  accounts: [
    'ai_xiaomu',
    'cz_binance',
    'chuge857',
    'artinmemes',
    'BroBean88',
    'Xuegaogx',
    'daidaibtc',
    '_FORAB',
    'aleabitoreddit',
    'justinsuntron',
  ],
  eventTypes: ['NEW_TWEET', 'NEW_TWEET_QUOTE'],
  minHotScore: 0,
  minReplyScore: 70,
  eventLogPath: 'queues/opentwitter-events.jsonl',
  statePath: 'queues/hot-reply-flow-state.json',
  replyDebugLogPath: 'logs/hot-reply-generation-debug.jsonl',
  replyAccount: 'yoyo_aigo',
  telegramBotToken: process.env.NOTIFY_TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.NOTIFY_TELEGRAM_CHAT_ID,
  dryRun: false,
};

function parseArgs(argv: string[]): HotReplyConfig {
  const config = { ...DEFAULT_CONFIG };
  config.accounts = value(argv, 'accounts', config.accounts.join(',')).split(',').map((item) => item.trim()).filter(Boolean);
  config.eventTypes = value(argv, 'events', config.eventTypes.join(',')).split(',').map((item) => item.trim()).filter(Boolean);
  config.minHotScore = Number(value(argv, 'min-hot-score', String(config.minHotScore)));
  config.minReplyScore = Number(value(argv, 'min-reply-score', String(config.minReplyScore)));
  config.eventLogPath = value(argv, 'event-log', config.eventLogPath);
  config.statePath = value(argv, 'state', config.statePath);
  config.replyDebugLogPath = value(argv, 'reply-debug-log', config.replyDebugLogPath);
  config.replyAccount = value(argv, 'reply-account', config.replyAccount);
  config.telegramBotToken = value(argv, 'telegram-bot-token', config.telegramBotToken || '');
  config.telegramChatId = value(argv, 'telegram-chat-id', config.telegramChatId || '');
  config.dryRun = argv.includes('--dry-run');
  return config;
}

function value(argv: string[], name: string, fallback: string): string {
  const idx = argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  if (idx + 1 >= argv.length || argv[idx + 1].startsWith('--')) throw new Error(`Missing value for --${name}`);
  return argv[idx + 1];
}

function appendJsonl(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(data)}\n`);
}

function loadState(file: string): HotReplyState {
  if (!fs.existsSync(file)) return { repliedTweetIds: {} };
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as HotReplyState;
}

function saveState(file: string, state: HotReplyState): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

function truncateDebugText(text: string | undefined, maxChars = 20_000): string | undefined {
  if (text === undefined) return undefined;
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]` : text;
}

function writeReplyGenerationDebugLog(file: string, data: unknown): void {
  try {
    appendJsonl(file, data);
  } catch {
    // Debug logging must never block candidate notification.
  }
}

function generateReply(event: NormalizedHotReplyEvent, replyAccount: string, debugLogPath: string): string {
  const prompt = buildHotReplyPrompt(event, replyAccount);
  const humanizerSkill = getReplyHumanizerSkill(event.text);
  const startedAt = new Date().toISOString();
  const result = spawnSync('hermes', ['--skills', humanizerSkill, '--toolsets', 'safe', '--oneshot', prompt], {
    encoding: 'utf-8',
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      HERMES_SESSION_SOURCE: 'tool',
    },
  });
  const cleaned = result.status === 0 && result.stdout.trim()
    ? cleanGeneratedReplyOutput(result.stdout, 100)
    : '';
  const replyText = cleaned || truncateReply(fallbackReply(event), 100);
  writeReplyGenerationDebugLog(debugLogPath, {
    type: 'reply-generation-debug',
    at: new Date().toISOString(),
    startedAt,
    sourceUrl: event.url,
    tweetId: event.tweetId,
    sourceAccount: event.username,
    replyAccount,
    replyScore: event.replyScore,
    humanizerSkill,
    hermesStatus: result.status,
    hermesSignal: result.signal,
    hermesError: result.error ? String(result.error) : undefined,
    rawStdout: truncateDebugText(result.stdout),
    rawStderr: truncateDebugText(result.stderr),
    cleanedReply: cleaned || undefined,
    fallbackUsed: !cleaned,
    finalReply: replyText,
  });
  return replyText;
}

async function handleMessage(raw: string, config: HotReplyConfig): Promise<void> {
  let parsedMessage: unknown;
  try {
    parsedMessage = JSON.parse(raw);
  } catch {
    appendJsonl(config.eventLogPath, { type: 'non-json', raw, at: new Date().toISOString() });
    return;
  }

  const event = normalizeOpenTwitterEvent(parsedMessage);
  appendJsonl(config.eventLogPath, { type: 'opentwitter-ws', event, raw: parsedMessage, at: new Date().toISOString() });
  const candidate = event;
  if (!candidate) return;
  if (!shouldReplyToEvent(candidate, config)) {
    if (candidate) appendJsonl(config.eventLogPath, { type: 'reply-skip-score', sourceUrl: candidate.url, replyScore: candidate.replyScore, minReplyScore: config.minReplyScore, hotScore: candidate.hotScore, at: new Date().toISOString() });
    return;
  }

  const state = loadState(config.statePath);
  const existing = state.repliedTweetIds[candidate.tweetId];
  if (existing) return;

  const replyText = generateReply(candidate, config.replyAccount, config.replyDebugLogPath);
  if (config.dryRun) {
    state.repliedTweetIds[candidate.tweetId] = { status: 'skipped', sourceUrl: candidate.url, replyText, at: new Date().toISOString() };
    saveState(config.statePath, state);
    appendJsonl(config.eventLogPath, { type: 'reply-dry-run', sourceUrl: candidate.url, replyText, replyScore: candidate.replyScore, at: new Date().toISOString() });
    return;
  }

  const candidateNotified = await sendTelegramSuccessNotification(buildTelegramHotReplyNotification(candidate, replyText), {
    botToken: config.telegramBotToken,
    chatId: config.telegramChatId,
  });
  const copyNotified = await sendTelegramSuccessNotification(buildTelegramReplyCopyMessage(replyText), {
    botToken: config.telegramBotToken,
    chatId: config.telegramChatId,
  });
  state.repliedTweetIds[candidate.tweetId] = { status: 'notified', sourceUrl: candidate.url, replyText, at: new Date().toISOString() };
  saveState(config.statePath, state);
  appendJsonl(config.eventLogPath, { type: 'reply-candidate-telegram', sourceUrl: candidate.url, replyScore: candidate.replyScore, notified: candidateNotified, copyNotified, at: new Date().toISOString() });
}

function connect(config: HotReplyConfig): void {
  const token = process.env.TWITTER_TOKEN?.trim();
  if (!token) throw new Error('TWITTER_TOKEN is required in .env');
  const ws = new WebSocket(`wss://ai.6551.io/open/twitter_wss?token=${encodeURIComponent(token)}`);
  let pingTimer: NodeJS.Timeout | undefined;
  ws.on('open', () => {
    appendJsonl(config.eventLogPath, { type: 'ws-open', accounts: config.accounts, eventTypes: config.eventTypes, at: new Date().toISOString() });
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'twitter.subscribe' }));
    pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 25_000);
  });
  ws.on('message', (data) => {
    void handleMessage(data.toString(), config).catch((error) => appendJsonl(config.eventLogPath, { type: 'handler-error', error: String(error), at: new Date().toISOString() }));
  });
  ws.on('pong', () => {
    appendJsonl(config.eventLogPath, { type: 'ws-pong', at: new Date().toISOString() });
  });
  ws.on('close', (code, reason) => {
    if (pingTimer) clearInterval(pingTimer);
    appendJsonl(config.eventLogPath, { type: 'ws-close', code, reason: reason.toString(), at: new Date().toISOString() });
    setTimeout(() => connect(config), 10_000);
  });
  ws.on('error', (error) => {
    appendJsonl(config.eventLogPath, { type: 'ws-error', error: error.message, at: new Date().toISOString() });
  });
}

const config = parseArgs(process.argv.slice(2));
connect(config);
