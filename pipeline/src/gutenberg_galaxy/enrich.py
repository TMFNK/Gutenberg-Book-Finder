import json

from .openrouter import chat_json
from .paths import CATALOG_JSON, ENRICH_DIR, LAYOUT_JSON


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
