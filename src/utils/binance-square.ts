import path from 'path';
import { spawnSync } from 'child_process';

const DEFAULT_SQUARE_POST_DIR = '/Users/openai/.hermes/skills/binance/square-post';

export interface SquarePostResult {
  success: boolean;
  id?: string;
  link?: string;
  error?: string;
  stdout?: string;
}

export function buildSquarePostArgs(alias: string, text: string, imagePaths: string[] = []): string[] {
  if (imagePaths.length > 0) {
    return ['scripts/post-image.mjs', '--alias', alias, '--text', text, '--images', imagePaths.join(',')];
  }
  return ['scripts/post-text.mjs', '--alias', alias, '--text', text];
}

export function buildSquareTextFromTweet(text: string, tweetUrl?: string): string {
  const body = text.trim();
  if (!tweetUrl) return body;
  return `${body}\n\n原推链接：${tweetUrl}`;
}

export function parseSquarePostResult(stdout: string): { id?: string; link?: string } {
  return {
    id: stdout.match(/ID:\s*(.+)/)?.[1]?.trim(),
    link: stdout.match(/Link:\s*(.+)/)?.[1]?.trim(),
  };
}

export function postToBinanceSquare(options: {
  alias: string;
  text: string;
  tweetUrl?: string;
  imagePaths?: string[];
  skillDir?: string;
}): SquarePostResult {
  const skillDir = options.skillDir || process.env.BINANCE_SQUARE_SKILL_DIR || DEFAULT_SQUARE_POST_DIR;
  const squareText = buildSquareTextFromTweet(options.text, options.tweetUrl);
  const result = spawnSync(process.execPath, buildSquarePostArgs(options.alias, squareText, options.imagePaths || []), {
    cwd: path.resolve(skillDir),
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    return { success: false, error: result.stderr || result.stdout || 'Binance Square post failed' };
  }
  const parsed = parseSquarePostResult(result.stdout);
  return { success: true, ...parsed, stdout: result.stdout };
}
