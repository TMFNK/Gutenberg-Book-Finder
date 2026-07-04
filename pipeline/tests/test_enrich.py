import pydantic
import pytest

from gutenberg_galaxy import enrich
from gutenberg_galaxy.enrich import BookTags, chunk, parse_tags


def test_cluster_prompt_contains_titles():
    p = enrich.cluster_prompt(3, ["Moby Dick", "The Sea-Wolf"])
    assert "Moby Dick" in p and "JSON" in p


def test_parse_label():
    assert enrich.parse_label({"label": "Sea Adventures"}) == "Sea Adventures"


def test_chunk():
    assert chunk([1, 2, 3, 4, 5], 2) == [[1, 2], [3, 4], [5]]


def test_book_tags_validation():
    ok = {"id": 1, "mood": "dark", "themes": ["revenge"], "difficulty": "hard",
          "hook": "A whale."}
    assert BookTags(**ok).id == 1
    with pytest.raises(pydantic.ValidationError):
        BookTags(**{**ok, "difficulty": "impossible"})


def test_parse_tags_keeps_valid_skips_invalid():
    resp = {"books": [{"id": 1, "mood": "dark", "themes": ["x"],
                       "difficulty": "easy", "hook": "h"},
                      {"id": 2, "mood": "sad"}]}  # invalid: missing fields
    tags = parse_tags(resp)
    assert tags[1]["mood"] == "dark" and 2 not in tags


def test_parse_tags_raises_when_nothing_valid():
    with pytest.raises(ValueError):
        parse_tags({"books": [{"id": 3}]})
