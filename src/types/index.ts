import type { Page, BrowserContext } from 'playwright';

// ============================================================================
// Platform Types
// ============================================================================

export type Platform = 'instagram' | 'twitter' | 'linkedin';

export type ActionType =
  | 'like'
  | 'comment'
  | 'follow'
  | 'unfollow'
  | 'dm'
  | 'post'
  | 'retweet'
  | 'reply'
  | 'connect'
  | 'view_story'
  | 'view_profile';

// ============================================================================
// Configuration Types
// ============================================================================

export interface ClawSocialConfig {
  server?: Partial<ServerConfig>;
  browser?: Partial<BrowserConfig>;
  rateLimits?: Partial<RateLimitConfig>;
  delays?: Partial<DelayConfig>;
  session?: Partial<SessionConfig>;
  logging?: Partial<LoggingConfig>;
}

export interface ServerConfig {
  host: string;
  port: number;
  wsPort: number;
  apiKey?: string;
  apiSecret?: string;
}

export interface BrowserConfig {
  headless: boolean;
  dataDir: string;
  timeout: number;
  userAgent?: string;
  viewport: {
    width: number;
    height: number;
  };
}

export interface RateLimitConfig {
  instagram: PlatformRateLimits;
  twitter: PlatformRateLimits;
  linkedin: PlatformRateLimits;
}

export interface PlatformRateLimits {
  like: number;
  comment: number;
  follow: number;
  dm: number;
  post: number;
  connect: number;
}

export interface DelayConfig {
  minMs: number;
  maxMs: number;
  typingMinMs: number;
  typingMaxMs: number;
}

export interface SessionConfig {
  dir: string;
  encryptionKey?: string;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  file?: string;
}

// ============================================================================
// Action Types
// ============================================================================

export interface ActionResult {
  success: boolean;
  platform: Platform;
  action: ActionType;
  target?: string;
  message?: string;
  error?: string;
  timestamp: number;
  duration: number;
  rateLimit?: RateLimitStatus;
}

export interface RateLimitStatus {
  remaining: number;
  total: number;
  resetAt: number;
  allowed: boolean;
}

// ============================================================================
// Platform Action Payloads
// ============================================================================

export interface LikePayload {
  url: string;
}

export interface CommentPayload {
  url: string;
  text: string;
}

export interface FollowPayload {
  username: string;
}

export interface DMPayload {
  username: string;
  message: string;
}

export interface PostPayload {
  text: string;
  media?: string[];
}

export interface ReplyPayload {
  url: string;
  text: string;
}

export interface ConnectPayload {
  profileUrl: string;
  note?: string;
}

export interface ProfilePayload {
  username: string;
}

// ============================================================================
// Session Types
// ============================================================================

export interface Session {
  platform: Platform;
  cookies: CookieData[];
  localStorage?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
  username?: string;
}

export interface CookieData {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

// ============================================================================
// API Types
// ============================================================================

export interface APIRequest {
  id: string;
  platform: Platform;
  action: ActionType;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface APIResponse {
  id: string;
  success: boolean;
  result?: ActionResult;
  error?: string;
  timestamp: number;
}

// ============================================================================
// WebSocket Types
// ============================================================================

export interface WSMessage {
  type: WSMessageType;
  id?: string;
  payload?: Record<string, unknown>;
}

export type WSMessageType =
  | 'command'
  | 'result'
  | 'status'
  | 'error'
  | 'ping'
  | 'pong'
  | 'subscribe'
  | 'unsubscribe';

// ============================================================================
// Internal Types
// ============================================================================

export interface BrowserInstance {
  context: BrowserContext;
  page: Page;
  platform?: Platform;
}

export interface PlatformHandler {
  platform: Platform;
  initialize(context: BrowserContext): Promise<void>;
  isLoggedIn(): Promise<boolean>;
  login(): Promise<boolean>;
  logout(): Promise<void>;
  like(payload: LikePayload): Promise<ActionResult>;
  comment(payload: CommentPayload): Promise<ActionResult>;
  follow(payload: FollowPayload): Promise<ActionResult>;
  unfollow(payload: FollowPayload): Promise<ActionResult>;
  dm(payload: DMPayload): Promise<ActionResult>;
  getProfile(payload: ProfilePayload): Promise<Record<string, unknown>>;
}

// ============================================================================
// Profile Types
// ============================================================================

export interface InstagramProfile {
  username: string;
  fullName?: string;
  bio?: string;
  followers?: number;
  following?: number;
  posts?: number;
  isPrivate?: boolean;
  isVerified?: boolean;
  profilePicUrl?: string;
  externalUrl?: string;
}

export interface TwitterProfile {
  username: string;
  displayName?: string;
  bio?: string;
  followers?: number;
  following?: number;
  tweets?: number;
  isVerified?: boolean;
  profilePicUrl?: string;
  location?: string;
  website?: string;
  joinDate?: string;
}

export interface LinkedInProfile {
  username: string;
  fullName?: string;
  headline?: string;
  location?: string;
  connections?: number;
  about?: string;
  profilePicUrl?: string;
  currentCompany?: string;
  currentTitle?: string;
}

// ============================================================================
// Event Types
// ============================================================================

export type ClawSocialEvent =
  | 'action:start'
  | 'action:complete'
  | 'action:error'
  | 'session:login'
  | 'session:logout'
  | 'ratelimit:warning'
  | 'ratelimit:exceeded'
  | 'browser:ready'
  | 'browser:closed';

export interface EventPayload {
  event: ClawSocialEvent;
  data: Record<string, unknown>;
  timestamp: number;
}
