import { describe, expect, it } from 'vitest';
import { buildIndex, searchBooks } from './search';
import type { Book } from './types';

function mk(over: Partial<Book>): Book {
  return { id: 1, title: 'T', author: 'A', year: 1850, lang: 'en',
    downloads: 10, mood: null, themes: null, difficulty: null, hook: null,
    cover: null, summary: null, subjects: [], bookshelves: [],
    url: 'https://www.gutenberg.org/ebooks/1', ...over };
}

const books = [
  mk({ id: 1, title: 'Moby Dick', author: 'Melville, Herman',
       subjects: ['Whaling -- Fiction'], themes: ['obsession'] }),
  mk({ id: 2, title: 'Pride and Prejudice', author: 'Austen, Jane',
       summary: 'Marriage and manners in Regency England.' }),
];

describe('searchBooks', () => {
  const index = buildIndex(books);
  it('finds by title with fuzzy match', () => {
    expect(searchBooks(index, books, 'moby dik')[0].id).toBe(1);
  });
  it('finds by author prefix', () => {
    expect(searchBooks(index, books, 'aust')[0].id).toBe(2);
  });
  it('finds by array fields (subjects, themes)', () => {
    expect(searchBooks(index, books, 'whaling')[0].id).toBe(1);
  });
  it('finds by summary', () => {
    expect(searchBooks(index, books, 'regency')[0].id).toBe(2);
  });
  it('returns empty for no match', () => {
    expect(searchBooks(index, books, 'zzzzqqq')).toEqual([]);
  });
});
