import fs from 'fs';
import path from 'path';
import type { Tweet } from '../graphql/types.js';
import type { MultiAccountTarget } from './multi-account-pipeline.js';
import type { SourceUser } from './source-scan.js';
import { applyHumanizerZh, stableTextIndex } from './humanizer-zh.js';
import { normalizeTwitterUsername } from './safety.js';

export interface HotTweetCandidate extends Tweet {
  hotScore: number;
}

export interface AutoPublishPlan {
  account: string;
  text: string;
  imageSkill: string;
  imagePrompt: string;
  squareAlias?: string;
  xurlApp?: string;
  sourceTweetId: string;
  sourceUser: string;
  sourceUrl: string;
  hotScore: number;
  status: 'pending';
}

export interface AutoPublishState {
  lastWindowStartAt?: string;
  lastWindowEndAt?: string;
  sources?: Record<string, { lastProcessedAt: string }>;
  targetAccountCursor?: number;
  publishedSourceTweets?: Record<string, {
    sourceUser: string;
    sourceUrl: string;
    firstPostedAt: string;
    accounts: Record<string, { postedAt: string; postedUrl?: string }>;
  }>;
}

export interface CollectionWindow {
  startAt: string;
  endAt: string;
  due: boolean;
}

export interface PendingAutoPublishRun {
  createdAt: string;
  statePath: string;
  window: CollectionWindow;
  dueSourceUsernames: string[];
  plans: AutoPublishPlan[];
  imagePath?: string;
}

export function loadAutoPublishState(file: string): AutoPublishState {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as AutoPublishState;
}

export function saveAutoPublishState(file: string, state: AutoPublishState): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

export function buildPendingAutoPublishRun(input: {
  statePath: string;
  window: CollectionWindow;
  dueSources: SourceUser[];
  plans: AutoPublishPlan[];
  imagePath?: string;
  createdAt?: Date;
}): PendingAutoPublishRun {
  return {
    createdAt: (input.createdAt || new Date()).toISOString(),
    statePath: input.statePath,
    window: input.window,
    dueSourceUsernames: input.dueSources.map((source) => normalizeTwitterUsername(source.username)).filter(Boolean),
    plans: input.plans,
    imagePath: input.imagePath,
  };
}

export function defaultPendingAutoPublishRunPath(statePath: string, run: PendingAutoPublishRun): string {
  const first = run.plans[0];
  const slug = first
    ? `${normalizeTwitterUsername(first.account)}_${String(first.sourceTweetId).replace(/[^0-9A-Za-z_-]/g, '')}`
    : `run_${run.createdAt.replace(/[^0-9A-Za-z_-]/g, '')}`;
  return path.join(path.dirname(statePath), 'auto-publish-pending', `${slug}.json`);
}

