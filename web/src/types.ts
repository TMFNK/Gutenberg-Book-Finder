export interface Book {
  id: number;
  title: string;
  author: string;
  year: number | null;
  lang: string;
  downloads: number;
  mood: string | null;
  themes: string[] | null;
  difficulty: string | null;
  hook: string | null;
  cover: string | null;
  summary: string | null;
  subjects: string[];
  bookshelves: string[];
  url: string;
}
