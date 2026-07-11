import fs from 'fs';
import { applyHumanizerZh, stableTextIndex } from './humanizer-zh.js';
import { normalizeTwitterUsername } from './safety.js';

export interface MultiAccountTarget {
  username: string;
  enabled: boolean;
  style?: string;
  topics?: string[];
  maxPostsPerDay?: number;
  imageSkill?: string;
  squareAlias?: string;
  xurlApp?: string;
}

export interface MultiAccountConfig {
  accounts: MultiAccountTarget[];
}

export interface SourceCandidateTweet {
  id: string;
  sourceUser: string;
  text: string;
  score: number;
  url: string;
  createdAt?: string;
  metrics?: {
    likeCount?: number;
    retweetCount?: number;
    replyCount?: number;
  };
}

export interface MultiAccountPostPlan {
  account: string;
  text: string;
  sourceUser: string;
  sourceTweetId: string;
  sourceUrl: string;
  status: 'pending';
}

export interface OpenTwitterSourceSearchOptions {
  fromUser: string;
  maxResults: number;
  product: 'Latest';
  excludeReplies: true;
  excludeRetweets: true;
}

type OpenTwitterLikeTweet = {
  id: string;
  text: string;
  createdAt?: string;
  likeCount?: number;
  favoriteCount?: number;
  retweetCount?: number;
  replyCount?: number;
};

type RawAccount = string | Partial<MultiAccountTarget>;

export function loadMultiAccountConfig(file: string): MultiAccountConfig {
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as RawAccount[] | { accounts?: RawAccount[] };
  const entries = Array.isArray(raw) ? raw : raw.accounts || [];
  const accounts = entries
    .map(normalizeAccount)
    .filter((account): account is MultiAccountTarget => Boolean(account && account.enabled));
  return { accounts };
}

function normalizeAccount(raw: RawAccount): MultiAccountTarget | undefined {
  const value = typeof raw === 'string' ? { username: raw } : raw;
  const username = normalizeTwitterUsername(value.username || '');
  if (!username) return undefined;
  return {
    username,
    enabled: value.enabled !== false,
    style: value.style,
    topics: value.topics,
    maxPostsPerDay: value.maxPostsPerDay,
    imageSkill: typeof value.imageSkill === 'string' && value.imageSkill.trim() ? value.imageSkill.trim() : undefined,
    squareAlias: typeof value.squareAlias === 'string' && value.squareAlias.trim() ? value.squareAlias.trim() : undefined,
    xurlApp: typeof value.xurlApp === 'string' && value.xurlApp.trim() ? value.xurlApp.trim() : undefined,
  };
}

export function buildOpenTwitterSourceSearchOptions(source: string, maxResults: number): OpenTwitterSourceSearchOptions {
  return {
    fromUser: normalizeTwitterUsername(source),
    maxResults,
    product: 'Latest',
    excludeReplies: true,
    excludeRetweets: true,
  };
}

export function normalizeOpenTwitterTweets(tweets: OpenTwitterLikeTweet[], sourceUser: string): SourceCandidateTweet[] {
  const username = normalizeTwitterUsername(sourceUser);
  return tweets.map((tweet) => {
    const likeCount = Number(tweet.likeCount ?? tweet.favoriteCount ?? 0);
    const retweetCount = Number(tweet.retweetCount ?? 0);
    const replyCount = Number(tweet.replyCount ?? 0);
    return {
      id: String(tweet.id || ''),
      sourceUser: username,
      text: String(tweet.text || ''),
      createdAt: tweet.createdAt,
      score: likeCount + retweetCount * 3 + replyCount,
      url: `https://x.com/${username}/status/${tweet.id}`,
      metrics: { likeCount, retweetCount, replyCount },
    };
  }).filter((tweet) => tweet.id && tweet.text);
}

export function selectTextOnlyTweets(tweets: SourceCandidateTweet[], limit = 5): SourceCandidateTweet[] {
  return tweets
    .filter((tweet) => {
      const text = tweet.text.trim();
      if (text.length < 12) return false;
      if (/https?:\/\//i.test(text)) return false;
      if (/pic\.x\.com|t\.co\//i.test(text)) return false;
      if (/giveaway|airdrop|抽奖|空投/i.test(text)) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function buildMultiAccountPosts(options: {
  sourceTweet: SourceCandidateTweet;
  accounts: MultiAccountTarget[];
  maxChars?: number;
}): MultiAccountPostPlan[] {
  const maxChars = options.maxChars || 200;
  return options.accounts.filter((account) => account.enabled).map((account, index) => ({
    account: account.username,
    text: truncateTweet(applyHumanizerZh(rewriteForAccount(options.sourceTweet.text, account, index), { account: account.username, variant: index }), maxChars),
    sourceUser: options.sourceTweet.sourceUser,
    sourceTweetId: options.sourceTweet.id,
    sourceUrl: options.sourceTweet.url,
    status: 'pending',
  }));
}

function rewriteForAccount(text: string, account: MultiAccountTarget, variant: number): string {
  const sentences = text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[。！？!?])/u)
    .map((item) => item.trim().replace(/[。！？!?]+$/u, ''))
    .filter(Boolean);
  const firstSentence = sentences[0] || text.trim();
  const secondSentence = sentences.find((item) => item !== firstSentence && item.length >= 8);
  const style = account.style || '中文财经科技';
  const aside = secondSentence || sourceAwareAside(firstSentence, variant);

  if (variant % 3 === 1 || /口语/.test(style)) {
    return `${firstSentence}。\n\n${sourceAwareAside(`${firstSentence} ${secondSentence || ''}`, variant)}。`;
  }

  if (variant % 3 === 2 || /犀利|观点/.test(style)) {
    return `${firstSentence}。\n\n${sourceAwareAside(`${firstSentence} ${secondSentence || ''}`, variant + 1)}。`;
  }

  return `${firstSentence}。\n\n${aside}。`;
}

function sourceAwareAside(text: string, variant: number): string {
  const options = /税|税制|税率|收入|打工|创业|经商|资本积累|资本收入|资产/i.test(text)
    ? ['税制是在分配激励，收入和资产被怎么对待，人的选择就会跟着变', '打工收入和资本回报被区别对待，最后影响的是普通人的路径选择', '看一个地方鼓励什么，税表往往比口号更诚实']
    : /ai|claude|模型|智能体|agent|算力/i.test(text)
      ? ['先看它会不会被普通人真的用起来', '更关键的是能不能嵌进具体工作', '我会关注它从演示走到日常的速度']
      : /btc|eth|币安|binance|加密|crypto|链|代币/i.test(text)
        ? ['流动性是一层，真实需求才更难伪装', '价格反应快，链上和资金会给第二层答案', '先别急着定性，观察资金往哪边挪']
        : /上市|美股|股票|财报|利润|营收|ceo|公司|市场/i.test(text)
          ? ['财报、现金流和用户增长会把故事拆开看', '估值可以抢跑，业务数据会慢慢验货', '最好把它放回公司基本面里看']
          : ['这类变化最后会反映到成本、效率和人的选择里', '我更想看它改变了谁的成本，又让谁多了选择', '别只看表面热闹，先拆它影响的是哪一层利益'];
  return options[stableTextIndex(text, variant, options.length)];
}

function truncateTweet(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)).replace(/[，。；、\s]+$/u, '') + '…';
}
