#!/usr/bin/env npx tsx
/**
 * Sync bird CLI cookies to ClawSocial Twitter session
 * 
 * Usage:
 *   npx tsx scripts/sync-bird-cookies.ts
 *   npx tsx scripts/sync-bird-cookies.ts --env-file ~/.clawdbot/.env
 * 
 * This reads AUTH_TOKEN and CT0 from environment and creates/updates
 * the sessions/twitter.json file for Playwright to use.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';

interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}

interface Session {
  platform: string;
  cookies: Cookie[];
  localStorage: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

// Parse command line args
const args = process.argv.slice(2);
let envFile = '';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--env-file' && args[i + 1]) {
    envFile = args[i + 1];
    break;
  }
}

// Load env file if specified
if (envFile) {
  const envContent = fs.readFileSync(envFile, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        process.env[key] = valueParts.join('=');
      }
    }
  }
}

const authToken = process.env.AUTH_TOKEN;
const ct0 = process.env.CT0;

if (!authToken || !ct0) {
  console.error('❌ Missing AUTH_TOKEN or CT0 environment variables');
  console.error('');
  console.error('Set them in .env or pass --env-file <path>');
  console.error('');
  console.error('Example:');
  console.error('  AUTH_TOKEN=xxx CT0=yyy npx tsx scripts/sync-bird-cookies.ts');
  console.error('  npx tsx scripts/sync-bird-cookies.ts --env-file ~/.clawdbot/.env');
  process.exit(1);
}

// Cookie expiry: 1 year from now
const expiryTime = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;

const cookies: Cookie[] = [
  {
    name: 'auth_token',
    value: authToken,
    domain: '.x.com',
    path: '/',
    expires: expiryTime,
    httpOnly: true,
    secure: true,
    sameSite: 'None',
  },
  {
    name: 'ct0',
    value: ct0,
    domain: '.x.com',
    path: '/',
    expires: expiryTime,
    httpOnly: false,
    secure: true,
    sameSite: 'Lax',
  },
  // Also add for twitter.com domain (some pages still use it)
  {
    name: 'auth_token',
    value: authToken,
    domain: '.twitter.com',
    path: '/',
    expires: expiryTime,
    httpOnly: true,
    secure: true,
    sameSite: 'None',
  },
  {
    name: 'ct0',
    value: ct0,
    domain: '.twitter.com',
    path: '/',
    expires: expiryTime,
    httpOnly: false,
    secure: true,
    sameSite: 'Lax',
  },
];

const session: Session = {
  platform: 'twitter',
  cookies,
  localStorage: {},
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// Determine sessions directory
const sessionsDir = path.join(process.cwd(), 'sessions');
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
}

const sessionPath = path.join(sessionsDir, 'twitter.json');

// Check if session file exists and preserve any additional cookies
if (fs.existsSync(sessionPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(sessionPath, 'utf-8')) as Session;
    // Keep non-auth cookies from existing session
    const existingOther = existing.cookies.filter(
      (c) => !['auth_token', 'ct0'].includes(c.name)
    );
    session.cookies = [...session.cookies, ...existingOther];
    session.createdAt = existing.createdAt;
    console.log(`📝 Updating existing session (preserving ${existingOther.length} other cookies)`);
  } catch {
    console.log('📝 Creating new session file');
  }
} else {
  console.log('📝 Creating new session file');
}

fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));

console.log(`✅ Twitter session synced to ${sessionPath}`);
console.log('');
console.log('Cookies set:');
console.log(`  • auth_token: ${authToken.slice(0, 8)}...${authToken.slice(-4)}`);
console.log(`  • ct0: ${ct0.slice(0, 8)}...${ct0.slice(-4)}`);
console.log('');
console.log('You can now use:');
console.log('  npm run cli -- x like <tweet-url>');
console.log('  npm run cli -- x follow <username>');
