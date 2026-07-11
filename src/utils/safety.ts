import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

export interface ActionLogEntry {
  platform: string;
  action: string;
  target?: string;
  text?: string;
  status: 'success' | 'error' | 'cancelled' | 'dry-run';
  error?: string;
  url?: string;
  [key: string]: unknown;
}

export interface PreviewActionOptions<T> {
  dryRun?: boolean;
  confirm?: boolean;
  summary: string;
  ask?: (summary: string) => Promise<boolean>;
  run: () => Promise<T>;
}

export interface PreviewActionResult<T> {
  executed: boolean;
  cancelled?: boolean;
  message?: string;
  value?: T;
}

export function normalizeTwitterUsername(usernameOrUrl: string): string {
  let username = usernameOrUrl.trim();
  if (username.includes('x.com/') || username.includes('twitter.com/')) {
    const match = username.match(/(?:x\.com|twitter\.com)\/(@?[\w]+)/);
    if (match) username = match[1];
  }
  return username.replace(/^@/, '').replace(/\?.*$/, '').replace(/\/.*$/, '');
}

export async function confirmOrSkip(
  question: string,
  readAnswer?: (question: string) => Promise<string>
): Promise<boolean> {
  const answer = readAnswer
    ? await readAnswer(question)
    : await askTerminal(question);
  return ['y', 'yes'].includes(answer.trim().toLowerCase());
}

export async function previewAction<T>(
  options: PreviewActionOptions<T>
): Promise<PreviewActionResult<T>> {
  if (options.dryRun) {
    return {
      executed: false,
      message: `DRY RUN: ${options.summary}`,
    };
  }

  if (options.confirm) {
    const ask = options.ask || ((summary: string) => confirmOrSkip(`${summary}\nContinue? [y/N] `));
    const confirmed = await ask(options.summary);
    if (!confirmed) {
      return {
        executed: false,
        cancelled: true,
        message: 'Cancelled by user.',
      };
    }
  }

  return {
    executed: true,
    value: await options.run(),
  };
}

export function appendActionLog(logPath: string, entry: ActionLogEntry): void {
  const dir = path.dirname(logPath);
  fs.mkdirSync(dir, { recursive: true });
  const line = JSON.stringify({
    time: new Date().toISOString(),
    ...entry,
  });
  fs.appendFileSync(logPath, `${line}\n`);
}

async function askTerminal(question: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}
