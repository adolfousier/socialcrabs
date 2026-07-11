import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildXAutoPublishSuccessTelegramMessage,
  buildXReplySuccessTelegramMessage,
  sendTelegramSuccessNotification,
} from './socialcrabs-success-notifications.js';

describe('SocialCrabs success Telegram notifications', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.NOTIFY_TELEGRAM_BOT_TOKEN;
    delete process.env.NOTIFY_TELEGRAM_CHAT_ID;
  });

  it('sends Telegram messages using env credentials when explicit credentials are omitted', async () => {
    process.env.NOTIFY_TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.NOTIFY_TELEGRAM_CHAT_ID = 'test-chat';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response);

    await expect(sendTelegramSuccessNotification('hello from socialcrabs')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('https://api.telegram.org/bottest-token/sendMessage', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        chat_id: 'test-chat',
        text: 'hello from socialcrabs',
        disable_web_page_preview: true,
      }),
    }));
  });

  it('returns false without Telegram env or explicit credentials', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(sendTelegramSuccessNotification('hello from socialcrabs')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('builds a Telegram message for successful X replies', () => {
    const message = buildXReplySuccessTelegramMessage({
      replyAccount: 'yoyo_aigo',
      sourceUrl: 'https://x.com/ai_xiaomu/status/1',
      replyUrl: 'https://x.com/yoyo_aigo/status/2',
      replyText: '这个判断挺实在，先看能不能持续跑起来。',
      replyScore: 88,
    });

    expect(message).toContain('✅ X 评论成功');
    expect(message).toContain('@yoyo_aigo');
    expect(message).toContain('https://x.com/yoyo_aigo/status/2');
    expect(message).toContain('https://x.com/ai_xiaomu/status/1');
    expect(message).toContain('88');
    expect(message).toContain('这个判断挺实在');
  });

  it('builds a Telegram message for successful X auto-publish posts', () => {
    const message = buildXAutoPublishSuccessTelegramMessage({
      account: 'blockheadchain_',
      postedUrl: 'https://x.com/blockheadchain_/status/3',
      sourceUrl: 'https://x.com/cz_binance/status/1',
      text: 'AI 工具真正有意思的地方，是开始变成日常工作流。',
      squareLink: 'https://app.binance.com/uni-qr/cpos/abc',
    });

    expect(message).toContain('✅ X 发推成功');
    expect(message).toContain('@blockheadchain_');
    expect(message).toContain('https://x.com/blockheadchain_/status/3');
    expect(message).toContain('https://x.com/cz_binance/status/1');
    expect(message).toContain('Binance Square');
    expect(message).toContain('AI 工具真正有意思');
  });
});
