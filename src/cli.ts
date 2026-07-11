#!/usr/bin/env node

import 'dotenv/config';
import { execFileSync } from 'child_process';
import { Command } from 'commander';
import { SocialCrabs } from './index.js';
import {
  computeNextRunAt,
  isSchedulerDue,
  loadTweetSchedulerState,
  saveTweetSchedulerState,
} from './utils/tweet-scheduler.js';
import {
  postTweetWithXurl,
} from './utils/xurl-poster.js';
import {
  loadTweetQueue,
  markTweetItem,
  saveTweetQueue,
  selectPendingTweetItems,
} from './utils/tweet-queue.js';
import {
  buildChineseTweetDrafts,
  loadRankedSourceTweets,
  saveTweetDraftQueue,
} from './utils/tweet-drafts.js';
import {
  capLimitPerUser,
  filterTweetsSince,
  loadSourceScanState,
  loadSourceUsers,
  rankSourceTweets,
  saveSourceScanState,
  saveSourceTweets,
} from './utils/source-scan.js';
import {
  appendActionLog,
  previewAction,
} from './utils/safety.js';
import {
  createApiTweetActionResult,
  normalizeTweetPostingMethod,
} from './utils/twitter-posting-policy.js';
import {
  buildTweetPipelinePlan,
  saveTweetImageJobs,
} from './utils/tweet-pipeline.js';
import { createOpenTwitterClientFromEnv } from './opentwitter/index.js';
import { extractTweetId } from './graphql/constants.js';
import {
  buildMultiAccountPosts,
  buildOpenTwitterSourceSearchOptions,
  loadMultiAccountConfig,
  normalizeOpenTwitterTweets,
  selectTextOnlyTweets,
} from './utils/multi-account-pipeline.js';
import {
  advanceTargetAccountCursor,
  buildAutoPublishHermesPrompt,
  buildAutoPublishPlans,
  buildImagePromptForTweet,
  buildNextAutoPublishState,
  buildPendingAutoPublishRun,
  buildXurlAccountArgs,
  cleanAutoPublishGeneratedText,
  computeContinuousCollectionWindow,
  defaultPendingAutoPublishRunPath,
  deletePendingAutoPublishRun,
  filterDueSourceUsers,
  getPublishedSourceTweetIds,
  loadAutoPublishState,
  loadPendingAutoPublishRun,
  markAutoPublishPlansPosted,
  markSourceUsersProcessed,
  saveAutoPublishState,
  savePendingAutoPublishRun,
  selectRotatingTargetAccounts,
} from './utils/auto-publish.js';
import {
  postToBinanceSquare,
} from './utils/binance-square.js';
import {
  buildXAutoPublishSuccessTelegramMessage,
  sendTelegramSuccessNotification,
} from './utils/socialcrabs-success-notifications.js';
import type { Platform, ActionType, NotificationPayload } from './types/index.js';

// Default retry configuration
const DEFAULT_RETRIES = 3;
const RETRY_DELAY_MS = 5000; // 5 seconds between retries
const ACTION_LOG_PATH = process.env.ACTION_LOG_FILE || 'logs/actions.jsonl';

/**
 * Parse --context JSON flag and merge with action result
 */
function parseContext(contextStr?: string): Record<string, unknown> | undefined {
  if (!contextStr) return undefined;
  try {
    return JSON.parse(contextStr);
  } catch {
    console.error('Invalid --context JSON:', contextStr);
    return undefined;
  }
}

/**
 * Retry wrapper for actions
 */
async function withRetry<T>(
  action: () => Promise<T>,
  options: {
    retries: number;
    actionName: string;
    target: string;
  }
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= options.retries; attempt++) {
    try {
      return await action();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < options.retries) {
        console.log(`⚠️ Attempt ${attempt}/${options.retries} failed for ${options.actionName} (${options.target})`);
        console.log(`   Error: ${lastError.message}`);
        console.log(`   Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }
  
  throw lastError;
}

/**
 * Parse retries option, default to DEFAULT_RETRIES
 */
function parseRetries(retriesStr?: string): number {
  if (!retriesStr) return DEFAULT_RETRIES;
  const n = parseInt(retriesStr, 10);
  return isNaN(n) ? DEFAULT_RETRIES : Math.max(1, Math.min(n, 10)); // Clamp 1-10
}

/**
 * Send notification with merged context (used when --context is provided)
 */
async function sendNotificationWithContext(
  claw: SocialCrabs,
  platform: Platform,
  action: ActionType,
  success: boolean,
  target: string,
  context?: Record<string, unknown>,
  error?: string
): Promise<void> {
  const notifier = claw.notifier;
  if (!notifier.isEnabled()) return;
  
  const payload: NotificationPayload = {
    event: success ? 'action:complete' : 'action:error',
    platform,
    action,
    success,
    target,
    error,
    details: context,
    timestamp: Date.now(),
  };
  
  await notifier.notify(payload);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function extractJsonObjectFromOutput(output: string): string {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  return start >= 0 && end >= start ? output.slice(start, end + 1) : output;
}

function extractIdFromXurlPostOutput(output: string): string | undefined {
  try {
    const parsed = JSON.parse(extractJsonObjectFromOutput(output)) as { data?: { id?: string } };
    return parsed.data?.id;
  } catch {
    return undefined;
  }
}

function autoPublishDebugEnabled(): boolean {
  return /^(1|true|yes|on)$/i.test(process.env.SOCIALCRABS_AUTO_PUBLISH_DEBUG || '');
}

function truncateDebugValue(value: string, maxChars = 600): string {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length > maxChars ? `${cleaned.slice(0, maxChars - 1)}…` : cleaned;
}

function logAutoPublishRewriteDebug(input: {
  account: string;
  rawStdout?: string;
  cleanedText?: string;
  fallbackUsed: boolean;
  reason?: string;
}): void {
  if (!autoPublishDebugEnabled()) return;
  console.error(JSON.stringify({
    event: 'auto-publish.rewrite',
    account: input.account.replace(/^@/, ''),
    fallbackUsed: input.fallbackUsed,
    reason: input.reason,
    rawStdout: input.rawStdout === undefined ? undefined : truncateDebugValue(input.rawStdout),
    cleanedText: input.cleanedText === undefined ? undefined : truncateDebugValue(input.cleanedText),
  }));
}

function generateAutoPublishTextWithHermes(input: {
  sourceText: string;
  draftText: string;
  account: string;
  style?: string;
  maxChars: number;
}): string {
  const prompt = buildAutoPublishHermesPrompt(input);
  try {
    const output = execFileSync('hermes', ['--skills', 'humanizer-zh', '--toolsets', 'safe', '--oneshot', prompt], {
      encoding: 'utf-8',
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        HERMES_SESSION_SOURCE: 'tool',
      },
    });
    const cleanedText = cleanAutoPublishGeneratedText(output, input.maxChars, 60);
    const fallbackUsed = cleanedText.length === 0;
    logAutoPublishRewriteDebug({
      account: input.account,
      rawStdout: output,
      cleanedText,
      fallbackUsed,
      reason: fallbackUsed ? 'empty-or-too-short-after-cleaning' : 'oneshot-ok',
    });
    return cleanedText || input.draftText;
  } catch (error) {
    logAutoPublishRewriteDebug({
      account: input.account,
      fallbackUsed: true,
      reason: `oneshot-error:${error instanceof Error ? error.message : String(error)}`,
    });
    return input.draftText;
  }
}

function boolOption(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function printTweets(tweets: Array<{ id: string; text: string; author: { username: string; name?: string }; likeCount?: number; retweetCount?: number; replyCount?: number }>): void {
  for (const tweet of tweets) {
    console.log(`@${tweet.author.username}${tweet.author.name ? ` (${tweet.author.name})` : ''} · ${tweet.id}`);
    console.log(tweet.text);
    console.log(`❤️ ${tweet.likeCount ?? 0}  🔁 ${tweet.retweetCount ?? 0}  💬 ${tweet.replyCount ?? 0}`);
    console.log('');
  }
}

function disableTwitterBrowserAction(action: string): never {
  console.error(`X browser action disabled: ${action}`);
  console.error('SocialCrabs no longer opens X pages in Playwright. Use opentwitter/TWITTER_TOKEN for read-only collection and xurl/API for publishing.');
  process.exit(1);
}

const program = new Command();

program
  .name('socialcrabs')
  .description('Production-ready social media automation with human-like behavior')
  .version('1.0.0');

// ============================================================================
// Server command
// ============================================================================

program
  .command('serve')
  .description('Start the SocialCrabs server')
  .option('-p, --port <port>', 'HTTP port', '3847')
  .option('-w, --ws-port <port>', 'WebSocket port', '3848')
  .option('-h, --host <host>', 'Host to bind to', '127.0.0.1')
  .option('--headless', 'Run browser in headless mode', true)
  .option('--no-headless', 'Run browser with visible window')
  .action(async (options) => {
    try {
      const claw = new SocialCrabs({
        server: {
          port: parseInt(options.port, 10),
          wsPort: parseInt(options.wsPort, 10),
          host: options.host,
        },
        browser: {
          headless: options.headless,
        },
      });

      await claw.initialize();
      await claw.startServer();

      console.log(`\n🦞 SocialCrabs server running`);
      console.log(`   HTTP: http://${options.host}:${options.port}`);
      console.log(`   WS:   ws://${options.host}:${options.wsPort}`);
      console.log(`\nPress Ctrl+C to stop\n`);
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  });

// ============================================================================
// Session commands
// ============================================================================

const session = program.command('session').description('Manage login sessions');

session
  .command('login <platform>')
  .description('Login to a platform (instagram, twitter, linkedin)')
  .option('--headless', 'Run in headless mode (reads credentials from env)')
  .option('-u, --username <username>', 'Username/email (or set PLATFORM_USERNAME env)')
  .option('-p, --password <password>', 'Password (or set PLATFORM_PASSWORD env)')
  .action(async (platform: Platform, options) => {
    try {
      if (platform === 'twitter') {
        disableTwitterBrowserAction('session login twitter');
      }
      // Get credentials from options or environment
      const envPrefix = platform.toUpperCase();
      const username = options.username || process.env[`${envPrefix}_USERNAME`] || process.env[`${envPrefix}_EMAIL`];
      const password = options.password || process.env[`${envPrefix}_PASSWORD`];
      
      const headless = options.headless === true || !!(username && password);
      
      const claw = new SocialCrabs({
        browser: { headless },
      });

      await claw.initialize();
      
      if (headless && username && password) {
        console.log(`\n🔐 Logging in to ${platform} (headless mode)...`);
        const success = await claw.loginWithCredentials(platform, username, password);
        
        if (success) {
          console.log(`✅ Successfully logged in to ${platform}`);
        } else {
          console.log(`❌ Login to ${platform} failed`);
        }
      } else if (headless) {
        console.log(`\n⚠️  Headless login requires credentials.`);
        console.log(`Set ${envPrefix}_USERNAME and ${envPrefix}_PASSWORD in .env`);
        console.log(`Or pass -u USERNAME -p PASSWORD\n`);
      } else {
        console.log(`\nOpening ${platform} login...`);
        console.log('Please enter your credentials in the browser window.\n');

        const success = await claw.login(platform);

        if (success) {
          console.log(`✅ Successfully logged in to ${platform}`);
        } else {
          console.log(`❌ Login to ${platform} failed or timed out`);
        }
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Login failed:', error);
      process.exit(1);
    }
  });

session
  .command('status')
  .description('Check login status for non-X browser platforms; X uses opentwitter token')
  .action(async () => {
    const hasToken = Boolean(process.env.TWITTER_TOKEN);
    console.log('X/twitter browser status checks disabled.');
    console.log(`opentwitter TWITTER_TOKEN: ${hasToken ? '✅ configured' : '❌ missing'}`);
    console.log('Instagram/LinkedIn browser status checks are not run by this command anymore because the old aggregate status path initialized the X browser context too.');
  });

session
  .command('logout <platform>')
  .description('Logout from a platform')
  .action(async (platform: Platform) => {
    try {
      if (platform === 'twitter') {
        disableTwitterBrowserAction('session logout twitter');
      }
      const claw = new SocialCrabs({ browser: { headless: true } });
      await claw.initialize();
      await claw.logout(platform);
      console.log(`✅ Logged out of ${platform}`);
      await claw.shutdown();
    } catch (error) {
      console.error('Logout failed:', error);
      process.exit(1);
    }
  });

// ============================================================================
// Instagram commands
// ============================================================================

const ig = program.command('ig').alias('instagram').description('Instagram actions');

ig.command('like <url>')
  .description('Like an Instagram post')
  .option('-c, --context <json>', 'JSON context for notification')
  .option('-r, --retries <number>', 'Number of retry attempts on failure', String(DEFAULT_RETRIES))
  .action(async (url: string, options: { context?: string; retries?: string }) => {
    const retries = parseRetries(options.retries);
    const context = parseContext(options.context);
    if (context) process.env.SOCIALCRABS_SILENT = '1';
    
    const claw = new SocialCrabs({ browser: { headless: true } });
    
    try {
      await claw.initialize();

      await withRetry(
        async () => {
          const res = await claw.instagram.like({ url });
          if (!res.success) throw new Error(res.error || 'Like failed');
          return res;
        },
        { retries, actionName: 'IG like', target: url }
      );

      console.log(`✅ Liked post: ${url}`);
      
      if (context) {
        await sendNotificationWithContext(
          claw, 'instagram', 'like', true, url,
          { postUrl: url, ...context }
        );
      }

      await claw.shutdown();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`❌ Failed to like after ${retries} attempts: ${errorMsg}`);
      
      if (context) {
        await sendNotificationWithContext(
          claw, 'instagram', 'like', false, url, context, errorMsg
        );
      }
      
      await claw.shutdown();
      process.exit(1);
    }
  });

ig.command('follow <username>')
  .description('Follow an Instagram user')
  .option('-c, --context <json>', 'JSON context for notification')
  .option('-r, --retries <number>', 'Number of retry attempts on failure', String(DEFAULT_RETRIES))
  .action(async (username: string, options: { context?: string; retries?: string }) => {
    const retries = parseRetries(options.retries);
    const context = parseContext(options.context);
    if (context) process.env.SOCIALCRABS_SILENT = '1';
    
    const claw = new SocialCrabs({ browser: { headless: true } });
    
    try {
      await claw.initialize();

      await withRetry(
        async () => {
          const res = await claw.instagram.follow({ username });
          if (!res.success) throw new Error(res.error || 'Follow failed');
          return res;
        },
        { retries, actionName: 'IG follow', target: `@${username}` }
      );

      console.log(`✅ Followed: @${username}`);
      
      if (context) {
        await sendNotificationWithContext(
          claw, 'instagram', 'follow', true, username,
          { profileUrl: `https://instagram.com/${username}`, ...context }
        );
      }

      await claw.shutdown();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`❌ Failed to follow @${username} after ${retries} attempts: ${errorMsg}`);
      
      if (context) {
        await sendNotificationWithContext(
          claw, 'instagram', 'follow', false, username, context, errorMsg
        );
      }
      
      await claw.shutdown();
      process.exit(1);
    }
  });