export function savePendingAutoPublishRun(file: string, run: PendingAutoPublishRun): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(run, null, 2)}\n`);
}

export function loadPendingAutoPublishRun(file: string): PendingAutoPublishRun {
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as PendingAutoPublishRun;
}

export function deletePendingAutoPublishRun(file: string): void {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export function computeContinuousCollectionWindow(state: AutoPublishState, now: Date, intervalHours = 6): CollectionWindow {
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const nowMs = now.getTime();
  const savedEnd = state.lastWindowEndAt ? new Date(state.lastWindowEndAt).getTime() : NaN;
  const startMs = Number.isFinite(savedEnd) ? savedEnd : nowMs - intervalMs;
  const endMs = Number.isFinite(savedEnd) ? startMs + intervalMs : nowMs;
  return {
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(endMs).toISOString(),
    due: endMs <= nowMs,
  };
}

export function buildNextAutoPublishState(state: AutoPublishState, window: CollectionWindow): AutoPublishState {
  return {
    ...state,
    lastWindowStartAt: window.startAt,
    lastWindowEndAt: window.endAt,
  };
}

export function filterDueSourceUsers(sources: SourceUser[], state: AutoPublishState, now: Date, cooldownHours = 6): SourceUser[] {
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const nowMs = now.getTime();
  return sources.filter((source) => {
    const username = normalizeTwitterUsername(source.username);
    const lastProcessedAt = state.sources?.[username]?.lastProcessedAt;
    if (!lastProcessedAt) return true;
    const lastMs = new Date(lastProcessedAt).getTime();
    return !Number.isFinite(lastMs) || nowMs - lastMs >= cooldownMs;
  });
}

export function markSourceUsersProcessed(state: AutoPublishState, sources: SourceUser[], processedAt: Date): AutoPublishState {
  const next: AutoPublishState = { ...state, sources: { ...(state.sources || {}) } };
  for (const source of sources) {
    const username = normalizeTwitterUsername(source.username);
    if (!username) continue;
    next.sources![username] = { lastProcessedAt: processedAt.toISOString() };
  }
  return next;
}

export function getPublishedSourceTweetIds(state: AutoPublishState): Set<string> {
  return new Set(Object.keys(state.publishedSourceTweets || {}));
}

export function selectRotatingTargetAccounts(accounts: MultiAccountTarget[], state: AutoPublishState, limit = 1): MultiAccountTarget[] {
  const enabled = accounts.filter((account) => account.enabled);
  if (enabled.length === 0 || limit <= 0) return [];
  const start = Math.max(0, state.targetAccountCursor || 0) % enabled.length;
  const selected: MultiAccountTarget[] = [];
  for (let i = 0; i < Math.min(limit, enabled.length); i += 1) {
    selected.push(enabled[(start + i) % enabled.length]);
  }
  return selected;
}

export function advanceTargetAccountCursor(state: AutoPublishState, accounts: MultiAccountTarget[], postedAccountCount: number): AutoPublishState {
  const enabledCount = accounts.filter((account) => account.enabled).length;
  if (enabledCount === 0 || postedAccountCount <= 0) return state;
  return {
    ...state,
    targetAccountCursor: ((state.targetAccountCursor || 0) + postedAccountCount) % enabledCount,
  };
}

export function markAutoPublishPlansPosted(
  state: AutoPublishState,
  plans: Array<Pick<AutoPublishPlan, 'account' | 'sourceTweetId' | 'sourceUser' | 'sourceUrl'> & { postedUrl?: string; status?: string }>,
  postedAt: Date
): AutoPublishState {
  const next: AutoPublishState = {
    ...state,
    publishedSourceTweets: { ...(state.publishedSourceTweets || {}) },
  };
  for (const plan of plans) {
    if (plan.status && plan.status !== 'posted') continue;
    const sourceTweetId = String(plan.sourceTweetId || '');
    const account = normalizeTwitterUsername(plan.account);
    if (!sourceTweetId || !account) continue;
    const existing = next.publishedSourceTweets![sourceTweetId] || {
      sourceUser: normalizeTwitterUsername(plan.sourceUser),
      sourceUrl: plan.sourceUrl,
      firstPostedAt: postedAt.toISOString(),
      accounts: {},
    };
    next.publishedSourceTweets![sourceTweetId] = {
      ...existing,
      sourceUser: existing.sourceUser || normalizeTwitterUsername(plan.sourceUser),
      sourceUrl: existing.sourceUrl || plan.sourceUrl,
      accounts: {
        ...existing.accounts,
        [account]: { postedAt: postedAt.toISOString(), postedUrl: plan.postedUrl },
      },
    };
  }
  return next;
}

export function selectRecentHotTextTweets(
  tweets: Tweet[],
  options: { now?: Date; lastHours?: number; startAt?: Date; endAt?: Date; limit: number; minScore?: number }
): HotTweetCandidate[] {
  const end = options.endAt ?? options.now;
  if (!end) throw new Error('selectRecentHotTextTweets requires either endAt or now');
  const cutoff = options.startAt?.getTime() ?? end.getTime() - (options.lastHours ?? 6) * 60 * 60 * 1000;
  const endMs = end.getTime();
  const minScore = options.minScore ?? 1;

  return tweets
    .filter((tweet) => {
      if (!tweet.createdAt) return false;
      const createdAt = new Date(tweet.createdAt).getTime();
      if (!Number.isFinite(createdAt) || createdAt <= cutoff || createdAt > endMs) return false;
      if (!isEligibleSourceTweet(tweet)) return false;
      return hotScore(tweet) >= minScore;
    })
    .map((tweet) => ({ ...tweet, hotScore: hotScore(tweet) }))
    .sort((a, b) => b.hotScore - a.hotScore)
    .slice(0, Math.max(0, options.limit));
}

export function buildAutoPublishPlans(options: {
  tweets: Tweet[];
  accounts: MultiAccountTarget[];
  now: Date;
  lastHours?: number;
  startAt?: Date;
  endAt?: Date;
  minScore?: number;
  maxChars?: number;
  excludeSourceTweetIds?: Set<string>;
}): AutoPublishPlan[] {
  const excludeSourceTweetIds = options.excludeSourceTweetIds || new Set<string>();
  const selected = selectRecentHotTextTweets(options.tweets, {
    now: options.now,
    lastHours: options.lastHours,
    startAt: options.startAt,
    endAt: options.endAt,
    limit: options.accounts.length + excludeSourceTweetIds.size,
    minScore: options.minScore,
  }).filter((tweet) => !excludeSourceTweetIds.has(tweet.id)).slice(0, options.accounts.length);
  const maxChars = options.maxChars ?? 220;
  const plans: AutoPublishPlan[] = [];

  for (let i = 0; i < options.accounts.length; i += 1) {
    const account = options.accounts[i];
    if (!account.enabled) continue;
    const source = selected[i];
    if (!source) break;
    const text = humanizeChineseTweet(rewriteTweetForAccount(source.text, account, i), maxChars, account.username, i);
    const imageSkill = normalizeImageSkill(account.imageSkill);
    const sourceUser = normalizeTwitterUsername(source.author.username);
    plans.push({
      account: account.username,
      text,
      imageSkill,
      imagePrompt: buildImagePromptForTweet(text, imageSkill),
      squareAlias: account.squareAlias,
      xurlApp: account.xurlApp,
      sourceTweetId: source.id,
      sourceUser,
      sourceUrl: `https://x.com/${sourceUser}/status/${source.id}`,
      hotScore: source.hotScore,
      status: 'pending',
    });
  }

  return plans;
}

