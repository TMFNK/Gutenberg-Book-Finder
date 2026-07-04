# Gutenberg Galaxy M1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** End-to-end pipeline on the 1,000 most-downloaded Project Gutenberg books, rendered as an interactive deck.gl map running locally.

**Architecture:** A resumable Python pipeline (`pipeline/`) with six cacheable stages (catalog → excerpts → embeddings → layout → LLM enrichment → export) writes static JSON into `web/public/data/`. A Vite + TypeScript + deck.gl frontend (`web/`) renders it. No server.

**Tech Stack:** Python 3.12 + uv, httpx, sentence-transformers (`intfloat/multilingual-e5-small`), umap-learn, hdbscan, pydantic, pytest; OpenRouter API; Vite + TypeScript + deck.gl.

## Global Constraints

- Python managed with `uv` inside `pipeline/` (see astral:uv skill); run everything as `uv run ...` from `pipeline/`.
- Every pipeline stage caches to `data/` (gitignored) and skips work already done — re-running any stage must be safe.
- All network fetching is polite: ≥0.5s between requests to gutenberg.org, custom User-Agent `gutenberg-galaxy (https://github.com/TMFNK/Gutenberg-Book-Finder)`.
- OpenRouter: model from env `OPENROUTER_MODEL` (default `openai/gpt-oss-120b`), key from env `OPENROUTER_API_KEY`. Never hardcode keys.
- M1 book count: `N_BOOKS = 1000`.
- Commit after every task (Conventional Commits style, as in existing history).

## File Structure

```
pipeline/
  pyproject.toml
  gutenberg_galaxy/
    __init__.py
    paths.py        # data-dir path constants
    catalog.py      # stage 1: Gutendex top-N catalog
    excerpts.py     # stage 2: download texts, strip PG boilerplate
    embed.py        # stage 3: local embeddings
    layout.py       # stage 4: UMAP 2D + HDBSCAN clusters
    openrouter.py   # thin OpenRouter chat client
    enrich.py       # stage 5: cluster labels + per-book tags
    export.py       # stage 6: write web/public/data/*.json
    __main__.py     # CLI: uv run python -m gutenberg_galaxy <stage>|all
  tests/
    test_catalog.py test_excerpts.py test_enrich.py test_export.py
    fixtures/gutendex_page.json fixtures/pg_text.txt
web/                # Vite vanilla-ts app
  src/main.ts src/map.ts src/card.ts src/search.ts src/types.ts
  public/data/      # books.json, clusters.json (pipeline output, gitignored until M2)
data/               # gitignored cache
```

---

### Task 1: Pipeline scaffold + catalog stage

**Files:**
- Create: `pipeline/pyproject.toml`, `pipeline/gutenberg_galaxy/__init__.py`, `pipeline/gutenberg_galaxy/paths.py`, `pipeline/gutenberg_galaxy/catalog.py`, `pipeline/tests/test_catalog.py`, `pipeline/tests/fixtures/gutendex_page.json`, root `.gitignore`

**Interfaces:**
- Produces: `catalog.fetch_catalog(n: int = 1000) -> list[dict]` — fetches/caches Gutendex books sorted by popularity; and `catalog.load_catalog() -> list[dict]` reading `data/catalog.json`. Each dict is a raw Gutendex book record (keys: `id, title, authors, summaries, subjects, bookshelves, languages, download_count, formats`).

- [ ] **Step 1: Scaffold**

```bash
cd /Users/edis-mac/Documents/Gutenberg-Book-Finder
printf 'data/\nweb/public/data/\n.env\n__pycache__/\n.venv/\nnode_modules/\ndist/\n' > .gitignore
mkdir -p pipeline && cd pipeline
uv init --lib --name gutenberg-galaxy --package
uv add httpx pydantic
uv add --dev pytest respx
```
Rename the generated package dir to `gutenberg_galaxy` if needed; delete sample code.

- [ ] **Step 2: paths.py**

```python
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
WEB_DATA_DIR = REPO_ROOT / "web" / "public" / "data"
CATALOG_JSON = DATA_DIR / "catalog.json"
EXCERPTS_DIR = DATA_DIR / "excerpts"
EMBEDDINGS_NPY = DATA_DIR / "embeddings.npy"
EMBEDDING_IDS_JSON = DATA_DIR / "embedding_ids.json"
LAYOUT_JSON = DATA_DIR / "layout.json"
ENRICH_DIR = DATA_DIR / "enrich"
```

- [ ] **Step 3: Failing test** (`tests/test_catalog.py`)

