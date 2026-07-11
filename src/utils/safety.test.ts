import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  appendActionLog,
  confirmOrSkip,
  normalizeTwitterUsername,
  previewAction,
} from './safety.js';

describe('normalizeTwitterUsername', () => {
  it('normalizes handles and profile URLs to bare usernames', () => {
    expect(normalizeTwitterUsername('@alice')).toBe('alice');
    expect(normalizeTwitterUsername('https://x.com/@bob')).toBe('bob');
    expect(normalizeTwitterUsername('https://twitter.com/carol/status/123')).toBe('carol');
  });
});

describe('previewAction', () => {
  it('returns a dry-run message and does not execute the action', async () => {
    let executed = false;
    const result = await previewAction({
      dryRun: true,
      summary: 'tweet: hello',
      run: async () => {
        executed = true;
        return 'done';
      },
    });

    expect(executed).toBe(false);
    expect(result.executed).toBe(false);
    expect(result.message).toContain('DRY RUN');
    expect(result.message).toContain('tweet: hello');
  });

  it('requires confirmation when confirm is enabled and input is not yes', async () => {
    let executed = false;
    const result = await previewAction({
      confirm: true,
      summary: 'follow @alice',
      ask: async () => false,
      run: async () => {
        executed = true;
        return 'done';
      },
    });

    expect(executed).toBe(false);
    expect(result.executed).toBe(false);
    expect(result.cancelled).toBe(true);
  });

  it('executes when confirmation succeeds', async () => {
    const result = await previewAction({
      confirm: true,
      summary: 'follow @alice',
      ask: async () => true,
      run: async () => 'done',
    });

    expect(result.executed).toBe(true);
    expect(result.value).toBe('done');
  });
});

describe('appendActionLog', () => {
  it('appends one JSON object per line and creates parent directories', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialcrabs-log-'));
    const logPath = path.join(dir, 'nested', 'actions.jsonl');

    appendActionLog(logPath, {
      platform: 'twitter',
      action: 'follow',
      target: '@alice',
      status: 'success',
    });

    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.platform).toBe('twitter');
    expect(entry.action).toBe('follow');
    expect(entry.target).toBe('@alice');
    expect(entry.status).toBe('success');
    expect(entry.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('confirmOrSkip', () => {
  it('treats y and yes as confirmation', async () => {
    await expect(confirmOrSkip('Proceed?', async () => 'y')).resolves.toBe(true);
    await expect(confirmOrSkip('Proceed?', async () => 'yes')).resolves.toBe(true);
    await expect(confirmOrSkip('Proceed?', async () => 'Y')).resolves.toBe(true);
    await expect(confirmOrSkip('Proceed?', async () => 'no')).resolves.toBe(false);
  });
});
