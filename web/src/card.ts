import type { Book } from './types';
import { esc } from './grid';

export function showDetail(b: Book | null): void {
  const backdrop = document.getElementById('detail-backdrop')!;
  const panel = document.getElementById('detail')!;
  if (!b) { backdrop.hidden = true; return; }
  backdrop.hidden = false;
  panel.innerHTML = `
    <button class="close" aria-label="Close">&times;</button>
    <div class="detail-grid">
      ${b.cover ? `<img class="detail-cover" src="${esc(b.cover)}" alt="">` : ''}
      <div>
        <h2>${esc(b.title)}</h2>
        <p class="author">${esc(b.author)}${b.lang !== 'en' ? ' &middot; ' + esc(b.lang) : ''}</p>
        ${b.hook ? `<p class="hook">${esc(b.hook)}</p>` : ''}
        <p>
          ${b.mood ? `<span class="chip">${esc(b.mood)}</span>` : ''}
          ${(b.themes ?? []).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}
          ${b.difficulty ? `<span class="chip">${esc(b.difficulty)}</span>` : ''}
        </p>
        ${b.summary ? `<p class="summary">${esc(b.summary)}</p>` : ''}
        <p class="downloads">${b.downloads.toLocaleString()} downloads</p>
        <a class="read" href="${esc(b.url)}" target="_blank" rel="noopener">Read free at Project Gutenberg &rarr;</a>
      </div>
    </div>`;
  panel.querySelector('.close')!.addEventListener('click', () => showDetail(null));
  backdrop.onclick = (e) => { if (e.target === backdrop) showDetail(null); };
}
