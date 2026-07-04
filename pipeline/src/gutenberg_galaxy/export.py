import json
from collections import defaultdict

from .catalog import load_catalog
from .enrich import load_tags
from .paths import ENRICH_DIR, LAYOUT_JSON, WEB_DATA_DIR


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
                 "label": labels.get(str(c), f"Cluster {c}"),
                 "x": sum(p[0] for p in ps) / len(ps),
                 "y": sum(p[1] for p in ps) / len(ps)}
                for c, ps in sorted(members.items())]
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    (WEB_DATA_DIR / "books.json").write_text(json.dumps(rows))
    (WEB_DATA_DIR / "clusters.json").write_text(json.dumps(clusters))
    print(f"exported {len(rows)} books, {len(clusters)} clusters")
