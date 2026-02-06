#!/usr/bin/env npx tsx
/**
 * Instagram Engagement Script
 * 
 * Scrapes followers from @open.claw, stores them, and engages with their posts.
 * Uses human-like delays between actions to avoid detection.
 */

import { ClawSocial } from '../index.js';
import * as fs from 'fs';
import * as path from 'path';

const STATE_FILE = path.join(process.cwd(), 'db/instagram_state.json');
const DELAYS_FILE = path.join(process.cwd(), 'db/ig_used_delays.json');
const SOURCE_PROFILE = 'open.claw';

// Comment templates - will be selected randomly and customized
const COMMENT_TEMPLATES = [
  "Great shot! 📸",
  "Love this! 🔥",
  "Amazing content! 🙌",
  "This is awesome! 💯",
  "Nice one! 👏",
  "Super cool! ✨",
  "Really impressive! 🚀",
  "Wow, love it! ❤️",
  "This is fire! 🔥",
  "So good! 👌",
];

interface FollowerData {
  username: string;
  scraped_at: string;
  engaged: boolean;
  engaged_at?: string;
  posts_liked: string[];
  posts_commented: string[];
  followed: boolean;
  followed_at?: string;
}

interface InstagramState {
  source_profile: string;
  followers: Record<string, FollowerData>;
  engaged_posts: Record<string, { engaged_at: string; action: string }>;
  followed_users: Record<string, { followed_at: string }>;
  last_scrape: string | null;
  last_engagement: string | null;
}

function loadState(): InstagramState {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  }
  return {
    source_profile: SOURCE_PROFILE,
    followers: {},
    engaged_posts: {},
    followed_users: {},
    last_scrape: null,
    last_engagement: null,
  };
}

function saveState(state: InstagramState): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function loadUsedDelays(): number[] {
  if (fs.existsSync(DELAYS_FILE)) {
    const data = JSON.parse(fs.readFileSync(DELAYS_FILE, 'utf-8'));
    // Clear delays older than 24h
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return data.delays?.filter((d: { time: number }) => d.time > cutoff).map((d: { delay: number }) => d.delay) || [];
  }
  return [];
}

function saveUsedDelay(delay: number): void {
  const data = fs.existsSync(DELAYS_FILE) ? JSON.parse(fs.readFileSync(DELAYS_FILE, 'utf-8')) : { delays: [] };
  data.delays = data.delays || [];
  data.delays.push({ delay, time: Date.now() });
  // Keep only last 24h
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  data.delays = data.delays.filter((d: { time: number }) => d.time > cutoff);
  fs.writeFileSync(DELAYS_FILE, JSON.stringify(data, null, 2));
}

function getUniqueDelay(minMinutes: number = 10, maxMinutes: number = 25): number {
  const usedDelays = loadUsedDelays();
  let delay: number;
  let attempts = 0;
  
  do {
    delay = Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;
    attempts++;
  } while (usedDelays.includes(delay) && attempts < 20);
  
  saveUsedDelay(delay);
  return delay;
}

function getRandomComment(): string {
  return COMMENT_TEMPLATES[Math.floor(Math.random() * COMMENT_TEMPLATES.length)];
}

