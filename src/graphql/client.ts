import { randomBytes, randomUUID } from 'node:crypto';
import { TWITTER_API_BASE, QUERY_IDS, SETTINGS_SCREEN_NAME_REGEX, SETTINGS_USER_ID_REGEX, SETTINGS_NAME_REGEX } from './constants.js';
import { buildSearchFeatures, buildHomeTimelineFeatures, buildFollowingFeatures } from './features.js';
import { parseTweetsFromInstructions, extractCursorFromInstructions, parseUsersFromInstructions } from './utils.js';
import type { Tweet, XClientOptions, SearchResult, UserResult, UserListResult } from './types.js';

const BEARER_TOKEN = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

export class XGraphQLClient {
  private authToken: string;
  private ct0: string;
  private cookieHeader: string;
  private userAgent: string;
  private timeoutMs?: number;
  private quoteDepth: number;
  private clientUuid: string;
  private clientUserId?: string;

  constructor(options: XClientOptions) {
    if (!options.authToken || !options.ct0) {
      throw new Error('Both authToken and ct0 cookies are required');
    }
    this.authToken = options.authToken;
    this.ct0 = options.ct0;
    this.cookieHeader = options.cookieHeader || `auth_token=${this.authToken}; ct0=${this.ct0}`;
    this.userAgent = options.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    this.timeoutMs = options.timeoutMs;
    this.quoteDepth = options.quoteDepth ?? 1;
    this.clientUuid = randomUUID();
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.9',
      authorization: BEARER_TOKEN,
      'x-csrf-token': this.ct0,
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-active-user': 'yes',
      'x-twitter-client-language': 'en',
      'x-client-uuid': this.clientUuid,
      'x-client-transaction-id': randomBytes(16).toString('hex'),
      cookie: this.cookieHeader,
      'user-agent': this.userAgent,
      'content-type': 'application/json',
      origin: 'https://x.com',
      referer: 'https://x.com/',
    };
    if (this.clientUserId) headers['x-twitter-client-user-id'] = this.clientUserId;
    return headers;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    if (!this.timeoutMs || this.timeoutMs <= 0) return fetch(url, init);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private getQueryId(operationName: string): string {
    return QUERY_IDS[operationName] || '';
  }

  private getSearchQueryIds(): string[] {
    return [...new Set([this.getQueryId('SearchTimeline'), 'M1jEez78PEfVfbQLvlWMvQ', '5h0kNbk3ii97rmfY6CdgAA', '6AAys3t42mosm_yTI_QENg'])];
  }

  private getHomeQueryIds(): string[] {
    return [...new Set([this.getQueryId('HomeTimeline'), 'edseUwk9sP5Phz__9TIRnA'])];
  }

  private getUserListQueryIds(operationName: 'Followers' | 'Following'): string[] {
    return [...new Set([this.getQueryId(operationName), operationName === 'Followers' ? 'SFYY3WsgwjlXSLlfnEUE4A' : 'mWYeougg_ocJS2Vr1Vt28w'])];
  }

  /**
   * Search for tweets matching a query
   */
  async search(query: string, count = 20): Promise<SearchResult> {
    const features = buildSearchFeatures();
    const queryIds = this.getSearchQueryIds();
    let lastSearchError = '';

    for (const queryId of queryIds) {
      const variables = {
        rawQuery: query,
        count,
        querySource: 'typed_query',
        product: 'Latest',
      };
      const params = new URLSearchParams({
        variables: JSON.stringify(variables),
      });
      const url = `${TWITTER_API_BASE}/${queryId}/SearchTimeline?${params.toString()}`;

      try {
        const response = await this.fetchWithTimeout(url, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ features, queryId }),
        });

        if (response.status === 404) { lastSearchError = `404 for queryId ${queryId}`; continue; }
        if (!response.ok) {
          const text = await response.text();
          lastSearchError = `HTTP ${response.status} (queryId ${queryId}): ${text.slice(0, 300)}`;
          // On 400/422 might be queryId mismatch, try next
          if (response.status === 400 || response.status === 422) continue;
          return { success: false, tweets: [], error: lastSearchError };
        }

        const data = await response.json() as any;
        if (data.errors?.length > 0) {
          lastSearchError = data.errors.map((e: any) => e.message).join(', ');
          // GRAPHQL_VALIDATION_FAILED = stale queryId, try next
          if (data.errors.some((e: any) => e?.extensions?.code === 'GRAPHQL_VALIDATION_FAILED')) continue;
          return { success: false, tweets: [], error: lastSearchError };
        }

