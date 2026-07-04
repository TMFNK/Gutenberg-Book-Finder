# Gutenberg Galaxy — Design Spec

**Date:** 2026-07-04
**Repo:** https://github.com/TMFNK/Gutenberg-Book-Finder
**Status:** Approved design, pre-implementation
**Purpose:** Interactive semantic map of all ~75,000 Project Gutenberg books. Portfolio / sales material for [mbitai.com](https://www.mbitai.com) — demonstrates "LLM to classify and map data in an interactive way."

## One-liner

A zoomable star-map where every Project Gutenberg book is a star, similar books cluster into LLM-named constellations, and every star links to the free book on gutenberg.org. Fully static site — zero hosting cost, permanent demo link.

## Decisions made (brainstorm 2026-07-04)

| Decision | Choice |
|---|---|
| Data depth | Metadata + first ~2,000 words of each book's text |
| Embeddings | Local sentence-transformers on Mac (MPS), $0. Multilingual model (~15% of PG is non-English) |
| LLM enrichment | OpenRouter: cluster labels + per-book tags. Free tier (batched, ~3 days) or paid `openai/gpt-oss-120b` (~$3–5, one afternoon) — pipeline supports both |
| Frontend | Custom (Vite + TypeScript + deck.gl), not embedding-atlas — distinctive product look for sales material |
| Hosting | GitHub Pages via GitHub Actions, static only |

## Architecture

### 1. Data pipeline (Python, runs once locally, resumable)

Five stages; each caches output to `data/` so any stage re-runs independently:

1. **Catalog** — download PG's official `pg_catalog.csv` (`gutenberg.org/cache/epub/feeds/pg_catalog.csv`): title, author, subjects, bookshelves, language, download counts for all books. Gutendex (self-hosted, free) as fallback/detail source.
2. **Excerpts** — fetch plain text per book via PG rsync mirror (sanctioned bulk route), strip Gutenberg header/footer, keep first ~2,000 words. Cached locally (~few GB). Rate-limited, slowest step (hours, once).
3. **Embeddings** — local sentence-transformers (multilingual, e.g. bge-m3 family) over `title + subjects + excerpt`.
4. **Layout & clusters** — UMAP → 2D positions; HDBSCAN → ~200–400 clusters.
5. **LLM enrichment (OpenRouter)** —
   - (a) Name each cluster from member titles (~300 requests, trivially free).
   - (b) Classify every book: mood, 2–3 themes, difficulty, one-line hook. Batched ~25 books/request, structured JSON. Free tier: 1,000 req/day (requires one-time $10 credit purchase; 50/day otherwise), 20 req/min → ~3 days. Paid gpt-oss-120b: ~$3–5 total.
   - JSON validated per batch, failures retried — bad batches cannot silently corrupt the dataset.

**Output:** compact static files — binary coordinate buffer + sharded JSON for book details, lazy-loaded. Target < ~40MB initial load.

### 2. Frontend (custom, static)

Vite + TypeScript + deck.gl scatterplot. Dark "galaxy" visual identity:

- Zoomed out: glowing point cloud, constellation region labels (LLM cluster names)
- Zoom in: star size/brightness by download count, titles appear
- Click star → book card: author, year, LLM hook line, tags, **"Read free" link to gutenberg.org**
- Client-side search (title/author) that flies the camera to the book
- Filters / color modes: LLM mood, era, language, subject, cluster
- "How this was made" page — the mbitai case study baked into the demo

### 3. Milestones

- **M1:** Pipeline end-to-end on 1,000 most-downloaded books → map renders locally. Proves everything before scale.
- **M2:** Full ~75k run + performance (binary buffers, lazy shards).
- **M3:** Visual polish, search/filters, case-study page, GitHub Pages deploy.

## Risks

- Non-English books (~15%): multilingual embedding model + language filter in UI.
- Free-tier LLM quality varies: per-batch JSON validation + retry.
- Mirror etiquette: rate-limited, cached excerpt download.

## Landscape (researched 2026-07-04)

- No polished public all-of-Gutenberg map exists — real gap.
- Prior art: Apple's open-source [Embedding Atlas](https://arxiv.org/html/2505.06386v1), [Nomic Atlas](https://docs.nomic.ai/atlas) (hosted), Google PAIR [book-viz](https://pair-code.github.io/book-viz/) (within-book structure).
- Inspiration: Sam Greydanus's interactive book map tweet (x.com/samgreydanus/status/2042660030164676896).
- Name is a McLuhan pun: *The Gutenberg Galaxy* (1962).