Save one real Gutendex page as `tests/fixtures/gutendex_page.json` (`curl -s "https://gutendex.com/books/?page=1" > tests/fixtures/gutendex_page.json`).

```python
import json, respx, httpx
from pathlib import Path
from gutenberg_galaxy import catalog

FIXTURE = json.loads((Path(__file__).parent / "fixtures/gutendex_page.json").read_text())

@respx.mock
def test_fetch_catalog_paginates_and_caches(tmp_path, monkeypatch):
    monkeypatch.setattr(catalog, "CATALOG_JSON", tmp_path / "catalog.json")
    page2 = {**FIXTURE, "next": None}
    respx.get("https://gutendex.com/books/", params={"page": "1"}).mock(
        return_value=httpx.Response(200, json=FIXTURE))
    respx.get("https://gutendex.com/books/", params={"page": "2"}).mock(
        return_value=httpx.Response(200, json=page2))
    books = catalog.fetch_catalog(n=40)  # fixture has 32/page -> needs 2 pages
    assert len(books) == 40
    assert books[0]["id"] == 2701
    assert catalog.load_catalog() == books  # cache round-trip
```

- [ ] **Step 4: Run to verify failure**

Run: `uv run pytest tests/test_catalog.py -v` — Expected: FAIL (no module `catalog`).

- [ ] **Step 5: Implement** (`gutenberg_galaxy/catalog.py`)

```python
import json, time
import httpx
from .paths import CATALOG_JSON

GUTENDEX = "https://gutendex.com/books/"
UA = {"User-Agent": "gutenberg-galaxy (https://github.com/TMFNK/Gutenberg-Book-Finder)"}

def fetch_catalog(n: int = 1000) -> list[dict]:
    if CATALOG_JSON.exists():
        return load_catalog()
    books, page = [], 1
    while len(books) < n:
        r = httpx.get(GUTENDEX, params={"page": str(page)}, headers=UA, timeout=30)
        r.raise_for_status()
        data = r.json()
        books.extend(data["results"])
        if not data.get("next"):
            break
        page += 1
        time.sleep(0.5)
    books = books[:n]
    CATALOG_JSON.parent.mkdir(parents=True, exist_ok=True)
    CATALOG_JSON.write_text(json.dumps(books))
    return books

def load_catalog() -> list[dict]:
    return json.loads(CATALOG_JSON.read_text())
```
(Test monkeypatches `catalog.CATALOG_JSON`; have both functions read the module attribute — i.e. reference `CATALOG_JSON` via module global as written.) Note: monkeypatching a `from`-import on the module works because functions look it up at call time from module globals.

- [ ] **Step 6: Run to verify pass** — `uv run pytest tests/test_catalog.py -v` → PASS
- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: pipeline scaffold + Gutendex catalog stage"`

---

### Task 2: Excerpt download + boilerplate stripping

**Files:**
- Create: `pipeline/gutenberg_galaxy/excerpts.py`, `pipeline/tests/test_excerpts.py`, `pipeline/tests/fixtures/pg_text.txt`

**Interfaces:**
- Consumes: `catalog.load_catalog()`
- Produces: `excerpts.strip_boilerplate(text: str) -> str`; `excerpts.excerpt(text: str, words: int = 2000) -> str`; `excerpts.plain_text_url(book: dict) -> str | None` (first `text/plain*` format URL); `excerpts.fetch_all(books: list[dict]) -> None` writing `data/excerpts/{id}.txt`.

- [ ] **Step 1: Fixture** — `tests/fixtures/pg_text.txt`: a small fake PG file:

```
The Project Gutenberg eBook of Testbook
junk header lines
*** START OF THE PROJECT GUTENBERG EBOOK TESTBOOK ***
Actual story text begins here. More words follow.
*** END OF THE PROJECT GUTENBERG EBOOK TESTBOOK ***
license junk
```

- [ ] **Step 2: Failing tests**

```python
from pathlib import Path
from gutenberg_galaxy import excerpts

RAW = (Path(__file__).parent / "fixtures/pg_text.txt").read_text()

def test_strip_boilerplate():
    body = excerpts.strip_boilerplate(RAW)
    assert body.startswith("Actual story text")
    assert "END OF THE PROJECT" not in body and "junk header" not in body

def test_strip_boilerplate_no_markers_returns_all():
    assert excerpts.strip_boilerplate("just text") == "just text"

def test_excerpt_word_cap():
    assert excerpts.excerpt("a b c d e", words=3) == "a b c"

def test_plain_text_url():
    book = {"formats": {"text/plain; charset=utf-8": "http://x/t.txt", "text/html": "h"}}
    assert excerpts.plain_text_url(book) == "http://x/t.txt"
    assert excerpts.plain_text_url({"formats": {"text/html": "h"}}) is None
```

