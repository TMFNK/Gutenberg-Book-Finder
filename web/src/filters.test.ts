import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS, applyFilters, era, facetOptions, pickRandom, sortBooks } from './filters';
import type { Book } from './types';

function mk(over: Partial<Book>): Book {
  return { id: 1, title: 'T', author: 'A', year: 1850, lang: 'en',
    downloads: 10, mood: null, themes: null, difficulty: null, hook: null,
    cover: null, summary: null, subjects: [], bookshelves: [],
    url: 'https://www.gutenberg.org/ebooks/1', ...over };
}

describe('era', () => {
  it('buckets years', () => {
    expect(era(1750)).toBe('Before 1800');
    expect(era(1850)).toBe('19th century');
    expect(era(1900)).toBe('20th century');
    expect(era(null)).toBeNull();
  });
});

describe('applyFilters', () => {
  const books = [
    mk({ id: 1, mood: 'dark', themes: ['obsession'], difficulty: 'hard' }),
    mk({ id: 2, mood: 'witty', themes: ['marriage'], lang: 'fr', year: 1750 }),
  ];
  it('empty filters keep everything', () => {
    expect(applyFilters(books, EMPTY_FILTERS)).toHaveLength(2);
  });
  it('filters by mood, theme, era together', () => {
    const hits = applyFilters(books, { ...EMPTY_FILTERS, mood: 'dark', theme: 'obsession', era: '19th century' });
    expect(hits.map((b) => b.id)).toEqual([1]);
  });
  it('handles null tag fields', () => {
    expect(applyFilters([mk({ mood: null })], { ...EMPTY_FILTERS, mood: 'dark' })).toHaveLength(0);
  });
});

describe('facetOptions', () => {
  it('sorts by frequency then alphabetically and respects limit', () => {
    const books = [mk({ mood: 'dark' }), mk({ mood: 'dark' }), mk({ mood: 'witty' }), mk({ mood: null })];
    expect(facetOptions(books, (b) => [b.mood])).toEqual(['dark', 'witty']);
    expect(facetOptions(books, (b) => [b.mood], 1)).toEqual(['dark']);
  });
});

describe('sortBooks', () => {
  const books = [mk({ id: 1, title: 'B', downloads: 5 }), mk({ id: 2, title: 'A', downloads: 9 })];
  it('sorts by downloads desc', () => {
    expect(sortBooks(books, 'downloads')[0].id).toBe(2);
  });
  it('sorts by title asc without mutating input', () => {
    expect(sortBooks(books, 'title')[0].title).toBe('A');
    expect(books[0].title).toBe('B');
  });
});

describe('pickRandom', () => {
  it('returns null on empty and a member otherwise', () => {
    expect(pickRandom([])).toBeNull();
    const books = [mk({ id: 7 })];
    expect(pickRandom(books)!.id).toBe(7);
  });
});
