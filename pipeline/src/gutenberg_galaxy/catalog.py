import json
import time

import httpx

from .paths import CATALOG_JSON

GUTENDEX = "https://gutendex.com/books/"
UA = {"User-Agent": "gutenberg-galaxy (https://github.com/TMFNK/Gutenberg-Galaxy)"}


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