ig.command('comment <url> <text>')
  .description('Comment on an Instagram post')
  .option('-c, --context <json>', 'JSON context for notification')
  .option('-r, --retries <number>', 'Number of retry attempts on failure', String(DEFAULT_RETRIES))
  .action(async (url: string, text: string, options: { context?: string; retries?: string }) => {
    const retries = parseRetries(options.retries);
    const context = parseContext(options.context);
    if (context) process.env.SOCIALCRABS_SILENT = '1';
    
    const claw = new SocialCrabs({ browser: { headless: true } });
    
    try {
      await claw.initialize();

      await withRetry(
        async () => {
          const res = await claw.instagram.comment({ url, text });
          if (!res.success) throw new Error(res.error || 'Comment failed');
          return res;
        },
        { retries, actionName: 'IG comment', target: url }
      );

      console.log(`✅ Commented on: ${url}`);
      
      if (context) {
        await sendNotificationWithContext(
          claw, 'instagram', 'comment', true, url,
          { postUrl: url, commentText: text, ...context }
        );
      }

      await claw.shutdown();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`❌ Failed to comment after ${retries} attempts: ${errorMsg}`);
      
      if (context) {
        await sendNotificationWithContext(
          claw, 'instagram', 'comment', false, url, context, errorMsg
        );
      }

      await claw.shutdown();
      process.exit(1);
    }
  });

