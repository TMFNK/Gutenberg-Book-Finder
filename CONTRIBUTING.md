# Contributing to Gutenberg Book Finder

Thanks for your interest in contributing! 🎉 Whether it's a bug report, a new feature, a design improvement, or a documentation fix; all contributions are welcome.

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Getting started](#getting-started)
  - [Fork & clone](#fork--clone)
  - [Pipeline setup](#pipeline-setup)
  - [Frontend setup](#frontend-setup)
- [Making changes](#making-changes)
  - [Pipeline changes](#pipeline-changes)
  - [Frontend changes](#frontend-changes)
  - [Documentation changes](#documentation-changes)
- [Code style](#code-style)
  - [Python](#python)
  - [TypeScript](#typescript)
- [Testing](#testing)
  - [Running pipeline tests](#running-pipeline-tests)
  - [Running frontend tests](#running-frontend-tests)
- [Submitting a pull request](#submitting-a-pull-request)
- [Project structure](#project-structure)

---

## Code of conduct

This project follows a **no-drama** policy. Be respectful, constructive, and inclusive. We're all here to learn and build something cool together.

---

## Getting started

### Fork & clone

1. Fork the repo on GitHub.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/<your-username>/Gutenberg-Book-Finder.git
   cd Gutenberg-Book-Finder
   ```
3. Add the upstream repo to stay in sync:
   ```bash
   git remote add upstream https://github.com/TMFNK/Gutenberg-Book-Finder.git
   ```

### Pipeline setup

The pipeline uses **uv** for Python package management.

```bash
cd pipeline
uv sync
```

> **Prerequisites:** Python 3.12+ and `uv` installed.  
> Install uv: `pip install uv` or follow the [official guide](https://docs.astral.sh/uv/).

The `enrich` stage requires an OpenRouter API key:

```bash
export OPENROUTER_API_KEY=sk-or-...
```

You can run individual stages or the full pipeline:

```bash
uv run python -m gutenberg_galaxy all
```

### Frontend setup

```bash
cd web
npm install
npm run dev
```

The frontend will start at `http://localhost:5173`. It reads pre-built JSON from `web/public/data/`, so no pipeline run required.

> **Prerequisites:** Node.js 22+ and npm.

---

## Making changes

### Pipeline changes

The pipeline lives under [`pipeline/src/gutenberg_galaxy/`](pipeline/src/gutenberg_galaxy/). Each stage is a self-contained module:

| Module                                                         | Responsibility                                         |
| -------------------------------------------------------------- | ------------------------------------------------------ |
| [`catalog.py`](pipeline/src/gutenberg_galaxy/catalog.py)       | Fetching metadata from Gutendex                        |
| [`excerpts.py`](pipeline/src/gutenberg_galaxy/excerpts.py)     | Downloading + cleaning book text                       |
| [`embed.py`](pipeline/src/gutenberg_galaxy/embed.py)           | Generating embeddings with `sentence-transformers`     |
| [`layout.py`](pipeline/src/gutenberg_galaxy/layout.py)         | Dimensionality reduction (UMAP) + clustering (HDBSCAN) |
| [`enrich.py`](pipeline/src/gutenberg_galaxy/enrich.py)         | LLM-powered tagging and labelling                      |
| [`export.py`](pipeline/src/gutenberg_galaxy/export.py)         | Writing frontend JSON                                  |
| [`openrouter.py`](pipeline/src/gutenberg_galaxy/openrouter.py) | Thin OpenRouter API client                             |

**Guidelines:**

- Each stage should be independently runnable (`uv run python -m gutenberg_galaxy <stage>`).
- Cache aggressively: write intermediate results to `data/` so stages can be resumed.
- Keep modules focused; extract shared utilities when code appears in multiple stages.
- Add or update tests in [`pipeline/tests/`](pipeline/tests/).

### Frontend changes

The frontend lives under [`web/`](web/), a plain Vite + TypeScript project with no framework.

| Module                             | Responsibility                      |
| ---------------------------------- | ----------------------------------- |
| [`grid.ts`](web/src/grid.ts)       | Book card grid                      |
| [`filters.ts`](web/src/filters.ts) | Facet filters, sorting, surprise-me |
| [`search.ts`](web/src/search.ts)   | MiniSearch full-text search         |
| [`card.ts`](web/src/card.ts)       | Book detail panel                   |
| [`types.ts`](web/src/types.ts)     | TypeScript type definitions         |
| [`style.css`](web/src/style.css)   | All styling                         |

**Guidelines:**

- No framework. Keep it vanilla TypeScript.
- Use the existing CSS variables for theming (defined in `style.css`).
- Search is client-side via [MiniSearch](https://github.com/lucaong/minisearch); no API calls.
- Add unit tests with [Vitest](https://vitest.dev/) alongside the module (`*.test.ts`).
- Run `npm run build` to verify the production build works.

### Documentation changes

Documentation lives in:

- `docs/`: design specs and plans
- `README.md`: top-level project overview
- `pipeline/README.md`: pipeline-specific docs

Keep docs concise, accurate, and clear. If you change behaviour, update the docs that reference it.

---

## Code style

### Python

- **Format with [Black](https://github.com/psf/black)** (default settings).
- **Lint with [Ruff](https://docs.astral.sh/ruff/)**.
- Follow **PEP 8** conventions.
- Use **type hints** everywhere.
- Use `pathlib.Path` over `os.path`.
- Use f-strings for formatting.

Quick check:

```bash
cd pipeline
uv pip install black ruff
black src/ tests/
ruff check src/ tests/
```

### TypeScript

- **Format with [Prettier](https://prettier.io/)** (if configured).
- Use **explicit types**: avoid `any` unless absolutely necessary.
- Prefer `const` over `let` (use `let` only for reassignment).
- Import types with `import type { ... }` to enable isolation.
- Keep functions small and focused.

---

## Testing

### Running pipeline tests

```bash
cd pipeline
uv run pytest
```

Tests use pytest conventions. Fixtures live in [`pipeline/tests/fixtures/`](pipeline/tests/fixtures/).

### Running frontend tests

```bash
cd web
npm test
```

Frontend tests use [Vitest](https://vitest.dev/). Test files are co-located with their modules (`*.test.ts`).

---

## Submitting a pull request

1. **Sync your fork** with upstream:

   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **Create a feature branch**:

   ```bash
   git checkout -b feat/my-change
   ```

3. **Make your changes**, commit with a clear message:

   ```bash
   git commit -m "feat: add XYZ feature"
   ```

   We follow [Conventional Commits](https://www.conventionalcommits.org/) loosely:
   - `feat:` a new feature
   - `fix:` a bug fix
   - `docs:` documentation changes
   - `refactor:` code restructuring
   - `test:` adding or updating tests
   - `chore:` tooling, CI, dependencies

4. **Run tests** to make sure nothing is broken:

   ```bash
   cd pipeline && uv run pytest
   cd web && npm test
   ```

5. **Push and open a PR**:

   ```bash
   git push origin feat/my-change
   ```

   Open a pull request against `TMFNK/Gutenberg-Book-Finder:main`.

6. **CI checks** will run automatically (via GitHub Actions):
   - Pipeline tests (`uv run pytest`)
   - Frontend tests (`npm test`)
   - Frontend build (`npm run build`)
   - If everything passes and your PR is approved, it will be merged.

### PR checklist

Before submitting, check:

- [ ] Code compiles and tests pass
- [ ] New code includes tests (if applicable)
- [ ] Documentation is updated (if behaviour changed)
- [ ] Commit messages follow conventional commits
- [ ] Branch is up to date with `main`

---

## Project structure

```
pipeline/              Python data pipeline (uv-managed)
  src/gutenberg_galaxy/
  tests/
web/                   Vite + TypeScript frontend
  src/
  public/data/
docs/                  Design spec and implementation plans
data/                  Cached pipeline output (git-committed)
```

---

## Questions?

Open an [issue](https://github.com/TMFNK/Gutenberg-Book-Finder/issues). Happy to help!
