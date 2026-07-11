import { describe, expect, it } from 'vitest';
import {
  buildHotReplyPrompt,
  buildTelegramHotReplyNotification,
  buildTelegramReplyBlockedNotification,
  getReplyHumanizerSkill,
  buildXurlReplyArgs,
  cleanGeneratedReplyOutput,
  isXReplyForbiddenError,
  buildXurlReplyResultRecords,
  fallbackReply,
  normalizeOpenTwitterEvent,
  scoreReplyCandidate,
  shouldReplyToEvent,
  truncateReply,
} from './hot-reply-flow.js';

describe('hot reply flow helpers', () => {
  it('normalizes opentwitter websocket tweet events', () => {
    const event = normalizeOpenTwitterEvent({
      method: 'twitter.event',
      params: {
        eventType: 'NEW_TWEET',
        twAccount: 'ai_xiaomu',
        content: {
          id: '123',
          text: 'AI 新工具出来了，普通人可以先用起来。',
          createdAt: '2026-07-07T10:00:00Z',
          retweetCount: 3,
          favoriteCount: 20,
          replyCount: 2,
        },
      },
    });

    expect(event).toMatchObject({
      eventType: 'NEW_TWEET',
      username: 'ai_xiaomu',
      tweetId: '123',
      text: 'AI 新工具出来了，普通人可以先用起来。',
      url: 'https://x.com/ai_xiaomu/status/123',
      hotScore: 33,
    });
  });

  it('filters only configured event types and accounts above the reply quality threshold', () => {
    const low = normalizeOpenTwitterEvent({
      params: { eventType: 'NEW_TWEET', twAccount: 'cz_binance', content: { id: '1', text: 'hello', favoriteCount: 1 } },
    })!;
    const high = normalizeOpenTwitterEvent({
      params: {
        eventType: 'NEW_TWEET',
        twAccount: 'cz_binance',
        content: {
          id: '2',
          text: 'AI agents are moving from demos into daily work, and the interesting part is which workflows people keep using after the first week.',
          favoriteCount: 30,
          retweetCount: 5,
          replyCount: 4,
          quoteCount: 2,
        },
      },
    })!;

    expect(scoreReplyCandidate(high)).toBeGreaterThanOrEqual(80);
    expect(scoreReplyCandidate(low)).toBeLessThan(80);
    expect(shouldReplyToEvent(low, { accounts: ['cz_binance'], eventTypes: ['NEW_TWEET'], minHotScore: 0, minReplyScore: 80 })).toBe(false);
    expect(shouldReplyToEvent(high, { accounts: ['cz_binance'], eventTypes: ['NEW_TWEET'], minHotScore: 0, minReplyScore: 80 })).toBe(true);
  });

  it('builds a language-aware generic humanizer prompt for replies', () => {
    const zhPrompt = buildHotReplyPrompt({
      username: 'ai_xiaomu',
      text: '想让 AI 文案更像真人，第一层不是改词。',
      url: 'https://x.com/ai_xiaomu/status/1',
    });
    const enPrompt = buildHotReplyPrompt({
      username: 'sama',
      text: 'Agents are starting to feel less like demos and more like a new runtime for work.',
      url: 'https://x.com/sama/status/1',
    }, 'blockheadchain_');

    expect(zhPrompt).toContain('humanizer-zh');
    expect(zhPrompt).toContain('用中文回复');
    expect(getReplyHumanizerSkill('想让 AI 文案更像真人，第一层不是改词。')).toBe('humanizer-zh');
    expect(enPrompt).toContain('blockheadchain_');
    expect(enPrompt).toContain('humanizer');
    expect(enPrompt).not.toContain('humanizer-zh');
    expect(enPrompt).toContain('Reply in English');
    expect(enPrompt).toContain('Only output the final reply text');
    expect(getReplyHumanizerSkill('Agents are starting to feel less like demos and more like a new runtime for work.')).toBe('humanizer');
  });

  it('builds xurl reply args with the socialcrabs app and keeps replies short', () => {
    expect(buildXurlReplyArgs('123', '确实，先跑起来比纠结概念更重要。')).toEqual([
      '--app',
      'socialcrabs',
      '--username',
      'yoyo_aigo',
      'reply',
      '123',
      '确实，先跑起来比纠结概念更重要。',
    ]);
    expect(truncateReply('这是一段很长的中文回复。'.repeat(20), 80).length).toBeLessThanOrEqual(80);
  });

  it('treats 70+ scored candidates as Telegram-only manual reply candidates', () => {
    const candidate = normalizeOpenTwitterEvent({
      params: {
        eventType: 'NEW_TWEET',
        twAccount: 'ai_xiaomu',
        content: {
          id: 'score-70',
          text: 'AI 智能体开始真正进入工作流，关键不是演示有多炫，而是团队会不会第二天继续用。',
          favoriteCount: 5,
        },
      },
    })!;

    expect(candidate.replyScore).toBeGreaterThanOrEqual(70);
    expect(shouldReplyToEvent(candidate, { accounts: ['ai_xiaomu'], eventTypes: ['NEW_TWEET'], minHotScore: 0, minReplyScore: 70 })).toBe(true);
    expect(buildXurlReplyArgs(candidate.tweetId, '确实，能不能被反复用才是真测试。', 'yoyo_aigo')).toEqual([
      '--app',
      'socialcrabs',
      '--username',
      'yoyo_aigo',
      'reply',
      'score-70',
      '确实，能不能被反复用才是真测试。',
    ]);
  });

  it('builds auto-reply state and log records for xurl reply results', () => {
    const event = normalizeOpenTwitterEvent({
      params: { eventType: 'NEW_TWEET', twAccount: 'ai_xiaomu', content: { id: 'ai-reply', text: 'AI 工具开始进日常工作流了。', favoriteCount: 10 } },
    })!;
    const ok = buildXurlReplyResultRecords(event, '确实，关键是能不能被反复用。', { id: 'reply-1' }, 'yoyo_aigo');
    const blocked = buildXurlReplyResultRecords(event, '确实，关键是能不能被反复用。', { error: '403 Forbidden' }, 'yoyo_aigo');

    expect(ok.state).toMatchObject({ status: 'posted', sourceUrl: event.url, replyUrl: 'https://x.com/yoyo_aigo/status/reply-1' });
    expect(ok.log).toMatchObject({ type: 'reply-posted', sourceUrl: event.url, replyUrl: 'https://x.com/yoyo_aigo/status/reply-1' });
    expect(blocked.state).toMatchObject({ status: 'error', sourceUrl: event.url, error: '403 Forbidden' });
    expect(blocked.log).toMatchObject({ type: 'reply-posted', sourceUrl: event.url, error: '403 Forbidden' });
  });

  it('builds Telegram notifications for 70+ scored manual reply candidates', () => {
    const event = normalizeOpenTwitterEvent({
      params: {
        eventType: 'NEW_TWEET',
        twAccount: 'ai_xiaomu',
        content: {
          id: 'ai-70',
          text: 'AI 副业最容易卡住的地方，是效率变高了，但商业模式没有变。',
          favoriteCount: 10,
        },
      },
    })!;

    const candidateMessage = buildTelegramHotReplyNotification(event, '这点挺准，提效只是第一步，关键还是能不能变成可重复跑的系统。');

    expect(candidateMessage).toContain('X 70+ reply candidate');
    expect(candidateMessage).toContain('@ai_xiaomu');
    expect(candidateMessage).toContain(`Score: ${event.replyScore}`);
    expect(candidateMessage).toContain(event.url);
    expect(candidateMessage).toContain('推荐回复');
    expect(candidateMessage).toContain('这点挺准，提效只是第一步，关键还是能不能变成可重复跑的系统。');
    expect(candidateMessage).not.toContain('短期看情绪');
  });

  it('builds a Telegram notification for 403-blocked automatic replies', () => {
    const event = normalizeOpenTwitterEvent({
      params: {
        eventType: 'NEW_TWEET_QUOTE',
        twAccount: 'justinsuntron',
        content: {
          id: 'blocked-403',
          text: '币安钱包TRON嘉年华来了，错过就明年才有啦！',
          favoriteCount: 10,
        },
      },
    })!;
    const error = '{"detail":"Reply to this conversation is not allowed because you have not been mentioned or otherwise engaged by the author of the post you are replying to.","status":403}';

    expect(isXReplyForbiddenError(error)).toBe(true);
    const message = buildTelegramReplyBlockedNotification(event, '这类活动最怕错过窗口，先看真实参与门槛。', error, 'yoyo_aigo');

    expect(message).toContain('⚠️ X 自动评论被 403 拦截');
    expect(message).toContain('评论账号：@yoyo_aigo');
    expect(message).toContain('原账号：@justinsuntron');
    expect(message).toContain('评分：');
    expect(message).toContain(event.url);
    expect(message).toContain('这类活动最怕错过窗口');
    expect(message).toContain('Reply to this conversation is not allowed');
    expect(message).not.toContain('NOTIFY_TELEGRAM_BOT_TOKEN');
  });

  it('cleans Hermes CLI echo before auto-posting generated replies', () => {
    expect(cleanGeneratedReplyOutput('Query: You are the X/Twitter reply assistant for @yoyo_aigo. Use the generic humanizer skill: remove AI-sounding phrasing.')).toBe('');
    expect(cleanGeneratedReplyOutput('Query: 你是 @yoyo_aigo 的中文推特回复助手。\n\n确实，能不能被反复用才是真测试。')).toBe('确实，能不能被反复用才是真测试。');
    expect(cleanGeneratedReplyOutput('Final reply:\n这点挺准，关键是能不能进每天的流程。')).toBe('这点挺准，关键是能不能进每天的流程。');
    expect(cleanGeneratedReplyOutput('Messages: 2 (1 user, 0 tool calls)')).toBe('');
    expect(cleanGeneratedReplyOutput('Messages: 4 (1 user, 2 tool calls)\n\n这事确实有点意思，关键还是看真实需求能不能撑住。')).toBe('这事确实有点意思，关键还是看真实需求能不能撑住。');
    expect(cleanGeneratedReplyOutput('Duration: 7s')).toBe('');
    expect(cleanGeneratedReplyOutput('Duration: 7s\n\n确实，真正难的是让它进入每天的固定流程。')).toBe('确实，真正难的是让它进入每天的固定流程。');
    expect(cleanGeneratedReplyOutput('没吃到房地产红利，倒是刚好撞上 AI 改写职业起点。00 后看新时代，可能比老登少点包袱。\n\nSession: 20260709_105904_ea68bc')).toBe('没吃到房地产红利，倒是刚好撞上 AI 改写职业起点。00 后看新时代，可能比老登少点包袱。');
    expect(cleanGeneratedReplyOutput('hermes --resume 20260709_112243_f64e50')).toBe('');
    expect(cleanGeneratedReplyOutput('这些命名确实很会借传统意象，不只是好听，也是在给技术线加一层自己的叙事。\n\nhermes --resume 20260709_112243_f64e50')).toBe('这些命名确实很会借传统意象，不只是好听，也是在给技术线加一层自己的叙事。');
    expect(cleanGeneratedReplyOutput('Goodbye! ⚕')).toBe('');
    expect(cleanGeneratedReplyOutput('这波更像时代换挡，不同代际拿到的入场券确实不一样。\nGoodbye! ⚕')).toBe('这波更像时代换挡，不同代际拿到的入场券确实不一样。');
  });

  it('generates fallback replies in the same language as the source without fixed formulaic endings', () => {
    const ai = fallbackReply(normalizeOpenTwitterEvent({
      params: { eventType: 'NEW_TWEET', twAccount: 'ai_xiaomu', content: { id: 'ai-1', text: 'AI 智能体开始进入工作流，很多团队已经在试。', favoriteCount: 10 } },
    })!);
    const english = fallbackReply(normalizeOpenTwitterEvent({
      params: { eventType: 'NEW_TWEET', twAccount: 'sama', content: { id: 'en-1', text: 'Agents are moving from demos into daily work.', favoriteCount: 10 } },
    })!);

    expect(ai).toMatch(/[\u4e00-\u9fff]/);
    expect(english).toMatch(/[A-Za-z]/);
    expect(english).not.toMatch(/[\u4e00-\u9fff]/);
    expect(`${ai}\n${english}`).not.toMatch(/真正拉开差距|短期很容易被情绪带着走|后面还是要看|热闹是一层|后面更该看/);
  });

  it('keeps Chinese fallback replies content-aware instead of generic remember-and-wait slogans', () => {
    const tax = fallbackReply(normalizeOpenTwitterEvent({
      params: { eventType: 'NEW_TWEET', twAccount: 'erchenlu1', content: { id: 'tax-reply', text: '有些国家的税制，明显是在鼓励创业、经商和资本积累，不太鼓励单纯打工。', favoriteCount: 10 } },
    })!);

    expect(tax).toContain('税制');
    expect(tax).toMatch(/收入|资产|资本|打工|创业|经商|激励/);
    expect(tax).not.toMatch(/这个点可以先记一笔|先记一笔|后续反馈|再看后续/);
  });
});
