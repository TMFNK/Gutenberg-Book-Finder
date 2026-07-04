import type { Book } from './types';

const SITE = 'Gutenberg Book Finder';

function setMeta(prop: string, content: string): void {
  let el = document.querySelector(`meta[property="${prop}"]`)
    ?? document.querySelector(`meta[name="${prop}"]`);
  if (!el) {
    el = document.createElement('meta');
    if (prop.startsWith('og:')) el.setAttribute('property', prop);
    else el.setAttribute('name', prop);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function setPageMeta(book: Book | null): void {
  if (book) {
    const title = `${book.title} — ${SITE}`;
    document.title = title;
    setMeta('og:title', title);
    setMeta('og:description', book.hook ?? book.summary?.slice(0, 160) ?? '');
    if (book.cover) setMeta('og:image', book.cover);
    setMeta('twitter:card', 'summary_large_image');
  } else {
    document.title = SITE;
    setMeta('og:title', SITE);
    setMeta('og:description',
      'Search 1,000 free Project Gutenberg books by title, author, mood, and more.');
    setMeta('og:image', '');
    setMeta('twitter:card', 'summary');
  }
}
