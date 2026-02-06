/**
 * ClawSocial Notification Service
 * 
 * CENTRALIZED NOTIFICATIONS — See docs/NOTIFICATION_TEMPLATES.md for specs.
 * All templates defined here. Cron jobs pass context, we format.
 */

import { log } from '../utils/logger.js';
import type {
  NotificationConfig,
  NotificationPayload,
  NotificationChannel,
  NotificationEvent,
  Platform,
  ActionType,
} from '../types/index.js';

// ============================================================================
// Template Formatters — Match docs/NOTIFICATION_TEMPLATES.md EXACTLY
// ============================================================================

interface NotificationDetails {
  // Common
  postUrl?: string;
  profileUrl?: string;
  url?: string;
  
  // X Engagement
  tweet?: string;
  author?: string;
  preview?: string;
  reply?: string;
  language?: string;
  behaviors?: string;
  
  // X Follow
  username?: string;
  followers?: number | string;
  queueRemaining?: number;
  
  // LinkedIn Engagement
  articleTitle?: string;
  articleAuthor?: string;
  comment?: string;
  commentText?: string;
  sessionInfo?: string;
  
  // LinkedIn Connection
  degree?: string;
  method?: string;
  note?: string;
  
  // Instagram
  action?: string;
  actions?: string[];
  
  // Error
  error?: string;
  attempted?: string;
}

/**
 * Format follower count: 1500 -> "1.5K"
 */
function formatCount(num: number | string | undefined): string {
  if (num === undefined) return 'N/A';
  const n = typeof num === 'string' ? parseInt(num, 10) : num;
  if (isNaN(n)) return String(num);
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

/**
 * Get current timestamp formatted
 */
function getTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
}

/**
 * Add common footer fields (language, behaviors, timestamp)
 */
function addFooterFields(lines: string[], d: NotificationDetails): void {
  if (d.language) lines.push(`**Language:** ${d.language}`);
  if (d.behaviors) lines.push(`**Behaviors:** ${d.behaviors}`);
  lines.push(`**Time:** ${getTimestamp()}`);
}

/**
 * Format X Engagement notification
 */
function formatXEngagement(success: boolean, target: string, d: NotificationDetails): string {
  const status = success ? '✅' : '❌';
  const lines: string[] = [];
  
  lines.push(`🐦 **X ENGAGEMENT** ${status}`);
  lines.push('');
  lines.push(`**Tweet:** ${d.tweet || d.postUrl || target}`);
  if (d.author) lines.push(`**Author:** @${d.author.replace('@', '')}`);
  if (d.preview) lines.push(`**Preview:** "${d.preview.substring(0, 100)}"`);
  lines.push('');
  lines.push('**Actions:**');
  lines.push('• ❤️ Liked: ✅');
  if (d.reply || d.commentText) {
    lines.push(`• 💬 Replied: "${d.reply || d.commentText}"`);
  }
  lines.push('');
  addFooterFields(lines, d);
  lines.push('');
  lines.push('_ClawSocial X/Twitter Automation_');
  
  return lines.join('\n');
}

/**
 * Format X Follow notification
 */
function formatXFollow(success: boolean, target: string, d: NotificationDetails): string {
  const status = success ? '✅' : '❌';
  const lines: string[] = [];
  
  lines.push(`👥 **X FOLLOW** ${status}`);
  lines.push('');
  lines.push(`**Target:** @${(d.username || target).replace('@', '')}`);
  if (d.profileUrl) lines.push(`**Profile:** ${d.profileUrl}`);
  if (d.followers !== undefined) lines.push(`**Followers:** ${formatCount(d.followers)}`);
  if (d.queueRemaining !== undefined) lines.push(`**Queue:** ${d.queueRemaining} accounts left`);
  lines.push('');
  addFooterFields(lines, d);
  lines.push('');
  lines.push('_ClawSocial X/Twitter Automation_');
  
  return lines.join('\n');
}

/**
 * Format X Like notification (simpler than full engagement)
 */
