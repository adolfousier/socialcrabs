import { describe, expect, it } from 'vitest';
import {
  parseXurlMediaId,
  parseXurlPostUrl,
  buildXurlPostArgs,
} from './xurl-poster.js';

describe('xurl poster helpers', () => {
  it('parses media id from common xurl media upload outputs', () => {
    expect(parseXurlMediaId(JSON.stringify({ data: { id: '123' } }))).toBe('123');
    expect(parseXurlMediaId(JSON.stringify({ media_id_string: '456' }))).toBe('456');
  });

  it('parses media id when xurl prints a success line after JSON', () => {
    const output = `${JSON.stringify({ data: { id: '789' } }, null, 2)}\nMedia uploaded successfully! Media ID: 789`;

    expect(parseXurlMediaId(output)).toBe('789');
  });

  it('parses posted tweet url from xurl post output', () => {
    expect(parseXurlPostUrl(JSON.stringify({ data: { id: '999' } }))).toBe('https://x.com/i/web/status/999');
  });

  it('builds xurl post args with media ids', () => {
    expect(buildXurlPostArgs('中文\n\n第二段', ['1', '2'])).toEqual([
      'post',
      '中文\n\n第二段',
      '--media-id',
      '1',
      '--media-id',
      '2',
    ]);
  });
});
