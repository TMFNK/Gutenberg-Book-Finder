import MiniSearch from 'minisearch';
import type { Book } from './types';

const FIELDS = ['title', 'author', 'subjects', 'themes', 'summary', 'hook'];

export function buildIndex(books: Book[]): MiniSearch {
  const index = new MiniSearch({
    fields: FIELDS,
    extractField: (doc, field) => {
      const v = (doc as unknown as Record<string, unknown>)[field];
      return Array.isArray(v) ? v.join(' ') : ((v as string) ?? '');
    },
  });
  index.addAll(books);
  return index;
}

export function searchBooks(index: MiniSearch, books: Book[],
                            query: string): Book[] {
  const byId = new Map(books.map((b) => [b.id, b]));
  return index.search(query, { prefix: true, fuzzy: 0.2 })
    .sort((a, z) => z.score - a.score || byId.get(z.id as number)!.downloads
      - byId.get(a.id as number)!.downloads)
    .map((r) => byId.get(r.id as number))
    .filter((b): b is Book => b !== undefined);
}
