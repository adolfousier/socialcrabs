import { describe, expect, it } from 'vitest';
import { buildSquarePostArgs, buildSquareTextFromTweet, parseSquarePostResult } from './binance-square.js';

describe('Binance Square cross-post helpers', () => {
  it('builds square-post command args with the saved alias and exact text', () => {
    expect(buildSquarePostArgs('guicai', '正文 $BTC #AI')).toEqual([
      'scripts/post-text.mjs',
      '--alias',
      'guicai',
      '--text',
      '正文 $BTC #AI',
    ]);
  });

  it('builds square-post image args when SocialCrabs generated an image for the X post', () => {
    expect(buildSquarePostArgs('guicai', '正文', ['/tmp/card.png'])).toEqual([
      'scripts/post-image.mjs',
      '--alias',
      'guicai',
      '--text',
      '正文',
      '--images',
      '/tmp/card.png',
    ]);
  });

  it('appends the X URL to the Square body when mirroring an X post', () => {
    expect(buildSquareTextFromTweet('推文正文', 'https://x.com/yoyo_aigo/status/123')).toBe('推文正文\n\n原推链接：https://x.com/yoyo_aigo/status/123');
  });

  it('parses Square script success output without exposing secrets', () => {
    expect(parseSquarePostResult('Publishing text post...\n\nSuccess!\nID: abc123\nLink: https://www.binance.com/square/post/abc123\n')).toEqual({
      id: 'abc123',
      link: 'https://www.binance.com/square/post/abc123',
    });
  });
});
