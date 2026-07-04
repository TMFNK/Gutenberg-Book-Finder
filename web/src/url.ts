import type { Filters } from './filters';

export type Sort = 'relevance' | 'downloads' | 'title';

const FILTER_KEYS: (keyof Filters)[] = [
  'mood', 'difficulty', 'theme', 'subject', 'bookshelf', 'author', 'lang', 'era',
];

export interface AppState {
  query: string;
  sort: Sort;
  filters: Filters;
  bookId: number | null;
}

export function readState(): Partial<AppState> {
  const p = new URLSearchParams(location.search);
  const sortParam = p.get('sort');
  const q = p.get('q') ?? '';
  let sort: Sort = 'downloads';
  if (sortParam === 'relevance' || sortParam === 'title' || sortParam === 'downloads')
    sort = sortParam;
  else if (q.trim()) sort = 'relevance';
  const filters = {} as Filters;
  for (const k of FILTER_KEYS) {
    const v = p.get(k);
    if (v) filters[k] = v;
  }
  const book = p.get('book');
  return {
    query: q,
    sort,
    filters,
    bookId: book ? Number(book) : null,
  };
}

export function writeState(state: AppState): void {
  const p = new URLSearchParams();
  if (state.query.trim()) p.set('q', state.query.trim());
  if (state.sort !== 'downloads') p.set('sort', state.sort);
  for (const k of FILTER_KEYS) {
    const v = state.filters[k];
    if (v) p.set(k, v);
  }
  if (state.bookId != null) p.set('book', String(state.bookId));
  const qs = p.toString();
  const url = qs ? `?${qs}` : location.pathname;
  history.replaceState(null, '', url);
}
