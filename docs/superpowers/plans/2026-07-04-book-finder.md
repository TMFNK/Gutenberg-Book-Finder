# Gutenberg Book Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the deck.gl galaxy map with a whichbook-inspired static search & browse UI for the 1,000-book dataset, commit the scraped metadata to the repo, and deploy to GitHub Pages.

**Architecture:** The Python export stage is slimmed to emit one `books.json` with catalog + LLM-tag fields (no map coordinates). The frontend stays Vite + vanilla TypeScript: pure logic modules (`filters.ts`, `search.ts` with MiniSearch) tested by vitest, thin DOM modules (`grid.ts`, `card.ts`, `main.ts`). A GitHub Actions workflow builds `web/` and deploys to GitHub Pages.

**Tech Stack:** Python (uv, pytest), TypeScript, Vite 8, MiniSearch 7, vitest, GitHub Actions + Pages.

**Spec:** `docs/superpowers/specs/2026-07-04-book-finder-design.md`

## Global Constraints

- No new scraping and no new LLM calls — all data comes from existing `data/catalog.json` and `data/enrich/`.
- Keep vanilla TypeScript; no UI framework.
- Site must work at `https://tmfnk.github.io/Gutenberg-Book-Finder/` (Vite `base: '/Gutenberg-Book-Finder/'` for builds) and at `/` in local dev.
- Commit to repo: `data/catalog.json`, `data/enrich/`, `data/layout.json`, `web/public/data/*.json`. Keep ignoring `data/excerpts/`, `data/embeddings.npy`, `data/embedding_ids.json`.
- All escaping of book-derived strings into HTML goes through `esc()` from `grid.ts`.
- Pipeline commands run from `pipeline/`; web commands run from `web/`.

---

### Task 1: Slim the export stage and add browse fields

**Files:**
- Modify: `pipeline/src/gutenberg_galaxy/export.py`
- Test: `pipeline/tests/test_export.py`

**Interfaces:**
- Consumes: `load_catalog()` (list of Gutendex book dicts), `load_tags()` (dict keyed by int book id) — both unchanged.
- Produces: `book_row(book: dict, tags: dict | None) -> dict` (note: `pos` and `cluster` params removed) and `run()` writing only `web/public/data/books.json`. Each row: `id:int, title:str, author:str, year:int|None, lang:str, downloads:int, mood:str|None, themes:list[str]|None, difficulty:str|None, hook:str|None, cover:str|None, summary:str|None, subjects:list[str], bookshelves:list[str], url:str`.

- [ ] **Step 1: Rewrite the tests to the new shape**

Replace the entire contents of `pipeline/tests/test_export.py` with:

```python
from gutenberg_galaxy.export import book_row


def test_book_row_shape():
    book = {"id": 2701, "title": "Moby Dick",
            "authors": [{"name": "Melville, Herman", "birth_year": 1819}],
            "languages": ["en"], "download_count": 160099,
            "formats": {"image/jpeg": "https://x.test/pg2701.cover.jpg"},
            "summaries": ["A sailor hunts a whale."],
            "subjects": ["Whaling -- Fiction"],
            "bookshelves": ["Best Books Ever"]}
    row = book_row(book, {"mood": "dark", "themes": ["obsession"],
                          "difficulty": "hard", "hook": "A whale."})
    assert row["author"] == "Melville, Herman"
    assert row["cover"] == "https://x.test/pg2701.cover.jpg"
    assert row["summary"] == "A sailor hunts a whale."
    assert row["subjects"] == ["Whaling -- Fiction"]
    assert row["bookshelves"] == ["Best Books Ever"]
    assert "x" not in row and "y" not in row and "cluster" not in row
    assert row["url"] == "https://www.gutenberg.org/ebooks/2701"


def test_book_row_defaults():
    row = book_row({"id": 1, "title": "T", "authors": [], "languages": [],
                    "download_count": 0}, None)
    assert row["author"] == "Unknown" and row["mood"] is None
    assert row["cover"] is None and row["summary"] is None
    assert row["subjects"] == [] and row["bookshelves"] == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && uv run pytest tests/test_export.py -v`
Expected: FAIL — `book_row() missing 2 required positional arguments` (old signature takes `pos` and `cluster`).