- [ ] **Step 3: Verify fail** — `uv run pytest tests/test_excerpts.py -v` → FAIL
- [ ] **Step 4: Implement** (`gutenberg_galaxy/excerpts.py`)

```python
import re, time
import httpx
from .paths import EXCERPTS_DIR
from .catalog import UA

START_RE = re.compile(r"\*\*\* ?START OF.*?\*\*\*", re.S)
END_RE = re.compile(r"\*\*\* ?END OF.*?\*\*\*", re.S)

def strip_boilerplate(text: str) -> str:
    m = START_RE.search(text)
    if m:
        text = text[m.end():]
    m = END_RE.search(text)
    if m:
        text = text[:m.start()]
    return text.strip()

def excerpt(text: str, words: int = 2000) -> str:
    return " ".join(text.split()[:words])

def plain_text_url(book: dict) -> str | None:
    for mime, url in book["formats"].items():
        if mime.startswith("text/plain"):
            return url
    return None

def fetch_all(books: list[dict]) -> None:
    EXCERPTS_DIR.mkdir(parents=True, exist_ok=True)
    with httpx.Client(headers=UA, timeout=60, follow_redirects=True) as client:
        for book in books:
            out = EXCERPTS_DIR / f"{book['id']}.txt"
            if out.exists():
                continue
            url = plain_text_url(book)
            if url is None:
                out.write_text("")  # marker: no plain text available
                continue
            try:
                r = client.get(url)
                r.raise_for_status()
                out.write_text(excerpt(strip_boilerplate(r.text)))
            except httpx.HTTPError as e:
                print(f"skip {book['id']}: {e}")
                out.write_text("")
            time.sleep(0.5)
```

- [ ] **Step 5: Verify pass** — `uv run pytest tests/test_excerpts.py -v` → PASS
- [ ] **Step 6: Commit** — `git commit -am "feat: excerpt download with PG boilerplate stripping"`

---

### Task 3: Embedding stage

**Files:**
- Create: `pipeline/gutenberg_galaxy/embed.py` (no unit test — model-dependent; verified by the e2e run in Task 8)

**Interfaces:**
- Consumes: `catalog.load_catalog()`, `data/excerpts/{id}.txt`
- Produces: `embed.run() -> None` writing `data/embeddings.npy` (float32, shape `(N, 384)`) and `data/embedding_ids.json` (list of book ids, row-aligned). Also `embed.doc_text(book: dict, excerpt: str) -> str`.

- [ ] **Step 1: Add deps** — `uv add sentence-transformers numpy`
- [ ] **Step 2: Implement**

```python
import json
import numpy as np
from .paths import EMBEDDINGS_NPY, EMBEDDING_IDS_JSON, EXCERPTS_DIR
from .catalog import load_catalog

MODEL = "intfloat/multilingual-e5-small"

def doc_text(book: dict, excerpt: str) -> str:
    subjects = "; ".join(book.get("subjects", [])[:8])
    return f"passage: {book['title']}. {subjects}. {excerpt[:6000]}"

def run() -> None:
    if EMBEDDINGS_NPY.exists():
        print("embeddings cached, skipping")
        return
    from sentence_transformers import SentenceTransformer
    books = load_catalog()
    texts, ids = [], []
    for b in books:
        f = EXCERPTS_DIR / f"{b['id']}.txt"
        texts.append(doc_text(b, f.read_text() if f.exists() else ""))
        ids.append(b["id"])
    model = SentenceTransformer(MODEL)
    emb = model.encode(texts, batch_size=32, show_progress_bar=True,
                       normalize_embeddings=True)
    np.save(EMBEDDINGS_NPY, emb.astype(np.float32))
    EMBEDDING_IDS_JSON.write_text(json.dumps(ids))
```

- [ ] **Step 3: Smoke test** — `uv run python -c "from gutenberg_galaxy.embed import doc_text; print(doc_text({'title':'T','subjects':['a']},'x'))"` → prints `passage: T. a. x`
- [ ] **Step 4: Commit** — `git commit -am "feat: local embedding stage (multilingual-e5-small)"`

---

### Task 4: Layout stage (UMAP + HDBSCAN)

**Files:**
- Create: `pipeline/gutenberg_galaxy/layout.py`

**Interfaces:**
- Consumes: `data/embeddings.npy`, `data/embedding_ids.json`
- Produces: `layout.run() -> None` writing `data/layout.json`: `{"positions": {id: [x, y]}, "clusters": {id: int}}` with x,y scaled to [-100, 100] and cluster `-1` = noise.

