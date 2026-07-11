import { normalizeTwitterUsername } from './safety.js';

export type HotReplyEventType = 'NEW_TWEET' | 'NEW_TWEET_QUOTE';

export interface NormalizedHotReplyEvent {
  eventType: string;
  username: string;
  tweetId: string;
  text: string;
  url: string;
  createdAt?: string;
  hotScore: number;
  replyScore: number;
  metrics: {
    favoriteCount: number;
    retweetCount: number;
    replyCount: number;
    quoteCount: number;
    viewCount: number;
    bookmarkCount: number;
  };
  raw: unknown;
}

export interface HotReplyDecisionConfig {
  accounts: string[];
  eventTypes: string[];
  minHotScore: number;
  minReplyScore?: number;
}

type EventRecord = Record<string, unknown>;

export function normalizeOpenTwitterEvent(message: unknown): NormalizedHotReplyEvent | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const root = message as EventRecord;
  const params = (root.params && typeof root.params === 'object' ? root.params : root) as EventRecord;
  const content = (params.content && typeof params.content === 'object' ? params.content : {}) as EventRecord;
  const eventType = stringField(params, ['eventType', 'type']);
  const username = normalizeTwitterUsername(stringField(params, ['twAccount', 'userScreenName', 'username']) || stringField(content, ['userScreenName', 'username']));
  const tweetId = stringField(content, ['id', 'idStr', 'id_str', 'twId']) || stringField(params, ['twId', 'tweetId']);
  const text = stringField(content, ['text', 'fullText', 'full_text', 'content']);
  if (!eventType || !username || !tweetId || !text) return undefined;
  const favoriteCount = numberField(content, ['favoriteCount', 'likeCount', 'favorite_count']);
  const retweetCount = numberField(content, ['retweetCount', 'retweet_count']);
  const replyCount = numberField(content, ['replyCount', 'reply_count']);
  const quoteCount = numberField(content, ['quoteCount', 'quote_count']);
  const viewCount = numberField(content, ['viewCount', 'views', 'view_count']);
  const bookmarkCount = numberField(content, ['bookmarkCount', 'bookmark_count']);
  const hotScore = favoriteCount + retweetCount * 3 + replyCount * 2 + quoteCount * 2;
  const event = {
    eventType,
    username,
    tweetId,
    text,
    url: `https://x.com/${username}/status/${tweetId}`,
    createdAt: stringField(content, ['createdAt', 'created_at']) || stringField(params, ['createdAt']),
    hotScore,
    metrics: { favoriteCount, retweetCount, replyCount, quoteCount, viewCount, bookmarkCount },
    raw: message,
  };
  return { ...event, replyScore: scoreReplyCandidate(event) };
}

export function shouldReplyToEvent(event: NormalizedHotReplyEvent | undefined, config: HotReplyDecisionConfig): boolean {
  if (!event) return false;
  const accounts = new Set(config.accounts.map(normalizeTwitterUsername));
  const eventTypes = new Set(config.eventTypes);
  if (!accounts.has(event.username)) return false;
  if (!eventTypes.has(event.eventType)) return false;
  if (event.hotScore < config.minHotScore) return false;
  if (event.replyScore < (config.minReplyScore ?? 80)) return false;
  if (/giveaway|airdrop|抽奖|空投/i.test(event.text)) return false;
  return true;
}

