import type { Book } from './types';

export interface Filters {
  mood: string | null;
  difficulty: string | null;
  theme: string | null;
  subject: string | null;
  bookshelf: string | null;
  author: string | null;
  lang: string | null;
  era: string | null;
}

export const EMPTY_FILTERS: Filters = {
  mood: null, difficulty: null, theme: null,
  subject: null, bookshelf: null, author: null,
  lang: null, era: null,
};

/** Strip PG "Category: " prefix for display. */
export function shelfLabel(s: string): string {
  return s.startsWith('Category: ') ? s.slice(10) : s;
}

export function era(year: number | null): string | null {
  if (year == null) return null;
  if (year < 1800) return 'Before 1800';
  if (year < 1900) return '19th century';
  return '20th century';
}

export function facetOptions(books: Book[],
                             get: (b: Book) => (string | null)[],
                             limit = Infinity): string[] {
  const counts = new Map<string, number>();
  for (const b of books)
    for (const v of get(b))
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, z) => z[1] - a[1] || a[0].localeCompare(z[0]))
    .slice(0, limit === Infinity ? undefined : limit)
    .map(([v]) => v);
}

export function applyFilters(books: Book[], f: Filters): Book[] {
  return books.filter((b) =>
    (!f.mood || b.mood === f.mood) &&
    (!f.difficulty || b.difficulty === f.difficulty) &&
    (!f.theme || (b.themes ?? []).includes(f.theme)) &&
    (!f.subject || b.subjects.includes(f.subject)) &&
    (!f.bookshelf || b.bookshelves.includes(f.bookshelf)) &&
    (!f.author || b.author === f.author) &&
    (!f.lang || b.lang === f.lang) &&
    (!f.era || era(b.year) === f.era));
}

export function sortBooks(books: Book[],
                          sort: 'downloads' | 'title'): Book[] {
  const copy = [...books];
  if (sort === 'title') copy.sort((a, z) => a.title.localeCompare(z.title));
  else copy.sort((a, z) => z.downloads - a.downloads);
  return copy;
}

export function pickRandom(books: Book[]): Book | null {
  return books.length ? books[Math.floor(Math.random() * books.length)] : null;
}