- [ ] **Step 1: Add deps** — `uv add umap-learn hdbscan`
- [ ] **Step 2: Implement**

```python
import json
import numpy as np
from .paths import EMBEDDINGS_NPY, EMBEDDING_IDS_JSON, LAYOUT_JSON

def run() -> None:
    if LAYOUT_JSON.exists():
        print("layout cached, skipping")
        return
    import umap, hdbscan
    emb = np.load(EMBEDDINGS_NPY)
    ids = json.loads(EMBEDDING_IDS_JSON.read_text())
    xy = umap.UMAP(n_neighbors=15, min_dist=0.1, metric="cosine",
                   random_state=42).fit_transform(emb)
    xy -= xy.mean(axis=0)
    xy *= 100 / np.abs(xy).max()
    labels = hdbscan.HDBSCAN(min_cluster_size=8, min_samples=3).fit_predict(xy)
    LAYOUT_JSON.write_text(json.dumps({
        "positions": {str(i): [round(float(x), 3), round(float(y), 3)]
                      for i, (x, y) in zip(ids, xy)},
        "clusters": {str(i): int(c) for i, c in zip(ids, labels)},
    }))
```

- [ ] **Step 3: Commit** — `git commit -am "feat: UMAP layout + HDBSCAN clustering stage"`

---

### Task 5: OpenRouter client + cluster labeling

**Files:**
- Create: `pipeline/gutenberg_galaxy/openrouter.py`, `pipeline/gutenberg_galaxy/enrich.py`, `pipeline/tests/test_enrich.py`

**Interfaces:**
- Produces: `openrouter.chat_json(prompt: str, max_retries: int = 3) -> dict|list` — calls OpenRouter chat completions with `response_format={"type":"json_object"}` where supported, parses/validates JSON, retries on failure. `enrich.label_clusters() -> dict[int, str]` writing `data/enrich/cluster_labels.json`.

- [ ] **Step 1: Failing test** (pure logic only — prompt building & response parsing)

```python
from gutenberg_galaxy import enrich

def test_cluster_prompt_contains_titles():
    p = enrich.cluster_prompt(3, ["Moby Dick", "The Sea-Wolf"])
    assert "Moby Dick" in p and "JSON" in p

def test_parse_label():
    assert enrich.parse_label({"label": "Sea Adventures"}) == "Sea Adventures"
```

- [ ] **Step 2: Verify fail** — `uv run pytest tests/test_enrich.py -v` → FAIL
- [ ] **Step 3: Implement `openrouter.py`**

```python
import json, os, time
import httpx

URL = "https://openrouter.ai/api/v1/chat/completions"

def chat_json(prompt: str, max_retries: int = 3):
    model = os.environ.get("OPENROUTER_MODEL", "openai/gpt-oss-120b")
    headers = {"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
               "HTTP-Referer": "https://github.com/TMFNK/Gutenberg-Book-Finder",
               "X-Title": "Gutenberg Galaxy"}
    body = {"model": model,
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"}}
    last = None
    for attempt in range(max_retries):
        try:
            r = httpx.post(URL, json=body, headers=headers, timeout=120)
            r.raise_for_status()
            content = r.json()["choices"][0]["message"]["content"]
            return json.loads(content)
        except (httpx.HTTPError, json.JSONDecodeError, KeyError) as e:
            last = e
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"OpenRouter failed after {max_retries} tries: {last}")
```

- [ ] **Step 4: Implement `enrich.py` (labeling half)**

```python
import json
from .paths import LAYOUT_JSON, ENRICH_DIR, CATALOG_JSON
from .openrouter import chat_json

def cluster_prompt(cluster_id: int, titles: list[str]) -> str:
    listing = "\n".join(f"- {t}" for t in titles[:30])
    return (f"These books form one cluster on a semantic map of Project Gutenberg:\n"
            f"{listing}\n\n"
            'Reply with JSON: {"label": "<2-4 word evocative region name>"}')

def parse_label(resp: dict) -> str:
    return str(resp["label"]).strip()

def label_clusters() -> dict[int, str]:
    ENRICH_DIR.mkdir(parents=True, exist_ok=True)
    out_path = ENRICH_DIR / "cluster_labels.json"
    if out_path.exists():
        return {int(k): v for k, v in json.loads(out_path.read_text()).items()}
    layout = json.loads(LAYOUT_JSON.read_text())
    books = {str(b["id"]): b for b in json.loads(CATALOG_JSON.read_text())}
    members: dict[int, list[str]] = {}
    for bid, c in layout["clusters"].items():
        if c != -1:
            members.setdefault(c, []).append(books[bid]["title"])
    labels = {c: parse_label(chat_json(cluster_prompt(c, titles)))
              for c, titles in sorted(members.items())}
    out_path.write_text(json.dumps(labels))
    return labels
```

