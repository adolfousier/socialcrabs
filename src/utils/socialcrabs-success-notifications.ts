import 'dotenv/config';

export interface TelegramCredentials {
  botToken?: string;
  chatId?: string;
}

export interface XReplySuccessNotificationInput {
  replyAccount: string;
  sourceUrl: string;
  replyUrl: string;
  replyText: string;
  replyScore?: number;
}

export interface XAutoPublishSuccessNotificationInput {
  account: string;
  postedUrl: string;
  sourceUrl?: string;
  text: string;
  squareLink?: string;
}

function compactPreview(text: string, maxChars = 180): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > maxChars ? `${cleaned.slice(0, maxChars - 1)}…` : cleaned;
}

export function buildXReplySuccessTelegramMessage(input: XReplySuccessNotificationInput): string {
  return [
    '✅ X 评论成功',
    '',
    `账号：@${input.replyAccount.replace(/^@/, '')}`,
    `评论：${input.replyUrl}`,
    `原推：${input.sourceUrl}`,
    input.replyScore === undefined ? undefined : `评分：${input.replyScore}`,
    '',
    `内容：${compactPreview(input.replyText)}`,
    '',
    `时间：${new Date().toISOString()}`,
  ].filter((line): line is string => line !== undefined).join('\n');
}

export function buildXAutoPublishSuccessTelegramMessage(input: XAutoPublishSuccessNotificationInput): string {
  return [
    '✅ X 发推成功',
    '',
    `账号：@${input.account.replace(/^@/, '')}`,
    `推文：${input.postedUrl}`,
    input.sourceUrl ? `源推：${input.sourceUrl}` : undefined,
    input.squareLink ? `Binance Square：${input.squareLink}` : undefined,
    '',
    `内容：${compactPreview(input.text)}`,
    '',
    `时间：${new Date().toISOString()}`,
  ].filter((line): line is string => line !== undefined).join('\n');
}

export async function sendTelegramSuccessNotification(
  message: string,
  credentials: TelegramCredentials = {}
): Promise<boolean> {
  const botToken = credentials.botToken || process.env.NOTIFY_TELEGRAM_BOT_TOKEN;
  const chatId = credentials.chatId || process.env.NOTIFY_TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return false;

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        disable_web_page_preview: true,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