function formatXLike(success: boolean, target: string, d: NotificationDetails): string {
  const status = success ? '✅' : '❌';
  const lines: string[] = [];
  
  lines.push(`🐦 **X ENGAGEMENT** ${status}`);
  lines.push('');
  lines.push(`**Tweet:** ${d.tweet || d.postUrl || target}`);
  if (d.author) lines.push(`**Author:** @${d.author.replace('@', '')}`);
  if (d.preview) lines.push(`**Preview:** "${d.preview.substring(0, 100)}"`);
  lines.push('');
  lines.push('**Actions:**');
  lines.push('• ❤️ Liked: ✅');
  lines.push('');
  addFooterFields(lines, d);
  lines.push('');
  lines.push('_ClawSocial X/Twitter Automation_');
  
  return lines.join('\n');
}

/**
 * Format LinkedIn Engagement notification
 */
function formatLinkedInEngagement(success: boolean, target: string, d: NotificationDetails): string {
  const status = success ? '✅' : '❌';
  const lines: string[] = [];
  
  lines.push(`🔗 **LINKEDIN ENGAGEMENT** ${status}`);
  lines.push('');
  if (d.articleTitle) {
    const author = d.articleAuthor || d.author || '';
    lines.push(`**Article:** "${d.articleTitle}"${author ? ` by ${author}` : ''}`);
  }
  lines.push(`**URL:** ${d.url || d.postUrl || target}`);
  lines.push('');
  lines.push('**Actions:**');
  lines.push('• ❤️ Liked: ✅');
  if (d.comment || d.commentText) {
    lines.push(`• 💬 Commented: "${d.comment || d.commentText}"`);
  }
  lines.push('');
  if (d.sessionInfo) lines.push(`**Session:** ${d.sessionInfo}`);
  addFooterFields(lines, d);
  lines.push('');
  lines.push('_ClawSocial LinkedIn Automation_');
  
  return lines.join('\n');
}

/**
 * Format LinkedIn Connection notification
 */
function formatLinkedInConnection(success: boolean, target: string, d: NotificationDetails): string {
  const status = success ? '✅' : '❌';
  const lines: string[] = [];
  
  lines.push(`🔗 **LINKEDIN CONNECTION** ${status}`);
  lines.push('');
  lines.push(`**Profile:** ${d.username || extractUsername(target, 'linkedin')}`);
  lines.push(`**URL:** ${d.profileUrl || d.url || target}`);
  if (d.degree) lines.push(`**Degree:** ${d.degree}`);
  if (d.method) lines.push(`**Method:** ${d.method}`);
  if (d.note) lines.push(`**Note:** "${d.note}"`);
  lines.push('');
  addFooterFields(lines, d);
  lines.push('');
  lines.push('_ClawSocial LinkedIn Automation_');
  
  return lines.join('\n');
}

/**
 * Format Instagram Engagement notification
 */
function formatInstagramEngagement(success: boolean, target: string, d: NotificationDetails): string {
  const status = success ? '✅' : '❌';
  const lines: string[] = [];
  
  lines.push(`📸 **INSTAGRAM ENGAGEMENT** ${status}`);
  lines.push('');
  lines.push(`**Target:** @${(d.username || extractUsername(target, 'instagram')).replace('@', '')}`);
  lines.push(`**Post:** ${d.postUrl || d.url || target || 'N/A'}`);
  
  // Determine action
  let actionText = d.action;
  if (!actionText && d.actions) {
    actionText = d.actions.join(' + ');
  }
  if (!actionText) {
    actionText = d.comment || d.commentText ? 'Liked + Commented' : 'Liked';
  }
  lines.push(`**Action:** ${actionText}`);
  if (d.comment || d.commentText) {
    lines.push(`**Comment:** "${d.comment || d.commentText}"`);
  }
  lines.push('');
  addFooterFields(lines, d);
  lines.push('');
  lines.push('_ClawSocial Instagram Automation_');
  
  return lines.join('\n');
}

/**
 * Format Instagram Follow notification
 */