export function buildXurlAccountArgs(account: string, xurlApp?: string): string[] {
  const username = normalizeTwitterUsername(account);
  const app = (xurlApp || '').trim();
  return app ? ['--app', app, '--username', username] : ['--username', username];
}

export function humanizeChineseTweet(input: string, maxChars = 220, account?: string, variant = 0): string {
  return truncateTwitterWeighted(applyHumanizerZh(input, { account, variant }), maxChars);
}

export function buildAutoPublishHermesPrompt(input: {
  sourceText: string;
  draftText: string;
  account: string;
  style?: string;
  maxChars?: number;
}): string {
  const maxChars = input.maxChars ?? 220;
  return [
    `你是 SocialCrabs 的 X/Twitter 发推改写助手，目标账号 @${normalizeTwitterUsername(input.account)}。`,
    '任务：基于来源推文，输出一条可直接发布到 X 的中文推文。',
    '只输出最终推文正文，不要标题、解释、Markdown、引号或编号。',
    `长度：60-120 个中文字符优先，信息密度要够；Twitter 加权长度绝不能超过 ${maxChars}。`,
    '不要只写一句空泛结论。至少保留一个具体判断、一个原因或后果，让读者知道这条推文在说什么。',
    '风格：像真人顺手发的观点，不要营销腔，不要三段式总结，不要“值得关注/真正值得看/别只看”这类固定 AI 味句式。',
    input.style ? `账号风格：${input.style}` : undefined,
    '',
    `来源推文：${input.sourceText.replace(/\s+/g, ' ').trim()}`,
    `当前草稿：${input.draftText.replace(/\s+/g, ' ').trim()}`,
  ].filter((line): line is string => line !== undefined).join('\n');
}

