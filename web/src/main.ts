import './style.css';
import type { Book } from './types';
import { buildIndex, searchBooks } from './search';
import { EMPTY_FILTERS, applyFilters, era, facetOptions, pickRandom,
         sortBooks, type Filters } from './filters';
import { renderGrid } from './grid';
import { showDetail } from './card';

interface Facet {
  id: string;
  key: keyof Filters;
  get: (b: Book) => (string | null)[];
  limit?: number;
}

const FACETS: Facet[] = [
  { id: 'f-mood', key: 'mood', get: (b) => [b.mood], limit: 30 },
  { id: 'f-difficulty', key: 'difficulty', get: (b) => [b.difficulty] },
  { id: 'f-theme', key: 'theme', get: (b) => b.themes ?? [], limit: 40 },
  { id: 'f-subject', key: 'subject', get: (b) => b.subjects, limit: 40 },
  { id: 'f-lang', key: 'lang', get: (b) => [b.lang] },
  { id: 'f-era', key: 'era', get: (b) => [era(b.year)] },
];

async function init() {
  let books: Book[];
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/books.json`);
    if (!res.ok) throw new Error(String(res.status));
    books = await res.json();
  } catch {
    document.getElementById('error')!.hidden = false;
    return;
  }

  const index = buildIndex(books);
  const filters: Filters = { ...EMPTY_FILTERS };
  let query = '';
  let sort: 'downloads' | 'title' = 'downloads';

  const visible = (): Book[] => {
    const base = query.trim()
      ? searchBooks(index, books, query)
      : sortBooks(books, sort);
    return applyFilters(base, filters);
  };
  const update = () => renderGrid(visible(), showDetail);

  for (const f of FACETS) {
    const select = document.getElementById(f.id) as HTMLSelectElement;
    select.replaceChildren(new Option('Any', ''),
      ...facetOptions(books, f.get, f.limit).map((v) => new Option(v, v)));
    select.addEventListener('change', () => {
      filters[f.key] = select.value || null;
      update();
    });
  }
  (document.getElementById('f-sort') as HTMLSelectElement)
    .addEventListener('change', (e) => {
      sort = (e.target as HTMLSelectElement).value as 'downloads' | 'title';
      update();
    });
  document.getElementById('search')!.addEventListener('input', (e) => {
    query = (e.target as HTMLInputElement).value;
    update();
  });
  document.getElementById('clear')!.addEventListener('click', () => {
    Object.assign(filters, EMPTY_FILTERS);
    for (const f of FACETS)
      (document.getElementById(f.id) as HTMLSelectElement).value = '';
    update();
  });
  document.getElementById('surprise')!.addEventListener('click', () => {
    const b = pickRandom(applyFilters(books, filters));
    if (b) showDetail(b);
  });
  update();
}
init();
