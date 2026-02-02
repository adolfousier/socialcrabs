#!/usr/bin/env npx tsx
/**
 * Remote Browser - View and control browser from your machine
 * 
 * Usage:
 *   npx tsx scripts/remote-browser.ts
 *   npx tsx scripts/remote-browser.ts "https://instagram.com/p/xxx"
 * 
 * Then connect:
 *   1. SSH tunnel: ssh -L 9222:localhost:9222 your-server
 *   2. Chrome: chrome://inspect → Configure → localhost:9222
 */

import { chromium } from 'playwright';

const url = process.argv[2] || 'https://www.instagram.com/accounts/login/';

async function main() {
  console.log('🌐 Starting remote browser...');
  console.log(`📍 URL: ${url}`);
  console.log('');
  console.log('To connect from your local machine:');
  console.log('  1. Open new terminal');
  console.log('  2. Run: ssh -L 9222:localhost:9222 <your-server>');
  console.log('  3. Open Chrome → chrome://inspect');
  console.log('  4. Click "Configure" → Add "localhost:9222"');
  console.log('  5. Browser appears under "Remote Target" - click "inspect"');
  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--remote-debugging-port=9222',
      '--remote-debugging-address=0.0.0.0',
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  await page.goto(url);
  
  console.log('✅ Browser ready! Waiting for connection...');
  console.log(`   Debug URL: http://localhost:9222`);

  // Keep running until Ctrl+C
  await new Promise(() => {});
}

main().catch(console.error);
