from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / "data"
WEB_DATA_DIR = REPO_ROOT / "web" / "public" / "data"
CATALOG_JSON = DATA_DIR / "catalog.json"
EXCERPTS_DIR = DATA_DIR / "excerpts"
EMBEDDINGS_NPY = DATA_DIR / "embeddings.npy"
EMBEDDING_IDS_JSON = DATA_DIR / "embedding_ids.json"
LAYOUT_JSON = DATA_DIR / "layout.json"
ENRICH_DIR = DATA_DIR / "enrich"