export function scoreReplyCandidate(event: Pick<NormalizedHotReplyEvent, 'eventType' | 'text' | 'hotScore'> & { createdAt?: string; metrics?: Partial<NormalizedHotReplyEvent['metrics']> }): number {
  const text = event.text.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  if (!text || /giveaway|airdrop|抽奖|空投/i.test(text)) return 0;

  let score = 45;
  if (event.eventType === 'NEW_TWEET') score += 10;
  if (event.eventType === 'NEW_TWEET_QUOTE') score += 6;
  if (event.eventType === 'NEW_TWEET_REPLY' || event.eventType === 'NEW_RETWEET') score -= 15;

  const length = [...text].length;
  if (length >= 35 && length <= 220) score += 20;
  else if (length >= 18 && length < 35) score += 10;
  else score -= 15;

  if (/https?:\/\/|t\.co\/|pic\.x\.com/i.test(event.text)) score -= 10;
  if (/[？?]|为什么|怎么|because|why|how|will|should|能不能|是否/i.test(text)) score += 5;
  if (/AI|agent|模型|智能体|BTC|ETH|币安|Binance|crypto|市场|产品|增长/i.test(text)) score += 8;

  const engagement = event.hotScore + (event.metrics?.viewCount || 0) / 100 + (event.metrics?.bookmarkCount || 0) * 2;
  score += Math.min(12, Math.floor(Math.log1p(Math.max(0, engagement)) * 4));

  if (event.createdAt) {
    const ageMs = Date.now() - new Date(event.createdAt).getTime();
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= 2 * 60 * 60 * 1000) score += 5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function buildHotReplyPrompt(event: { username: string; text: string; url: string }, replyAccount = 'yoyo_aigo'): string {
  const replyInChinese = isLikelyChinese(event.text);
  const humanizerSkill = replyInChinese ? 'humanizer-zh' : 'humanizer';
  const languageLines = replyInChinese
    ? ['用中文回复。', '40-90 个中文字符左右。', '先根据原文观点写回复，再用 humanizer-zh 去掉 AI 味。像真人随手回复，克制、有判断，不要油腻。']
    : ['Reply in English.', 'Keep it to one short, natural sentence.', 'Write the reply from the source post, then apply humanizer so it sounds like a real person, not a brand account.'];
  return [
    `You are the X/Twitter reply assistant for @${replyAccount}.`,
    `Use the ${humanizerSkill} skill for the final rewrite.`,
    'Reply requirements:',
    '- Only output the final reply text. No explanation, no title.',
    ...languageLines,
    '- Do not @ anyone, add links, add hashtags, or give investment advice.',
    `Source account: @${event.username}`,
    `Source URL: ${event.url}`,
    `Source text: ${event.text}`,
  ].join('\n');
}

export function getReplyHumanizerSkill(text: string): 'humanizer' | 'humanizer-zh' {
  return isLikelyChinese(text) ? 'humanizer-zh' : 'humanizer';
}

export function truncateReply(text: string, maxChars = 100): string {
  const cleaned = text
    .replace(/^回复[:：]\s*/u, '')
    .replace(/^reply[:：]\s*/iu, '')
    .replace(/["“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 1)).replace(/[，。；、\s]+$/u, '')}…`;
}

export function cleanGeneratedReplyOutput(output: string, maxChars = 100): string {
  const raw = output.trim();
  if (!raw) return '';
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const withoutLabels = lines
    .map((line) => line.replace(/^(final reply|final|answer|回复|reply)[:：]\s*/iu, '').trim())
    .filter(Boolean);
  const nonEchoLines = withoutLabels.filter((line) =>
    !/^Query[:：]/iu.test(line)
    && !/^Session[:：]\s*\S+/iu.test(line)
    && !/^hermes\s+--resume\s+\S+/iu.test(line)
    && !/^Messages:\s*\d+\s*\(/iu.test(line)
    && !/^Duration:\s*\d+(?:\.\d+)?\s*(?:ms|s|sec|secs|seconds)?$/iu.test(line)
    && !/^Goodbye!?\s*[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]*$/iu.test(line)
  );
  const candidate = nonEchoLines.at(-1) || '';
  if (!candidate) return '';
  if (/You are the X\/Twitter reply assistant|Source account:|Source URL:|Source text:|Reply requirements:|humanizer skill/i.test(candidate)) return '';
  return truncateReply(candidate, maxChars);
}

export function buildXurlReplyArgs(tweetId: string, replyText: string, username = 'yoyo_aigo'): string[] {
  return ['--app', 'socialcrabs', '--username', username, 'reply', tweetId, replyText];
}

export interface XurlReplyOutcome {
  id?: string;
  error?: string;
}

export function buildXurlReplyResultRecords(
  event: NormalizedHotReplyEvent,
  replyText: string,
  outcome: XurlReplyOutcome,
  replyAccount = 'yoyo_aigo'
): {
  state: { sourceUrl: string; replyText: string; replyUrl?: string; status: 'posted' | 'error'; at: string; error?: string };
  log: { type: 'reply-posted'; sourceUrl: string; replyText: string; replyScore: number; replyUrl?: string; error?: string; at: string };
} {
  const at = new Date().toISOString();
  const replyUrl = outcome.id ? `https://x.com/${replyAccount}/status/${outcome.id}` : undefined;
  return {
    state: {
      status: replyUrl ? 'posted' : 'error',
      sourceUrl: event.url,
      replyText,
      replyUrl,
      error: outcome.error,
      at,
    },
    log: {
      type: 'reply-posted',
      sourceUrl: event.url,
      replyText,
      replyScore: event.replyScore,
      replyUrl,
      error: outcome.error,
      at,
    },
  };
}

export function buildTelegramHotReplyNotification(event: NormalizedHotReplyEvent, suggestedReply: string): string {
  const preview = event.text.replace(/\s+/g, ' ').trim();
  return [
    '🐦 X 70+ reply candidate',
    '',
    `Account: @${event.username}`,
    `Score: ${event.replyScore}`,
    `Event: ${event.eventType}`,
    `URL: ${event.url}`,
    '',
    `Source: ${preview.length > 240 ? `${preview.slice(0, 237)}...` : preview}`,
    '',
    `推荐回复：${suggestedReply.trim()}`,
  ].join('\n');
}

export function buildTelegramReplyCopyMessage(replyText: string): string {
  return replyText.trim();
}

export function isXReplyForbiddenError(error: string | undefined): boolean {
  if (!error) return false;
  return /(?:"status"\s*:\s*403|\b403\b|Forbidden)/i.test(error)
    && /Reply to this conversation is not allowed|not been mentioned|otherwise engaged by the author/i.test(error);
}

export function buildTelegramReplyBlockedNotification(
  event: NormalizedHotReplyEvent,
  attemptedReply: string,
  error: string | undefined,
  replyAccount = 'yoyo_aigo'
): string {
  const sourcePreview = event.text.replace(/\s+/g, ' ').trim();
  const errorPreview = sanitizeErrorPreview(error || '403 Forbidden');
  return [
    '⚠️ X 自动评论被 403 拦截',
    '',
    `评论账号：@${replyAccount}`,
    `原账号：@${event.username}`,
    `评分：${event.replyScore}`,
    `事件：${event.eventType}`,
    `原推：${event.url}`,
    '',
    `原文：${sourcePreview.length > 220 ? `${sourcePreview.slice(0, 217)}...` : sourcePreview}`,
    '',
    `计划评论：${attemptedReply}`,
    '',
    `X 错误：${errorPreview}`,
  ].join('\n');
}

function sanitizeErrorPreview(error: string): string {
  return error
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\s+/g, ' ')
    .replace(/(Authorization|Bearer|token|BOT_TOKEN|CHAT_ID|api[_-]?key|password)[^,}\]]*/gi, '$1 [REDACTED]')
    .trim()
    .slice(0, 500);
}

export function fallbackReply(event: NormalizedHotReplyEvent): string {
  const text = event.text.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  const first = text.split(/[。！？!?]/).find(Boolean) || text;
  if (isLikelyChinese(text)) {
    if (/税|税制|税率|收入|打工|创业|经商|资本积累|资本收入|资产/i.test(first)) return truncateReply(`${first}。税制本质是在分配激励，收入和资产怎么被对待，会直接改变人的选择。`, 100);
    if (/AI|智能体|模型|agent/i.test(first)) return truncateReply(`${first}。我会看它能不能真的进日常工作。`, 100);
    if (/币安|Binance|crypto|BTC|ETH|加密/i.test(first)) return truncateReply(`${first}。先看真实需求和流动性怎么走。`, 100);
    return truncateReply(`${first}。更该拆的是它改变了谁的成本，又让谁多了选择。`, 100);
  }
  if (/AI|agent|model|compute/i.test(first)) return truncateReply(`${first}. The useful test is whether people keep using it after the demo.`);
  if (/Binance|crypto|BTC|ETH|token|chain/i.test(first)) return truncateReply(`${first}. I'd watch real demand and liquidity before calling it.`);
  return truncateReply(`${first}. Worth watching, but I would wait for the next data point.`);
}

function isLikelyChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/u.test(text);
}

function stringField(record: EventRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function numberField(record: EventRecord, keys: string[]): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}
