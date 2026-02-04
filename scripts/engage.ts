#!/usr/bin/env npx tsx
/**
 * LinkedIn Engagement Runner
 * 
 * Pipeline: Search → Extract posts → Save → Like + Comment with human delays
 * 
 * Rules:
 * - Max 7 comments per run
 * - 10-25 min random delays between comments  
 * - Never repeat same delay time
 * - Simulates human: scroll, like, wait, comment
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ClawSocial } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const STATE_FILE = path.join(PROJECT_ROOT, 'db', 'linkedin_state.json');
const DELAY_LOG = path.join(PROJECT_ROOT, 'db', 'used_delays.json');

const MAX_COMMENTS = 7;
const MIN_DELAY_SEC = 600;  // 10 min
const MAX_DELAY_SEC = 1500; // 25 min

// Comment templates - varied and natural
const COMMENTS = [
  "Great insights here! This is exactly what the community needs.",
  "Solid breakdown. The technical depth is appreciated.",
  "Thanks for sharing this perspective. Really helpful!",
  "Interesting take on the AI agent ecosystem. Well articulated.",
  "Appreciate the analysis here. Bookmarked for reference.",
  "Good overview! Would love to see more deep dives like this.",
  "This is a helpful resource. The ecosystem is evolving fast.",
];

interface Post {
  url: string;
  urn: string;
  preview?: string;
  first_seen: string;
  liked: boolean;
  commented: boolean;
  comment_text?: string;
}

interface Article {
  url: string;
  title: string;
  author_hint?: string;
  first_seen: string;
  liked: boolean;
  commented: boolean;
  comment_text?: string;
}

interface State {
  profiles: Record<string, any>;
  posts: Record<string, Post>;
  articles?: Record<string, Article>;
  comments_made: Array<{ url: string; title?: string; comment: string; timestamp: string }>;
  likes_made: Array<{ url: string; title?: string; timestamp: string }>;
  last_run: string | null;
}

function loadState(): State {
  if (fs.existsSync(STATE_FILE)) {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    // Migrate old articles to posts if needed
    if (data.articles && !data.posts) {
      data.posts = {};
    }
    return data;
  }
  return {
    profiles: {},
    posts: {},
    comments_made: [],
    likes_made: [],
    last_run: null,
  };
}

function saveState(state: State) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function loadUsedDelays(): Set<number> {
  if (fs.existsSync(DELAY_LOG)) {
    const data = JSON.parse(fs.readFileSync(DELAY_LOG, 'utf-8'));
    const cutoff = Date.now() - 86400000; // 24h ago
    return new Set(
      Object.entries(data)
        .filter(([_, ts]) => (ts as number) > cutoff)
        .map(([d, _]) => parseInt(d))
    );
  }
  return new Set();
}

function saveUsedDelay(delay: number) {
  let data: Record<string, number> = {};
  if (fs.existsSync(DELAY_LOG)) {
    data = JSON.parse(fs.readFileSync(DELAY_LOG, 'utf-8'));
  }
  const cutoff = Date.now() - 86400000;
  data = Object.fromEntries(
    Object.entries(data).filter(([_, ts]) => ts > cutoff)
  );
  data[delay.toString()] = Date.now();
  fs.writeFileSync(DELAY_LOG, JSON.stringify(data, null, 2));
}

function getUniqueDelay(): number {
  const used = loadUsedDelays();
  for (let i = 0; i < 100; i++) {
    let delay = Math.floor(Math.random() * (MAX_DELAY_SEC - MIN_DELAY_SEC + 1)) + MIN_DELAY_SEC;
    delay += Math.floor(Math.random() * 60); // Add random seconds
    if (!used.has(delay)) {
      saveUsedDelay(delay);
      return delay;
    }
  }
  return Math.floor(Math.random() * (MAX_DELAY_SEC - MIN_DELAY_SEC + 1)) + MIN_DELAY_SEC;
}

function getRandomComment(): string {
  return COMMENTS[Math.floor(Math.random() * COMMENTS.length)];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDelay(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

async function searchAndExtract(claw: ClawSocial, query: string): Promise<void> {
  console.log(`\n→ Searching LinkedIn for "${query}"...`);
  
  const { html, posts } = await claw.linkedin.search(query);
  
  if (!html) {
    console.log('  ✗ Search failed');
    return;
  }
  
  // Save HTML
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const htmlFile = path.join(PROJECT_ROOT, 'scraped', `linkedin_${query}_${timestamp}.html`);
  fs.writeFileSync(htmlFile, html);
  console.log(`  ✓ Saved HTML: ${path.basename(htmlFile)}`);
  console.log(`  ✓ Found ${posts.length} posts`);
  
  // Merge into state
  const state = loadState();
  let newCount = 0;
  for (const post of posts) {
    if (!state.posts[post.urn]) {
      state.posts[post.urn] = {
        url: post.url,
        urn: post.urn,
        preview: post.preview,
        first_seen: new Date().toISOString(),
        liked: false,
        commented: false,
      };
      newCount++;
    }
  }
  saveState(state);
  console.log(`  ✓ Added ${newCount} new posts (${Object.keys(state.posts).length} total)`);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const skipSearch = process.argv.includes('--skip-search');
  const query = process.argv.find(a => a.startsWith('--query='))?.split('=')[1] || 'openclaw';
  
  console.log('========================================');
  console.log('LinkedIn Engagement Session');
  console.log(`Query: ${query}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Skip search: ${skipSearch}`);
  console.log('========================================\n');

  // Initialize ClawSocial
  let claw: ClawSocial | null = null;
  if (!dryRun) {
    console.log('Initializing browser...');
    claw = new ClawSocial({
      browser: { headless: true },
    });
    await claw.initialize();
    
    // Search and extract new posts first
    if (!skipSearch) {
      await searchAndExtract(claw, query);
    }
  }

  // Load state
  const state = loadState();
  state.last_run = new Date().toISOString();
  saveState(state);

  // Get pending articles (user profile posts on LinkedIn)
  const pendingArticles = Object.entries(state.articles || {})
    .filter(([_, article]) => !article.commented)
    .map(([hash, article]) => ({ hash, type: 'article', ...article }));

  // Also get pending posts
  const pendingPosts = Object.entries(state.posts || {})
    .filter(([_, post]) => !post.commented)
    .map(([urn, post]) => ({ urn, hash: urn, type: 'post', ...post }));

  // Combine - prioritize articles (user profile posts)
  const pending = [...pendingArticles, ...pendingPosts];

  if (pending.length === 0) {
    console.log('No pending content to engage with.');
    if (claw) await claw.shutdown();
    return;
  }

  // Shuffle for variety
  pending.sort(() => Math.random() - 0.5);
  const toProcess = pending.slice(0, MAX_COMMENTS);

  console.log(`Found ${pending.length} pending (${pendingArticles.length} articles, ${pendingPosts.length} posts)`);
  console.log(`Processing ${toProcess.length} this session\n`);

  if (dryRun) {
    console.log('[DRY RUN] Would process:');
    for (let i = 0; i < toProcess.length; i++) {
      const post = toProcess[i];
      const delay = getUniqueDelay();
      console.log(`  ${i + 1}. ${post.urn}`);
      console.log(`     ${post.url}`);
      console.log(`     Delay after: ${formatDelay(delay)}`);
    }
    return;
  }

  // Initialize if not done
  if (!claw) {
    console.log('Initializing browser...');
    claw = new ClawSocial({
      browser: { headless: true },
    });
    await claw.initialize();
  }

  let commentsMade = 0;
  let likesMade = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const item = toProcess[i] as any;
    const isArticle = item.type === 'article';
    const title = item.title || item.urn || 'Unknown';
    
    console.log(`\n[${i + 1}/${toProcess.length}] ${isArticle ? 'Article' : 'Post'}: ${title.slice(0, 50)}...`);
    console.log(`  URL: ${item.url}`);

    try {
      // Like
      console.log('  → Liking...');
      const likeResult = await claw.linkedin.like({ url: item.url });
      if (likeResult.success) {
        console.log('  ✓ Liked');
        likesMade++;
        if (isArticle && state.articles) {
          state.articles[item.hash].liked = true;
        } else if (state.posts) {
          state.posts[item.hash].liked = true;
        }
        state.likes_made.push({
          url: item.url,
          title: title,
          timestamp: new Date().toISOString(),
        });
      } else {
        console.log(`  ✗ Like failed: ${likeResult.error}`);
      }
    } catch (e: any) {
      console.log(`  ✗ Like error: ${e.message}`);
    }

    // Small delay before commenting
    await sleep(5000 + Math.random() * 10000);

    try {
      // Comment
      const comment = getRandomComment();
      console.log(`  → Commenting: "${comment.slice(0, 40)}..."`);
      const commentResult = await claw.linkedin.comment({ 
        url: item.url, 
        text: comment 
      });
      
      if (commentResult.success) {
        console.log('  ✓ Commented');
        commentsMade++;
        if (isArticle && state.articles) {
          state.articles[item.hash].commented = true;
          state.articles[item.hash].comment_text = comment;
        } else if (state.posts) {
          state.posts[item.hash].commented = true;
          state.posts[item.hash].comment_text = comment;
        }
        state.comments_made.push({
          url: item.url,
          title: title,
          comment,
          timestamp: new Date().toISOString(),
        });
      } else {
        console.log(`  ✗ Comment failed: ${commentResult.error}`);
      }
    } catch (e: any) {
      console.log(`  ✗ Comment error: ${e.message}`);
    }

    // Save state after each item
    saveState(state);

    // Wait before next (unless last one)
    if (i < toProcess.length - 1) {
      const delay = getUniqueDelay();
      console.log(`\n  ⏳ Waiting ${formatDelay(delay)} before next...`);
      await sleep(delay * 1000);
    }
  }

  await claw.shutdown();

  console.log('\n========================================');
  console.log('Session complete!');
  console.log(`  Likes: ${likesMade}`);
  console.log(`  Comments: ${commentsMade}`);
  console.log(`  Total in state: ${state.comments_made.length}`);
  console.log('========================================');
}

main().catch(console.error);