- [ ] **Step 5: Verify pass** — `uv run pytest tests/test_enrich.py -v` → PASS
- [ ] **Step 6: Commit** — `git commit -am "feat: OpenRouter client + LLM cluster labeling"`

---

### Task 6: Per-book LLM tagging (batched, validated, resumable)

**Files:**
- Modify: `pipeline/gutenberg_galaxy/enrich.py`
- Test: `pipeline/tests/test_enrich.py` (append)

**Interfaces:**
- Produces: `enrich.tag_books() -> None` writing `data/enrich/tags/batch_{n}.json`; `enrich.BookTags` pydantic model (`id:int, mood:str, themes:list[str] (1-3), difficulty:str in easy|medium|hard, hook:str`); `enrich.load_tags() -> dict[int, dict]`; `enrich.chunk(seq: list, size: int) -> list[list]`.

- [ ] **Step 1: Failing tests** (append to `tests/test_enrich.py`)

```python
import pydantic, pytest
from gutenberg_galaxy.enrich import chunk, BookTags, parse_tags

def test_chunk():
    assert chunk([1, 2, 3, 4, 5], 2) == [[1, 2], [3, 4], [5]]

def test_book_tags_validation():
    ok = {"id": 1, "mood": "dark", "themes": ["revenge"], "difficulty": "hard",
          "hook": "A whale."}
    assert BookTags(**ok).id == 1
    with pytest.raises(pydantic.ValidationError):
        BookTags(**{**ok, "difficulty": "impossible"})

def test_parse_tags_expects_all_ids():
    resp = {"books": [{"id": 1, "mood": "dark", "themes": ["x"],
                       "difficulty": "easy", "hook": "h"}]}
    assert parse_tags(resp, expected_ids={1})[1]["mood"] == "dark"
    with pytest.raises(ValueError):
        parse_tags(resp, expected_ids={1, 2})
```

- [ ] **Step 2: Verify fail**, then implement (append to `enrich.py`):

```python
from typing import Literal
from pydantic import BaseModel, Field
from .excerpts import EXCERPTS_DIR

class BookTags(BaseModel):
    id: int
    mood: str
    themes: list[str] = Field(min_length=1, max_length=3)
    difficulty: Literal["easy", "medium", "hard"]
    hook: str

def chunk(seq: list, size: int) -> list[list]:
    return [seq[i:i + size] for i in range(0, len(seq), size)]

def parse_tags(resp: dict, expected_ids: set[int]) -> dict[int, dict]:
    tags = {t.id: t.model_dump() for t in (BookTags(**b) for b in resp["books"])}
    missing = expected_ids - set(tags)
    if missing:
        raise ValueError(f"missing ids in LLM response: {missing}")
    return tags

def tags_prompt(batch: list[dict]) -> str:
    lines = []
    for b in batch:
        f = EXCERPTS_DIR / f"{b['id']}.txt"
        text = f.read_text()[:400] if f.exists() else ""
        subj = "; ".join(b.get("subjects", [])[:4])
        lines.append(f"id={b['id']} | {b['title']} | {subj} | {text}")
    return ("For each book below give mood (one word), themes (1-3 short phrases), "
            'difficulty ("easy"|"medium"|"hard"), and hook (one enticing sentence).\n'
            'Reply JSON: {"books": [{"id":..., "mood":..., "themes":[...], '
            '"difficulty":..., "hook":...}]}\n\n' + "\n".join(lines))

def tag_books() -> None:
    from .catalog import load_catalog
    tags_dir = ENRICH_DIR / "tags"
    tags_dir.mkdir(parents=True, exist_ok=True)
    for n, batch in enumerate(chunk(load_catalog(), 25)):
        out = tags_dir / f"batch_{n}.json"
        if out.exists():
            continue
        resp = chat_json(tags_prompt(batch))
        tags = parse_tags(resp, expected_ids={b["id"] for b in batch})
        out.write_text(json.dumps(tags))
        print(f"batch {n} done")

def load_tags() -> dict[int, dict]:
    result = {}
    for f in sorted((ENRICH_DIR / "tags").glob("batch_*.json")):
        result.update({int(k): v for k, v in json.loads(f.read_text()).items()})
    return result
```

- [ ] **Step 3: Verify pass** — `uv run pytest tests/test_enrich.py -v` → PASS
- [ ] **Step 4: Commit** — `git commit -am "feat: batched per-book LLM tagging with validation"`

