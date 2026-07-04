import json
from pathlib import Path

import httpx
import respx

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