async function sleep(ms: number): Promise<void> {
  console.log(`⏳ Waiting ${Math.round(ms / 1000)}s...`);
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeFollowers(claw: ClawSocial, state: InstagramState, limit: number = 10): Promise<string[]> {
  console.log(`\n📋 Scraping followers from @${SOURCE_PROFILE}...`);
  
  const followers = await claw.instagram.scrapeFollowers(SOURCE_PROFILE, limit);
  const newFollowers: string[] = [];
  
  for (const username of followers) {
    if (!state.followers[username]) {
      state.followers[username] = {
        username,
        scraped_at: new Date().toISOString(),
        engaged: false,
        posts_liked: [],
        posts_commented: [],
        followed: false,
      };
      newFollowers.push(username);
      console.log(`  ✅ New follower: @${username}`);
    }
  }
  
  state.last_scrape = new Date().toISOString();
  saveState(state);
  
  console.log(`📊 Found ${newFollowers.length} new followers (${Object.keys(state.followers).length} total stored)`);
  return newFollowers;
}

async function engageWithFollower(
  claw: ClawSocial, 
  state: InstagramState, 
  username: string,
  dryRun: boolean = false
): Promise<{ success: boolean; liked: string[]; commented: string[]; followed: boolean; error?: string }> {
  console.log(`\n🎯 Engaging with @${username}...`);
  
  const liked: string[] = [];
  const commented: string[] = [];
  let followed = false;
  
  try {
    // Get recent posts
    const posts = await claw.instagram.getRecentPosts(username, 3);
    
    if (posts.length === 0) {
      console.log(`  ⚠️ No posts found for @${username} - will follow instead`);
      
      if (dryRun) {
        console.log(`  🔍 DRY RUN - Would follow @${username}`);
        return { success: true, liked, commented, followed: true };
      }
      
      // Follow the user since we can't find posts
      console.log(`  👤 Following @${username}...`);
      const followResult = await claw.instagram.follow({ username });
      
      if (followResult.success) {
        followed = true;
        console.log(`  ✅ Followed!`);
        
        // Update state
        const followerData = state.followers[username];
        if (followerData) {
          followerData.engaged = true;
          followerData.engaged_at = new Date().toISOString();
          followerData.followed = true;
          followerData.followed_at = new Date().toISOString();
        }
        state.followed_users[username] = { followed_at: new Date().toISOString() };
        state.last_engagement = new Date().toISOString();
        saveState(state);
      } else {
        console.log(`  ❌ Follow failed: ${followResult.error}`);
      }
      
      return { success: followed, liked, commented, followed };
    }
    
    // Pick first post that hasn't been engaged
    const postUrl = posts.find(p => !state.engaged_posts[p]);
    
    if (!postUrl) {
      console.log(`  ⚠️ Already engaged with all visible posts from @${username}`);
      return { success: false, liked, commented, followed, error: 'Already engaged' };
    }
    
    console.log(`  📷 Target post: ${postUrl}`);
    
    if (dryRun) {
      console.log(`  🔍 DRY RUN - Would like and comment`);
      return { success: true, liked: [postUrl], commented: [postUrl], followed };
    }
    
    // Short pause before engaging
    console.log(`  🔄 Preparing to engage...`);
    await sleep(3000 + Math.random() * 2000);
    
    // Like the post
    console.log(`  ❤️ Liking post...`);
    const likeResult = await claw.instagram.like({ url: postUrl });
    
    if (likeResult.success) {
      liked.push(postUrl);
      console.log(`  ✅ Liked!`);
    } else {
      console.log(`  ❌ Like failed: ${likeResult.error}`);
    }
    
    // Wait between actions
    await sleep(5000 + Math.random() * 5000);
    
    // Comment on the post
    const comment = getRandomComment();
    console.log(`  💬 Commenting: "${comment}"`);
    const commentResult = await claw.instagram.comment({ url: postUrl, text: comment });
    
    if (commentResult.success) {
      commented.push(postUrl);
      console.log(`  ✅ Commented!`);
    } else {
      console.log(`  ❌ Comment failed: ${commentResult.error}`);
    }
    
    // Update state
    if (liked.length > 0 || commented.length > 0) {
      state.engaged_posts[postUrl] = {
        engaged_at: new Date().toISOString(),
        action: `liked:${liked.length > 0}, commented:${commented.length > 0}`,
      };
      
      const followerData = state.followers[username];
      if (followerData) {
        followerData.engaged = true;
        followerData.engaged_at = new Date().toISOString();
        followerData.posts_liked.push(...liked);
        followerData.posts_commented.push(...commented);
      }
      
      state.last_engagement = new Date().toISOString();
      saveState(state);
    }
    
    return { success: liked.length > 0 || commented.length > 0, liked, commented, followed };
  } catch (error) {
    console.log(`  ❌ Error: ${error}`);
    return { success: false, liked, commented, followed, error: String(error) };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const skipScrape = args.includes('--skip-scrape');
  const dryRun = args.includes('--dry-run');
  const maxEngagements = parseInt(args.find(a => a.startsWith('--max='))?.split('=')[1] || '3', 10);
  
  console.log('═══════════════════════════════════════════════════');
  console.log('📸 INSTAGRAM ENGAGEMENT — @open.claw Followers');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Skip scrape: ${skipScrape}`);
  console.log(`Max engagements: ${maxEngagements}`);
  
  const state = loadState();
  console.log(`\n📊 Current state:`);
  console.log(`  - Followers tracked: ${Object.keys(state.followers).length}`);
  console.log(`  - Posts engaged: ${Object.keys(state.engaged_posts).length}`);
  console.log(`  - Last scrape: ${state.last_scrape || 'never'}`);
  console.log(`  - Last engagement: ${state.last_engagement || 'never'}`);
  
  const claw = new ClawSocial({ browser: { headless: true } });
  
  try {
    await claw.initialize();
    
    // Skip login check - if scraping works, we're logged in enough
    console.log('\n✅ Session loaded, proceeding...');
    
    // Scrape followers if not skipped
    if (!skipScrape) {
      await scrapeFollowers(claw, state, 15);
    }
    
    // Get followers that haven't been engaged yet
    const unengagedFollowers = Object.values(state.followers)
      .filter(f => !f.engaged)
      .slice(0, maxEngagements);
    
    if (unengagedFollowers.length === 0) {
      console.log('\n✅ All tracked followers have been engaged!');
      console.log('Run without --skip-scrape to find new followers.');
      await claw.shutdown();
      return;
    }
    
    console.log(`\n🎯 Found ${unengagedFollowers.length} followers to engage with`);
    
    const results: Array<{ username: string; success: boolean; liked: string[]; commented: string[]; followed: boolean }> = [];
    
    for (let i = 0; i < unengagedFollowers.length; i++) {
      const follower = unengagedFollowers[i];
      
      if (i > 0) {
        // Wait between engagements with unique delay
        const delayMinutes = getUniqueDelay(10, 25);
        console.log(`\n⏰ Waiting ${delayMinutes} minutes before next engagement...`);
        await sleep(delayMinutes * 60 * 1000);
      }
      
      const result = await engageWithFollower(claw, state, follower.username, dryRun);
      results.push({ username: follower.username, ...result });
      
      console.log(`\n📊 Progress: ${i + 1}/${unengagedFollowers.length}`);
    }
    
    // Print summary
    console.log('\n═══════════════════════════════════════════════════');
    console.log('📊 SESSION SUMMARY');
    console.log('═══════════════════════════════════════════════════');
    
    const successful = results.filter(r => r.success);
    const followedCount = results.filter(r => r.followed).length;
    const likedCount = results.reduce((sum, r) => sum + r.liked.length, 0);
    const commentedCount = results.reduce((sum, r) => sum + r.commented.length, 0);
    
    console.log(`✅ Successful engagements: ${successful.length}/${results.length}`);
    console.log(`   - Follows: ${followedCount}`);
    console.log(`   - Likes: ${likedCount}`);
    console.log(`   - Comments: ${commentedCount}`);
    
    for (const r of results) {
      const status = r.success ? '✅' : '❌';
      const actions = [];
      if (r.followed) actions.push('followed');
      if (r.liked.length > 0) actions.push(`${r.liked.length} likes`);
      if (r.commented.length > 0) actions.push(`${r.commented.length} comments`);
      console.log(`  ${status} @${r.username}: ${actions.join(', ') || 'no action'}`);
    }
    
    await claw.shutdown();
    
    // Output JSON for cron job reporting
    console.log('\n📤 JSON Output:');
    console.log(JSON.stringify({
      success: successful.length > 0,
      total: results.length,
      successful: successful.length,
      results,
      state: {
        followers_tracked: Object.keys(state.followers).length,
        posts_engaged: Object.keys(state.engaged_posts).length,
      }
    }, null, 2));
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    await claw.shutdown();
    process.exit(1);
  }
}

main();