---

### Task 7: Export stage + CLI orchestrator

**Files:**
- Create: `pipeline/gutenberg_galaxy/export.py`, `pipeline/gutenberg_galaxy/__main__.py`
- Test: `pipeline/tests/test_export.py`

**Interfaces:**
- Produces: `export.book_row(book, pos, cluster, tags) -> dict` and `export.run() -> None` writing `web/public/data/books.json` (list of rows) and `web/public/data/clusters.json` (`[{"id", "label", "x", "y"}]`, centroid of members). Row schema: `{id,title,author,year,lang,downloads,x,y,cluster,mood,themes,difficulty,hook,url}` where `url = f"https://www.gutenberg.org/ebooks/{id}"`, `author` = first author name or "Unknown", `year` = first author's `birth_year` or null.
- CLI: `uv run python -m gutenberg_galaxy all|catalog|excerpts|embed|layout|enrich|export`.

- [ ] **Step 1: Failing test** (`tests/test_export.py`)

```python
from gutenberg_galaxy.export import book_row

def test_book_row_shape():
    book = {"id": 2701, "title": "Moby Dick",
            "authors": [{"name": "Melville, Herman", "birth_year": 1819}],
            "languages": ["en"], "download_count": 160099}
    row = book_row(book, (1.5, -2.0), 4,
                   {"mood": "dark", "themes": ["obsession"],
                    "difficulty": "hard", "hook": "A whale."})
    assert row["author"] == "Melville, Herman" and row["x"] == 1.5
    assert row["url"] == "https://www.gutenberg.org/ebooks/2701"

def test_book_row_defaults():
    row = book_row({"id": 1, "title": "T", "authors": [], "languages": [],
                    "download_count": 0}, (0, 0), -1, None)
    assert row["author"] == "Unknown" and row["mood"] is None
```

- [ ] **Step 2: Verify fail**, then implement `export.py`:

```python
import json
from collections import defaultdict
from .paths import LAYOUT_JSON, WEB_DATA_DIR
from .catalog import load_catalog
from .enrich import load_tags, ENRICH_DIR

def book_row(book: dict, pos, cluster: int, tags: dict | None) -> dict:
    tags = tags or {}
    authors = book.get("authors") or []
    return {"id": book["id"], "title": book["title"],
            "author": authors[0]["name"] if authors else "Unknown",
            "year": authors[0].get("birth_year") if authors else None,
            "lang": (book.get("languages") or ["?"])[0],
            "downloads": book.get("download_count", 0),
            "x": pos[0], "y": pos[1], "cluster": cluster,
            "mood": tags.get("mood"), "themes": tags.get("themes"),
            "difficulty": tags.get("difficulty"), "hook": tags.get("hook"),
            "url": f"https://www.gutenberg.org/ebooks/{book['id']}"}

def run() -> None:
    layout = json.loads(LAYOUT_JSON.read_text())
    labels = json.loads((ENRICH_DIR / "cluster_labels.json").read_text())
    all_tags = load_tags()
    rows, members = [], defaultdict(list)
    for book in load_catalog():
        bid = str(book["id"])
        pos, cluster = layout["positions"][bid], layout["clusters"][bid]
        rows.append(book_row(book, pos, cluster, all_tags.get(book["id"])))
        if cluster != -1:
            members[cluster].append(pos)
    clusters = [{"id": int(c),
                 "label": labels.get(str(c), labels.get(c, f"Cluster {c}")),
                 "x": sum(p[0] for p in ps) / len(ps),
                 "y": sum(p[1] for p in ps) / len(ps)}
                for c, ps in sorted(members.items())]
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    (WEB_DATA_DIR / "books.json").write_text(json.dumps(rows))
    (WEB_DATA_DIR / "clusters.json").write_text(json.dumps(clusters))
    print(f"exported {len(rows)} books, {len(clusters)} clusters")
```

And `__main__.py`:

```python
import sys
from . import catalog, excerpts, embed, layout, enrich, export

STAGES = {"catalog": lambda: catalog.fetch_catalog(1000),
          "excerpts": lambda: excerpts.fetch_all(catalog.load_catalog()),
          "embed": embed.run, "layout": layout.run,
          "enrich": lambda: (enrich.label_clusters(), enrich.tag_books()),
          "export": export.run}

stage = sys.argv[1] if len(sys.argv) > 1 else "all"
for name, fn in STAGES.items():
    if stage in (name, "all"):
        print(f"=== {name} ===")
        fn()
```

