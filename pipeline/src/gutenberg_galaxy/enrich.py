import json
from typing import Literal

from pydantic import BaseModel, Field

from .openrouter import chat_json
from .paths import CATALOG_JSON, ENRICH_DIR, EXCERPTS_DIR, LAYOUT_JSON


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
    labels = ({int(k): v for k, v in json.loads(out_path.read_text()).items()}
              if out_path.exists() else {})
    layout = json.loads(LAYOUT_JSON.read_text())
    books = {str(b["id"]): b for b in json.loads(CATALOG_JSON.read_text())}
    members: dict[int, list[str]] = {}
    for bid, c in layout["clusters"].items():
        if c != -1:
            members.setdefault(c, []).append(books[bid]["title"])
    for c, titles in sorted(members.items()):
        if c in labels:
            continue
        labels[c] = chat_json(cluster_prompt(c, titles), validate=parse_label)
        out_path.write_text(json.dumps(labels))
        print(f"cluster {c}: {labels[c]}")
    return labels


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
        ids = {b["id"] for b in batch}
        tags = chat_json(tags_prompt(batch),
                         validate=lambda r, ids=ids: parse_tags(r, ids))
        out.write_text(json.dumps(tags))
        print(f"batch {n} done")


def load_tags() -> dict[int, dict]:
    result = {}
    for f in sorted((ENRICH_DIR / "tags").glob("batch_*.json")):
        result.update({int(k): v for k, v in json.loads(f.read_text()).items()})
    return result