export function cleanAutoPublishGeneratedText(output: string, maxChars = 220, minWeight = 0): string {
  const lines = output
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^(final tweet|final|answer|tweet|推文|正文)[:：]\s*/iu, '').trim())
    .filter(Boolean)
    .filter((line) =>
      !/^Query[:：]/iu.test(line)
      && !/^Session[:：]\s*\S+/iu.test(line)
      && !/^hermes\s+--resume\s+\S+/iu.test(line)
      && !/^Messages:\s*\d+\s*\(/iu.test(line)
      && !/^Duration:\s*\d+(?:\.\d+)?\s*(?:ms|s|sec|secs|seconds)?$/iu.test(line)
      && !/^Goodbye!?\s*[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]*$/iu.test(line)
    );
  const candidate = lines.at(-1) || '';
  if (!candidate) return '';
  if (/SocialCrabs|X\/Twitter 发推改写助手|来源推文|当前草稿|只输出最终推文正文/i.test(candidate)) return '';
  const cleaned = candidate.replace(/[“”"]/g, '').trim();
  if (twitterWeightedLength(cleaned) < minWeight) return '';
  return truncateTwitterWeighted(cleaned, maxChars);
}

export function twitterWeightedLength(text: string): number {
  let length = 0;
  for (const char of text) {
    const code = char.codePointAt(0) || 0;
    length += isSingleWeightTwitterChar(code) ? 1 : 2;
  }
  return length;
}

export function truncateTwitterWeighted(text: string, maxWeight: number): string {
  if (twitterWeightedLength(text) <= maxWeight) return text;
  const ellipsis = '…';
  const ellipsisWeight = twitterWeightedLength(ellipsis);
  let output = '';
  let weight = 0;
  for (const char of text) {
    const code = char.codePointAt(0) || 0;
    const charWeight = isSingleWeightTwitterChar(code) ? 1 : 2;
    if (weight + charWeight + ellipsisWeight > maxWeight) break;
    output += char;
    weight += charWeight;
  }
  return output.replace(/[，。；、\s]+$/u, '') + ellipsis;
}

function isSingleWeightTwitterChar(code: number): boolean {
  return code <= 0x10ff
    || (code >= 0x2000 && code <= 0x200d)
    || (code >= 0x2010 && code <= 0x201f)
    || (code >= 0x2032 && code <= 0x2037);
}

export function normalizeImageSkill(imageSkill?: string): string {
  const value = (imageSkill || '').trim();
  return value || 'ian-xiaohei-illustrations';
}

export function buildImagePromptForTweet(tweetText: string, imageSkill = 'ian-xiaohei-illustrations'): string {
  const skill = normalizeImageSkill(imageSkill);
  if (skill === 'guizang-social-card-skill') return buildGuizangSocialCardPrompt(tweetText);
  if (skill === 'ian-xiaohei-illustrations') return buildIanXiaoheiPrompt(tweetText);
  return buildCustomSkillPrompt(tweetText, skill);
}

function buildIanXiaoheiPrompt(tweetText: string): string {
  return [
    'Generate one standalone 16:9 horizontal Chinese article illustration in Ian Xiaohei style.',
    'Visual DNA: 纯白背景。极简黑色手绘线稿，轻微抖动，大量留白，清爽但怪诞，像白板上的产品草图。',
    'Recurring IP character required: 小黑，一个黑色实心、白点眼、细腿、空表情的小怪物。小黑必须承担画面的核心动作，不能只是站在旁边装饰。',
    `Theme / source post: ${tweetText}`,
    'Core idea: 把这条中文推文里的判断画成一个具体隐喻，只表达一个核心动作或结构。',
    'Composition: 让小黑认真地搬运、筛选、搭桥、拉线或操作一个荒诞但成立的小机器，用这个动作解释推文观点。主体占画面 40%-60%，至少 35% 留白。',
    'Chinese handwritten labels: 最多 5-8 个短中文手写批注，每个 2-8 字。可以用“情绪”“兑现”“热闹”“长期”“信号”等词，但不要写长句。',
    'Color use: 黑色为主体线稿和小黑；橙色表示主路径；红色只标关键提醒；蓝色只标补充状态。颜色克制。',
    'Constraints: 无文字标题、无字幕、无 logo、无品牌商标、不要真实人物。不要 PPT、商业插画、正式流程图、复杂架构图、可爱卡通、儿童插画、科技 UI、渐变、阴影、纸纹。不要左上角标题，不要写结构类型。',
  ].join('\n');
}

function buildGuizangSocialCardPrompt(tweetText: string): string {
  return [
    'Create one polished Guizang-style social card for X/Twitter from the Chinese post below.',
    'Target: a single 3:4 portrait social card that can also work as an attached X image.',
    'Style skill: guizang-social-card-skill. Use Guizang editorial / Swiss social-card principles: strong hook, magazine-grade hierarchy, clean grid, high readability on mobile, no generic SaaS card clutter.',
    `Source post / final tweet: ${tweetText}`,
    'Visual direction: convert the key opinion into a social card, not a literal illustration. Use a concise Chinese headline derived from the tweet, 1-2 supporting phrases, and one clear visual metaphor or data-card structure.',
    'Layout: 3:4 portrait, content fills at least 75% of the canvas height, no large dead blank bands. Prefer a refined Editorial Magazine or Swiss International composition with strong typography, subtle paper/ink or accent color system, and clean spacing.',
    'Chinese text: keep all visible Chinese short and readable. No typos. Do not add fabricated numbers, dates, brands, logos, or claims.',
    'Constraints: no platform logos, no real-person likeness, no fake UI, no watermark, no English title, no cramped paragraph blocks, no childish cartoon style, no PPT look.',
  ].join('\n');
}

function buildCustomSkillPrompt(tweetText: string, imageSkill: string): string {
  return [
    `Create one social image using the configured image skill: ${imageSkill}.`,
    'Use that skill\'s visual rules and constraints when generating the image for this X/Twitter post.',
    `Source post / final tweet: ${tweetText}`,
    'Keep the image readable on mobile, avoid platform logos and watermarks, avoid fake data, and do not include sensitive or fabricated claims.',
  ].join('\n');
}

function rewriteTweetForAccount(sourceText: string, account: MultiAccountTarget, variant: number): string {
  const sentences = sourceText
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[。！？!?])/u)
    .map((item) => item.trim().replace(/[。！？!?]+$/u, ''))
    .filter(Boolean);
  const first = sentences[0] || sourceText.trim();
  const second = sentences.find((item) => item !== first && item.length >= 8);
  const style = account.style || '';
  const accountName = normalizeTwitterUsername(account.username);

  if (/口语/.test(style) || accountName === 'blockheadchain_') {
    return [first, second || buildSourceAwareAside(first, variant)].join('。');
  }

  if (/犀利|观点/.test(style)) {
    return [first, second || buildSourceAwareAside(first, variant + 1)].join('。');
  }

  return [first, second || buildSourceAwareAside(first, variant + 2)].join('。');
}

