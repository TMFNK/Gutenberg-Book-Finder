from gutenberg_galaxy.export import book_row


def test_book_row_shape():
    book = {"id": 2701, "title": "Moby Dick",
            "authors": [{"name": "Melville, Herman", "birth_year": 1819}],
            "languages": ["en"], "download_count": 160099,
            "formats": {"image/jpeg": "https://x.test/pg2701.cover.jpg"},
            "summaries": ["A sailor hunts a whale."],
            "subjects": ["Whaling -- Fiction"],
            "bookshelves": ["Best Books Ever"]}
    row = book_row(book, {"mood": "Dark ", "themes": ["obsession"],
                          "difficulty": "hard", "hook": "A whale."})
    assert row["author"] == "Melville, Herman"
    assert row["mood"] == "dark"
    assert row["cover"] == "https://x.test/pg2701.cover.jpg"
    assert row["summary"] == "A sailor hunts a whale."
    assert row["subjects"] == ["Whaling -- Fiction"]
    assert row["bookshelves"] == ["Best Books Ever"]
    assert "x" not in row and "y" not in row and "cluster" not in row
    assert row["url"] == "https://www.gutenberg.org/ebooks/2701"


def test_book_row_defaults():
    row = book_row({"id": 1, "title": "T", "authors": [], "languages": [],
                    "download_count": 0}, None)
    assert row["author"] == "Unknown" and row["mood"] is None
    assert row["cover"] is None and row["summary"] is None
    assert row["subjects"] == [] and row["bookshelves"] == []