        const instructions = data.data?.search_by_raw_query?.search_timeline?.timeline?.instructions;
        const tweets = parseTweetsFromInstructions(instructions, this.quoteDepth);
        const nextCursor = extractCursorFromInstructions(instructions);
        return { success: true, tweets, nextCursor };
      } catch (error) {
        lastSearchError = error instanceof Error ? error.message : String(error);
        continue;
      }
    }
    return { success: false, tweets: [], error: lastSearchError || 'All query IDs failed' };
  }

  /**
   * Get home timeline
   */
  async getHomeTimeline(count = 20): Promise<SearchResult> {
    const features = buildHomeTimelineFeatures();
    const queryIds = this.getHomeQueryIds();

    for (const queryId of queryIds) {
      const variables = {
        count,
        includePromotedContent: true,
        latestControlAvailable: true,
        requestContext: 'launch',
        withCommunity: true,
      };
      const params = new URLSearchParams({
        variables: JSON.stringify(variables),
        features: JSON.stringify(features),
      });
      const url = `${TWITTER_API_BASE}/${queryId}/HomeTimeline?${params.toString()}`;

      try {
        const response = await this.fetchWithTimeout(url, {
          method: 'GET',
          headers: this.getHeaders(),
        });

        if (response.status === 404) continue;
        if (!response.ok) {
          const text = await response.text();
          return { success: false, tweets: [], error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
        }

        const data = await response.json() as any;
        if (data.errors?.length > 0) {
          return { success: false, tweets: [], error: data.errors.map((e: any) => e.message).join(', ') };
        }

        const instructions = data.data?.home?.home_timeline_urt?.instructions;
        const tweets = parseTweetsFromInstructions(instructions, this.quoteDepth);
        return { success: true, tweets };
      } catch (error) {
        continue;
      }
    }
    return { success: false, tweets: [], error: 'All query IDs failed' };
  }

  /**
   * Get followers for a user ID
   */
  async getFollowers(userId: string, count = 50, cursor?: string): Promise<UserListResult> {
    return this.getUserList('Followers', userId, count, cursor);
  }

  /**
   * Get accounts followed by a user ID
   */
  async getFollowing(userId: string, count = 50, cursor?: string): Promise<UserListResult> {
    return this.getUserList('Following', userId, count, cursor);
  }

  private async getUserList(
    operationName: 'Followers' | 'Following',
    userId: string,
    count = 50,
    cursor?: string
  ): Promise<UserListResult> {
    const features = buildFollowingFeatures();
    const queryIds = this.getUserListQueryIds(operationName);
    let lastError = '';

    for (const queryId of queryIds) {
      const variables: Record<string, unknown> = {
        userId,
        count,
        includePromotedContent: false,
      };
      if (cursor) variables.cursor = cursor;

      const params = new URLSearchParams({
        variables: JSON.stringify(variables),
        features: JSON.stringify(features),
      });
      const url = `${TWITTER_API_BASE}/${queryId}/${operationName}?${params.toString()}`;

      try {
        const response = await this.fetchWithTimeout(url, {
          method: 'GET',
          headers: this.getHeaders(),
        });

        if (response.status === 404) { lastError = `404 for queryId ${queryId}`; continue; }
        if (!response.ok) {
          const text = await response.text();
          lastError = `HTTP ${response.status} (queryId ${queryId}): ${text.slice(0, 300)}`;
          if (response.status === 400 || response.status === 422) continue;
          return { success: false, users: [], error: lastError };
        }

        const data = await response.json() as any;
        if (data.errors?.length > 0) {
          lastError = data.errors.map((e: any) => e.message).join(', ');
          if (data.errors.some((e: any) => e?.extensions?.code === 'GRAPHQL_VALIDATION_FAILED')) continue;
          return { success: false, users: [], error: lastError };
        }

        const instructions = findInstructions(data);
        const users = parseUsersFromInstructions(instructions);
        const nextCursor = extractCursorFromInstructions(instructions);
        return { success: true, users, nextCursor };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        continue;
      }
    }

    const fallback = await this.getRestUserList(operationName, userId, count, cursor);
    if (fallback.success) return fallback;
    return { success: false, users: [], error: `${lastError || 'All query IDs failed'}; REST fallback: ${fallback.error || 'unknown error'}` };
  }

  private async getRestUserList(
    operationName: 'Followers' | 'Following',
    userId: string,
    count = 50,
    cursor?: string
  ): Promise<UserListResult> {
    const endpoint = operationName === 'Followers' ? 'followers/list.json' : 'friends/list.json';
    const params = new URLSearchParams({
      user_id: userId,
      count: String(Math.min(count, 200)),
      skip_status: 'true',
      include_user_entities: 'false',
    });
    if (cursor) params.set('cursor', cursor);

    const url = `https://api.twitter.com/1.1/${endpoint}?${params.toString()}`;
    try {
      const response = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (!response.ok) {
        const text = await response.text();
        return { success: false, users: [], error: `HTTP ${response.status}: ${text.slice(0, 300)}` };
      }
      const data = await response.json() as any;
      const users = (data.users || []).map((user: any) => ({
        id: user.id_str ?? user.id?.toString(),
        username: user.screen_name,
        name: user.name ?? user.screen_name,
        description: user.description,
        followersCount: user.followers_count,
        followingCount: user.friends_count,
        isBlueVerified: Boolean(user.is_blue_verified || user.verified),
        profileImageUrl: user.profile_image_url_https,
        createdAt: user.created_at,
      })).filter((user: any) => user.id && user.username);
      const nextCursor = data.next_cursor_str && data.next_cursor_str !== '0' ? data.next_cursor_str : undefined;
      return { success: true, users, nextCursor };
    } catch (error) {
      return { success: false, users: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<UserResult> {
    const urls = [
      'https://x.com/i/api/account/settings.json',
      'https://api.twitter.com/1.1/account/settings.json',
      'https://x.com/i/api/account/verify_credentials.json?skip_status=true&include_entities=false',
    ];

    let lastError: string | undefined;
    for (const url of urls) {
      try {
        const response = await this.fetchWithTimeout(url, {
          method: 'GET',
          headers: this.getHeaders(),
        });

        if (!response.ok) {
          lastError = `HTTP ${response.status}`;
          continue;
        }

        const data = await response.json() as any;
        const username = data?.screen_name ?? data?.user?.screen_name;
        const name = data?.name ?? data?.user?.name ?? username ?? '';
        const userId = data?.user_id?.toString() ?? data?.user_id_str ?? data?.user?.id_str ?? data?.user?.id?.toString();

        if (username && userId) {
          this.clientUserId = userId;
          return { success: true, user: { id: userId, username, name: name || username } };
        }
        lastError = 'Could not parse user from response';
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    // Fallback: scrape settings page
    try {
      const response = await this.fetchWithTimeout('https://x.com/settings/account', {
        headers: { cookie: this.cookieHeader, 'user-agent': this.userAgent } as any,
      });
      if (response.ok) {
        const html = await response.text();
        const usernameMatch = SETTINGS_SCREEN_NAME_REGEX.exec(html);
        const idMatch = SETTINGS_USER_ID_REGEX.exec(html);
        const nameMatch = SETTINGS_NAME_REGEX.exec(html);
        if (usernameMatch?.[1] && idMatch?.[1]) {
          return {
            success: true,
            user: {
              id: idMatch[1],
              username: usernameMatch[1],
              name: nameMatch?.[1]?.replace(/\\"/g, '"') || usernameMatch[1],
            },
          };
        }
      }
    } catch {}

    return { success: false, error: lastError ?? 'Unknown error' };
  }

  /**
   * Get tweet detail by ID
   */
  async getTweetDetail(tweetId: string): Promise<{ success: boolean; tweet?: Tweet; error?: string }> {
    const queryId = this.getQueryId('TweetDetail');
    const features = buildSearchFeatures();
    const variables = {
      focalTweetId: tweetId,
      with_rux_injections: false,
      rankingMode: 'Relevance',
      includePromotedContent: true,
      withCommunity: true,
      withQuickPromoteEligibilityTweetFields: true,
      withBirdwatchNotes: true,
      withVoice: true,
    };
    const params = new URLSearchParams({
      variables: JSON.stringify(variables),
      features: JSON.stringify(features),
    });
    const url = `${TWITTER_API_BASE}/${queryId}/TweetDetail?${params.toString()}`;

    try {
      const response = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
      }
      const data = await response.json() as any;
      const instructions = data.data?.threaded_conversation_with_injections_v2?.instructions;
      const tweets = parseTweetsFromInstructions(instructions ?? [], this.quoteDepth);
      const tweet = tweets.find(t => t.id === tweetId);
      return tweet ? { success: true, tweet } : { success: false, error: 'Tweet not found in response' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Get mentions for current user (searches @username)
   */
  async getMentions(count = 20): Promise<SearchResult> {
    const user = await this.getCurrentUser();
    if (!user.success || !user.user) {
      return { success: false, tweets: [], error: user.error ?? 'Could not get current user' };
    }
    return this.search(`@${user.user.username}`, count);
  }
}

function findInstructions(value: any): any[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findInstructions(item);
      if (found.length > 0) return found;
    }
    return [];
  }
  if (Array.isArray(value.instructions)) return value.instructions;
  for (const child of Object.values(value)) {
    const found = findInstructions(child);
    if (found.length > 0) return found;
  }
  return [];
}

/**
 * Create an XGraphQLClient from environment variables
 */
export function createClientFromEnv(): XGraphQLClient {
  const authToken = process.env.AUTH_TOKEN || process.env.SOCIALCRABS_AUTH_TOKEN || '';
  const ct0 = process.env.CT0 || process.env.SOCIALCRABS_CT0 || '';
  if (!authToken || !ct0) {
    throw new Error('AUTH_TOKEN and CT0 environment variables are required. Set them in .env or pass --auth-token and --ct0.');
  }
  return new XGraphQLClient({ authToken, ct0, timeoutMs: 30000 });
}