- [ ] **Step 3: Rewrite export.py**

Replace the entire contents of `pipeline/src/gutenberg_galaxy/export.py` with:

```python
import json

from .catalog import load_catalog
from .enrich import load_tags
from .paths import WEB_DATA_DIR


def book_row(book: dict, tags: dict | None) -> dict:
    tags = tags or {}
    authors = book.get("authors") or []
    summaries = book.get("summaries") or []
    return {"id": book["id"], "title": book["title"],
            "author": authors[0]["name"] if authors else "Unknown",
            "year": authors[0].get("birth_year") if authors else None,
            "lang": (book.get("languages") or ["?"])[0],
            "downloads": book.get("download_count", 0),
            "mood": tags.get("mood"), "themes": tags.get("themes"),
            "difficulty": tags.get("difficulty"), "hook": tags.get("hook"),
            "cover": (book.get("formats") or {}).get("image/jpeg"),
            "summary": summaries[0] if summaries else None,
            "subjects": book.get("subjects") or [],
            "bookshelves": book.get("bookshelves") or [],
            "url": f"https://www.gutenberg.org/ebooks/{book['id']}"}


def run() -> None:
    all_tags = load_tags()
    rows = [book_row(b, all_tags.get(b["id"])) for b in load_catalog()]
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    (WEB_DATA_DIR / "books.json").write_text(json.dumps(rows))
    (WEB_DATA_DIR / "clusters.json").unlink(missing_ok=True)
    print(f"exported {len(rows)} books")
```

- [ ] **Step 4: Run the full pipeline test suite**

