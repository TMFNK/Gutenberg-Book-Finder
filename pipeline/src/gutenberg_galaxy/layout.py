import json

import numpy as np

from .paths import EMBEDDING_IDS_JSON, EMBEDDINGS_NPY, LAYOUT_JSON


def run() -> None:
    if LAYOUT_JSON.exists():
        print("layout cached, skipping")
        return
    import hdbscan
    import umap

    emb = np.load(EMBEDDINGS_NPY)
    ids = json.loads(EMBEDDING_IDS_JSON.read_text())
    xy = umap.UMAP(n_neighbors=15, min_dist=0.1, metric="cosine",
                   random_state=42).fit_transform(emb)
    xy -= xy.mean(axis=0)
    xy *= 100 / np.abs(xy).max()
    labels = hdbscan.HDBSCAN(min_cluster_size=8, min_samples=3,
                             cluster_selection_method="leaf").fit_predict(xy)
    LAYOUT_JSON.write_text(json.dumps({
        "positions": {str(i): [round(float(x), 3), round(float(y), 3)]
                      for i, (x, y) in zip(ids, xy)},
        "clusters": {str(i): int(c) for i, c in zip(ids, labels)},
    }))
