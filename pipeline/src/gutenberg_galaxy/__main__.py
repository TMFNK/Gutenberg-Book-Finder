import sys

from . import catalog, embed, enrich, excerpts, export, layout

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
