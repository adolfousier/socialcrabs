import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

export interface XurlPostResult {
  success: boolean;
  postedUrl?: string;
  mediaIds?: string[];
  error?: string;
}

export function resolveXurlBinary(): string {
  const candidates = [
    process.env.XURL_BIN,
    'xurl',
    path.join(os.homedir(), '.local', 'bin', 'xurl'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (candidate === 'xurl') return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'xurl';
}

export function buildXurlPostArgs(text: string, mediaIds: string[] = []): string[] {
  const args = ['post', text];
  for (const mediaId of mediaIds) {
    args.push('--media-id', mediaId);
  }
  return args;
}

function parseFirstJsonObject(stdout: string): unknown {
  const text = stdout || '{}';
  const start = text.indexOf('{');
  if (start === -1) return JSON.parse(text);

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(text.slice(start, i + 1));
      }
    }
  }

  return JSON.parse(text);
}

export function parseXurlMediaId(stdout: string): string | undefined {
  const data = parseFirstJsonObject(stdout) as any;
  return data?.data?.id?.toString()
    ?? data?.media_id_string?.toString()
    ?? data?.media_id?.toString()
    ?? data?.id?.toString();
}

export function parseXurlPostUrl(stdout: string): string | undefined {
  const data = parseFirstJsonObject(stdout) as any;
  const id = data?.data?.id?.toString() ?? data?.id?.toString();
  return id ? `https://x.com/i/web/status/${id}` : undefined;
}

export function postTweetWithXurl(text: string, mediaPaths: string[] = []): XurlPostResult {
  const xurl = resolveXurlBinary();
  const mediaIds: string[] = [];

  for (const mediaPath of mediaPaths) {
    const upload = spawnSync(xurl, ['media', 'upload', mediaPath], { encoding: 'utf-8' });
    if (upload.status !== 0) {
      return { success: false, mediaIds, error: upload.stderr || upload.stdout || `xurl media upload failed for ${mediaPath}` };
    }
    try {
      const mediaId = parseXurlMediaId(upload.stdout);
      if (!mediaId) return { success: false, mediaIds, error: `Could not parse media id from xurl output for ${mediaPath}` };
      mediaIds.push(mediaId);
    } catch (error) {
      return { success: false, mediaIds, error: `Could not parse xurl media output: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  const post = spawnSync(xurl, buildXurlPostArgs(text, mediaIds), { encoding: 'utf-8' });
  if (post.status !== 0) {
    return { success: false, mediaIds, error: post.stderr || post.stdout || 'xurl post failed' };
  }

  try {
    const postedUrl = parseXurlPostUrl(post.stdout);
    if (!postedUrl) return { success: false, mediaIds, error: 'Could not parse posted tweet URL from xurl output' };
    return { success: true, postedUrl, mediaIds };
  } catch (error) {
    return { success: false, mediaIds, error: `Could not parse xurl post output: ${error instanceof Error ? error.message : String(error)}` };
  }
}