- [ ] **Step 3: Verify pass** — `uv run pytest -v` (whole suite) → all PASS
- [ ] **Step 4: Commit** — `git commit -am "feat: export stage + CLI orchestrator"`

---

### Task 8: Run the full M1 pipeline

**Files:** none (produces `data/` cache + `web/public/data/*.json`)

- [ ] **Step 1:** `cd pipeline && uv run python -m gutenberg_galaxy catalog` → prints nothing fatal; `data/catalog.json` exists, `python3 -c "import json;print(len(json.load(open('../data/catalog.json'))))"` → 1000
- [ ] **Step 2:** `uv run python -m gutenberg_galaxy excerpts` — ~15-20 min (0.5s delay × 1000). Expect ≥950 non-empty files in `data/excerpts/`.
- [ ] **Step 3:** `uv run python -m gutenberg_galaxy embed` — first run downloads the model (~450MB), then a few minutes on MPS.
- [ ] **Step 4:** `uv run python -m gutenberg_galaxy layout` — seconds. Sanity: `python3 -c "import json;d=json.load(open('../data/layout.json'));print(len(set(d['clusters'].values())))"` → roughly 15–50 clusters.
- [ ] **Step 5:** `export OPENROUTER_API_KEY=...` (and optionally `OPENROUTER_MODEL=...:free`), then `uv run python -m gutenberg_galaxy enrich`. 1,000 books = 40 batches + ~30 label calls — fits a single free-tier day (if $10 credit purchased) or costs cents paid. Verify `data/enrich/tags/` has 40 files.
- [ ] **Step 6:** `uv run python -m gutenberg_galaxy export` → `exported 1000 books, N clusters`
- [ ] **Step 7: Commit** any fixes made — `git commit -am "fix: pipeline adjustments from first full run"` (skip if no changes)

---

### Task 9: Web scaffold + deck.gl point map

**Files:**
- Create: `web/` via Vite; `web/src/types.ts`, `web/src/map.ts`; modify `web/src/main.ts`, `web/index.html`

**Interfaces:**
- Produces: `types.ts` exporting `interface Book {id:number; title:string; author:string; year:number|null; lang:string; downloads:number; x:number; y:number; cluster:number; mood:string|null; themes:string[]|null; difficulty:string|null; hook:string|null; url:string}` and `interface Cluster {id:number; label:string; x:number; y:number}`; `map.ts` exporting `createMap(books: Book[], clusters: Cluster[], onPick: (b: Book|null) => void): Deck`.

- [ ] **Step 1: Scaffold**

```bash
cd /Users/edis-mac/Documents/Gutenberg-Book-Finder
npm create vite@latest web -- --template vanilla-ts
cd web && npm install && npm install deck.gl
```

- [ ] **Step 2: `index.html` body** — dark theme shell:

```html
<body style="margin:0;background:#0a0a14;color:#e8e6df;font-family:Georgia,serif">
  <div id="map" style="position:fixed;inset:0"></div>
  <div id="hud" style="position:fixed;top:16px;left:16px;z-index:10">
    <h1 style="font-size:18px;margin:0">Gutenberg Galaxy</h1>
    <input id="search" placeholder="Search 1,000 books…"
      style="margin-top:8px;padding:6px 10px;background:#141428;color:inherit;border:1px solid #333;border-radius:6px;width:220px"/>
  </div>
  <div id="card" style="display:none;position:fixed;right:16px;top:16px;width:300px;background:#141428ee;border:1px solid #333;border-radius:10px;padding:16px;z-index:10"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
```

- [ ] **Step 3: `map.ts`**

```typescript
import { Deck, OrthographicView } from '@deck.gl/core';
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { Book, Cluster } from './types';

const PALETTE: [number, number, number][] = [
  [138, 180, 248], [246, 178, 107], [143, 214, 148], [234, 153, 153],
  [180, 167, 214], [255, 217, 102], [118, 200, 214], [213, 166, 189],
];

export function createMap(books: Book[], clusters: Cluster[],
                          onPick: (b: Book | null) => void): Deck<OrthographicView> {
  return new Deck({
    parent: document.getElementById('map')!,
    views: new OrthographicView(),
    initialViewState: { target: [0, 0, 0], zoom: 1.5, minZoom: 0.5, maxZoom: 8 },
    controller: true,
    getCursor: ({ isHovering }) => (isHovering ? 'pointer' : 'grab'),
    layers: [
      new ScatterplotLayer<Book>({
        id: 'books', data: books, pickable: true,
        getPosition: (d) => [d.x, -d.y],
        getRadius: (d) => 0.3 + Math.log10(1 + d.downloads) * 0.15,
        radiusUnits: 'common',
        getFillColor: (d) => d.cluster === -1
          ? [120, 120, 140, 160]
          : [...PALETTE[d.cluster % PALETTE.length], 210] as [number,number,number,number],
        onClick: (info) => onPick(info.object ?? null),
      }),
      new TextLayer<Cluster>({
        id: 'labels', data: clusters,
        getPosition: (d) => [d.x, -d.y], getText: (d) => d.label,
        getSize: 14, getColor: [232, 230, 223, 190],
        fontFamily: 'Georgia, serif', billboard: false,
      }),
    ],
  });
}
```

