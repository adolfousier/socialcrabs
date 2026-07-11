export interface Tweet {
  id: string;
  text: string;
  createdAt?: string;
  replyCount?: number;
  retweetCount?: number;
  likeCount?: number;
  conversationId?: string;
  inReplyToStatusId?: string;
  author: {
    username: string;
    name: string;
  };
  authorId?: string;
  quotedTweet?: Tweet;
  media?: MediaItem[];
  article?: { title: string; previewText?: string };
}

export interface MediaItem {
  type: string;
  url: string;
  width?: number;
  height?: number;
  previewUrl?: string;
  videoUrl?: string;
  durationMs?: number;
}

export interface XUser {
  id: string;
  username: string;
  name: string;
  description?: string;
  followersCount?: number;
  followingCount?: number;
  isBlueVerified?: boolean;
  profileImageUrl?: string;
  createdAt?: string;
}

export interface SearchResult {
  success: boolean;
  tweets: Tweet[];
  error?: string;
  nextCursor?: string;
}

export interface UserResult {
  success: boolean;
  user?: { id: string; username: string; name: string };
  error?: string;
}

export interface UserListResult {
  success: boolean;
  users: XUser[];
  error?: string;
  nextCursor?: string;
}

export interface XClientOptions {
  authToken: string;
  ct0: string;
  cookieHeader?: string;
  userAgent?: string;
  timeoutMs?: number;
  quoteDepth?: number;
}