ig.command('dm <username> <message>')
  .description('Send a DM to an Instagram user')
  .action(async (username: string, message: string) => {
    try {
      const claw = new SocialCrabs({ browser: { headless: true } });
      await claw.initialize();

      const result = await claw.instagram.dm({ username, message });

      if (result.success) {
        console.log(`✅ Sent DM to: @${username}`);
      } else {
        console.log(`❌ Failed to send DM: ${result.error}`);
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

ig.command('profile <username>')
  .description('Get Instagram profile data')
  .action(async (username: string) => {
    try {
      const claw = new SocialCrabs({ browser: { headless: true } });
      await claw.initialize();

      const profile = await claw.instagram.getProfile(username);
      console.log(JSON.stringify(profile, null, 2));

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

ig.command('followers <username>')
  .description('Scrape followers from an Instagram profile')
  .option('-n, --limit <number>', 'Max followers to scrape', '10')
  .action(async (username: string, options: { limit: string }) => {
    try {
      const claw = new SocialCrabs({ browser: { headless: true } });
      await claw.initialize();

      const limit = parseInt(options.limit, 10);
      const followers = await claw.instagram.scrapeFollowers(username, limit);
      
      console.log(`\n📋 Scraped ${followers.length} followers from @${username}:\n`);
      followers.forEach((f, i) => console.log(`  ${i + 1}. @${f}`));
      console.log(JSON.stringify({ username, followers, count: followers.length }, null, 2));

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

ig.command('posts <username>')
  .description('Get recent posts from an Instagram profile')
  .option('-n, --limit <number>', 'Max posts to get', '3')
  .action(async (username: string, options: { limit: string }) => {
    try {
      const claw = new SocialCrabs({ browser: { headless: true } });
      await claw.initialize();

      const limit = parseInt(options.limit, 10);
      const posts = await claw.instagram.getRecentPosts(username, limit);
      
      console.log(`\n📷 Recent posts from @${username}:\n`);
      posts.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
      console.log(JSON.stringify({ username, posts, count: posts.length }, null, 2));

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// ============================================================================
// Twitter commands
// ============================================================================

const twitter = program.command('twitter').alias('x').description('Twitter/X actions');

twitter
  .command('like <url>')
  .description('Like a tweet')
  .option('-c, --context <json>', 'JSON context for notification (language, behaviors, etc.)')
  .option('-r, --retries <number>', 'Number of retry attempts on failure', String(DEFAULT_RETRIES))
  .action(async (url: string) => {
    void url;
    disableTwitterBrowserAction('like');
  });

twitter
  .command('tweet <text>')
  .description('Post a tweet via X API/xurl only')
  .option('--dry-run', 'Preview the tweet without posting')
  .option('--confirm', 'Ask for confirmation before posting')
  .action(async (text: string, options: { dryRun?: boolean; confirm?: boolean }) => {
    try {
      const summary = `About to post tweet via X API/xurl:\n\n${text}`;
      const preview = await previewAction({
        dryRun: options.dryRun,
        confirm: options.confirm,
        summary,
        run: async () => {
          const startedAt = Date.now();
          const apiResult = postTweetWithXurl(text);
          return createApiTweetActionResult(text, apiResult, startedAt);
        },
      });

      if (!preview.executed) {
        console.log(preview.message);
        appendActionLog(ACTION_LOG_PATH, {
          platform: 'twitter',
          action: 'tweet',
          text,
          method: 'api',
          status: preview.cancelled ? 'cancelled' : 'dry-run',
        });
        return;
      }

      const result = preview.value!;
      if (result.success) {
        console.log(`✅ Posted tweet via API`);
        if (result.data?.postUrl) {
          console.log(`🔗 ${result.data.postUrl}`);
        }
        appendActionLog(ACTION_LOG_PATH, {
          platform: 'twitter',
          action: 'tweet',
          text,
          method: 'api',
          status: 'success',
          url: result.data?.postUrl as string | undefined,
        });
      } else {
        console.log(`❌ Failed to post via API: ${result.error}`);
        appendActionLog(ACTION_LOG_PATH, {
          platform: 'twitter',
          action: 'tweet',
          text,
          method: 'api',
          status: 'error',
          error: result.error,
        });
        process.exitCode = 1;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      appendActionLog(ACTION_LOG_PATH, {
        platform: 'twitter',
        action: 'tweet',
        text,
        method: 'api',
        status: 'error',
        error: errorMsg,
      });
      console.error('Error:', error);
      process.exit(1);
    }
  });

twitter
  .command('follow <username>')
  .description('Follow a Twitter user')
  .option('-c, --context <json>', 'JSON context for notification')
  .option('-r, --retries <number>', 'Number of retry attempts on failure', String(DEFAULT_RETRIES))
  .option('--dry-run', 'Preview the follow without clicking')
  .option('--confirm', 'Ask for confirmation before following')
  .action(async (usernameOrUrl: string) => {
    void usernameOrUrl;
    disableTwitterBrowserAction('follow');
  });

twitter
  .command('follow-queue <file>')
  .description('Follow pending users from a JSON queue')
  .option('-l, --limit <number>', 'Maximum users to follow in this run', '1')
  .option('-r, --retries <number>', 'Number of retry attempts per user', String(DEFAULT_RETRIES))
  .option('--delay-seconds <number>', 'Delay between successful follows', '120')
  .option('--dry-run', 'Preview queued follows without clicking')
  .option('--confirm', 'Ask for confirmation before running the queue')
  .action(async (file: string) => {
    void file;
    disableTwitterBrowserAction('follow-queue');
  });

 twitter
  .command('reply <url> <text>')
  .description('Reply to a tweet')
  .option('-c, --context <json>', 'JSON context for notification')
  .action(async (url: string, text: string) => {
    void url;
    void text;
    disableTwitterBrowserAction('reply');
  });

// X DM removed - encrypted DMs require passcode that can't be automated

// ============================================================================
// X Read Commands via opentwitter / 6551 API (no browser, no x.com GraphQL cookies)
// ============================================================================

twitter
  .command('search <query>')
  .description('Search tweets via opentwitter / 6551 API')
  .option('-n, --count <number>', 'Number of tweets', '20')
  .option('--json', 'Output raw JSON')
  .action(async (query: string, options: { count?: string; json?: boolean }) => {
    try {
      const client = createOpenTwitterClientFromEnv();
      const result = await client.search({ keywords: query, maxResults: parseInt(options.count || '20', 10), product: 'Top' });
      if (!result.success) { console.error('Error:', result.error); process.exit(1); }
      if (options.json) { console.log(JSON.stringify(result.tweets, null, 2)); return; }
      if (result.tweets.length === 0) { console.log('No tweets found.'); return; }
      for (const tweet of result.tweets) {
        console.log(`\n@${tweet.author.username} (${tweet.author.name})`);
        console.log(tweet.text);
        console.log(`❤️ ${tweet.likeCount ?? 0}  🔁 ${tweet.retweetCount ?? 0}  💬 ${tweet.replyCount ?? 0}`);
        console.log(`https://x.com/${tweet.author.username}/status/${tweet.id}`);
        console.log('---');
      }
      console.log(`\n${result.tweets.length} tweets found via opentwitter.`);
    } catch (e: any) { console.error('Error:', e.message); process.exit(1); }
  });

twitter
  .command('home')
  .description('Disabled: opentwitter does not expose a home timeline endpoint')
  .option('-n, --count <number>', 'Ignored')
  .option('--json', 'Ignored')
  .action(async () => {
    console.error('X home timeline disabled: it required authenticated x.com GraphQL/cookie access. Use `socialcrabs twitter search` or `source-scan` via opentwitter instead.');
    process.exit(1);
  });

twitter
  .command('mentions')
  .description('Search tweets mentioning a user via opentwitter')
  .option('-u, --username <username>', 'Username to search mentions for')
  .option('-n, --count <number>', 'Number of tweets', '5')
  .option('--json', 'Output raw JSON')
  .action(async (options: { username?: string; count?: string; json?: boolean }) => {
    try {
      const username = options.username || process.env.SOCIALCRABS_TWITTER_USERNAME || process.env.TWITTER_USERNAME;
      if (!username) { console.error('Error: --username or TWITTER_USERNAME is required for opentwitter mentions.'); process.exit(1); }
      const client = createOpenTwitterClientFromEnv();
      const result = await client.search({ mentionUser: username, maxResults: parseInt(options.count || '5', 10), product: 'Latest' });
      if (!result.success) { console.error('Error:', result.error); process.exit(1); }
      if (options.json) { console.log(JSON.stringify(result.tweets, null, 2)); return; }
      if (result.tweets.length === 0) { console.log('No mentions found.'); return; }
      for (const tweet of result.tweets) {
        console.log(`\n@${tweet.author.username}: ${tweet.text}`);
        console.log(`https://x.com/${tweet.author.username}/status/${tweet.id}`);
        console.log('---');
      }
    } catch (e: any) { console.error('Error:', e.message); process.exit(1); }
  });

twitter
  .command('tweet-queue <file>')
  .description('Post pending tweets from a JSON queue via X API/xurl; supports imagePath media')
  .option('-l, --limit <number>', 'Maximum tweets to post in this run', '1')
  .option('--delay-seconds <number>', 'Delay between successful tweets', '120')
  .option('--dry-run', 'Preview queued tweets without posting')
  .option('--confirm', 'Ask for confirmation before posting')
  .option('--method <method>', 'Posting method: api only', 'api')
  .action(async (file: string, options: { limit?: string; delaySeconds?: string; dryRun?: boolean; confirm?: boolean; method?: string }) => {
    const fs = await import('fs');
    const limit = Math.max(1, parseInt(options.limit || '1', 10) || 1);
    const delaySeconds = Math.max(0, parseInt(options.delaySeconds || '120', 10) || 0);
    try {
      const method = normalizeTweetPostingMethod(options.method);
      const queue = loadTweetQueue(file);
      let items = queue.items;
      const selected = selectPendingTweetItems(items, limit);

      if (selected.length === 0) {
        console.log('No pending tweets in queue.');
        return;
      }

      const summary = [
        `About to post ${selected.length} queued tweet(s):`,
        ...selected.map((item, index) => {
          const image = item.imagePath ? ` [image: ${item.imagePath}]` : '';
          return `${index + 1}. ${item.text.slice(0, 120).replace(/\s+/g, ' ')}${image}`;
        }),
        `Queue: ${file}`,
        `Method: ${method}`,
        `Delay between tweets: ${delaySeconds}s`,
      ].join('\n');

      const preview = await previewAction({
        dryRun: options.dryRun,
        confirm: options.confirm,
        summary,
        run: async () => true,
      });

      if (!preview.executed) {
        console.log(preview.message);
        for (const item of selected) {
          appendActionLog(ACTION_LOG_PATH, {
            platform: 'twitter',
            action: 'tweet-queue',
            target: item.id,
            text: item.text,
            status: preview.cancelled ? 'cancelled' : 'dry-run',
            queue: file,
            imagePath: item.imagePath,
          });
        }
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < selected.length; i++) {
        const item = selected[i];
        console.log(`\n[${i + 1}/${selected.length}] Posting queued tweet ${item.id}...`);

        try {
          const media = item.imagePath && fs.existsSync(item.imagePath) ? [item.imagePath] : undefined;
          if (item.imagePath && !media) {
            console.log(`⚠️  Image path not found, posting text only: ${item.imagePath}`);
          }
          const res = postTweetWithXurl(item.text, media || []);
          if (!res.success) throw new Error(res.error || 'xurl post failed');
          const postedUrl = res.postedUrl;

          successCount += 1;
          items = markTweetItem(items, item.id, 'posted', { postedUrl });
          saveTweetQueue(file, items);
          appendActionLog(ACTION_LOG_PATH, {
            platform: 'twitter',
            action: 'tweet-queue',
            target: item.id,
            text: item.text,
            status: 'success',
            url: postedUrl,
            queue: file,
            imagePath: item.imagePath,
          });
          console.log(`✅ Posted queued tweet ${item.id}`);
          if (postedUrl) console.log(`🔗 ${postedUrl}`);

          if (i < selected.length - 1 && delaySeconds > 0) {
            console.log(`Waiting ${delaySeconds}s before next tweet...`);
            await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errorCount += 1;
          items = markTweetItem(items, item.id, 'error', { error: errorMsg });
          saveTweetQueue(file, items);
          appendActionLog(ACTION_LOG_PATH, {
            platform: 'twitter',
            action: 'tweet-queue',
            target: item.id,
            text: item.text,
            status: 'error',
            error: errorMsg,
            queue: file,
            imagePath: item.imagePath,
          });
          console.log(`❌ Failed ${item.id}: ${errorMsg}`);
        }
      }

      console.log(`\nDone. Posted: ${successCount}, errors: ${errorCount}`);
      if (errorCount > 0) process.exitCode = 1;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      appendActionLog(ACTION_LOG_PATH, {
        platform: 'twitter',
        action: 'tweet-queue',
        target: file,
        status: 'error',
        error: errorMsg,
      });
      console.error('Error:', errorMsg);
      process.exit(1);
    }
  });

twitter
  .command('tweet-scheduler')
  .description('Run one scheduler tick: post one pending tweet via API only when due')
  .option('--queue <file>', 'Tweet queue JSON file', 'queues/tweets.json')
  .option('--state <file>', 'Scheduler state JSON file', 'state/tweet-scheduler.json')
  .option('--min-hours <number>', 'Minimum hours before next run', '6')
  .option('--max-hours <number>', 'Maximum hours before next run', '8')
  .option('--run-now', 'Ignore nextRunAt and run immediately if a pending tweet exists')
  .option('--dry-run', 'Show scheduler decision without posting or mutating files')
  .action(async (options: { queue?: string; state?: string; minHours?: string; maxHours?: string; runNow?: boolean; dryRun?: boolean }) => {
    const fs = await import('fs');
    const queuePath = options.queue || 'queues/tweets.json';
    const statePath = options.state || 'state/tweet-scheduler.json';
    const minHours = Math.max(0.1, parseFloat(options.minHours || '6') || 6);
    const maxHours = Math.max(minHours, parseFloat(options.maxHours || '8') || 8);
    const now = new Date();
    const state = loadTweetSchedulerState(statePath);

    if (!state.nextRunAt && !options.runNow) {
      const nextRunAt = computeNextRunAt(now, minHours, maxHours).toISOString();
      const nextState = { ...state, nextRunAt, minHours, maxHours, lastStatus: 'initialized' };
      console.log(`Scheduler initialized. Next run: ${nextRunAt}`);
      if (!options.dryRun) saveTweetSchedulerState(statePath, nextState);
      return;
    }

    const due = options.runNow || isSchedulerDue(state, now);
    if (!due) {
      console.log(`Not due. Next run: ${state.nextRunAt}`);
      return;
    }

    const queue = loadTweetQueue(queuePath);
    const [item] = selectPendingTweetItems(queue.items, 1);
    if (!item) {
      const nextRunAt = computeNextRunAt(now, minHours, maxHours).toISOString();
      const nextState = { ...state, nextRunAt, minHours, maxHours, lastRunAt: now.toISOString(), lastStatus: 'no_pending_tweets' };
      console.log(`Due, but no pending tweets. Next run: ${nextRunAt}`);
      if (!options.dryRun) saveTweetSchedulerState(statePath, nextState);
      return;
    }

    const media = item.imagePath && fs.existsSync(item.imagePath) ? [item.imagePath] : [];
    console.log(`Due. Will post queued tweet ${item.id} via API.`);
    console.log(item.text);
    if (media.length > 0) console.log(`Image: ${media[0]}`);

    if (options.dryRun) {
      console.log('DRY RUN: no API call, no queue/state mutation.');
      return;
    }

    const result = postTweetWithXurl(item.text, media);
    const items = result.success
      ? markTweetItem(queue.items, item.id, 'posted', { postedUrl: result.postedUrl })
      : markTweetItem(queue.items, item.id, 'error', { error: result.error || 'xurl post failed' });
    saveTweetQueue(queuePath, items);

    const nextRunAt = computeNextRunAt(now, minHours, maxHours).toISOString();
    saveTweetSchedulerState(statePath, {
      ...state,
      nextRunAt,
      minHours,
      maxHours,
      lastRunAt: now.toISOString(),
      lastStatus: result.success ? 'posted' : 'error',
      lastMessage: result.success ? result.postedUrl : result.error,
    });

    appendActionLog(ACTION_LOG_PATH, {
      platform: 'twitter',
      action: 'tweet-scheduler',
      target: item.id,
      status: result.success ? 'success' : 'error',
      url: result.postedUrl,
      error: result.error,
      nextRunAt,
    });

    if (!result.success) {
      console.error(`Scheduler post failed: ${result.error}`);
      process.exit(1);
    }

    console.log(`Posted ${item.id}: ${result.postedUrl}`);
    console.log(`Next run: ${nextRunAt}`);
  });

 twitter
  .command('draft-tweets <sourceFile>')
  .description('Generate Chinese tweet drafts from ranked source tweets; no posting')
  .option('-o, --output <file>', 'Output tweet draft queue JSON file', 'queues/tweets.json')
  .option('-c, --count <number>', 'Number of drafts to generate', '3')
  .option('--dry-run', 'Preview drafts without writing output')
  .action(async (sourceFile: string, options: { output?: string; count?: string; dryRun?: boolean }) => {
    try {
      const count = parsePositiveInt(options.count, 3);
      const sourceTweets = loadRankedSourceTweets(sourceFile);
      const drafts = buildChineseTweetDrafts(sourceTweets, count);

      if (drafts.length === 0) {
        console.log('No new source tweets available for drafting.');
        return;
      }

      console.log(`Generated ${drafts.length} Chinese draft(s):`);
      for (const draft of drafts) {
        console.log(`\n[${draft.id}] from @${draft.sourceUser}`);
        console.log(draft.text);
        console.log(`imageProvider: ${draft.imageProvider}`);
        console.log(`source: ${draft.sourceUrl}`);
      }

      appendActionLog(ACTION_LOG_PATH, {
        platform: 'twitter',
        action: 'draft-tweets',
        target: options.output || 'queues/tweets.json',
        status: options.dryRun ? 'dry-run' : 'success',
        drafts: drafts.length,
      });

      if (options.dryRun) {
        console.log('\nDRY RUN: no tweet draft file written.');
        return;
      }

      const output = options.output || 'queues/tweets.json';
      saveTweetDraftQueue(output, drafts);
      console.log(`\nSaved ${drafts.length} draft tweet(s) to ${output}`);
    } catch (e: any) {
      console.error('Error:', e.message);
      appendActionLog(ACTION_LOG_PATH, {
        platform: 'twitter',
        action: 'draft-tweets',
        target: sourceFile,
        status: 'error',
        error: e.message,
      });
      process.exit(1);
    }
  });

 twitter
  .command('source-scan <file>')
  .description('Read source users, rank their recent tweets, and write source-tweets.json')
  .option('-o, --output <file>', 'Output ranked source tweets JSON file', 'queues/source-tweets.json')
  .option('--state <file>', 'Per-user scan state file', 'state/source-scan-state.json')
  .option('--limit-per-user <number>', 'Tweets to read per source user, capped at 10', '10')
  .option('--dry-run', 'Preview ranked source tweets without writing output or updating state')
  .option('--json', 'Print ranked source tweets as JSON')
  .action(async (file: string, options: { output?: string; state?: string; limitPerUser?: string; dryRun?: boolean; json?: boolean }) => {
    try {
      const users = loadSourceUsers(file);
      if (users.length === 0) {
        console.log('No enabled source users found.');
        return;
      }

      const client = createOpenTwitterClientFromEnv();
      const limitPerUser = capLimitPerUser(options.limitPerUser);
      const statePath = options.state || 'state/source-scan-state.json';
      const scanState = loadSourceScanState(statePath);
      const scanStartedAt = new Date().toISOString();
      const batches = [];

      console.log(`Scanning ${users.length} source user(s), up to ${limitPerUser} tweets each...`);
      for (const user of users) {
        const result = await client.getUserTweets(user.username, limitPerUser, 'Latest');
        if (!result.success) {
          console.log(`⚠️  @${user.username}: ${result.error}`);
          appendActionLog(ACTION_LOG_PATH, {
            platform: 'twitter',
            action: 'source-scan',
            target: `@${user.username}`,
            status: 'error',
            error: result.error,
          });
          continue;
        }
        const lastScannedAt = scanState.users[user.username]?.lastScannedAt;
        const newTweets = filterTweetsSince(result.tweets, lastScannedAt);
        batches.push({ sourceUser: user.username, weight: user.weight, tweets: newTweets });
        console.log(`@${user.username}: read ${result.tweets.length} tweet(s), kept ${newTweets.length} new tweet(s)${lastScannedAt ? ` since ${lastScannedAt}` : ' (first scan)'}`);
        if (!options.dryRun) {
          scanState.users[user.username] = { lastScannedAt: scanStartedAt };
        }
      }

      const ranked = rankSourceTweets(batches);

      if (options.json) {
        console.log(JSON.stringify(ranked, null, 2));
      } else {
        console.log(`Ranked usable source tweets: ${ranked.length}`);
        for (const tweet of ranked.slice(0, 20)) {
          console.log(`  score=${tweet.score} @${tweet.sourceUser}: ${tweet.text.slice(0, 100).replace(/\s+/g, ' ')}`);
          console.log(`    ${tweet.sourceTweetUrl}`);
        }
        if (ranked.length > 20) console.log(`  ...and ${ranked.length - 20} more`);
      }

      appendActionLog(ACTION_LOG_PATH, {
        platform: 'twitter',
        action: 'source-scan',
        target: options.output || 'queues/source-tweets.json',
        status: options.dryRun ? 'dry-run' : 'success',
        sources: users.length,
        rankedTweets: ranked.length,
      });

      if (options.dryRun) {
        console.log('DRY RUN: no source tweet file written.');
        return;
      }

      const output = options.output || 'queues/source-tweets.json';
      saveSourceTweets(output, ranked);
      saveSourceScanState(statePath, scanState);
      console.log(`Saved ${ranked.length} ranked source tweet(s) to ${output}`);
      console.log(`Updated source scan state: ${statePath}`);
    } catch (e: any) {
      console.error('Error:', e.message);
      appendActionLog(ACTION_LOG_PATH, {
        platform: 'twitter',
        action: 'source-scan',
        target: file,
        status: 'error',
        error: e.message,
      });
      process.exit(1);
    }
  });

 twitter
  .command('pipeline <sourceUsersFile>')
  .description('Run source scan → Chinese draft generation → image job queue → tweet queue; no posting')
  .option('--source-output <file>', 'Ranked source tweets JSON file', 'queues/source-tweets.json')
  .option('--tweet-queue <file>', 'Tweet queue JSON file', 'queues/tweets.json')
  .option('--image-jobs <file>', 'Image generation jobs JSON file', 'queues/image-jobs.json')
  .option('--state <file>', 'Per-user source scan state file', 'state/source-scan-state.json')
  .option('--limit-per-user <number>', 'Tweets to read per source user, capped at 10', '10')
  .option('-c, --count <number>', 'Number of new tweet drafts to create', '3')
  .option('--dry-run', 'Preview pipeline results without writing files')
  .option('--json', 'Print pipeline summary as JSON')
  .action(async (sourceUsersFile: string, options: { sourceOutput?: string; tweetQueue?: string; imageJobs?: string; state?: string; limitPerUser?: string; count?: string; dryRun?: boolean; json?: boolean }) => {
    try {
      const users = loadSourceUsers(sourceUsersFile);
      if (users.length === 0) {
        console.log('No enabled source users found.');
        return;
      }

      const sourceOutput = options.sourceOutput || 'queues/source-tweets.json';
      const tweetQueuePath = options.tweetQueue || 'queues/tweets.json';
      const imageJobsPath = options.imageJobs || 'queues/image-jobs.json';
      const statePath = options.state || 'state/source-scan-state.json';
      const limitPerUser = capLimitPerUser(options.limitPerUser);
      const draftCount = parsePositiveInt(options.count, 3);
      const scanState = loadSourceScanState(statePath);
      const scanStartedAt = new Date().toISOString();
      const client = createOpenTwitterClientFromEnv();
      const batches = [];

      console.log(`Pipeline scanning ${users.length} source user(s), up to ${limitPerUser} tweets each...`);
      for (const user of users) {
        const result = await client.getUserTweets(user.username, limitPerUser, 'Latest');
        if (!result.success) {
          console.log(`⚠️  @${user.username}: ${result.error}`);
          appendActionLog(ACTION_LOG_PATH, {
            platform: 'twitter',
            action: 'pipeline',
            target: `@${user.username}`,
            status: 'error',
            error: result.error,
          });
          continue;
        }
        const lastScannedAt = scanState.users[user.username]?.lastScannedAt;
        const newTweets = filterTweetsSince(result.tweets, lastScannedAt);
        batches.push({ sourceUser: user.username, weight: user.weight, tweets: newTweets });
        console.log(`@${user.username}: read ${result.tweets.length}, kept ${newTweets.length}${lastScannedAt ? ` since ${lastScannedAt}` : ' (first scan)'}`);
        if (!options.dryRun) {
          scanState.users[user.username] = { lastScannedAt: scanStartedAt };
        }
      }

      const ranked = rankSourceTweets(batches);
      const existingQueue = loadTweetQueue(tweetQueuePath).items;
      const plan = buildTweetPipelinePlan({
        sourceTweets: ranked,
        existingQueue,
        draftCount,
      });

      const summary = {
        sources: users.length,
        rankedTweets: ranked.length,
        draftsCreated: plan.drafts.length,
        imageJobsCreated: plan.imageJobs.length,
        nextQueueSize: plan.nextQueue.length,
        sourceOutput,
        tweetQueue: tweetQueuePath,
        imageJobs: imageJobsPath,
        state: statePath,
        dryRun: Boolean(options.dryRun),
      };

      if (options.json) {
        console.log(JSON.stringify({ summary, drafts: plan.drafts, imageJobs: plan.imageJobs }, null, 2));
      } else {
        console.log(`Ranked usable source tweets: ${ranked.length}`);
        console.log(`New drafts: ${plan.drafts.length}`);
        for (const draft of plan.drafts) {
          console.log(`\n[${draft.id}] from @${draft.sourceUser} score=${draft.sourceScore ?? 0}`);
          console.log(draft.text);
          console.log(`image job: ${draft.imageProvider}`);
          console.log(`source: ${draft.sourceUrl}`);
        }
      }

      appendActionLog(ACTION_LOG_PATH, {
        platform: 'twitter',
        action: 'pipeline',
        target: sourceUsersFile,
        status: options.dryRun ? 'dry-run' : 'success',
        ...summary,
      });

      if (options.dryRun) {
        console.log('\nDRY RUN: no source/queue/image/state files written and no tweet posted.');
        return;
      }

      saveSourceTweets(sourceOutput, plan.nextSources);
      saveTweetQueue(tweetQueuePath, plan.nextQueue);
      saveTweetImageJobs(imageJobsPath, plan.imageJobs);
      saveSourceScanState(statePath, scanState);
      console.log(`\nSaved ranked sources: ${sourceOutput}`);
      console.log(`Saved tweet queue: ${tweetQueuePath}`);
      console.log(`Saved image jobs: ${imageJobsPath}`);
      console.log(`Updated scan state: ${statePath}`);
      console.log('No tweet was posted. Use tweet-scheduler or tweet-queue when you are ready to publish via API.');
    } catch (e: any) {
      console.error('Error:', e.message);
      appendActionLog(ACTION_LOG_PATH, {
        platform: 'twitter',
        action: 'pipeline',
        target: sourceUsersFile,
        status: 'error',
        error: e.message,
      });
      process.exit(1);
    }
  });

twitter
  .command('user <username>')
  .description('Get Twitter/X user profile via opentwitter')
  .option('--json', 'Output raw JSON')
  .action(async (username: string, options: { json?: boolean }) => {
    try {
      const result = await createOpenTwitterClientFromEnv().getUserInfo(username);
      if (!result.success) throw new Error(result.error || 'opentwitter user lookup failed');
      if (options.json) { printJson(result.user); return; }
      console.log(`@${result.user!.username} (${result.user!.name})`);
      console.log(`id: ${result.user!.id}`);
    } catch (e: any) { console.error('Error:', e.message); process.exit(1); }
  });

twitter
  .command('user-id <userId>')
  .description('Get Twitter/X user profile by numeric ID via opentwitter')
  .option('--json', 'Output raw JSON')
  .action(async (userId: string, options: { json?: boolean }) => {
    try {
      const result = await createOpenTwitterClientFromEnv().getUserById(userId);
      if (!result.success) throw new Error(result.error || 'opentwitter user-id lookup failed');
      if (options.json) { printJson(result.user); return; }
      console.log(`@${result.user!.username} (${result.user!.name})`);
      console.log(`id: ${result.user!.id}`);
    } catch (e: any) { console.error('Error:', e.message); process.exit(1); }
  });

twitter
  .command('user-tweets <username>')
  .description('Get recent tweets from a user via opentwitter')
  .option('-n, --count <number>', 'Number of tweets', '20')
  .option('--product <product>', 'Latest or Top', 'Latest')
  .option('--json', 'Output raw JSON')
  .action(async (username: string, options: { count?: string; product?: string; json?: boolean }) => {
    try {
      const product = options.product === 'Top' ? 'Top' : 'Latest';
      const result = await createOpenTwitterClientFromEnv().getUserTweets(username, parsePositiveInt(options.count, 20), product);
      if (!result.success) throw new Error(result.error || 'opentwitter user tweets failed');
      if (options.json) { printJson(result.tweets); return; }
      printTweets(result.tweets);
    } catch (e: any) { console.error('Error:', e.message); process.exit(1); }
  });

twitter
  .command('search-advanced')
  .description('Advanced Twitter/X search via opentwitter filters')
  .option('--keywords <keywords>', 'Search keywords')
  .option('--from-user <username>', 'Tweets from user')
  .option('--to-user <username>', 'Tweets to user')
  .option('--mention-user <username>', 'Tweets mentioning user')
  .option('--hashtag <hashtag>', 'Hashtag without #')
  .option('--exclude-replies', 'Exclude replies')
  .option('--exclude-retweets', 'Exclude retweets')
  .option('--min-likes <number>', 'Minimum likes')
  .option('--min-retweets <number>', 'Minimum retweets')
  .option('--min-replies <number>', 'Minimum replies')
  .option('--since-date <date>', 'YYYY-MM-DD')
  .option('--until-date <date>', 'YYYY-MM-DD')
  .option('--lang <lang>', 'Language code')
  .option('--product <product>', 'Top or Latest', 'Top')
  .option('-n, --count <number>', 'Number of tweets', '20')
  .option('--json', 'Output raw JSON')
  .action(async (options: any) => {
    try {
      const result = await createOpenTwitterClientFromEnv().search({
        keywords: options.keywords,
        fromUser: options.fromUser,
        toUser: options.toUser,
        mentionUser: options.mentionUser,
        hashtag: options.hashtag,
        excludeReplies: boolOption(options.excludeReplies),
        excludeRetweets: boolOption(options.excludeRetweets),
        minLikes: options.minLikes ? parsePositiveInt(options.minLikes, 0) : undefined,
        minRetweets: options.minRetweets ? parsePositiveInt(options.minRetweets, 0) : undefined,
        minReplies: options.minReplies ? parsePositiveInt(options.minReplies, 0) : undefined,
        sinceDate: options.sinceDate,
        untilDate: options.untilDate,
        lang: options.lang,
        product: options.product === 'Latest' ? 'Latest' : 'Top',
        maxResults: parsePositiveInt(options.count, 20),
      });
      if (!result.success) throw new Error(result.error || 'opentwitter advanced search failed');
      if (options.json) { printJson(result.tweets); return; }
      printTweets(result.tweets);
    } catch (e: any) { console.error('Error:', e.message); process.exit(1); }
  });

twitter
  .command('follower-events <username>')
  .description('Get follow/unfollow events via opentwitter')
  .option('--unfollow', 'Fetch unfollower events instead of new followers')
  .option('-n, --count <number>', 'Number of events', '20')
  .option('--json', 'Output raw JSON')
  .action(async (username: string, options: { unfollow?: boolean; count?: string; json?: boolean }) => {
    try {
      const data = await createOpenTwitterClientFromEnv().getFollowerEvents(username, !options.unfollow, parsePositiveInt(options.count, 20));
      printJson(data);
    } catch (e: any) { console.error('Error:', e.message); process.exit(1); }
  });

twitter
  .command('article <id>')
  .description('Get Twitter/X Article by ID via opentwitter')
  .option('--json', 'Output raw JSON')
  .action(async (id: string) => {
    try { printJson(await createOpenTwitterClientFromEnv().getArticleById(id)); }
    catch (e: any) { console.error('Error:', e.message); process.exit(1); }
  });

twitter
  .command('quotes <tweetId>')
  .description('Get quote tweets for a tweet ID via opentwitter')
  .option('-n, --count <number>', 'Number of quote tweets', '20')
  .option('--json', 'Output raw JSON')
  .action(async (tweetId: string, options: { count?: string; json?: boolean }) => {
    try {
      const result = await createOpenTwitterClientFromEnv().getQuoteTweetsById(tweetId, parsePositiveInt(options.count, 20));
      if (!result.success) throw new Error(result.error || 'opentwitter quote tweets failed');
      if (options.json) { printJson(result.tweets); return; }
      printTweets(result.tweets);
    } catch (e: any) { console.error('Error:', e.message); process.exit(1); }
  });

twitter
  .command('retweet-users <tweetId>')
  .description('Get users who retweeted a tweet via opentwitter')
  .option('--cursor <cursor>', 'Pagination cursor')
  .option('--json', 'Output raw JSON')
  .action(async (tweetId: string, options: { cursor?: string }) => {
    try { printJson(await createOpenTwitterClientFromEnv().getRetweetUsersById(tweetId, options.cursor)); }
    catch (e: any) { console.error('Error:', e.message); process.exit(1); }
  });

twitter
  .command('watch')
  .description('Get all monitored Twitter/X users via opentwitter')
  .option('--json', 'Output raw JSON')
  .action(async () => {
    try { printJson(await createOpenTwitterClientFromEnv().getWatch()); }
    catch (e: any) { console.error('Error:', e.message); process.exit(1); }
  });

twitter
  .command('watch-add <username>')
  .description('Add a Twitter/X user to opentwitter watch list')
  .option('--new-tweet', 'Monitor new tweets')
  .option('--new-follow', 'Monitor new followers')
  .option('--new-unfollow', 'Monitor unfollowers')
  .option('--new-reply', 'Monitor tweet replies')
  .option('--new-quote', 'Monitor quote tweets')
  .option('--new-retweet', 'Monitor retweets')
  .option('--update-name', 'Monitor username/name changes')
  .option('--update-desc', 'Monitor description changes')
  .option('--update-avatar', 'Monitor avatar changes')
  .option('--update-banner', 'Monitor banner changes')
  .option('--new-ca', 'Monitor CA events')
  .option('--tweet-topping', 'Monitor tweet pinning events')
  .option('--json', 'Output raw JSON')
  .action(async (username: string, options: any) => {
    try {
      const data = await createOpenTwitterClientFromEnv().addWatch(username, {
        newTweetBol: boolOption(options.newTweet),
        newFlwBol: boolOption(options.newFollow),
        newUnFlwBol: boolOption(options.newUnfollow),
        newTweetReplyBol: boolOption(options.newReply),
        newTweetQuoteBol: boolOption(options.newQuote),
        newRetweetBol: boolOption(options.newRetweet),
        updateNameBol: boolOption(options.updateName),
        updateDescBol: boolOption(options.updateDesc),
        updateAvatarBol: boolOption(options.updateAvatar),
        updateBannerBol: boolOption(options.updateBanner),
        newCaBol: boolOption(options.newCa),
        tweetToppingBol: boolOption(options.tweetTopping),
      });
      printJson(data);
    } catch (e: any) { console.error('Error:', e.message); process.exit(1); }
  });

twitter
  .command('watch-delete <username>')
  .description('Delete a Twitter/X user from opentwitter watch list')
  .option('--json', 'Output raw JSON')
  .action(async (username: string) => {
    try { printJson(await createOpenTwitterClientFromEnv().deleteWatch(username)); }
    catch (e: any) { console.error('Error:', e.message); process.exit(1); }
  });

 twitter
  .command('whoami')
  .description('Show configured opentwitter identity hint')
  .action(async () => {
    try {
      createOpenTwitterClientFromEnv();
      const username = process.env.SOCIALCRABS_TWITTER_USERNAME || process.env.TWITTER_USERNAME;
      console.log(username ? `opentwitter token configured; username hint: @${username}` : 'opentwitter token configured. Set TWITTER_USERNAME if you want whoami to print a handle.');
    } catch (e: any) { console.error('Error:', e.message); process.exit(1); }
  });

twitter
  .command('mutual-candidates')
  .description('Generate follow queue candidates from followers you do not follow back')
  .option('-o, --output <file>', 'Output follow queue JSON file', 'queues/follow.json')
  .option('--max-followers <number>', 'Maximum followers to inspect', '200')
  .option('--max-following <number>', 'Maximum following accounts to inspect', '200')
  .option('--page-size <number>', 'GraphQL page size', '50')
  .option('--denylist <file>', 'Optional newline-separated denylist')
  .option('--dry-run', 'Preview candidates without writing output')
  .option('--json', 'Print candidates as JSON')
  .action(async () => {
    console.error('mutual-candidates disabled: the old implementation used authenticated x.com GraphQL followers/following. opentwitter does not provide the full following list needed for safe mutual-follow diffing.');
    console.error('No browser or x.com page was opened.');
    process.exit(1);
  });

twitter
  .command('auto-publish')
  .description('Collect recent hot tweets via opentwitter, humanize drafts, prepare image prompts, then publish with xurl API')
  .requiredOption('--sources <file>', 'Source account list JSON')
  .requiredOption('--accounts <file>', 'Target account list JSON')
  .option('--interval-hours <number>', 'Continuous collection interval in hours', '6')
  .option('--state <file>', 'State file for continuous windows', 'queues/auto-publish-state.json')
  .option('--count-per-user <number>', 'Tweets to fetch per source user', '20')
  .option('--min-score <number>', 'Minimum heat score', '1')
  .option('--max-chars <number>', 'Max characters per final tweet', '220')
  .option('--posts-per-run <number>', 'How many rotating target accounts to publish per run', '1')
  .option('--image-path <file>', 'Generated image path to attach to all posts; required for publishing in this CLI version')
  .option('--resume-plan <file>', 'Resume a saved pending auto-publish plan without re-collecting or reselecting a source tweet')
  .option('--dry-run', 'Preview plans and image prompts without publishing')
  .option('--confirm', 'Require confirmation before publishing')
  .option('--json', 'Output JSON')
  .action(async (options: { sources: string; accounts: string; intervalHours?: string; state?: string; countPerUser?: string; minScore?: string; maxChars?: string; postsPerRun?: string; imagePath?: string; resumePlan?: string; dryRun?: boolean; confirm?: boolean; json?: boolean }) => {
    const { execFileSync } = await import('child_process');
    let pendingPlanPath = options.resumePlan;
    try {
      const sources = loadSourceUsers(options.sources);
      const accounts = loadMultiAccountConfig(options.accounts).accounts;
      if (sources.length === 0) throw new Error('No enabled source accounts found');
      if (accounts.length === 0) throw new Error('No enabled target accounts found');

      const statePath = options.state || 'queues/auto-publish-state.json';
      const intervalHours = parsePositiveInt(options.intervalHours, 6);
      const state = loadAutoPublishState(statePath);
      const postsPerRun = parsePositiveInt(options.postsPerRun, 1);
      const runStartedAt = new Date();
      const maxChars = parsePositiveInt(options.maxChars, 220);
      let targetAccounts = selectRotatingTargetAccounts(accounts, state, postsPerRun);
      let window;
      let dueSources;
      let plans;

      if (options.resumePlan) {
        const pending = loadPendingAutoPublishRun(options.resumePlan);
        window = pending.window;
        plans = pending.plans;
        const wantedSources = new Set(pending.dueSourceUsernames);
        dueSources = sources.filter((source) => wantedSources.has(source.username.replace(/^@/, '')));
        const wantedAccounts = new Set(plans.map((plan) => plan.account.replace(/^@/, '')));
        targetAccounts = accounts.filter((account) => wantedAccounts.has(account.username.replace(/^@/, '')));
        if (options.json) console.error(`Resuming pending auto-publish plan: ${options.resumePlan}`);
      } else {
        if (targetAccounts.length === 0) throw new Error('No enabled rotating target accounts found');
        window = computeContinuousCollectionWindow(state, runStartedAt, intervalHours);
        if (!window.due) {
          const message = `Next continuous ${intervalHours}h collection window is not due yet: ${window.startAt} → ${window.endAt}`;
          if (options.json) printJson({ due: false, window, statePath });
          else console.log(message);
          return;
        }

        dueSources = filterDueSourceUsers(sources, state, runStartedAt, intervalHours);
        if (dueSources.length === 0) {
          const message = `All source users are marked processed within the last ${intervalHours}h; skipping collection.`;
          if (options.json) printJson({ due: false, reason: 'source-cooldown', statePath, sources: state.sources || {} });
          else console.log(message);
          return;
        }

        const client = createOpenTwitterClientFromEnv();
        const tweets = [];
        const countPerUser = parsePositiveInt(options.countPerUser, 20);
        for (const source of dueSources) {
          const result = await client.getUserTweets(source.username, countPerUser, 'Latest');
          if (!result.success) {
            console.error(`opentwitter skipped @${source.username}: ${result.error}`);
            continue;
          }
          tweets.push(...result.tweets);
        }

        plans = buildAutoPublishPlans({
          tweets,
          accounts: targetAccounts,
          now: new Date(window.endAt),
          startAt: new Date(window.startAt),
          endAt: new Date(window.endAt),
          minScore: parsePositiveInt(options.minScore, 1),
          maxChars,
          excludeSourceTweetIds: getPublishedSourceTweetIds(state),
        });

        if (plans.length === 0) {
          if (!options.dryRun) saveAutoPublishState(statePath, markSourceUsersProcessed(buildNextAutoPublishState(state, window), dueSources, runStartedAt));
          console.log(`No eligible hot tweets found in continuous window ${window.startAt} → ${window.endAt}.`);
          return;
        }

        const tweetsById = new Map(tweets.map((tweet) => [tweet.id, tweet]));
        const accountsByUsername = new Map(targetAccounts.map((account) => [account.username, account]));
        for (const plan of plans) {
          const sourceTweet = tweetsById.get(plan.sourceTweetId);
          const account = accountsByUsername.get(plan.account);
          if (!sourceTweet || !account) continue;
          const hermesText = generateAutoPublishTextWithHermes({
            sourceText: sourceTweet.text,
            draftText: plan.text,
            account: plan.account,
            style: account.style,
            maxChars,
          });
          plan.text = hermesText;
          plan.imagePrompt = buildImagePromptForTweet(plan.text, plan.imageSkill);
        }
      }

      const summary = [
        `Auto-publish plans: ${plans.length}`,
        `Window: ${window.startAt} → ${window.endAt}`,
        ...plans.map((plan, index) => [
          `\n[${index + 1}] @${plan.account}`,
          `source: ${plan.sourceUrl}`,
          `score: ${plan.hotScore}`,
          `image skill: ${plan.imageSkill}`,
          plan.text,
          `image prompt:\n${plan.imagePrompt}`,
        ].join('\n')),
      ].join('\n');

      const preview = await previewAction({
        dryRun: options.dryRun,
        confirm: options.confirm,
        summary,
        run: async () => true,
      });

      if (!preview.executed) {
        if (options.json) printJson({ plans, window, statePath, dueSources: dueSources.map((source) => source.username), dryRun: true });
        else console.log(preview.message);
        return;
      }

      if (!options.imagePath) {
        throw new Error('Publishing requires --image-path. Use the imagePrompt from --dry-run to generate an image, then rerun with --confirm --image-path <file>.');
      }

      const pendingRun = buildPendingAutoPublishRun({
        statePath,
        window,
        dueSources,
        plans,
        imagePath: options.imagePath,
        createdAt: runStartedAt,
      });
      pendingPlanPath = pendingPlanPath || defaultPendingAutoPublishRunPath(statePath, pendingRun);
      savePendingAutoPublishRun(pendingPlanPath, pendingRun);
      console.error(`Saved pending auto-publish plan: ${pendingPlanPath}`);

      const results = [];
      for (const plan of plans) {
        const xurlAccountArgs = buildXurlAccountArgs(plan.account, plan.xurlApp);
        const uploadOutput = execFileSync('xurl', [...xurlAccountArgs, 'media', 'upload', options.imagePath], { encoding: 'utf-8' });
        const mediaId = /Media ID:\s*(\d+)/.exec(uploadOutput)?.[1] || JSON.parse(extractJsonObjectFromOutput(uploadOutput)).data?.id;
        if (!mediaId) throw new Error(`Could not parse media id for @${plan.account}`);
        const postOutput = execFileSync('xurl', [...xurlAccountArgs, 'post', plan.text, '--media-id', String(mediaId)], { encoding: 'utf-8' });
        const tweetId = extractIdFromXurlPostOutput(postOutput);
        const url = tweetId ? `https://x.com/${plan.account}/status/${tweetId}` : undefined;
        const square = url && plan.squareAlias
          ? postToBinanceSquare({ alias: plan.squareAlias, text: plan.text, tweetUrl: url, imagePaths: [options.imagePath] })
          : undefined;
        results.push({ ...plan, mediaId, tweetId, url, postedUrl: url, square, status: url ? 'posted' : 'error' });
        if (url) {
          await sendTelegramSuccessNotification(buildXAutoPublishSuccessTelegramMessage({
            account: plan.account,
            postedUrl: url,
            sourceUrl: plan.sourceUrl,
            text: plan.text,
            squareLink: square?.success ? (square.link || square.id) : undefined,
          }));
        }
        appendActionLog(ACTION_LOG_PATH, {
          platform: 'twitter',
          action: 'auto-publish',
          target: `@${plan.account}`,
          status: url ? 'success' : 'error',
          url,
          source: plan.sourceUrl,
        });
      }

      let nextState = buildNextAutoPublishState(state, window);
      nextState = markSourceUsersProcessed(nextState, dueSources, runStartedAt);
      nextState = markAutoPublishPlansPosted(nextState, results, runStartedAt);
      nextState = advanceTargetAccountCursor(nextState, accounts, results.filter((result) => result.status === 'posted').length);
      saveAutoPublishState(statePath, nextState);
      if (pendingPlanPath) deletePendingAutoPublishRun(pendingPlanPath);

      if (options.json) printJson({ results, window, statePath, pendingPlanPath: undefined });
      else {
        console.log(`Posted ${results.filter((result) => result.status === 'posted').length}/${results.length} account(s).`);
        for (const result of results) {
          console.log(`${result.status === 'posted' ? '✅' : '❌'} @${result.account}: ${result.url || 'failed'}`);
          if (result.square) console.log(`  Binance Square: ${result.square.success ? (result.square.link || result.square.id || 'posted') : `failed: ${result.square.error}`}`);
        }
      }
    } catch (e: any) {
      console.error('Error:', e.message);
      if (pendingPlanPath) console.error(`Pending auto-publish plan kept for retry: ${pendingPlanPath}`);
      appendActionLog(ACTION_LOG_PATH, {
        platform: 'twitter',
        action: 'auto-publish',
        target: options.sources,
        status: 'error',
        error: e.message,
      });
      process.exit(1);
    }
  });

twitter
  .command('multi-account-pipeline')
  .description('Collect one text-only source tweet and draft/post distinct API tweets for multiple bound X accounts')
  .requiredOption('--source <handle>', 'Source X handle or URL to collect from')
  .requiredOption('--accounts <file>', 'JSON file with target accounts')
  .option('-n, --count <number>', 'Number of source tweets to inspect', '10')
  .option('--max-chars <number>', 'Max characters per generated tweet, keep short for images', '200')
  .option('--dry-run', 'Preview per-account posts without publishing')
  .option('--confirm', 'Require confirmation before publishing')
  .option('--json', 'Print JSON plan/result')
  .action(async (options: { source: string; accounts: string; count?: string; maxChars?: string; dryRun?: boolean; confirm?: boolean; json?: boolean }) => {
    const { execFileSync } = await import('child_process');
    try {
      const accountConfig = loadMultiAccountConfig(options.accounts);
      if (accountConfig.accounts.length === 0) {
        console.log('No enabled target accounts found.');
        return;
      }

      const count = parsePositiveInt(options.count, 10);
      const maxChars = parsePositiveInt(options.maxChars, 200);
      const client = createOpenTwitterClientFromEnv();
      const searchOptions = buildOpenTwitterSourceSearchOptions(options.source, count);
      const result = await client.search(searchOptions);
      if (!result.success) throw new Error(result.error || 'opentwitter source search failed');
      const tweets = selectTextOnlyTweets(normalizeOpenTwitterTweets(result.tweets, options.source), 1);
      const sourceTweet = tweets[0];
      if (!sourceTweet) {
        console.log(`No text-only source tweets found for ${options.source}.`);
        return;
      }

      const posts = buildMultiAccountPosts({ sourceTweet, accounts: accountConfig.accounts, maxChars });
      const summary = [
        `Source: @${sourceTweet.sourceUser} ${sourceTweet.url}`,
        `Selected text: ${sourceTweet.text}`,
        `Targets: ${posts.map((post) => `@${post.account}`).join(', ')}`,
        ...posts.map((post, index) => `\n[${index + 1}] @${post.account}\n${post.text}`),
      ].join('\n');

      const preview = await previewAction({
        dryRun: options.dryRun,
        confirm: options.confirm,
        summary,
        run: async () => true,
      });

      if (!preview.executed) {
        if (options.json) console.log(JSON.stringify({ sourceTweet, posts, dryRun: true }, null, 2));
        else console.log(preview.message);
        return;
      }

      const results = [];
      for (const post of posts) {
        const output = execFileSync('xurl', ['--username', post.account, 'post', post.text], { encoding: 'utf-8' });
        const tweetId = extractIdFromXurlPostOutput(output);
        results.push({
          ...post,
          status: tweetId ? 'posted' : 'error',
          tweetId,
          url: tweetId ? `https://x.com/${post.account}/status/${tweetId}` : undefined,
          raw: output,
        });
        if (tweetId) {
          await sendTelegramSuccessNotification(buildXAutoPublishSuccessTelegramMessage({
            account: post.account,
            postedUrl: `https://x.com/${post.account}/status/${tweetId}`,
            sourceUrl: sourceTweet.url,
            text: post.text,
          }));
        }
        appendActionLog(ACTION_LOG_PATH, {
          platform: 'twitter',
          action: 'multi-account-pipeline',
          target: `@${post.account}`,
          status: tweetId ? 'success' : 'error',
          url: tweetId ? `https://x.com/${post.account}/status/${tweetId}` : undefined,
          source: sourceTweet.url,
        });
      }

      if (options.json) console.log(JSON.stringify({ sourceTweet, results }, null, 2));
      else {
        console.log(`Posted ${results.filter((result) => result.status === 'posted').length}/${results.length} account(s).`);
        for (const result of results) console.log(`${result.status === 'posted' ? '✅' : '❌'} @${result.account}: ${result.url || 'failed'}`);
      }
    } catch (e: any) {
      console.error('Error:', e.message);
      appendActionLog(ACTION_LOG_PATH, {
        platform: 'twitter',
        action: 'multi-account-pipeline',
        target: options.source,
        status: 'error',
        error: e.message,
      });
      process.exit(1);
    }
  });

 twitter
  .command('read <url>')
  .description('Read a specific tweet by URL or ID')
  .option('--json', 'Output raw JSON')
  .action(async (url: string, options: { json?: boolean }) => {
    try {
      const client = createOpenTwitterClientFromEnv();
      const tweetId = extractTweetId(url);
      const result = await client.getTweetById(tweetId);
      if (!result.success) { console.error('Error:', result.error); process.exit(1); }
      if (options.json) { console.log(JSON.stringify(result.tweet, null, 2)); return; }
      const t = result.tweet!;
      console.log(`@${t.author.username} (${t.author.name})`);
      console.log(t.text);
      console.log(`❤️ ${t.likeCount ?? 0}  🔁 ${t.retweetCount ?? 0}  💬 ${t.replyCount ?? 0}`);
      if (t.quotedTweet) {
        console.log(`\n  Quoting @${t.quotedTweet.author.username}: ${t.quotedTweet.text}`);
      }
    } catch (e: any) { console.error('Error:', e.message); process.exit(1); }
  });

// ============================================================================
// LinkedIn commands
// ============================================================================

const linkedin = program.command('linkedin').alias('li').description('LinkedIn actions');

linkedin
  .command('connect <url>')
  .description('Send a connection request')
  .option('-n, --note <note>', 'Add a note to the connection request')
  .option('-c, --context <json>', 'JSON context for notification')
  .option('-r, --retries <number>', 'Number of retry attempts on failure', String(DEFAULT_RETRIES))
  .action(async (url: string, options: { note?: string; context?: string; retries?: string }) => {
    const retries = parseRetries(options.retries);
    const context = parseContext(options.context);
    if (context) process.env.SOCIALCRABS_SILENT = '1';
    
    const claw = new SocialCrabs({ browser: { headless: true } });
    
    try {
      await claw.initialize();

      await withRetry(
        async () => {
          const res = await claw.linkedin.connect({
            profileUrl: url,
            note: options.note,
          });
          if (!res.success) throw new Error(res.error || 'Connect failed');
          return res;
        },
        { retries, actionName: 'LinkedIn connect', target: url }
      );

      console.log(`✅ Sent connection request to: ${url}`);
      
      if (context) {
        await sendNotificationWithContext(
          claw, 'linkedin', 'connect', true, url,
          { profileUrl: url, note: options.note, ...context }
        );
      }

      await claw.shutdown();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`❌ Failed to connect after ${retries} attempts: ${errorMsg}`);
      
      if (context) {
        await sendNotificationWithContext(
          claw, 'linkedin', 'connect', false, url, context, errorMsg
        );
      }
      
      await claw.shutdown();
      process.exit(1);
    }
  });

linkedin
  .command('message <url> <text>')
  .description('Send a LinkedIn message')
  .action(async (url: string, text: string) => {
    try {
      const claw = new SocialCrabs({ browser: { headless: true } });
      await claw.initialize();

      const result = await claw.linkedin.dm({ username: url, message: text });

      if (result.success) {
        console.log(`✅ Sent message`);
      } else {
        console.log(`❌ Failed to send message: ${result.error}`);
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

linkedin
  .command('like <url>')
  .description('Like a LinkedIn post')
  .action(async (url: string) => {
    try {
      const claw = new SocialCrabs({ browser: { headless: true } });
      await claw.initialize();

      const result = await claw.linkedin.like({ url });

      if (result.success) {
        console.log(`✅ Liked post: ${url}`);
      } else {
        console.log(`❌ Failed to like: ${result.error}`);
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

linkedin
  .command('profile <username>')
  .description('Get LinkedIn profile data')
  .action(async (username: string) => {
    try {
      const claw = new SocialCrabs({ browser: { headless: true } });
      await claw.initialize();

      const profile = await claw.linkedin.getProfile(username);
      console.log(JSON.stringify(profile, null, 2));

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

linkedin
  .command('comment <url> <text>')
  .description('Comment on a LinkedIn post')
  .action(async (url: string, text: string) => {
    try {
      const claw = new SocialCrabs({ browser: { headless: true } });
      await claw.initialize();

      const result = await claw.linkedin.comment({ url, text });

      if (result.success) {
        console.log(`✅ Commented on post: ${url}`);
      } else {
        console.log(`❌ Failed to comment: ${result.error}`);
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

linkedin
  .command('search <query>')
  .description('Search LinkedIn for content')
  .option('-o, --output <file>', 'Save HTML to file')
  .action(async (query: string, options: { output?: string }) => {
    try {
      const claw = new SocialCrabs({ browser: { headless: true } });
      await claw.initialize();

      const result = await claw.linkedin.search(query);

      console.log(`Found ${result.posts.length} posts:`);
      for (const post of result.posts) {
        console.log(`  - ${post.urn}`);
        console.log(`    ${post.url}`);
      }

      if (options.output) {
        const fs = await import('fs');
        fs.writeFileSync(options.output, result.html);
        console.log(`\nHTML saved to: ${options.output}`);
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

linkedin
  .command('engage')
  .description('Run full engagement session (search + like + comment)')
  .option('-q, --query <query>', 'Search query', 'openclaw')
  .option('--dry-run', 'Show what would be done without doing it')
  .option('--skip-search', 'Skip the search step, use existing articles')
  .action(async (options: { query: string; dryRun?: boolean; skipSearch?: boolean }) => {
    try {
      const args = ['src/scripts/engage.ts', `--query=${options.query}`];
      if (options.dryRun) args.push('--dry-run');
      if (options.skipSearch) args.push('--skip-search');
      
      const { spawn } = await import('child_process');
      const child = spawn('npx', ['tsx', ...args], {
        cwd: process.cwd(),
        stdio: 'inherit',
      });
      
      child.on('exit', (code) => process.exit(code || 0));
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// ============================================================================
// Notification commands
// ============================================================================

const notify = program.command('notify').description('Manage notifications');

notify
  .command('status')
  .description('Show notification configuration status')
  .action(async () => {
    try {
      const claw = new SocialCrabs({ browser: { headless: true } });
      const notifier = claw.notifier;
      
      console.log('\n📬 Notification Status\n');
      console.log(`Enabled: ${notifier.isEnabled() ? '✅ Yes' : '❌ No'}`);
      
      const channels = notifier.getChannels();
      console.log(`\nConfigured Channels:`);
      if (channels.length === 0) {
        console.log('  (none)');
      } else {
        channels.forEach(ch => console.log(`  • ${ch}`));
      }
      
      console.log(`\nEvent Notifications:`);
      console.log(`  • action:complete    ${notifier.isEventEnabled('action:complete') ? '✅' : '❌'}`);
      console.log(`  • action:error       ${notifier.isEventEnabled('action:error') ? '✅' : '❌'}`);
      console.log(`  • session:login      ${notifier.isEventEnabled('session:login') ? '✅' : '❌'}`);
      console.log(`  • ratelimit:exceeded ${notifier.isEventEnabled('ratelimit:exceeded') ? '✅' : '❌'}`);
      
      console.log(`\nEnvironment Variables:`);
      console.log(`  NOTIFY_ENABLED=${process.env.NOTIFY_ENABLED || '(not set)'}`);
      console.log(`  NOTIFY_TELEGRAM_BOT_TOKEN=${process.env.NOTIFY_TELEGRAM_BOT_TOKEN ? '***configured***' : '(not set)'}`);
      console.log(`  NOTIFY_TELEGRAM_CHAT_ID=${process.env.NOTIFY_TELEGRAM_CHAT_ID || '(not set)'}`);
      console.log(`  NOTIFY_DISCORD_WEBHOOK=${process.env.NOTIFY_DISCORD_WEBHOOK ? '***configured***' : '(not set)'}`);
      console.log(`  NOTIFY_WEBHOOK_URL=${process.env.NOTIFY_WEBHOOK_URL || '(not set)'}`);
      console.log();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

notify
  .command('test [channel]')
  .description('Send a test notification (telegram, discord, webhook, or all)')
  .action(async (channel?: string) => {
    try {
      const claw = new SocialCrabs({ browser: { headless: true } });
      const notifier = claw.notifier;
      
      if (!notifier.isEnabled()) {
        console.log('❌ Notifications are disabled. Set NOTIFY_ENABLED=true in .env');
        process.exit(1);
      }
      
      console.log(`\n🧪 Sending test notification${channel ? ` to ${channel}` : ' to all channels'}...\n`);
      
      const success = await notifier.sendTest(channel as any);
      
      if (success) {
        console.log('✅ Test notification sent successfully');
      } else {
        console.log('❌ Failed to send test notification');
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

notify
  .command('send <message>')
  .description('Send a custom notification message')
  .option('-c, --channel <channel>', 'Send to specific channel (telegram, discord, webhook)')
  .action(async (message: string, options: { channel?: string }) => {
    try {
      const claw = new SocialCrabs({ browser: { headless: true } });
      const notifier = claw.notifier;
      
      if (!notifier.isEnabled()) {
        console.log('❌ Notifications are disabled. Set NOTIFY_ENABLED=true in .env');
        process.exit(1);
      }
      
      let success: boolean;
      if (options.channel) {
        success = await notifier.send(options.channel as any, message);
      } else {
        success = await notifier.broadcast(message);
      }
      
      if (success) {
        console.log('✅ Notification sent');
      } else {
        console.log('❌ Failed to send notification');
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// ============================================================================
// Formatted notification command (for cron jobs)
// ============================================================================

notify
  .command('report <platform> <action> <target>')
  .description('Send a formatted notification report (for cron jobs)')
  .option('--context <json>', 'JSON context with all fields')
  .option('--success', 'Mark as success (default)', true)
  .option('--error <message>', 'Mark as error with message')
  .action(async (platform: string, action: string, target: string, options: { context?: string; success?: boolean; error?: string }) => {
    try {
      const claw = new SocialCrabs({ browser: { headless: true } });
      const notifier = claw.notifier;
      
      if (!notifier.isEnabled()) {
        console.log('❌ Notifications disabled. Set NOTIFY_ENABLED=true');
        process.exit(1);
      }
      
      let details: Record<string, unknown> = {};
      if (options.context) {
        try {
          details = JSON.parse(options.context);
        } catch {
          console.error('❌ Invalid JSON in --context');
          process.exit(1);
        }
      }
      
      const success = !options.error;
      
      await notifier.notify({
        event: success ? 'action:complete' : 'action:error',
        platform: platform as any,
        action: action as any,
        success,
        target,
        error: options.error,
        details,
        timestamp: Date.now(),
      });
      
      console.log(`✅ ${platform.toUpperCase()} ${action.toUpperCase()} report sent`);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// ============================================================================
// Test notification commands (for testing templates)
// ============================================================================

notify
  .command('test-x-like')
  .description('Send a test X LIKE notification')
  .action(async () => {
    const claw = new SocialCrabs({ browser: { headless: true } });
    const notifier = claw.notifier;
    
    if (!notifier.isEnabled()) {
      console.log('❌ Notifications disabled. Set NOTIFY_ENABLED=true');
      process.exit(1);
    }
    
    await notifier.notify({
      event: 'action:complete',
      platform: 'twitter',
      action: 'like',
      success: true,
      target: 'https://x.com/elonmusk/status/123456789',
      details: {
        tweet: 'https://x.com/elonmusk/status/123456789',
        author: 'elonmusk',
        preview: 'Just mass-produced the most insane humanoid robot ever. Coming to a store near you soon...',
        language: 'EN',
        behaviors: 'Warm-up ✅, Profile check ✅',
      },
      timestamp: Date.now(),
    });
    
    console.log('✅ Test X LIKE notification sent');
  });

notify
  .command('test-x-follow')
  .description('Send a test X FOLLOW notification')
  .action(async () => {
    const claw = new SocialCrabs({ browser: { headless: true } });
    const notifier = claw.notifier;
    
    if (!notifier.isEnabled()) {
      console.log('❌ Notifications disabled');
      process.exit(1);
    }
    
    await notifier.notify({
      event: 'action:complete',
      platform: 'twitter',
      action: 'follow',
      success: true,
      target: 'vutruso',
      details: {
        profileUrl: 'https://x.com/vutruso',
        followers: 5200,
        queueRemaining: 12,
        actions: ['👥 Followed'],
      },
      timestamp: Date.now(),
    });
    
    console.log('✅ Test X FOLLOW notification sent');
  });

notify
  .command('test-x-reply')
  .description('Send a test X ENGAGEMENT (Like + Reply) notification')
  .action(async () => {
    const claw = new SocialCrabs({ browser: { headless: true } });
    const notifier = claw.notifier;
    
    if (!notifier.isEnabled()) {
      console.log('❌ Notifications disabled');
      process.exit(1);
    }
    
    await notifier.notify({
      event: 'action:complete',
      platform: 'twitter',
      action: 'comment',
      success: true,
      target: 'https://x.com/openai/status/987654321',
      details: {
        tweet: 'https://x.com/openai/status/987654321',
        author: 'openai',
        preview: 'Introducing GPT-5: The most capable AI model yet. Now available for everyone...',
        reply: 'Incredible progress! What features are you most excited about? 🚀',
        language: 'EN',
        behaviors: 'Warm-up ✅, Profile check ✅',
      },
      timestamp: Date.now(),
    });
    
    console.log('✅ Test X ENGAGEMENT notification sent');
  });

notify
  .command('test-linkedin-connect')
  .description('Send a test LINKEDIN CONNECTION notification')
  .action(async () => {
    const claw = new SocialCrabs({ browser: { headless: true } });
    const notifier = claw.notifier;
    
    if (!notifier.isEnabled()) {
      console.log('❌ Notifications disabled');
      process.exit(1);
    }
    
    await notifier.notify({
      event: 'action:complete',
      platform: 'linkedin',
      action: 'connect',
      success: true,
      target: 'https://linkedin.com/in/john-developer',
      details: {
        profileUrl: 'https://linkedin.com/in/john-developer',
        degree: '2nd',
        method: 'Direct',
        actions: ['🔗 Connection Sent'],
      },
      timestamp: Date.now(),
    });
    
    console.log('✅ Test LINKEDIN CONNECTION notification sent');
  });

notify
  .command('test-linkedin-comment')
  .description('Send a test LINKEDIN ENGAGEMENT notification')
  .action(async () => {
    const claw = new SocialCrabs({ browser: { headless: true } });
    const notifier = claw.notifier;
    
    if (!notifier.isEnabled()) {
      console.log('❌ Notifications disabled');
      process.exit(1);
    }
    
    await notifier.notify({
      event: 'action:complete',
      platform: 'linkedin',
      action: 'comment',
      success: true,
      target: 'https://linkedin.com/feed/update/urn:li:activity:123456',
      details: {
        url: 'https://linkedin.com/feed/update/urn:li:activity:123456',
        articleTitle: 'The Future of AI Automation in Enterprise',
        articleAuthor: 'Sarah Chen, CTO at TechVentures',
        comment: 'Great insights! AI is definitely changing how we approach complex problems. The key is finding the right balance between automation and human oversight.',
        sessionInfo: 'Morning batch (2/4)',
        actions: ['❤️ Liked', '💬 Commented'],
      },
      timestamp: Date.now(),
    });
    
    console.log('✅ Test LINKEDIN COMMENT notification sent');
  });

notify
  .command('test-ig-follow')
  .description('Send a test INSTAGRAM FOLLOW notification')
  .action(async () => {
    const claw = new SocialCrabs({ browser: { headless: true } });
    const notifier = claw.notifier;
    
    if (!notifier.isEnabled()) {
      console.log('❌ Notifications disabled');
      process.exit(1);
    }
    
    await notifier.notify({
      event: 'action:complete',
      platform: 'instagram',
      action: 'follow',
      success: true,
      target: 'techfounder',
      details: {
        profileUrl: 'https://instagram.com/techfounder',
        followers: 12500,
        actions: ['👥 Followed'],
      },
      timestamp: Date.now(),
    });
    
    console.log('✅ Test INSTAGRAM FOLLOW notification sent');
  });

notify
  .command('test-ig-comment')
  .description('Send a test INSTAGRAM COMMENT notification')
  .action(async () => {
    const claw = new SocialCrabs({ browser: { headless: true } });
    const notifier = claw.notifier;
    
    if (!notifier.isEnabled()) {
      console.log('❌ Notifications disabled');
      process.exit(1);
    }
    
    await notifier.notify({
      event: 'action:complete',
      platform: 'instagram',
      action: 'comment',
      success: true,
      target: 'https://instagram.com/p/ABC123xyz',
      details: {
        postUrl: 'https://instagram.com/p/ABC123xyz',
        commentText: 'This is fire! 🔥 Keep building!',
        actions: ['❤️ Liked', '💬 Commented'],
      },
      timestamp: Date.now(),
    });
    
    console.log('✅ Test INSTAGRAM COMMENT notification sent');
  });

notify
  .command('test-error')
  .description('Send a test ERROR notification')
  .action(async () => {
    const claw = new SocialCrabs({ browser: { headless: true } });
    const notifier = claw.notifier;
    
    if (!notifier.isEnabled()) {
      console.log('❌ Notifications disabled');
      process.exit(1);
    }
    
    await notifier.notify({
      event: 'action:error',
      platform: 'twitter',
      action: 'like',
      success: false,
      target: 'https://x.com/private_account/status/999',
      error: 'Rate limit exceeded - try again in 15 minutes',
      details: {
        postUrl: 'https://x.com/private_account/status/999',
      },
      timestamp: Date.now(),
    });
    
    console.log('✅ Test ERROR notification sent');
  });

notify
  .command('test-all')
  .description('Send all test notifications')
  .action(async () => {
    const claw = new SocialCrabs({ browser: { headless: true } });
    const notifier = claw.notifier;
    
    if (!notifier.isEnabled()) {
      console.log('❌ Notifications disabled. Set NOTIFY_ENABLED=true');
      process.exit(1);
    }
    
    console.log('🧪 Sending all test notifications...\n');
    
    const tests = [
      { name: 'X LIKE', platform: 'twitter' as Platform, action: 'like' as ActionType, details: { postUrl: 'https://x.com/test/status/123', author: 'testuser', actions: ['❤️ Liked'], language: 'EN', behaviors: 'Warm-up ✅' } },
      { name: 'X FOLLOW', platform: 'twitter' as Platform, action: 'follow' as ActionType, details: { profileUrl: 'https://x.com/testuser', followers: 5200, queueRemaining: 8, actions: ['👥 Followed'] } },
      { name: 'X REPLY', platform: 'twitter' as Platform, action: 'comment' as ActionType, details: { postUrl: 'https://x.com/test/status/456', commentText: 'Great insights!', actions: ['❤️ Liked', '💬 Replied'], language: 'EN' } },
      { name: 'LINKEDIN CONNECTION', platform: 'linkedin' as Platform, action: 'connect' as ActionType, details: { profileUrl: 'https://linkedin.com/in/test', degree: '2nd', method: 'Direct', actions: ['🔗 Connection Sent'] } },
      { name: 'LINKEDIN COMMENT', platform: 'linkedin' as Platform, action: 'comment' as ActionType, details: { postUrl: 'https://linkedin.com/feed/update/123', articleTitle: 'AI Future', commentText: 'Great article!', actions: ['❤️ Liked', '💬 Commented'] } },
      { name: 'INSTAGRAM FOLLOW', platform: 'instagram' as Platform, action: 'follow' as ActionType, details: { profileUrl: 'https://instagram.com/testuser', followers: 12500, actions: ['👥 Followed'] } },
      { name: 'INSTAGRAM COMMENT', platform: 'instagram' as Platform, action: 'comment' as ActionType, details: { postUrl: 'https://instagram.com/p/ABC123', commentText: 'This is fire! 🔥', actions: ['❤️ Liked', '💬 Commented'] } },
    ];
    
    for (const test of tests) {
      await notifier.notify({
        event: 'action:complete',
        platform: test.platform,
        action: test.action,
        success: true,
        target: test.details.postUrl || test.details.profileUrl || 'test',
        details: test.details,
        timestamp: Date.now(),
      });
      console.log(`  ✅ ${test.name}`);
      await new Promise(r => setTimeout(r, 500)); // Small delay between messages
    }
    
    console.log('\n✅ All test notifications sent!');
  });

// Parse arguments
program.parse();
