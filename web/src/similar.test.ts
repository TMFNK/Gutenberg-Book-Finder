import { describe, expect, it } from 'vitest';
import { similarBooks } from './similar';
import type { Book } from './types';

function mk(over: Partial<Book>): Book {
  return { id: 1, title: 'T', author: 'A', year: 1850, lang: 'en',
    downloads: 10, mood: null, themes: null, difficulty: null, hook: null,
    cover: null, summary: null, subjects: [], bookshelves: [],
    url: 'https://www.gutenberg.org/ebooks/1', ...over };
}

describe('similarBooks', () => {
  const all = [
    mk({ id: 1, mood: 'dark', themes: ['obsession'], subjects: ['Whaling'], downloads: 100 }),
    mk({ id: 2, mood: 'dark', themes: ['obsession'], subjects: ['Sea'], downloads: 200 }),
    mk({ id: 3, mood: 'witty', themes: ['marriage'], subjects: ['England'], downloads: 300 }),
    mk({ id: 4, mood: 'dark', themes: ['revenge'], subjects: ['Whaling'], downloads: 50 }),
  ];

  it('ranks by shared mood, themes, and subjects', () => {
    expect(similarBooks(all[0], all).map((b) => b.id)).toEqual([2, 4]);
  });

  it('excludes the source book', () => {
    expect(similarBooks(all[0], all).every((b) => b.id !== 1)).toBe(true);
  });

  it('returns empty when nothing matches', () => {
    expect(similarBooks(all[2], [all[2]])).toEqual([]);
  });
});
