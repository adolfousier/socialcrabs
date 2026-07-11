import fs from 'fs';
import path from 'path';
import type { RankedSourceTweet } from './source-scan.js';
import { applyHumanizerZh } from './humanizer-zh.js';

export interface TweetDraft {
  id: string;
  text: string;
  language: 'zh';
  status: 'pending' | 'posted' | 'error' | 'skipped';
  sourceTweetId: string;
  sourceUrl: string;
  sourceUser: string;
  sourceScore?: number;
  imageProvider: 'gpt-image-2';
  imagePrompt: string;
  imagePath?: string;
  createdAt: string;
  postedAt?: string;
  error?: string;
}

export function loadRankedSourceTweets(file: string): RankedSourceTweet[] {
  if (!fs.existsSync(file)) return [];
  const tweets = JSON.parse(fs.readFileSync(file, 'utf-8')) as RankedSourceTweet[];
  return tweets.filter((tweet) => tweet.status === 'new');
}

export function buildChineseTweetDrafts(sourceTweets: RankedSourceTweet[], count: number): TweetDraft[] {
  const createdAt = new Date().toISOString();
  return sourceTweets.slice(0, Math.max(0, count)).map((source, index) => {
    const text = applyHumanizerZh(rewriteAsChineseOriginal(source.text, index), { variant: index });
    return {
      id: `draft-${createdAt.replace(/[:.]/g, '-')}-${index + 1}`,
      text,
      language: 'zh',
      status: 'pending',
      sourceTweetId: source.id,
      sourceUrl: source.sourceTweetUrl,
      sourceUser: source.sourceUser,
      sourceScore: source.score,
      imageProvider: 'gpt-image-2',
      imagePrompt: buildChineseImagePrompt(text),
      createdAt,
    };
  });
}

export function saveTweetDraftQueue(file: string, drafts: TweetDraft[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(drafts, null, 2)}\n`);
}

function rewriteAsChineseOriginal(sourceText: string, variant = 0): string {
  const text = sourceText.replace(/\s+/g, ' ').trim();

  if (/社群|社区|互相|托举|成长|微信群|成员|牛熊/.test(text)) {
    return formatTweetParagraphs([
      '真正有生命力的社群，不是热闹时大家都在，而是低谷时仍然有人互相托举。',
      '能一起成长、一起复盘、一起穿过周期的人，才是最稀缺的连接。',
    ]);
  }

  if (/创业|公司|估值|增长|创始|项目|产品/.test(text)) {
    const variants = [
      ['估值能先跑起来，但产品和增长会慢慢验货。', '我更看重的是，有没有人愿意反复用、持续付费。'],
      ['项目早期讲故事不难，难的是把用户和收入一点点做出来。', '能不能撑过周期，最后还是靠日常数据说话。'],
    ];
    return formatTweetParagraphs(variants[Math.abs(variant) % variants.length]);
  }

  if (/误解|表达|建议|观点|讨论|问题/.test(text)) {
    return formatTweetParagraphs([
      '沟通里最浪费时间的，不是观点不同，而是有人把你没说过的话加工成另一个版本再来反驳。',
      '清晰表达很重要，认真倾听更重要。',
    ]);
  }

  return formatTweetParagraphs([
    '一个想法能不能留下来，不看它当下有多热闹。',
    '更重要的是，过一段时间后它是否仍然能解释问题、推动行动、让人愿意继续投入。',
  ]);
}

export function formatTweetParagraphs(paragraphs: string[]): string {
  return paragraphs
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join('\n\n');
}

function buildChineseImagePrompt(tweetText: string) {
  return [
    '用中文生成一张适合推文配图的方形海报。',
    '主题：长期主义、社群成长、互相托举、穿越周期。',
    `文案灵感：${tweetText}`,
    '视觉风格：干净、现代、温暖、有轻微科技感，适合社交媒体传播。',
    '画面元素：抽象的人群连接、向上生长的线条、柔和蓝紫渐变背景。',
    '不要出现真实人物肖像，不要出现平台标志，不要出现英文文字。',
  ].join('\n');
}
