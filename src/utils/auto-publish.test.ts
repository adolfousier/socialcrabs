import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildAutoPublishPlans,
  buildAutoPublishHermesPrompt,
  cleanAutoPublishGeneratedText,
  computeContinuousCollectionWindow,
  getPublishedSourceTweetIds,
  loadAutoPublishState,
  saveAutoPublishState,
  buildNextAutoPublishState,
  filterDueSourceUsers,
  markAutoPublishPlansPosted,
  markSourceUsersProcessed,
  selectRotatingTargetAccounts,
  advanceTargetAccountCursor,
  buildImagePromptForTweet,
  buildPendingAutoPublishRun,
  buildXurlAccountArgs,
  defaultPendingAutoPublishRunPath,
  deletePendingAutoPublishRun,
  humanizeChineseTweet,
  loadPendingAutoPublishRun,
  savePendingAutoPublishRun,
  selectRecentHotTextTweets,
  twitterWeightedLength,
} from './auto-publish.js';
import type { Tweet } from '../graphql/types.js';

function tweet(overrides: Partial<Tweet>): Tweet {
  return {
    id: '1',
    text: '长鑫上市以后会是中国一个标志性的事件，这其实也是时代机遇的一个里程碑。上市后利润和估值都会被市场重新定价。',
    createdAt: new Date().toISOString(),
    likeCount: 10,
    retweetCount: 2,
    replyCount: 1,
    author: { username: 'LuBtc888', name: '0x鸣人' },
    ...overrides,
  };
}

