import './style.css';
import type { Book } from './types';
import { buildIndex, searchBooks } from './search';
import { EMPTY_FILTERS, applyFilters, era, facetOptions, pickRandom,
         shelfLabel, sortBooks, type Filters } from './filters';
import { renderGrid } from './grid';
import { showDetail } from './card';
import { loadRecent, pushRecent } from './recent';
import { similarBooks } from './similar';
import { readState, writeState, type Sort } from './url';
import { setPageMeta } from './meta';

interface Facet {
  id: string;
  key: keyof Filters;
  get: (b: Book) => (string | null)[];
  label?: (v: string) => string;
  limit?: number;
}

const FACETS: Facet[] = [
  { id: 'f-mood', key: 'mood', get: (b) => [b.mood], limit: 30 },
  { id: 'f-difficulty', key: 'difficulty', get: (b) => [b.difficulty] },
  { id: 'f-theme', key: 'theme', get: (b) => b.themes ?? [], limit: 40 },
  { id: 'f-subject', key: 'subject', get: (b) => b.subjects, limit: 40 },
  { id: 'f-bookshelf', key: 'bookshelf', get: (b) => b.bookshelves,
    label: shelfLabel, limit: 40 },
  { id: 'f-author', key: 'author', get: (b) => [b.author], limit: 50 },
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

  const byId = new Map(books.map((b) => [b.id, b]));
  const index = buildIndex(books);
  const filters: Filters = { ...EMPTY_FILTERS };
  const initial = readState();
  let query = initial.query ?? '';
  let sort: Sort = initial.sort ?? 'downloads';
  if (initial.filters) Object.assign(filters, initial.filters);

  let openBookId: number | null = initial.bookId ?? null;
  let lastFocused: HTMLElement | null = null;

  const searchInput = document.getElementById('search') as HTMLInputElement;
  const sortSelect = document.getElementById('f-sort') as HTMLSelectElement;
  const recentShelf = document.getElementById('recent-shelf')!;
  const recentLabel = document.getElementById('recent-label')!;
  const emptyEl = document.getElementById('empty')!;
  const grid = document.getElementById('grid')!;

  searchInput.value = query;
  sortSelect.value = sort;
  for (const f of FACETS) {
    const v = filters[f.key];
    if (v) (document.getElementById(f.id) as HTMLSelectElement).value = v;
  }

  const syncUrl = () => {
    writeState({ query, sort, filters, bookId: openBookId });
  };

  const openDetail = (b: Book, focusEl?: HTMLElement | null) => {
    lastFocused = focusEl ?? (document.activeElement as HTMLElement | null);
    openBookId = b.id;
    pushRecent(b.id);
    renderRecentShelf();
    setPageMeta(b);
    syncUrl();
    showDetail(b, {
      similar: similarBooks(b, books),
      returnFocus: lastFocused,
      onClose: () => {
        openBookId = null;
        setPageMeta(null);
        syncUrl();
      },
      onPick: (next) => openDetail(next),
      onFilterAuthor: (author) => {
        showDetail(null);
        openBookId = null;
        filters.author = author;
        (document.getElementById('f-author') as HTMLSelectElement).value = author;
        update();
      },
    });
  };

  const visible = (): Book[] => {
    let base: Book[];
    if (query.trim()) {
      base = searchBooks(index, books, query);
      if (sort === 'downloads') base = sortBooks(base, 'downloads');
      else if (sort === 'title') base = sortBooks(base, 'title');
    } else {
      base = sortBooks(books, sort === 'title' ? 'title' : 'downloads');
    }
    return applyFilters(base, filters);
  };

  const renderRecentShelf = () => {
    const recent = loadRecent()
      .map((id) => byId.get(id))
      .filter((b): b is Book => b !== undefined);
    const show = recent.length > 0;
    recentShelf.hidden = !show;
    recentLabel.hidden = !show;
    recentShelf.replaceChildren(
      ...recent.map((b) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'mood-chip recent-chip';
        chip.textContent = b.title;
        chip.title = b.title;
        chip.addEventListener('click', () => openDetail(b));
        return chip;
      }));
  };

  const resetAll = () => {
    query = '';
    sort = 'downloads';
    searchInput.value = '';
    sortSelect.value = sort;
    Object.assign(filters, EMPTY_FILTERS);
    for (const f of FACETS)
      (document.getElementById(f.id) as HTMLSelectElement).value = '';
    showDetail(null);
    openBookId = null;
    setPageMeta(null);
    update();
  };

  const badge = document.getElementById('filter-count')!;
  const apply = document.getElementById('apply')!;
  const moodSelect = document.getElementById('f-mood') as HTMLSelectElement;
  const moodShelf = document.getElementById('mood-shelf')!;

  const syncMoodShelf = () => {
    for (const chip of moodShelf.children)
      chip.setAttribute('aria-pressed',
        String(chip.textContent === filters.mood));
  };

  const update = () => {
    const shown = visible();
    const hasQuery = !!query.trim();
    const hasFilters = Object.values(filters).some(Boolean);

    if (shown.length === 0) {
      emptyEl.hidden = false;
      grid.hidden = true;
      const msg = document.getElementById('empty-msg')!;
      if (hasQuery && hasFilters)
        msg.textContent = 'No books match your search and filters.';
      else if (hasQuery)
        msg.textContent = 'No books match your search.';
      else if (hasFilters)
        msg.textContent = 'No books match your filters.';
      else msg.textContent = 'No books found.';
    } else {
      emptyEl.hidden = true;
      grid.hidden = false;
      renderGrid(shown, (b, el) => openDetail(b, el));
    }

    const active = Object.values(filters).filter(Boolean).length;
    badge.hidden = active === 0;
    badge.textContent = String(active);
    apply.textContent = `Show ${shown.length.toLocaleString()} book${shown.length === 1 ? '' : 's'}`;
    syncMoodShelf();
    syncUrl();
  };

  moodShelf.replaceChildren(
    ...facetOptions(books, (b) => [b.mood], 8).map((m) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'mood-chip';
      chip.textContent = m;
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        filters.mood = filters.mood === m ? null : m;
        moodSelect.value = filters.mood ?? '';
        update();
      });
      return chip;
    }));

  for (const f of FACETS) {
    const select = document.getElementById(f.id) as HTMLSelectElement;
    select.replaceChildren(new Option('Any', ''),
      ...facetOptions(books, f.get, f.limit).map((v) =>
        new Option(f.label ? f.label(v) : v, v)));
    select.addEventListener('change', () => {
      filters[f.key] = select.value || null;
      update();
    });
  }

  sortSelect.addEventListener('change', (e) => {
    sort = (e.target as HTMLSelectElement).value as Sort;
    update();
  });

  searchInput.addEventListener('input', (e) => {
    const v = (e.target as HTMLInputElement).value;
    const hadQuery = !!query.trim();
    query = v;
    const hasQuery = !!query.trim();
    if (hasQuery && !hadQuery && sort === 'downloads') {
      sort = 'relevance';
      sortSelect.value = sort;
    } else if (!hasQuery && hadQuery && sort === 'relevance') {
      sort = 'downloads';
      sortSelect.value = sort;
    }
    update();
  });

  document.getElementById('clear')!.addEventListener('click', resetAll);
  document.getElementById('empty-reset')!.addEventListener('click', resetAll);
  document.getElementById('empty-popular')!.addEventListener('click', () => {
    resetAll();
    sortBooks(books, 'downloads').slice(0, 12);
    update();
  });

  document.getElementById('surprise')!.addEventListener('click', () => {
    const b = pickRandom(applyFilters(books, filters));
    if (b) openDetail(b);
  });

  const toggle = document.getElementById('filters-toggle')!;
  const sheetBackdrop = document.getElementById('sheet-backdrop')!;
  const setFiltersOpen = (open: boolean) => {
    document.body.classList.toggle('filters-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    sheetBackdrop.hidden = !open;
  };
  toggle.addEventListener('click',
    () => setFiltersOpen(!document.body.classList.contains('filters-open')));
  apply.addEventListener('click', () => setFiltersOpen(false));
  sheetBackdrop.addEventListener('click', () => setFiltersOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('detail-backdrop')!.hidden) {
      showDetail(null, {
        returnFocus: lastFocused,
        onClose: () => {
          openBookId = null;
          setPageMeta(null);
          syncUrl();
        },
      });
    } else setFiltersOpen(false);
  });

  renderRecentShelf();
  setPageMeta(null);
  update();

  if (openBookId != null) {
    const b = byId.get(openBookId);
    if (b) openDetail(b);
  }
}
init();
