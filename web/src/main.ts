import './style.css';
import type { Book } from './types';
import { buildIndex, searchBooks } from './search';
import { EMPTY_FILTERS, applyFilters, era, facetOptions, pickRandom,
         shelfLabel, sortBooks, type Filters } from './filters';
import { renderGrid, renderMiniGrid } from './grid';
import { showDetail } from './card';
import { loadRecent, pushRecent } from './recent';
import { booksByAuthor, similarBooks } from './similar';
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

const FILTER_LABELS: Partial<Record<keyof Filters, string>> = {
  bookshelf: 'Category', author: 'Author', subject: 'Subject', theme: 'Theme',
};

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

  const popular = sortBooks(books, 'downloads').slice(0, 8);
  const byId = new Map(books.map((b) => [b.id, b]));
  const index = buildIndex(books);
  const filters: Filters = { ...EMPTY_FILTERS };
  const initial = readState();
  let query = initial.query ?? '';
  let sort: Sort = initial.sort ?? 'downloads';
  if (initial.filters) Object.assign(filters, initial.filters);

  let openBookId: number | null = initial.bookId ?? null;
  let lastFocused: HTMLElement | null = null;
  let fromHistory = false;
  let detailPushedHistory = false;

  const searchInput = document.getElementById('search') as HTMLInputElement;
  const sortSelect = document.getElementById('f-sort') as HTMLSelectElement;
  const recentShelf = document.getElementById('recent-shelf')!;
  const recentLabel = document.getElementById('recent-label')!;
  const popularShelf = document.getElementById('popular-shelf')!;
  const popularLabel = document.getElementById('popular-label')!;
  const categoryShelf = document.getElementById('category-shelf')!;
  const activeFilters = document.getElementById('active-filters')!;
  const emptyEl = document.getElementById('empty')!;
  const emptyHint = document.getElementById('empty-hint')!;
  const emptyPopularGrid = document.getElementById('empty-popular-grid')!;
  const grid = document.getElementById('grid')!;
  const bookshelfSelect = document.getElementById('f-bookshelf') as HTMLSelectElement;

  searchInput.value = query;
  sortSelect.value = sort;
  for (const f of FACETS) {
    const v = filters[f.key];
    if (v) (document.getElementById(f.id) as HTMLSelectElement).value = v;
  }

  const syncUrl = (push = false) => {
    writeState({ query, sort, filters, bookId: openBookId }, push);
  };

  const closeDetail = () => {
    if (fromHistory) return;
    if (openBookId == null) return;
    if (detailPushedHistory) history.back();
    else {
      dismissDetail();
      syncUrl(false);
    }
  };

  const dismissDetail = () => {
    openBookId = null;
    detailPushedHistory = false;
    showDetail(null, { returnFocus: lastFocused });
    setPageMeta(null);
  };

  const presentDetail = (b: Book, focusEl?: HTMLElement | null) => {
    lastFocused = focusEl ?? (document.activeElement as HTMLElement | null);
    openBookId = b.id;
    pushRecent(b.id);
    renderRecentShelf();
    setPageMeta(b);
    showDetail(b, {
      similar: similarBooks(b, books),
      byAuthor: booksByAuthor(b, books),
      returnFocus: lastFocused,
      onClose: closeDetail,
      onPick: (next) => openDetail(next),
      onFilterAuthor: (author) => {
        dismissDetail();
        filters.author = author;
        (document.getElementById('f-author') as HTMLSelectElement).value = author;
        update();
      },
    });
  };

  const openDetail = (b: Book, focusEl?: HTMLElement | null) => {
    presentDetail(b, focusEl);
    if (!fromHistory) {
      syncUrl(true);
      detailPushedHistory = true;
    }
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

  const hasActiveFilters = () => Object.values(filters).some(Boolean);

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

  const renderPopularShelf = () => {
    const browse = !query.trim() && !hasActiveFilters();
    popularShelf.hidden = !browse;
    popularLabel.hidden = !browse;
    if (!browse) return;
    popularShelf.replaceChildren(
      ...popular.map((b) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'mood-chip recent-chip';
        chip.textContent = b.title;
        chip.title = `${b.title} — ${b.downloads.toLocaleString()} downloads`;
        chip.addEventListener('click', () => openDetail(b));
        return chip;
      }));
  };

  const syncCategoryShelf = () => {
    for (const chip of categoryShelf.children) {
      const val = chip.getAttribute('data-value');
      chip.setAttribute('aria-pressed', String(val === filters.bookshelf));
    }
  };

  const renderActiveFilters = () => {
    const active = (Object.keys(filters) as (keyof Filters)[])
      .filter((k) => filters[k])
      .map((k) => ({ key: k, value: filters[k]! }));
    activeFilters.hidden = active.length === 0;
    activeFilters.replaceChildren(
      ...active.map(({ key, value }) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'mood-chip filter-chip';
        const label = FILTER_LABELS[key] ?? key;
        const text = key === 'bookshelf' ? shelfLabel(value) : value;
        chip.textContent = `${label}: ${text} ×`;
        chip.addEventListener('click', () => {
          filters[key] = null;
          (document.getElementById(
            FACETS.find((f) => f.key === key)!.id) as HTMLSelectElement).value = '';
          update();
        });
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
    if (openBookId != null) dismissDetail();
    else setPageMeta(null);
    update();
  };

  const applyFromUrl = () => {
    fromHistory = true;
    const s = readState();
    query = s.query ?? '';
    sort = s.sort ?? 'downloads';
    Object.assign(filters, EMPTY_FILTERS);
    if (s.filters) Object.assign(filters, s.filters);
    searchInput.value = query;
    sortSelect.value = sort;
    for (const f of FACETS)
      (document.getElementById(f.id) as HTMLSelectElement).value = filters[f.key] ?? '';

    const id = s.bookId ?? null;
    if (id && byId.has(id)) {
      if (openBookId !== id) presentDetail(byId.get(id)!);
    } else if (openBookId != null) dismissDetail();

    refresh(false);
    fromHistory = false;
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

  const refresh = (sync = true) => {
    const shown = visible();
    const hasQuery = !!query.trim();
    const filtered = hasActiveFilters();

    if (shown.length === 0) {
      emptyEl.hidden = false;
      grid.hidden = true;
      const msg = document.getElementById('empty-msg')!;
      if (hasQuery && filtered)
        msg.textContent = 'No books match your search and filters.';
      else if (hasQuery)
        msg.textContent = 'No books match your search.';
      else if (filtered)
        msg.textContent = 'No books match your filters.';
      else msg.textContent = 'No books found.';
      emptyHint.hidden = false;
      emptyPopularGrid.hidden = false;
      renderMiniGrid(popular.slice(0, 6), (b, el) => openDetail(b, el));
    } else {
      emptyEl.hidden = true;
      grid.hidden = false;
      emptyHint.hidden = true;
      emptyPopularGrid.hidden = true;
      renderGrid(shown, (b, el) => openDetail(b, el));
    }

    const active = Object.values(filters).filter(Boolean).length;
    badge.hidden = active === 0;
    badge.textContent = String(active);
    apply.textContent = `Show ${shown.length.toLocaleString()} book${shown.length === 1 ? '' : 's'}`;
    syncMoodShelf();
    syncCategoryShelf();
    renderActiveFilters();
    renderPopularShelf();
    if (sync) syncUrl(false);
  };

  const update = () => refresh(true);

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

  categoryShelf.replaceChildren(
    ...facetOptions(books, (b) => b.bookshelves, 8).map((cat) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'mood-chip';
      chip.textContent = shelfLabel(cat);
      chip.setAttribute('data-value', cat);
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        filters.bookshelf = filters.bookshelf === cat ? null : cat;
        bookshelfSelect.value = filters.bookshelf ?? '';
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
  document.getElementById('empty-popular')!.addEventListener('click', resetAll);

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
    if (!document.getElementById('detail-backdrop')!.hidden) closeDetail();
    else setFiltersOpen(false);
  });

  window.addEventListener('popstate', applyFromUrl);

  renderRecentShelf();
  setPageMeta(null);
  refresh(false);

  if (openBookId != null) {
    fromHistory = true;
    const b = byId.get(openBookId);
    if (b) presentDetail(b);
    fromHistory = false;
    syncUrl(false);
  }
}
init();