Run: `cd pipeline && uv run pytest -v`
Expected: all tests PASS (export tests plus untouched catalog/enrich/excerpts tests).

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/gutenberg_galaxy/export.py pipeline/tests/test_export.py
git commit -m "feat: export browse fields (cover, summary, subjects), drop map fields"
```

---

### Task 2: Regenerate data and commit metadata to the repo

**Files:**
- Modify: `.gitignore`
- Create (generated): `web/public/data/books.json`
- Delete: `web/public/data/clusters.json` (removed by the export run)

**Interfaces:**
- Consumes: Task 1's `run()` via the pipeline CLI.
- Produces: tracked `web/public/data/books.json` (the file the frontend fetches), tracked `data/catalog.json`, `data/enrich/`, `data/layout.json`.

- [ ] **Step 1: Regenerate the export**

Run: `cd pipeline && uv run python -m gutenberg_galaxy export`
Expected: `exported 1000 books`. Verify: `ls web/public/data/` shows only `books.json` (clusters.json deleted).

- [ ] **Step 2: Spot-check the new fields**

Run: `python3 -c "import json; b=json.load(open('web/public/data/books.json'))[0]; print(b['cover'], b['subjects'][:1], b['summary'][:60])"`
Expected: a gutenberg.org cover URL, a subject list, summary text.

- [ ] **Step 3: Update .gitignore**

Replace the entire contents of `.gitignore` with:

```
data/*
!data/catalog.json
!data/enrich/
!data/layout.json
.env
__pycache__/
.venv/
node_modules/
dist/
```

(Note: `data/*` instead of `data/` — git cannot re-include files whose parent directory is excluded, so the negations require the `*` form. The `web/public/data/` line is removed so exported JSON is tracked.)

- [ ] **Step 4: Verify what git will track**

Run: `git status --short && git check-ignore data/excerpts data/embeddings.npy`
Expected: `data/catalog.json`, `data/enrich/`, `data/layout.json`, `web/public/data/books.json` show as untracked; `check-ignore` prints both excluded paths.

- [ ] **Step 5: Commit**

```bash
git add .gitignore data/catalog.json data/enrich data/layout.json web/public/data/books.json
git commit -m "chore: commit scraped metadata and exported book data"
```

---

### Task 3: Frontend logic layer — types, filters, MiniSearch

**Files:**
- Modify: `web/package.json` (deps), `web/src/types.ts`, `web/src/search.ts`
- Create: `web/src/filters.ts`, `web/src/filters.test.ts`, `web/src/search.test.ts`
- Delete: `web/src/map.ts`

**Interfaces:**
- Consumes: `Book` rows as exported by Task 1.
- Produces (used by Task 4):
  - `types.ts`: `interface Book` (fields exactly as in Task 1's row; `Cluster` interface deleted).
  - `filters.ts`: `interface Filters { mood, difficulty, theme, subject, lang, era: string | null }`, `EMPTY_FILTERS: Filters`, `era(year: number | null): string | null`, `facetOptions(books: Book[], get: (b: Book) => (string | null)[], limit?: number): string[]`, `applyFilters(books: Book[], f: Filters): Book[]`, `sortBooks(books: Book[], sort: 'downloads' | 'title'): Book[]`, `pickRandom(books: Book[]): Book | null`.
  - `search.ts`: `buildIndex(books: Book[]): MiniSearch`, `searchBooks(index: MiniSearch, books: Book[], query: string): Book[]` (relevance-ranked).

**Note:** `npm run build` is expected to be red between this task and Task 4 (main.ts still imports the deleted map). This task's verification is `npm test`.

- [ ] **Step 1: Update dependencies**

In `web/package.json`, delete the `"deck.gl": "^9.3.6"` dependency, add `"minisearch": "^7.2.0"` under `dependencies` and `"vitest": "^3.2.4"` under `devDependencies`, and add `"test": "vitest run"` to `scripts`. Then:

Run: `cd web && npm install`
Expected: install succeeds; deck.gl removed from node_modules.

- [ ] **Step 2: Replace types.ts**

Replace the entire contents of `web/src/types.ts` with:

```ts
export interface Book {
  id: number;
  title: string;
  author: string;
  year: number | null;
  lang: string;
  downloads: number;
  mood: string | null;
  themes: string[] | null;
  difficulty: string | null;
  hook: string | null;
  cover: string | null;
  summary: string | null;
  subjects: string[];
  bookshelves: string[];
  url: string;
}
```

- [ ] **Step 3: Delete the map**

Run: `git rm web/src/map.ts`

- [ ] **Step 4: Write failing filter tests**

Create `web/src/filters.test.ts`:

```ts
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
```

Run: `cd web && npm test`
Expected: FAIL — `Cannot find module './filters'`.

- [ ] **Step 5: Implement filters.ts**

Create `web/src/filters.ts`:

```ts
import type { Book } from './types';

export interface Filters {
  mood: string | null;
  difficulty: string | null;
  theme: string | null;
  subject: string | null;
  lang: string | null;
  era: string | null;
}

export const EMPTY_FILTERS: Filters = {
  mood: null, difficulty: null, theme: null,
  subject: null, lang: null, era: null,
};

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
    (!f.lang || b.lang === f.lang) &&
    (!f.era || era(b.year) === f.era));
}

export function sortBooks(books: Book[], sort: 'downloads' | 'title'): Book[] {
  const copy = [...books];
  if (sort === 'title') copy.sort((a, z) => a.title.localeCompare(z.title));
  else copy.sort((a, z) => z.downloads - a.downloads);
  return copy;
}

export function pickRandom(books: Book[]): Book | null {
  return books.length ? books[Math.floor(Math.random() * books.length)] : null;
}
```

Run: `cd web && npm test`
Expected: filters tests PASS (search.test.ts doesn't exist yet).

- [ ] **Step 6: Write failing search tests**

Create `web/src/search.test.ts`:

```ts
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
```

Run: `cd web && npm test`
Expected: FAIL — search.ts still exports the old deck.gl `wireSearch`.

- [ ] **Step 7: Rewrite search.ts**

Replace the entire contents of `web/src/search.ts` with:

```ts
import MiniSearch from 'minisearch';
import type { Book } from './types';

const FIELDS = ['title', 'author', 'subjects', 'themes', 'summary'];

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
    .map((r) => byId.get(r.id as number))
    .filter((b): b is Book => b !== undefined);
}
```

- [ ] **Step 8: Run all web tests**

Run: `cd web && npm test`
Expected: all filters + search tests PASS.

- [ ] **Step 9: Commit**

```bash
git add web/package.json web/package-lock.json web/src/types.ts web/src/filters.ts web/src/filters.test.ts web/src/search.ts web/src/search.test.ts
git commit -m "feat: filter/search logic layer with MiniSearch, drop deck.gl"
```

(The `git rm web/src/map.ts` from Step 3 is already staged and lands in this commit.)

---

### Task 4: Browse UI — layout, card grid, detail panel

**Files:**
- Modify: `web/index.html`, `web/src/main.ts`, `web/src/card.ts`
- Create: `web/src/style.css`, `web/src/grid.ts`

**Interfaces:**
- Consumes: everything in Task 3's "Produces" block.
- Produces: `grid.ts`: `renderGrid(books: Book[], onPick: (b: Book) => void): void`, `esc(s: string): string`. `card.ts`: `showDetail(b: Book | null): void`.

- [ ] **Step 1: Replace index.html**

Replace the entire contents of `web/index.html` with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Gutenberg Book Finder</title>
  </head>
  <body>
    <header>
      <h1>Gutenberg Book Finder</h1>
      <p class="tagline">Find your next free book among Project Gutenberg&rsquo;s 1,000 most loved.</p>
      <div class="controls">
        <input id="search" type="search" placeholder="Search title, author, subject&hellip;" />
        <button id="surprise" type="button">Surprise me</button>
      </div>
    </header>
    <div class="layout">
      <aside id="filters">
        <label>Mood <select id="f-mood"></select></label>
        <label>Difficulty <select id="f-difficulty"></select></label>
        <label>Theme <select id="f-theme"></select></label>
        <label>Subject <select id="f-subject"></select></label>
        <label>Language <select id="f-lang"></select></label>
        <label>Era <select id="f-era"></select></label>
        <label>Sort by
          <select id="f-sort">
            <option value="downloads">Most downloaded</option>
            <option value="title">Title A&ndash;Z</option>
          </select>
        </label>
        <button id="clear" type="button">Clear filters</button>
      </aside>
      <main>
        <p id="count"></p>
        <div id="grid"></div>
        <p id="error" hidden>Could not load the book data. Please try again later.</p>
      </main>
    </div>
    <div id="detail-backdrop" hidden><div id="detail"></div></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Create style.css**

Create `web/src/style.css`:

```css
:root {
  --bg: #0a0a14;
  --panel: #141428;
  --border: #333;
  --text: #e8e6df;
  --muted: #a5a294;
  --accent: #8ab4f8;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: Georgia, serif;
}
header { padding: 24px 24px 12px; }
h1 { font-size: 26px; margin: 0; }
.tagline { margin: 4px 0 16px; color: var(--muted); }
.controls { display: flex; gap: 10px; flex-wrap: wrap; }
#search {
  flex: 1; min-width: 220px; max-width: 480px;
  padding: 10px 14px; font: inherit;
  background: var(--panel); color: inherit;
  border: 1px solid var(--border); border-radius: 8px;
}
button {
  padding: 10px 14px; font: inherit; cursor: pointer;
  background: var(--panel); color: var(--accent);
  border: 1px solid var(--border); border-radius: 8px;
}
button:hover { border-color: var(--accent); }
.layout { display: flex; gap: 24px; padding: 0 24px 24px; align-items: flex-start; }
#filters {
  position: sticky; top: 16px;
  display: flex; flex-direction: column; gap: 12px;
  width: 220px; flex-shrink: 0;
  background: var(--panel); border: 1px solid var(--border);
  border-radius: 10px; padding: 16px;
}
#filters label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--muted); }
#filters select {
  font: inherit; color: var(--text); background: var(--bg);
  border: 1px solid var(--border); border-radius: 6px; padding: 6px;
}
main { flex: 1; }
#count { margin: 0 0 12px; color: var(--muted); }
#grid {
  display: grid; gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
}
.book-card {
  background: var(--panel); border: 1px solid var(--border);
  border-radius: 10px; overflow: hidden; cursor: pointer;
}
.book-card:hover, .book-card:focus { border-color: var(--accent); outline: none; }
.cover-wrap { position: relative; aspect-ratio: 2 / 3; background: #1d1d33; }
.cover-wrap img.cover {
  position: absolute; inset: 0; z-index: 1;
  width: 100%; height: 100%; object-fit: cover;
}
.cover-fallback {
  position: absolute; inset: 0; display: flex;
  align-items: center; justify-content: center; text-align: center;
  padding: 12px; color: var(--muted); font-style: italic;
}
.card-body { padding: 12px; }
.card-body h2 { font-size: 15px; margin: 0 0 2px; }
.author { margin: 0 0 6px; font-size: 13px; color: var(--muted); }
.chip {
  display: inline-block; margin: 0 4px 4px 0; padding: 2px 8px;
  font-size: 11px; border: 1px solid var(--border);
  border-radius: 999px; color: var(--accent);
}
.hook { margin: 6px 0 0; font-size: 13px; font-style: italic; color: var(--muted); }
#detail-backdrop {
  position: fixed; inset: 0; z-index: 20;
  background: rgba(5, 5, 12, 0.75);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
#detail {
  position: relative; max-width: 640px; max-height: 85vh; overflow-y: auto;
  background: var(--panel); border: 1px solid var(--border);
  border-radius: 12px; padding: 24px;
}
#detail .close {
  position: absolute; top: 10px; right: 10px;
  padding: 2px 10px; font-size: 18px; border-radius: 6px;
}
.detail-grid { display: flex; gap: 20px; }
.detail-cover { width: 180px; height: auto; align-self: flex-start; border-radius: 6px; }
.summary { font-size: 14px; line-height: 1.5; }
.downloads { font-size: 12px; color: var(--muted); }
a.read { color: var(--accent); }
#error { color: #f28b82; }
@media (max-width: 720px) {
  .layout { flex-direction: column; }
  #filters { position: static; width: 100%; }
  .detail-grid { flex-direction: column; }
  .detail-cover { width: 140px; }
}
```

- [ ] **Step 3: Create grid.ts**

Create `web/src/grid.ts`:

```ts
import type { Book } from './types';

export function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function bookCard(b: Book, onPick: (b: Book) => void): HTMLElement {
  const card = document.createElement('article');
  card.className = 'book-card';
  card.tabIndex = 0;
  card.innerHTML = `
    <div class="cover-wrap">
      <div class="cover-fallback">${esc(b.title)}</div>
      ${b.cover ? `<img class="cover" loading="lazy" src="${esc(b.cover)}" alt="">` : ''}
    </div>
    <div class="card-body">
      <h2>${esc(b.title)}</h2>
      <p class="author">${esc(b.author)}</p>
      ${b.mood ? `<span class="chip">${esc(b.mood)}</span>` : ''}
      ${b.hook ? `<p class="hook">${esc(b.hook)}</p>` : ''}
    </div>`;
  const img = card.querySelector('img.cover');
  img?.addEventListener('error', () => img.remove());
  card.addEventListener('click', () => onPick(b));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onPick(b);
  });
  return card;
}

export function renderGrid(books: Book[], onPick: (b: Book) => void): void {
  const grid = document.getElementById('grid')!;
  const count = document.getElementById('count')!;
  count.textContent = `${books.length} book${books.length === 1 ? '' : 's'}`;
  grid.replaceChildren(...books.map((b) => bookCard(b, onPick)));
}
```

(The fallback title sits under the cover image; if the image 404s it is removed and the fallback shows through.)

- [ ] **Step 4: Rewrite card.ts as the detail panel**

Replace the entire contents of `web/src/card.ts` with:

```ts
import type { Book } from './types';
import { esc } from './grid';

export function showDetail(b: Book | null): void {
  const backdrop = document.getElementById('detail-backdrop')!;
  const panel = document.getElementById('detail')!;
  if (!b) { backdrop.hidden = true; return; }
  backdrop.hidden = false;
  panel.innerHTML = `
    <button class="close" aria-label="Close">&times;</button>
    <div class="detail-grid">
      ${b.cover ? `<img class="detail-cover" src="${esc(b.cover)}" alt="">` : ''}
      <div>
        <h2>${esc(b.title)}</h2>
        <p class="author">${esc(b.author)}${b.lang !== 'en' ? ' &middot; ' + esc(b.lang) : ''}</p>
        ${b.hook ? `<p class="hook">${esc(b.hook)}</p>` : ''}
        <p>
          ${b.mood ? `<span class="chip">${esc(b.mood)}</span>` : ''}
          ${(b.themes ?? []).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}
          ${b.difficulty ? `<span class="chip">${esc(b.difficulty)}</span>` : ''}
        </p>
        ${b.summary ? `<p class="summary">${esc(b.summary)}</p>` : ''}
        <p class="downloads">${b.downloads.toLocaleString()} downloads</p>
        <a class="read" href="${esc(b.url)}" target="_blank" rel="noopener">Read free at Project Gutenberg &rarr;</a>
      </div>
    </div>`;
  panel.querySelector('.close')!.addEventListener('click', () => showDetail(null));
  backdrop.onclick = (e) => { if (e.target === backdrop) showDetail(null); };
}
```

- [ ] **Step 5: Rewrite main.ts**

Replace the entire contents of `web/src/main.ts` with:

```ts
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
  { id: 'f-mood', key: 'mood', get: (b) => [b.mood] },
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
```

- [ ] **Step 6: Type-check and build**

Run: `cd web && npm run build`
Expected: `tsc` clean, Vite build succeeds.

- [ ] **Step 7: Verify in the browser preview**

Start the dev server (use the preview tooling / `.claude/launch.json` config, or `npm run dev`). Verify with the preview tools, not by asking the user:
- Snapshot shows the header, filter sidebar, and a populated card grid with a book count of 1,000.
- Typing `moby dik` in search narrows the grid to Moby Dick (fuzzy works).
- Selecting a mood filter narrows the count; Clear filters restores it.
- Clicking a card opens the detail panel with cover, summary, chips, and a gutenberg.org link; the close button dismisses it.
- "Surprise me" opens a detail panel.
- No console errors (ignore individual cover-image 404s, which are handled by the fallback).

- [ ] **Step 8: Commit**

```bash
git add web/index.html web/src/style.css web/src/grid.ts web/src/card.ts web/src/main.ts
git commit -m "feat: whichbook-style browse UI - card grid, filters, detail panel"
```

---

### Task 5: GitHub Pages deployment

**Files:**
- Create: `web/vite.config.ts`, `.github/workflows/deploy.yml`
- Modify: `README.md` (frontend description + live URL)

**Interfaces:**
- Consumes: the buildable `web/` app from Task 4.
- Produces: automated deploy of `web/dist` to GitHub Pages on every push to `main`.

- [ ] **Step 1: Create vite.config.ts**

Create `web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Gutenberg-Book-Finder/' : '/',
}));
```

(Dev stays at `/` so the local preview keeps working; `main.ts` fetches via `import.meta.env.BASE_URL`, which resolves correctly in both.)

- [ ] **Step 2: Verify the base path lands in the build**

Run: `cd web && npm run build && grep -o '/Gutenberg-Book-Finder/assets/[^"]*' dist/index.html | head -1`
Expected: a `/Gutenberg-Book-Finder/assets/index-*.js` path.

- [ ] **Step 3: Create the workflow**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: web/package-lock.json
      - run: npm ci
        working-directory: web
      - run: npm run build
        working-directory: web
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: web/dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Update the README**

In `README.md`: replace the galaxy-map description (lines 1–5 and the frontend paragraph) to describe the book finder, replace the `map.ts`/`search.ts` lines in the project-layout tree with `grid.ts`, `filters.ts`, `search.ts`, `card.ts` one-liners, remove the `clusters.json` mention, and add near the top:

```markdown
**Live site:** https://tmfnk.github.io/Gutenberg-Book-Finder/
```

- [ ] **Step 5: Commit and push**

```bash
git add web/vite.config.ts .github/workflows/deploy.yml README.md
git commit -m "feat: GitHub Pages deploy workflow"
git push origin main
```

- [ ] **Step 6: Enable Pages and verify the deploy**

GitHub Pages must be set to deploy from Actions once: `gh api -X POST repos/TMFNK/Gutenberg-Book-Finder/pages -f build_type=workflow` (if it errors with "already exists", run `gh api -X PUT repos/TMFNK/Gutenberg-Book-Finder/pages -f build_type=workflow`).

Then: `gh run watch` until the deploy job succeeds, and `curl -sI https://tmfnk.github.io/Gutenberg-Book-Finder/ | head -1`
Expected: `HTTP/2 200`. If the very first request 404s, wait a minute for Pages DNS/CDN and retry once.

---

## Out of scope (per spec)

- Mood sliders, character/plot picker, books-by-place.
- Catalog beyond the 1,000-book M1 dataset.
- Custom domain.
