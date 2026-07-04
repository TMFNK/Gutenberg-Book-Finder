import type { Book } from './types';

export function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
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
      ${b.mood ? `<span class="chip">${esc(b.mood)}</span>` : ''}
      ${b.hook ? `<p class="hook">${esc(b.hook)}</p>` : ''}
    </div>`;
  const img = card.querySelector('img.cover');
  img?.addEventListener('error', () => img.remove());
  card.addEventListener('click', () => onPick(b));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onPick(b);
  });
  return card;
}

export function renderGrid(books: Book[], onPick: (b: Book) => void): void {
  const grid = document.getElementById('grid')!;
  const count = document.getElementById('count')!;
  count.textContent = `${books.length} book${books.length === 1 ? '' : 's'}`;
  grid.replaceChildren(...books.map((b) => bookCard(b, onPick)));
}
