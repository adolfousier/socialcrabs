#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import { ClawSocial } from './index.js';
import type { Platform } from './types/index.js';

const program = new Command();

program
  .name('clawsocial')
  .description('Production-ready social media automation with human-like behavior')
  .version('1.0.0');

// ============================================================================
// Server command
// ============================================================================

program
  .command('serve')
  .description('Start the ClawSocial server')
  .option('-p, --port <port>', 'HTTP port', '3847')
  .option('-w, --ws-port <port>', 'WebSocket port', '3848')
  .option('-h, --host <host>', 'Host to bind to', '127.0.0.1')
  .option('--headless', 'Run browser in headless mode', true)
  .option('--no-headless', 'Run browser with visible window')
  .action(async (options) => {
    try {
      const claw = new ClawSocial({
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

      console.log(`\n🦞 ClawSocial server running`);
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
      // Get credentials from options or environment
      const envPrefix = platform.toUpperCase();
      const username = options.username || process.env[`${envPrefix}_USERNAME`] || process.env[`${envPrefix}_EMAIL`];
      const password = options.password || process.env[`${envPrefix}_PASSWORD`];
      
      const headless = options.headless === true || !!(username && password);
      
      const claw = new ClawSocial({
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
  .description('Check login status for all platforms')
  .action(async () => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const status = await claw.getStatus();

      console.log('\n📊 Session Status\n');
      console.log(`Browser: ${status.browser ? '✅ Running' : '❌ Not running'}`);
      console.log(`Uptime: ${Math.floor(status.uptime)}s\n`);

      for (const [platform, info] of Object.entries(status.platforms)) {
        console.log(`${platform.charAt(0).toUpperCase() + platform.slice(1)}:`);
        console.log(`  Logged in: ${info.loggedIn ? '✅' : '❌'}`);
        console.log('  Rate limits:');
        for (const [action, limit] of Object.entries(info.rateLimits)) {
          console.log(`    ${action}: ${limit.remaining}/${limit.total} remaining`);
        }
        console.log();
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Failed to get status:', error);
      process.exit(1);
    }
  });

session
  .command('logout <platform>')
  .description('Logout from a platform')
  .action(async (platform: Platform) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
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
  .action(async (url: string) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const result = await claw.instagram.like({ url });

      if (result.success) {
        console.log(`✅ Liked post: ${url}`);
      } else {
        console.log(`❌ Failed to like post: ${result.error}`);
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

ig.command('follow <username>')
  .description('Follow an Instagram user')
  .action(async (username: string) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const result = await claw.instagram.follow({ username });

      if (result.success) {
        console.log(`✅ Followed: @${username}`);
      } else {
        console.log(`❌ Failed to follow: ${result.error}`);
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

ig.command('comment <url> <text>')
  .description('Comment on an Instagram post')
  .action(async (url: string, text: string) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const result = await claw.instagram.comment({ url, text });

      if (result.success) {
        console.log(`✅ Commented on: ${url}`);
      } else {
        console.log(`❌ Failed to comment: ${result.error}`);
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

ig.command('dm <username> <message>')
  .description('Send a DM to an Instagram user')
  .action(async (username: string, message: string) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
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
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const profile = await claw.instagram.getProfile(username);
      console.log(JSON.stringify(profile, null, 2));

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
  .action(async (url: string) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const result = await claw.twitter.like({ url });

      if (result.success) {
        console.log(`✅ Liked tweet: ${url}`);
      } else {
        console.log(`❌ Failed to like: ${result.error}`);
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

twitter
  .command('tweet <text>')
  .description('Post a tweet')
  .action(async (text: string) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const result = await claw.twitter.post({ text });

      if (result.success) {
        console.log(`✅ Posted tweet`);
      } else {
        console.log(`❌ Failed to post: ${result.error}`);
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

twitter
  .command('follow <username>')
  .description('Follow a Twitter user')
  .action(async (username: string) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const result = await claw.twitter.follow({ username });

      if (result.success) {
        console.log(`✅ Followed: @${username}`);
      } else {
        console.log(`❌ Failed to follow: ${result.error}`);
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

twitter
  .command('reply <url> <text>')
  .description('Reply to a tweet')
  .action(async (url: string, text: string) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const result = await claw.twitter.comment({ url, text });

      if (result.success) {
        console.log(`✅ Replied to tweet`);
      } else {
        console.log(`❌ Failed to reply: ${result.error}`);
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

twitter
  .command('dm <username> <message>')
  .description('Send a DM on Twitter')
  .action(async (username: string, message: string) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const result = await claw.twitter.dm({ username, message });

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

// ============================================================================
// LinkedIn commands
// ============================================================================

const linkedin = program.command('linkedin').alias('li').description('LinkedIn actions');

linkedin
  .command('connect <url>')
  .description('Send a connection request')
  .option('-n, --note <note>', 'Add a note to the connection request')
  .action(async (url: string, options) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
      await claw.initialize();

      const result = await claw.linkedin.connect({
        profileUrl: url,
        note: options.note,
      });

      if (result.success) {
        console.log(`✅ Sent connection request to: ${url}`);
      } else {
        console.log(`❌ Failed to connect: ${result.error}`);
      }

      await claw.shutdown();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

linkedin
  .command('message <url> <text>')
  .description('Send a LinkedIn message')
  .action(async (url: string, text: string) => {
    try {
      const claw = new ClawSocial({ browser: { headless: true } });
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
      const claw = new ClawSocial({ browser: { headless: true } });
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
      const claw = new ClawSocial({ browser: { headless: true } });
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
      const claw = new ClawSocial({ browser: { headless: true } });
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
      const claw = new ClawSocial({ browser: { headless: true } });
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
      const args = ['scripts/engage.ts', `--query=${options.query}`];
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

// Parse arguments
program.parse();
