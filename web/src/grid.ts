import type { Book } from './types';

export function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function fmtDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

function bookCard(b: Book, onPick: (b: Book) => void): HTMLElement {
  const card = document.createElement('article');
  card.className = 'book-card';
  card.tabIndex = 0;
  card.innerHTML = `
    <div class="cover-wrap">
      <div class="cover-fallback">${esc(b.title)}</div>
      ${b.cover ? `<img class="cover" loading="lazy" src="${esc(b.cover)}" alt="">` : ''}
    </div>
    <div class="card-body">
      <h2>${esc(b.title)}</h2>
      <p class="author">${esc(b.author)}</p>
      <p class="card-downloads">${fmtDownloads(b.downloads)} downloads</p>
      ${b.mood ? `<span class="chip">${esc(b.mood)}</span>` : ''}
      ${b.hook ? `<p class="hook">${esc(b.hook)}</p>` : ''}
    </div>`;
  const img = card.querySelector('img.cover');
  img?.addEventListener('error', () => img.remove());
  card.addEventListener('click', () => onPick(b, card));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onPick(b, card);
  });
  return card;
}

export function renderGrid(books: Book[],
                          onPick: (b: Book, el: HTMLElement) => void): void {
  const grid = document.getElementById('grid')!;
  const count = document.getElementById('count')!;
  count.textContent = `${books.length.toLocaleString()} book${books.length === 1 ? '' : 's'}`;
  grid.replaceChildren(...books.map((b) => bookCard(b, onPick)));
}