describe('auto publish helpers', () => {
  it('computes continuous 6-hour collection windows from saved state', () => {
    const now = new Date('2026-07-07T12:30:00Z');

    expect(computeContinuousCollectionWindow({}, now, 6)).toEqual({
      startAt: '2026-07-07T06:30:00.000Z',
      endAt: '2026-07-07T12:30:00.000Z',
      due: true,
    });

    expect(computeContinuousCollectionWindow({ lastWindowEndAt: '2026-07-07T06:00:00.000Z' }, now, 6)).toEqual({
      startAt: '2026-07-07T06:00:00.000Z',
      endAt: '2026-07-07T12:00:00.000Z',
      due: true,
    });

    expect(computeContinuousCollectionWindow({ lastWindowEndAt: '2026-07-07T10:00:00.000Z' }, now, 6)).toEqual({
      startAt: '2026-07-07T10:00:00.000Z',
      endAt: '2026-07-07T16:00:00.000Z',
      due: false,
    });
  });

  it('saves and loads auto publish state without repeating a completed window', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-publish-state-'));
    const file = path.join(dir, 'state.json');
    const state = buildNextAutoPublishState({}, { startAt: '2026-07-07T06:00:00.000Z', endAt: '2026-07-07T12:00:00.000Z', due: true });

    saveAutoPublishState(file, state);

    expect(loadAutoPublishState(file)).toEqual({
      lastWindowStartAt: '2026-07-07T06:00:00.000Z',
      lastWindowEndAt: '2026-07-07T12:00:00.000Z',
    });
  });

  it('persists pending auto-publish plans so a failed publish can resume the same source', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-publish-pending-'));
    const statePath = path.join(dir, 'state.json');
    const window = { startAt: '2026-07-07T06:00:00.000Z', endAt: '2026-07-07T09:00:00.000Z', due: true };
    const plans = buildAutoPublishPlans({
      tweets: [tweet({ id: 'source-fixed', author: { username: 'ai_xiaomu', name: 'AI小木' }, createdAt: '2026-07-07T08:00:00Z' })],
      accounts: [{ username: 'blockheadchain_', enabled: true, imageSkill: 'ian-xiaohei-illustrations', squareAlias: 'Ben' }],
      startAt: new Date(window.startAt),
      endAt: new Date(window.endAt),
      now: new Date(window.endAt),
      minScore: 1,
    });
    const pending = buildPendingAutoPublishRun({
      statePath,
      window,
      dueSources: [{ username: 'ai_xiaomu', url: 'https://x.com/ai_xiaomu', weight: 1, enabled: true }],
      plans,
      imagePath: '/tmp/blockheadchain.png',
      createdAt: new Date('2026-07-07T09:01:00Z'),
    });
    const file = defaultPendingAutoPublishRunPath(statePath, pending);

    savePendingAutoPublishRun(file, pending);
    const loaded = loadPendingAutoPublishRun(file);

    expect(file).toContain('auto-publish-pending/blockheadchain__source-fixed.json');
    expect(loaded.plans[0].sourceTweetId).toBe('source-fixed');
    expect(loaded.plans[0].account).toBe('blockheadchain_');
    expect(loaded.dueSourceUsernames).toEqual(['ai_xiaomu']);
    expect(loaded.imagePath).toBe('/tmp/blockheadchain.png');

    deletePendingAutoPublishRun(file);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('tracks source-level 6-hour cooldowns so processed list entries are skipped', () => {
    const sources = [
      { username: 'LuBtc888', url: 'https://x.com/LuBtc888', weight: 1, enabled: true },
      { username: 'ai_xiaomu', url: 'https://x.com/ai_xiaomu', weight: 1, enabled: true },
    ];
    const now = new Date('2026-07-07T12:00:00Z');
    const state = markSourceUsersProcessed({}, [sources[0]], now);

    expect(filterDueSourceUsers(sources, state, new Date('2026-07-07T15:00:00Z'), 6).map((source) => source.username)).toEqual(['ai_xiaomu']);
    expect(filterDueSourceUsers(sources, state, new Date('2026-07-07T18:00:01Z'), 6).map((source) => source.username)).toEqual(['LuBtc888', 'ai_xiaomu']);
    expect(state.sources?.LuBtc888?.lastProcessedAt).toBe('2026-07-07T12:00:00.000Z');
  });

  it('rotates target accounts and advances cursor after successful posts', () => {
    const accounts = [
      { username: 'a', enabled: true },
      { username: 'b', enabled: true },
      { username: 'c', enabled: true },
    ];

    expect(selectRotatingTargetAccounts(accounts, { targetAccountCursor: 1 }, 2).map((account) => account.username)).toEqual(['b', 'c']);
    expect(advanceTargetAccountCursor({ targetAccountCursor: 1 }, accounts, 2).targetAccountCursor).toBe(0);
  });

  it('records posted source tweets and excludes them from future plans across all accounts', () => {
    const postedAt = new Date('2026-07-07T12:00:00Z');
    const state = markAutoPublishPlansPosted({}, [{
      account: 'yoyo_aigo',
      sourceTweetId: 'used-source',
      sourceUser: 'LuBtc888',
      sourceUrl: 'https://x.com/LuBtc888/status/used-source',
      postedUrl: 'https://x.com/yoyo_aigo/status/posted',
      status: 'posted',
    }], postedAt);

    expect(getPublishedSourceTweetIds(state).has('used-source')).toBe(true);
    expect(state.publishedSourceTweets?.['used-source']?.accounts.yoyo_aigo.postedUrl).toBe('https://x.com/yoyo_aigo/status/posted');

    const plans = buildAutoPublishPlans({
      tweets: [tweet({ id: 'used-source', likeCount: 999 }), tweet({ id: 'fresh-source', likeCount: 10 })],
      accounts: [{ username: 'alt_account', enabled: true, style: '口语化' }],
      now: new Date(),
      lastHours: 24,
      excludeSourceTweetIds: getPublishedSourceTweetIds(state),
    });

    expect(plans.map((plan) => plan.sourceTweetId)).toEqual(['fresh-source']);
  });

  it('does not reuse one source tweet for multiple accounts in the same run', () => {
    const plans = buildAutoPublishPlans({
      tweets: [tweet({ id: 'only-source' })],
      accounts: [
        { username: 'yoyo_aigo', enabled: true },
        { username: 'alt_account', enabled: true },
      ],
      now: new Date(),
      lastHours: 24,
    });

    expect(plans).toHaveLength(1);
    expect(plans[0].account).toBe('yoyo_aigo');
  });

  it('selects tweets inside the continuous 6-hour window, including link or media posts', () => {
    const selected = selectRecentHotTextTweets([
      tweet({ id: 'in-window', createdAt: '2026-07-07T08:00:00Z', likeCount: 20, retweetCount: 4, replyCount: 3 }),
      tweet({ id: 'before-window', createdAt: '2026-07-07T05:59:59Z', likeCount: 999 }),
      tweet({ id: 'after-window', createdAt: '2026-07-07T12:00:01Z', likeCount: 999 }),
      tweet({ id: 'media', text: '带图观点也可以进入自动发推候选 https://t.co/abc', createdAt: '2026-07-07T08:00:00Z', likeCount: 999 }),
    ], { startAt: new Date('2026-07-07T06:00:00Z'), endAt: new Date('2026-07-07T12:00:00Z'), limit: 2, minScore: 1 });

    expect(selected.map((item) => item.id)).toEqual(['media', 'in-window']);
    expect(selected[1].hotScore).toBe(38);
  });

  it('selects recent 24h hot tweets while still excluding replies and spam', () => {
    const now = new Date('2026-07-07T10:00:00Z');
    const selected = selectRecentHotTextTweets([
      tweet({ id: 'hot', createdAt: '2026-07-07T08:00:00Z', likeCount: 20, retweetCount: 4, replyCount: 3 }),
      tweet({ id: 'old', createdAt: '2026-07-05T08:00:00Z', likeCount: 999 }),
      tweet({ id: 'media', text: '带图观点也可以进入候选 https://t.co/abc', createdAt: '2026-07-07T08:00:00Z', likeCount: 999 }),
      tweet({ id: 'reply', inReplyToStatusId: 'parent', createdAt: '2026-07-07T08:00:00Z', likeCount: 999 }),
      tweet({ id: 'spam', text: '抽奖 空投 giveaway airdrop 这个内容足够长但不该进入候选', createdAt: '2026-07-07T08:00:00Z', likeCount: 999 }),
    ], { now, lastHours: 24, limit: 3, minScore: 1 });

    expect(selected.map((item) => item.id)).toEqual(['media', 'hot']);
    expect(selected[1].hotScore).toBe(38);
  });

  it('humanizes rewritten Chinese copy by removing common AI tells', () => {
    const humanized = humanizeChineseTweet('这不仅是一个标志性事件，更是产业链重估的重要里程碑。真正值得看的，不是短期炒多高，而是能不能穿越周期。');

    expect(humanized).not.toMatch(/不仅|更是|标志性|里程碑|真正值得看的|别只/);
    expect(humanized.length).toBeLessThanOrEqual(220);
    expect(humanized).toMatch(/[\u4e00-\u9fff]/);
  });

  it('builds and cleans Hermes oneshot output for auto-publish rewrites', () => {
    const prompt = buildAutoPublishHermesPrompt({
      sourceText: 'AI 批量做内容，最大的问题不是内容质量，而是把生意建在平台容忍度上。',
      draftText: 'AI 批量做内容的问题不只是质量，更关键是平台规则。',
      account: 'yoyo_aigo',
      style: '口语化',
      maxChars: 220,
    });

    expect(prompt).toContain('只输出最终推文正文');
    expect(prompt).toContain('60-120 个中文字符');
    expect(prompt).toContain('不要只写一句空泛结论');
    expect(prompt).toContain('@yoyo_aigo');
    expect(cleanAutoPublishGeneratedText('Final tweet:\n做内容最怕的不是 AI 味，而是整个生意都绑在平台脸色上。')).toBe('做内容最怕的不是 AI 味，而是整个生意都绑在平台脸色上。');
    expect(cleanAutoPublishGeneratedText('Final tweet:\n别急着做大，先确认这事能活。', 220, 60)).toBe('');
    expect(cleanAutoPublishGeneratedText('hermes --resume 20260709_112243_f64e50')).toBe('');
    expect(cleanAutoPublishGeneratedText('Session: 20260709_105904_ea68bc')).toBe('');
    expect(cleanAutoPublishGeneratedText('做内容最怕的不是 AI 味，而是整个生意都绑在平台脸色上。\n\nDuration: 7s')).toBe('做内容最怕的不是 AI 味，而是整个生意都绑在平台脸色上。');
  });

  it('truncates Chinese copy by Twitter weighted length instead of raw JS characters', () => {
    const longChinese = '这是一段很长的中文内容，用来模拟带图片发布时会被 X 按加权长度截断的问题。'.repeat(8);
    const humanized = humanizeChineseTweet(longChinese, 220);

    expect(twitterWeightedLength(humanized)).toBeLessThanOrEqual(220);
  });

  it('builds per-account plans with custom image skills and matching prompts', () => {
    const plans = buildAutoPublishPlans({
      tweets: [tweet({ id: 'source-1' }), tweet({ id: 'source-2', text: '第二条来源推文，内容足够长，可以给另一个账号改写使用。市场会看短期情绪，也会看长期兑现。', likeCount: 8 })],
      accounts: [
        { username: 'yoyo_aigo', enabled: true, style: '财经科技', imageSkill: 'guizang-social-card-skill', squareAlias: 'guicai' },
        { username: 'alt_account', enabled: true, style: '口语化', imageSkill: 'ian-xiaohei-illustrations', xurlApp: 'socialcrabs' },
      ],
      now: new Date(),
      lastHours: 24,
      minScore: 1,
      maxChars: 220,
    });

    expect(plans).toHaveLength(2);
    expect(plans[0].account).toBe('yoyo_aigo');
    expect(plans[0].text).not.toBe(plans[1].text);
    expect(plans[0].imageSkill).toBe('guizang-social-card-skill');
    expect(plans[0].squareAlias).toBe('guicai');
    expect(plans[0].imagePrompt).toContain('Guizang');
    expect(plans[0].imagePrompt).toContain('social card');
    expect(plans[1].imageSkill).toBe('ian-xiaohei-illustrations');
    expect(plans[1].xurlApp).toBe('socialcrabs');
    expect(buildXurlAccountArgs(plans[1].account, plans[1].xurlApp)).toEqual(['--app', 'socialcrabs', '--username', 'alt_account']);
    expect(buildXurlAccountArgs('yoyo_aigo')).toEqual(['--username', 'yoyo_aigo']);
    expect(plans[1].text).not.toContain('别只把它当成一个热点看，后面更该盯的是利润能不能稳住、预期能不能兑现');
    expect(plans[1].text).toContain('第二条来源推文');
    expect(plans[1].imagePrompt).toContain('小黑');
    expect(plans[1].imagePrompt).toContain('纯白背景');
    expect(plans[0].sourceUrl).toBe('https://x.com/LuBtc888/status/source-1');
  });

  it('humanizes each target account into a distinct non-formulaic Chinese version before image prompts', () => {
    const sourceText = '这不仅是一个标志性事件，更是行业深度重估的重要里程碑。真正值得看的，不是短期炒多高，而是能不能穿越周期。';
    const plans = buildAutoPublishPlans({
      tweets: [tweet({ id: 'source-a', text: sourceText }), tweet({ id: 'source-b', text: sourceText, likeCount: 9 })],
      accounts: [
        { username: 'yoyo_aigo', enabled: true, style: '财经科技', imageSkill: 'guizang-social-card-skill' },
        { username: 'blockheadchain_', enabled: true, style: '口语化，真实感受', imageSkill: 'ian-xiaohei-illustrations' },
      ],
      now: new Date(),
      lastHours: 24,
      minScore: 1,
      maxChars: 220,
    });

    expect(plans).toHaveLength(2);
    expect(plans[0].text).not.toBe(plans[1].text);
    for (const plan of plans) {
      expect(plan.text).not.toMatch(/不仅|更是|标志性|里程碑|真正值得看的|短期看情绪|后面还是看兑现/);
      expect(plan.imagePrompt).toContain(plan.text);
    }
  });

  it('does not generate fixed yoyo_aigo closing slogans when the source has only one sentence', () => {
    const plans = buildAutoPublishPlans({
      tweets: [tweet({
        id: 'claude-workbench',
        text: 'Claude AI 不是有意识了，是内部出现了一个可读的工作台。',
        likeCount: 30,
        retweetCount: 5,
        replyCount: 2,
      })],
      accounts: [{ username: 'yoyo_aigo', enabled: true, style: '财经科技', imageSkill: 'guizang-social-card-skill' }],
      now: new Date(),
      lastHours: 24,
      minScore: 1,
      maxChars: 220,
    });

    expect(plans).toHaveLength(1);
    expect(plans[0].text).toContain('Claude AI 不是有意识了');
    expect(plans[0].text).not.toMatch(/短期看情绪，后面还是看兑现|短期会吵|短线看预期|市场会先抢叙事|后面还是看兑现/);
  });

  it('turns generic fallback endings into source-specific views for tax and income posts', () => {
    const plans = buildAutoPublishPlans({
      tweets: [tweet({
        id: 'tax-incentives',
        text: '有些国家的税制，明显是在鼓励创业、经商和资本积累，不太鼓励单纯打工。',
        likeCount: 30,
        retweetCount: 5,
        replyCount: 2,
        author: { username: 'erchenlu1', name: '二辰路' },
      })],
      accounts: [{ username: 'yoyo_aigo', enabled: true, style: '中文财经科技，观点清晰，短段落', imageSkill: 'guizang-social-card-skill' }],
      now: new Date(),
      lastHours: 24,
      minScore: 1,
      maxChars: 220,
    });

    expect(plans).toHaveLength(1);
    expect(plans[0].text).toContain('税制');
    expect(plans[0].text).toMatch(/创业|经商|资本|打工|收入|资产/);
    expect(plans[0].text).not.toMatch(/这个点值得先记下来|先记一笔|落到具体场景|过几天再看大家怎么消化|先看后续反馈|急着下判断/);
  });

  it('creates an Ian Xiaohei prompt by default from the final humanized tweet', () => {
    expect(buildImagePromptForTweet('半导体这轮机会，别只看情绪。')).toContain('半导体这轮机会');
  });

  it('creates a Guizang social card prompt when requested', () => {
    const prompt = buildImagePromptForTweet('半导体这轮机会，别只看情绪。', 'guizang-social-card-skill');

    expect(prompt).toContain('Guizang');
    expect(prompt).toContain('3:4');
    expect(prompt).toContain('半导体这轮机会');
  });

  it('keeps arbitrary future image skill names configurable in the prompt', () => {
    const prompt = buildImagePromptForTweet('半导体这轮机会，别只看情绪。', 'future-custom-card-skill');

    expect(prompt).toContain('future-custom-card-skill');
    expect(prompt).toContain('半导体这轮机会');
  });
});