- [ ] **Step 4: `main.ts`**

```typescript
import { createMap } from './map';
import type { Book, Cluster } from './types';

async function init() {
  const [books, clusters]: [Book[], Cluster[]] = await Promise.all([
    fetch('/data/books.json').then((r) => r.json()),
    fetch('/data/clusters.json').then((r) => r.json()),
  ]);
  createMap(books, clusters, (b) => console.log('picked', b?.title));
}
init();
```

- [ ] **Step 5: Verify** — `npm run dev`, open http://localhost:5173: colored point cloud with region labels renders; clicking a point logs its title in the console; pan/zoom works.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: deck.gl galaxy map rendering 1k books"`

---

### Task 10: Book card + search

**Files:**
- Create: `web/src/card.ts`, `web/src/search.ts`
- Modify: `web/src/main.ts`

**Interfaces:**
- Consumes: `createMap` from Task 9, `Book` from `types.ts`
- Produces: `card.showCard(b: Book|null): void`; `search.wireSearch(books: Book[], deck: Deck, onPick: (b: Book) => void): void` — Enter flies camera to best title/author prefix match.

- [ ] **Step 1: `card.ts`**

```typescript
import type { Book } from './types';

export function showCard(b: Book | null): void {
  const el = document.getElementById('card')!;
  if (!b) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = `
    <h2 style="font-size:16px;margin:0 0 4px">${b.title}</h2>
    <p style="margin:0;opacity:.7">${b.author}${b.lang !== 'en' ? ' · ' + b.lang : ''}</p>
    ${b.hook ? `<p style="font-style:italic;margin:10px 0">${b.hook}</p>` : ''}
    ${b.themes ? `<p style="font-size:12px;opacity:.8">${b.mood} · ${b.themes.join(' · ')} · ${b.difficulty}</p>` : ''}
    <p style="font-size:12px;opacity:.6">${b.downloads.toLocaleString()} downloads</p>
    <a href="${b.url}" target="_blank" style="color:#8ab4f8">Read free on gutenberg.org →</a>`;
}
```

- [ ] **Step 2: `search.ts`**

```typescript
import type { Deck, OrthographicView } from '@deck.gl/core';
import type { Book } from './types';

export function wireSearch(books: Book[], deck: Deck<OrthographicView>,
                           onPick: (b: Book) => void): void {
  const input = document.getElementById('search') as HTMLInputElement;
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !input.value.trim()) return;
    const q = input.value.toLowerCase();
    const hit = books.find((b) => b.title.toLowerCase().includes(q))
      ?? books.find((b) => b.author.toLowerCase().includes(q));
    if (!hit) return;
    deck.setProps({ initialViewState: { target: [hit.x, -hit.y, 0], zoom: 5,
      transitionDuration: 800 } as any });
    onPick(hit);
  });
}
```

- [ ] **Step 3: Wire in `main.ts`** — replace the `console.log` callback:

```typescript
import { createMap } from './map';
import { showCard } from './card';
import { wireSearch } from './search';
import type { Book, Cluster } from './types';

async function init() {
  const [books, clusters]: [Book[], Cluster[]] = await Promise.all([
    fetch('/data/books.json').then((r) => r.json()),
    fetch('/data/clusters.json').then((r) => r.json()),
  ]);
  const deck = createMap(books, clusters, showCard);
  wireSearch(books, deck, showCard);
}
init();
```

- [ ] **Step 4: Verify** — `npm run dev`: click a star → card with hook/tags/read-link appears; search "moby" + Enter → camera flies to Moby Dick and card opens; `npm run build` succeeds.
- [ ] **Step 5: Commit + push** — `git add -A && git commit -m "feat: book card and fly-to search" && git push`

---

## M1 acceptance

Open `npm run dev`, and: 1,000 books render as a clustered galaxy; regions carry LLM names; clicking any star shows LLM hook + working gutenberg.org link; search flies to books. Pipeline re-runs are no-ops (all stages cached). Then M2 (75k scale-up) and M3 (polish/deploy) get their own plans.
