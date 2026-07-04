# Gutenberg Book Finder — Design Spec

**Date:** 2026-07-04
**Status:** Approved
**Supersedes:** the galaxy-map frontend described in `docs/design.md` (pipeline stages remain)

## Concept

Replace the deck.gl galaxy map with a whichbook.net-inspired search & browse
interface for the 1,000 most-downloaded Project Gutenberg books. Fully static,
all search/filtering client-side, hosted on GitHub Pages at the default
project URL (`https://tmfnk.github.io/Gutenberg-Book-Finder/`). No custom domain.

## Scope decisions

- **Galaxy map:** removed entirely (deck.gl dependency, `map.ts`).
- **Discovery modes (v1):** classic search + filters only. No mood sliders,
  no character/plot picker, no books-by-place.
- **Catalog size (v1):** the existing 1,000-book M1 dataset.

## Data (pipeline changes)

Extend `export.py`; no new scraping or LLM calls — all fields already exist in
`data/catalog.json` and `data/enrich/`:

- **Add per book:** cover URL (`formats["image/jpeg"]`), official Gutendex
  summary (first entry of `summaries`), `subjects`, `bookshelves`.
- **Remove per book:** `x`, `y`, `cluster` (map-only fields). `clusters.json`
  is no longer exported or consumed.
- **Keep:** id, title, author, year, lang, downloads, mood, themes,
  difficulty, hook, url.

### Metadata committed to the repo

Un-ignore and commit:

- `data/catalog.json` (~2.1 MB)
- `data/enrich/` (~324 KB)
- `data/layout.json` (~40 KB)
- `web/public/data/*.json` (exported frontend data)

Still ignored (bulky, reproducible from the pipeline): `data/excerpts/`,
`data/embeddings.npy`, `data/embedding_ids.json`.

## Frontend (web/ changes)

Keep the Vite + vanilla TypeScript stack. Remove deck.gl.

- **Search:** [MiniSearch](https://github.com/lucaong/minisearch) index over
  title, author, subjects, themes, summary. Instant as-you-type, fuzzy,
  client-side.
- **Filters:** sidebar (collapsible on mobile) — mood, difficulty, themes,
  subject, language, era (derived from year). Sort by relevance (when a
  search query is active) / most downloaded / title.
- **Results:** responsive card grid — cover image, title, author, mood chip,
  hook line. Covers hotlink to gutenberg.org's cache; on image error, show a
  styled placeholder.
- **Detail view:** clicking a card opens a panel (evolved from `card.ts`):
  large cover, summary, all tags, difficulty, "Read free at Project
  Gutenberg" link.
- **Surprise me:** button that picks a random book honoring the active
  filters.

## Deployment

GitHub Actions workflow: on push to `main`, build `web/` with Vite
(`base: '/Gutenberg-Book-Finder/'`) and deploy to GitHub Pages.

## Testing

- **Pipeline:** extend the existing pytest suite to cover the new export
  fields and removed fields.
- **Frontend:** vitest unit tests for filter/search logic (pure functions
  over the book list). Visual behavior verified via local preview.

## Error handling

- Missing/failed cover image → styled placeholder.
- Book missing enrichment fields → card renders without those chips.
- Data fetch failure → visible error message, not a blank page.
