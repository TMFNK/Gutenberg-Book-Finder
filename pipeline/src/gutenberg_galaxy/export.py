import json

from .catalog import load_catalog
from .enrich import load_tags
from .paths import WEB_DATA_DIR


def book_row(book: dict, tags: dict | None) -> dict:
    tags = tags or {}
    authors = book.get("authors") or []
    summaries = book.get("summaries") or []
    mood = tags.get("mood")
    return {"id": book["id"], "title": book["title"],
            "author": authors[0]["name"] if authors else "Unknown",
            "year": authors[0].get("birth_year") if authors else None,
            "lang": (book.get("languages") or ["?"])[0],
            "downloads": book.get("download_count", 0),
            "mood": mood.strip().lower() if mood else None,
            "themes": tags.get("themes"),
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