function formatInstagramFollow(success: boolean, target: string, d: NotificationDetails): string {
  const status = success ? '✅' : '❌';
  const lines: string[] = [];
  
  lines.push(`📸 **INSTAGRAM FOLLOW** ${status}`);
  lines.push('');
  lines.push(`**Target:** @${(d.username || target).replace('@', '')}`);
  if (d.profileUrl) lines.push(`**Profile:** ${d.profileUrl}`);
  if (d.followers !== undefined) lines.push(`**Followers:** ${formatCount(d.followers)}`);
  if (d.queueRemaining !== undefined) lines.push(`**Queue:** ${d.queueRemaining} accounts left`);
  lines.push('');
  addFooterFields(lines, d);
  lines.push('');
  lines.push('_ClawSocial Instagram Automation_');
  
  return lines.join('\n');
}

/**
 * Escape markdown special characters for Telegram
 */
function escapeMarkdown(text: string): string {
  // Escape characters that break Telegram markdown: _ * [ ] ( ) ~ ` > # + - = | { } . !
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

/**
 * Format error notification
 */
function formatError(platform: Platform, action: ActionType, target: string, error: string, d: NotificationDetails): string {
  const emoji = platform === 'twitter' ? '🐦' : platform === 'linkedin' ? '🔗' : '📸';
  const platformName = platform === 'twitter' ? 'X' : platform.toUpperCase();
  const actionName = action.toUpperCase();
  
  // Escape error message to prevent markdown issues
  const safeError = escapeMarkdown(error);
  const safeTarget = escapeMarkdown(target);
  
  const lines: string[] = [];
  lines.push(`${emoji} **${platformName} ${actionName}** ❌`);
  lines.push('');
  lines.push(`**Target:** ${safeTarget}`);
  lines.push(`**Error:** ${safeError}`);
  if (d.attempted) lines.push(`**Attempted:** ${escapeMarkdown(d.attempted)}`);
  lines.push('');
  lines.push(`**Time:** ${getTimestamp()}`);
  lines.push('');
  lines.push(`_ClawSocial ${platformName} Automation_`);
  
  return lines.join('\n');
}

/**
 * Extract username from URL
 */
function extractUsername(url: string, platform: Platform): string {
  if (platform === 'linkedin') {
    const match = url.match(/linkedin\.com\/in\/([^\/\?]+)/);
    return match ? match[1] : url;
  }
  if (platform === 'instagram') {
    const match = url.match(/instagram\.com\/([^\/\?]+)/);
    return match ? match[1] : url;
  }
  if (platform === 'twitter') {
    const match = url.match(/(?:x|twitter)\.com\/([^\/\?]+)/);
    return match ? match[1] : url;
  }
  return url;
}

/**
 * Main format function — routes to specific formatter
 */
function formatNotification(
  platform: Platform,
  action: ActionType,
  success: boolean,
  target: string,
  error?: string,
  details?: Record<string, unknown>
): string {
  const d = (details || {}) as NotificationDetails;
  
  // Error case
  if (!success && error) {
    return formatError(platform, action, target, error, d);
  }
  
  // Route to specific formatter
  if (platform === 'twitter') {
    if (action === 'follow') return formatXFollow(success, target, d);
    if (action === 'like') return formatXLike(success, target, d);
    if (action === 'comment' || action === 'reply') return formatXEngagement(success, target, d);
    return formatXEngagement(success, target, d); // Default for X
  }
  
  if (platform === 'linkedin') {
    if (action === 'connect') return formatLinkedInConnection(success, target, d);
    return formatLinkedInEngagement(success, target, d); // like, comment
  }
  
  if (platform === 'instagram') {
    if (action === 'follow') return formatInstagramFollow(success, target, d);
    return formatInstagramEngagement(success, target, d); // like, comment
  }
  
  // Fallback (should never reach here but TypeScript wants it)
  return `${String(platform).toUpperCase()} ${String(action).toUpperCase()} ${success ? '✅' : '❌'}\nTarget: ${target}`;
}

// ============================================================================
// Notification Sender
// ============================================================================

export class Notifier {
  private config: NotificationConfig;
  
  constructor(config: NotificationConfig) {
    this.config = config;
  }
  
  isEnabled(): boolean {
    return this.config.enabled;
  }
  
  isEventEnabled(event: NotificationEvent): boolean {
    return this.config.enabled && this.config.events[event];
  }
  
  getChannels(): NotificationChannel[] {
    const channels: NotificationChannel[] = [];
    if (this.config.channels.telegram) channels.push('telegram');
    if (this.config.channels.discord) channels.push('discord');
    if (this.config.channels.webhook) channels.push('webhook');
    return channels;
  }
  
  updateConfig(config: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  getConfig(): NotificationConfig {
    return this.config;
  }
  
  async notify(payload: NotificationPayload): Promise<boolean> {
    if (!this.isEventEnabled(payload.event)) {
      log.debug('Notification skipped - event disabled', { event: payload.event });
      return false;
    }
    
    const message = formatNotification(
      payload.platform,
      payload.action,
      payload.success,
      payload.target || '',
      payload.error,
      payload.details
    );
    
    return this.broadcast(message);
  }
  
  async broadcast(message: string): Promise<boolean> {
    if (!this.config.enabled) {
      log.debug('Notifications disabled, skipping broadcast');
      return false;
    }
    
    const results: boolean[] = [];
    
    if (this.config.channels.telegram) {
      results.push(await this.sendTelegram(message));
    }
    if (this.config.channels.discord) {
      results.push(await this.sendDiscord(message));
    }
    if (this.config.channels.webhook) {
      results.push(await this.sendWebhook(message));
    }
    
    return results.some(r => r);
  }
  
  async send(channel: NotificationChannel, message: string): Promise<boolean> {
    switch (channel) {
      case 'telegram':
        return this.sendTelegram(message);
      case 'discord':
        return this.sendDiscord(message);
      case 'webhook':
        return this.sendWebhook(message);
      default:
        log.error(`Unknown notification channel: ${channel}`);
        return false;
    }
  }
  
  async sendTest(channel?: NotificationChannel): Promise<boolean> {
    const testMessage = `🧪 **NOTIFICATION TEST**

This is a test notification from ClawSocial.

**Status:** ✅ Working
**Timestamp:** ${new Date().toISOString()}

_ClawSocial Automation_`;
    
    if (channel) {
      return this.send(channel, testMessage);
    }
    return this.broadcast(testMessage);
  }
  
  private async sendTelegram(message: string): Promise<boolean> {
    const cfg = this.config.channels.telegram;
    if (!cfg) return false;
    
    try {
      const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cfg.chatId,
          text: message,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        log.error('Telegram notification failed', { status: response.status, error });
        return false;
      }
      
      log.debug('Telegram notification sent');
      return true;
    } catch (error) {
      log.error('Telegram notification error', { error: String(error) });
      return false;
    }
  }
  
  private async sendDiscord(message: string): Promise<boolean> {
    const cfg = this.config.channels.discord;
    if (!cfg) return false;
    
    try {
      const response = await fetch(cfg.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        log.error('Discord notification failed', { status: response.status, error });
        return false;
      }
      
      log.debug('Discord notification sent');
      return true;
    } catch (error) {
      log.error('Discord notification error', { error: String(error) });
      return false;
    }
  }
  
  private async sendWebhook(message: string): Promise<boolean> {
    const cfg = this.config.channels.webhook;
    if (!cfg) return false;
    
    try {
      const response = await fetch(cfg.url, {
        method: cfg.method || 'POST',
        headers: { 'Content-Type': 'application/json', ...cfg.headers },
        body: JSON.stringify({ message, timestamp: Date.now(), source: 'clawsocial' }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        log.error('Webhook notification failed', { status: response.status, error });
        return false;
      }
      
      log.debug('Webhook notification sent');
      return true;
    } catch (error) {
      log.error('Webhook notification error', { error: String(error) });
      return false;
    }
  }
}

let notifierInstance: Notifier | null = null;

export function initNotifier(config: NotificationConfig): Notifier {
  notifierInstance = new Notifier(config);
  return notifierInstance;
}

export function getNotifier(): Notifier | null {
  return notifierInstance;
}
