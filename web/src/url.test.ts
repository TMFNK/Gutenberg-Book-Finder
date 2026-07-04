import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readState, writeState } from './url';
import { EMPTY_FILTERS } from './filters';

describe('url state', () => {
  let search = '';

  beforeEach(() => {
    search = '';
    vi.stubGlobal('location', {
      pathname: '/',
      get search() { return search; },
      set search(v: string) { search = v; },
    });
    vi.stubGlobal('history', {
      replaceState: (_: unknown, __: string, url: string) => {
        const i = url.indexOf('?');
        search = i >= 0 ? url.slice(i) : '';
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads query and book from search params', () => {
    search = '?q=pride&book=2701&mood=witty';
    expect(readState()).toMatchObject({
      query: 'pride', bookId: 2701, sort: 'relevance',
      filters: { mood: 'witty' },
    });
  });

  it('writes compact state to the URL', () => {
    writeState({
      query: 'whale', sort: 'relevance', bookId: 2701,
      filters: { ...EMPTY_FILTERS, mood: 'ominous' },
    });
    expect(search).toBe('?q=whale&sort=relevance&mood=ominous&book=2701');
  });

  it('omits default sort from URL', () => {
    writeState({ query: '', sort: 'downloads', filters: EMPTY_FILTERS, bookId: null });
    expect(search).toBe('');
  });
});
