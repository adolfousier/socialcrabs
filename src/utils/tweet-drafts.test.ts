import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildChineseTweetDrafts,
  formatTweetParagraphs,
  loadRankedSourceTweets,
  saveTweetDraftQueue,
} from './tweet-drafts.js';

describe('tweet drafts', () => {
  it('formats tweet paragraphs with two returns between paragraphs', () => {
    expect(formatTweetParagraphs(['第一段', '第二段', '第三段'])).toBe('第一段\n\n第二段\n\n第三段');
  });

  it('builds Chinese-only original drafts with gpt-image-2 image jobs', () => {
    const drafts = buildChineseTweetDrafts([
      {
        id: '2073280911349788843',
        text: '蓝鸟会成立15个月了，大家一起成长，很多小伙伴在X上从几千粉丝增长到几万甚至十几万粉丝了！我们的微信群都被封了10来个了，大家一直在！危机中互相托举。',
        sourceUser: 'NFTCPS',
        sourceName: '鸟哥',
        sourceUrl: 'https://x.com/NFTCPS',
        sourceTweetUrl: 'https://x.com/NFTCPS/status/2073280911349788843',
        score: 172,
        status: 'new',
      },
    ], 1);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toEqual(expect.objectContaining({
      sourceUser: 'NFTCPS',
      sourceTweetId: '2073280911349788843',
      sourceUrl: 'https://x.com/NFTCPS/status/2073280911349788843',
      status: 'pending',
      language: 'zh',
      imageProvider: 'gpt-image-2',
    }));
    expect(drafts[0].text).toMatch(/[\u4e00-\u9fff]/);
    expect(drafts[0].text).not.toMatch(/[A-Za-z]/);
    expect(drafts[0].text).not.toContain('蓝鸟会成立15个月了');
    expect(drafts[0].imagePrompt).toContain('中文');
    expect(drafts[0].imagePrompt).toContain('社群');
  });

  it('humanizes Chinese drafts instead of returning fixed template slogans', () => {
    const drafts = buildChineseTweetDrafts([
      {
        id: 'company-1',
        text: '创业公司真正重要的不是讲故事，而是产品和增长能不能持续兑现，穿越周期。',
        sourceUser: 'builder',
        sourceName: 'Builder',
        sourceUrl: 'https://x.com/builder',
        sourceTweetUrl: 'https://x.com/builder/status/company-1',
        score: 20,
        status: 'new',
      },
      {
        id: 'company-2',
        text: '一个项目估值短期可以很高，但最终还是要看产品是不是有人反复用。',
        sourceUser: 'builder2',
        sourceName: 'Builder2',
        sourceUrl: 'https://x.com/builder2',
        sourceTweetUrl: 'https://x.com/builder2/status/company-2',
        score: 18,
        status: 'new',
      },
    ], 2);

    expect(drafts).toHaveLength(2);
    expect(drafts[0].text).not.toBe(drafts[1].text);
    expect(drafts.map((draft) => draft.text).join('\n')).not.toMatch(/很多事情短期看像是估值|真正能穿越周期|故事讲得最大/);
  });

  it('loads source tweets and only uses status new', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweet-drafts-'));
    const file = path.join(dir, 'source-tweets.json');
    fs.writeFileSync(file, JSON.stringify([
      { id: '1', text: '这是一条足够长的中文来源推文，用于生成草稿。', sourceUser: 'a', sourceTweetUrl: 'https://x.com/a/status/1', sourceUrl: 'https://x.com/a', score: 2, status: 'used' },
      { id: '2', text: '这是一条新的中文来源推文，用于生成草稿。', sourceUser: 'b', sourceTweetUrl: 'https://x.com/b/status/2', sourceUrl: 'https://x.com/b', score: 3, status: 'new' },
    ]));

    expect(loadRankedSourceTweets(file).map((tweet) => tweet.id)).toEqual(['2']);
  });

  it('saves tweet draft queue as pretty json', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweet-queue-'));
    const file = path.join(dir, 'nested', 'tweets.json');

    saveTweetDraftQueue(file, [{
      id: 'draft-1',
      text: '这是一条中文草稿。',
      language: 'zh',
      status: 'pending',
      sourceTweetId: '1',
      sourceUrl: 'https://x.com/a/status/1',
      sourceUser: 'a',
      imageProvider: 'gpt-image-2',
      imagePrompt: '中文海报',
      createdAt: '2026-07-04T00:00:00.000Z',
    }]);

    const content = fs.readFileSync(file, 'utf-8');
    expect(content).toContain('\n  {');
    expect(JSON.parse(content)[0].imageProvider).toBe('gpt-image-2');
  });
});
