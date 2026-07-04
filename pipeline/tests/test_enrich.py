from gutenberg_galaxy import enrich


def test_cluster_prompt_contains_titles():
    p = enrich.cluster_prompt(3, ["Moby Dick", "The Sea-Wolf"])
    assert "Moby Dick" in p and "JSON" in p


def test_parse_label():
    assert enrich.parse_label({"label": "Sea Adventures"}) == "Sea Adventures"
