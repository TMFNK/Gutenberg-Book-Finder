from gutenberg_galaxy.export import book_row


def test_book_row_shape():
    book = {"id": 2701, "title": "Moby Dick",
            "authors": [{"name": "Melville, Herman", "birth_year": 1819}],
            "languages": ["en"], "download_count": 160099}
    row = book_row(book, (1.5, -2.0), 4,
                   {"mood": "dark", "themes": ["obsession"],
                    "difficulty": "hard", "hook": "A whale."})
    assert row["author"] == "Melville, Herman" and row["x"] == 1.5
    assert row["url"] == "https://www.gutenberg.org/ebooks/2701"


def test_book_row_defaults():
    row = book_row({"id": 1, "title": "T", "authors": [], "languages": [],
                    "download_count": 0}, (0, 0), -1, None)
    assert row["author"] == "Unknown" and row["mood"] is None
