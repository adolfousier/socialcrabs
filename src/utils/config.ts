import dotenv from 'dotenv';
import path from 'path';
import type { ServerConfig, BrowserConfig, RateLimitConfig, DelayConfig, SessionConfig, LoggingConfig } from '../types/index.js';

interface ResolvedConfig {
  server: ServerConfig;
  browser: BrowserConfig;
  rateLimits: RateLimitConfig;
  delays: DelayConfig;
  session: SessionConfig;
  logging: LoggingConfig;
}

// Load environment variables
dotenv.config();

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key]?.toLowerCase();
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1';
}

function getEnvString(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export function loadConfig(): ResolvedConfig {
  return {
    server: {
      host: getEnvString('HOST', '127.0.0.1'),
      port: getEnvNumber('PORT', 3847),
      wsPort: getEnvNumber('WS_PORT', 3848),
      apiKey: process.env.API_KEY,
      apiSecret: process.env.API_SECRET,
    },
    browser: {
      headless: getEnvBoolean('BROWSER_HEADLESS', true),
      dataDir: getEnvString('BROWSER_DATA_DIR', './browser-data'),
      timeout: getEnvNumber('BROWSER_TIMEOUT', 30000),
      userAgent: process.env.BROWSER_USER_AGENT,
      viewport: {
        width: getEnvNumber('BROWSER_WIDTH', 1280),
        height: getEnvNumber('BROWSER_HEIGHT', 720),
      },
    },
    rateLimits: {
      instagram: {
        like: getEnvNumber('RATE_LIMIT_INSTAGRAM_LIKE', 100),
        comment: getEnvNumber('RATE_LIMIT_INSTAGRAM_COMMENT', 30),
        follow: getEnvNumber('RATE_LIMIT_INSTAGRAM_FOLLOW', 50),
        dm: getEnvNumber('RATE_LIMIT_INSTAGRAM_DM', 50),
        post: getEnvNumber('RATE_LIMIT_INSTAGRAM_POST', 10),
        connect: 0,
      },
      twitter: {
        like: getEnvNumber('RATE_LIMIT_TWITTER_LIKE', 100),
        comment: getEnvNumber('RATE_LIMIT_TWITTER_COMMENT', 50),
        follow: getEnvNumber('RATE_LIMIT_TWITTER_FOLLOW', 50),
        dm: getEnvNumber('RATE_LIMIT_TWITTER_DM', 20),
        post: getEnvNumber('RATE_LIMIT_TWITTER_POST', 10),
        connect: 0,
      },
      linkedin: {
        like: getEnvNumber('RATE_LIMIT_LINKEDIN_LIKE', 100),
        comment: getEnvNumber('RATE_LIMIT_LINKEDIN_COMMENT', 30),
        follow: getEnvNumber('RATE_LIMIT_LINKEDIN_CONNECT', 15),
        dm: getEnvNumber('RATE_LIMIT_LINKEDIN_MESSAGE', 40),
        post: getEnvNumber('RATE_LIMIT_LINKEDIN_POST', 5),
        connect: getEnvNumber('RATE_LIMIT_LINKEDIN_CONNECT', 15),
      },
    },
    delays: {
      minMs: getEnvNumber('DELAY_MIN_MS', 1500),
      maxMs: getEnvNumber('DELAY_MAX_MS', 4000),
      typingMinMs: getEnvNumber('TYPING_SPEED_MIN_MS', 30),
      typingMaxMs: getEnvNumber('TYPING_SPEED_MAX_MS', 100),
    },
    session: {
      dir: getEnvString('SESSION_DIR', './sessions'),
      encryptionKey: process.env.COOKIE_ENCRYPTION_KEY,
    },
    logging: {
      level: getEnvString('LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error',
      file: process.env.LOG_FILE,
    },
  };
}

export function resolveDataPath(basePath: string, subPath: string): string {
  if (path.isAbsolute(subPath)) {
    return subPath;
  }
  return path.resolve(basePath, subPath);
}

export const config = loadConfig();
export default config;
