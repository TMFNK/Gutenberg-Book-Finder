import type { Book } from './types';

export function similarBooks(book: Book, all: Book[], n = 4): Book[] {
  const themes = new Set(book.themes ?? []);
  const subjects = new Set(book.subjects);
  return all
    .filter((b) => b.id !== book.id)
    .map((b) => {
      let score = 0;
      if (book.mood && b.mood === book.mood) score += 3;
      for (const t of b.themes ?? []) if (themes.has(t)) score += 2;
      for (const s of b.subjects) if (subjects.has(s)) score += 1;
      return { b, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, z) => z.score - a.score || z.b.downloads - a.b.downloads)
    .slice(0, n)
    .map((x) => x.b);
}