function buildSourceAwareAside(text: string, variant: number): string {
  const normalized = text.toLowerCase();
  const options = /税|税制|税率|收入|打工|创业|经商|资本积累|资本收入|资产/i.test(normalized)
    ? ['税制是在分配激励，收入和资产被怎么对待，人的选择就会跟着变', '打工收入和资本回报被区别对待，最后影响的是普通人的路径选择', '看一个地方鼓励什么，税表往往比口号更诚实']
    : /ai|claude|模型|智能体|agent|算力/i.test(normalized)
      ? ['先看它会不会被普通人真的用起来', '更值得盯的是它能不能嵌进具体工作', '我会关注它从演示走到日常的速度']
      : /btc|eth|币安|binance|加密|crypto|链|代币/i.test(normalized)
        ? ['流动性是一层，真实需求才更难伪装', '价格反应很快，链上和资金会给第二层答案', '这类事我会先看资金往哪边挪']
        : /美股|股票|财报|利润|营收|ceo|公司|市场/i.test(normalized)
          ? ['财报、现金流和用户增长会把故事拆开看', '估值可以抢跑，业务数据会慢慢验货', '最好把它放回公司基本面里看']
          : ['这类变化最后会反映到成本、效率和人的选择里', '我更想看它改变了谁的成本，又让谁多了选择', '别只看表面热闹，先拆它影响的是哪一层利益'];
  return options[stableTextIndex(text, variant, options.length)];
}

function isEligibleSourceTweet(tweet: Tweet): boolean {
  const text = tweet.text.trim();
  const textWithoutUrls = text
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/pic\.x\.com\/\S+/gi, '')
    .replace(/t\.co\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (textWithoutUrls.length < 8 || text.length > 320) return false;
  if (tweet.inReplyToStatusId) return false;
  if (/giveaway|airdrop|抽奖|空投/i.test(text)) return false;
  return true;
}

function hotScore(tweet: Tweet): number {
  return (tweet.likeCount || 0) + (tweet.retweetCount || 0) * 3 + (tweet.replyCount || 0) * 2;
}
