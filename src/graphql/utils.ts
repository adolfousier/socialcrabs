import type { Tweet, MediaItem, XUser } from './types.js';

export function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

export function extractMedia(result: any): MediaItem[] | undefined {
  const rawMedia = result?.legacy?.extended_entities?.media ?? result?.legacy?.entities?.media;
  if (!rawMedia || rawMedia.length === 0) return undefined;

  const media: MediaItem[] = [];
  for (const item of rawMedia) {
    if (!item.type || !item.media_url_https) continue;
    const mediaItem: MediaItem = { type: item.type, url: item.media_url_https };
    const sizes = item.sizes;
    if (sizes?.large) {
      mediaItem.width = sizes.large.w;
      mediaItem.height = sizes.large.h;
    }
    if ((item.type === 'video' || item.type === 'animated_gif') && item.video_info?.variants) {
      const mp4Variants = item.video_info.variants.filter((v: any) => v.content_type === 'video/mp4' && typeof v.url === 'string');
      const withBitrate = mp4Variants.filter((v: any) => typeof v.bitrate === 'number').sort((a: any, b: any) => b.bitrate - a.bitrate);
      const selected = withBitrate[0] ?? mp4Variants[0];
      if (selected) mediaItem.videoUrl = selected.url;
      if (typeof item.video_info.duration_millis === 'number') mediaItem.durationMs = item.video_info.duration_millis;
    }
    media.push(mediaItem);
  }
  return media.length > 0 ? media : undefined;
}

export function extractNoteTweetText(result: any): string | undefined {
  const note = result?.note_tweet?.note_tweet_results?.result;
  if (!note) return undefined;
  return firstText(note.text, note.richtext?.text, note.rich_text?.text);
}

export function extractArticleMetadata(result: any): { title: string; previewText?: string } | undefined {
  const article = result?.article;
  if (!article) return undefined;
  const articleResult = article.article_results?.result ?? article;
  const title = firstText(articleResult.title, article.title);
  if (!title) return undefined;
  const previewText = firstText(articleResult.preview_text, article.preview_text);
  return { title, previewText };
}

export function extractArticleText(result: any): string | undefined {
  const article = result?.article;
  if (!article) return undefined;
  const articleResult = article.article_results?.result ?? article;
  const title = firstText(articleResult.title, article.title);
  let body = firstText(
    articleResult.plain_text, article.plain_text,
    articleResult.body?.text, articleResult.content?.text,
    articleResult.text, article.body?.text, article.content?.text, article.text
  );
  if (body && title && body.trim() === title.trim()) body = undefined;
  if (title && body && !body.startsWith(title)) return `${title}\n\n${body}`;
  return body ?? title;
}

export function extractTweetText(result: any): string | undefined {
  return extractArticleText(result) ?? extractNoteTweetText(result) ?? firstText(result?.legacy?.full_text);
}

export function unwrapTweetResult(result: any): any {
  if (!result) return undefined;
  if (result.tweet) return result.tweet;
  return result;
}

export function mapTweetResult(result: any, quoteDepth = 1): Tweet | undefined {
  const userResult = result?.core?.user_results?.result;
  const userLegacy = userResult?.legacy;
  const userCore = userResult?.core;
  const username = userLegacy?.screen_name ?? userCore?.screen_name;
  const name = userLegacy?.name ?? userCore?.name ?? username;
  const userId = userResult?.rest_id;
  if (!result?.rest_id || !username) return undefined;
  const text = extractTweetText(result);
  if (!text) return undefined;

  let quotedTweet: Tweet | undefined;
  if (quoteDepth > 0) {
    const quotedResult = unwrapTweetResult(result.quoted_status_result?.result);
    if (quotedResult) quotedTweet = mapTweetResult(quotedResult, quoteDepth - 1);
  }

  return {
    id: result.rest_id,
    text,
    createdAt: result.legacy?.created_at,
    replyCount: result.legacy?.reply_count,
    retweetCount: result.legacy?.retweet_count,
    likeCount: result.legacy?.favorite_count,
    conversationId: result.legacy?.conversation_id_str,
    inReplyToStatusId: result.legacy?.in_reply_to_status_id_str ?? undefined,
    author: { username, name: name || username },
    authorId: userId,
    quotedTweet,
    media: extractMedia(result),
    article: extractArticleMetadata(result),
  };
}

export function collectTweetResultsFromEntry(entry: any): any[] {
  const results: any[] = [];
  const push = (r: any) => { if (r?.rest_id) results.push(r); };
  const content = entry.content;
  push(content?.itemContent?.tweet_results?.result);
  push(content?.item?.itemContent?.tweet_results?.result);
  for (const item of content?.items ?? []) {
    push(item?.item?.itemContent?.tweet_results?.result);
    push(item?.itemContent?.tweet_results?.result);
    push(item?.content?.itemContent?.tweet_results?.result);
  }
  return results;
}

export function parseTweetsFromInstructions(instructions: any[], quoteDepth = 1): Tweet[] {
  const tweets: Tweet[] = [];
  const seen = new Set<string>();
  for (const instruction of instructions ?? []) {
    for (const entry of instruction.entries ?? []) {
      const results = collectTweetResultsFromEntry(entry);
      for (const result of results) {
        const mapped = mapTweetResult(result, quoteDepth);
        if (!mapped || seen.has(mapped.id)) continue;
        seen.add(mapped.id);
        tweets.push(mapped);
      }
    }
  }
  return tweets;
}

export function parseUsersFromInstructions(instructions: any[]): XUser[] {
  const users: XUser[] = [];
  const seen = new Set<string>();

  const pushUser = (result: any) => {
    const user = mapUserResult(result);
    if (!user || seen.has(user.id)) return;
    seen.add(user.id);
    users.push(user);
  };

  for (const instruction of instructions ?? []) {
    for (const entry of instruction.entries ?? []) {
      const content = entry.content;
      pushUser(content?.itemContent?.user_results?.result);
      pushUser(content?.item?.itemContent?.user_results?.result);
      for (const item of content?.items ?? []) {
        pushUser(item?.item?.itemContent?.user_results?.result);
        pushUser(item?.itemContent?.user_results?.result);
        pushUser(item?.content?.itemContent?.user_results?.result);
      }
    }
  }

  return users;
}

function mapUserResult(result: any): XUser | undefined {
  if (!result || result.__typename === 'UserUnavailable') return undefined;
  const legacy = result.legacy;
  const core = result.core;
  const id = result.rest_id?.toString();
  const username = legacy?.screen_name ?? core?.screen_name;
  const name = legacy?.name ?? core?.name ?? username;
  if (!id || !username) return undefined;

  return {
    id,
    username,
    name: name || username,
    description: legacy?.description,
    followersCount: legacy?.followers_count,
    followingCount: legacy?.friends_count,
    isBlueVerified: Boolean(result.is_blue_verified),
    profileImageUrl: legacy?.profile_image_url_https,
    createdAt: legacy?.created_at,
  };
}

export function extractCursorFromInstructions(instructions: any[], cursorType = 'Bottom'): string | undefined {
  for (const instruction of instructions ?? []) {
    for (const entry of instruction.entries ?? []) {
      const content = entry.content;
      if (content?.cursorType === cursorType && typeof content.value === 'string' && content.value.length > 0) {
        return content.value;
      }
    }
  }
  return undefined;
}
