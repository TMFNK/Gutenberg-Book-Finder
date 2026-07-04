import type { Book } from './types';
import { esc } from './grid';

export interface DetailOpts {
  similar?: Book[];
  onPick?: (b: Book) => void;
  onFilterAuthor?: (author: string) => void;
  onClose?: () => void;
  returnFocus?: HTMLElement | null;
}

export function showDetail(b: Book | null, opts: DetailOpts = {}): void {
  const backdrop = document.getElementById('detail-backdrop')!;
  const panel = document.getElementById('detail')!;
  if (!b) {
    backdrop.hidden = true;
    panel.innerHTML = '';
    opts.onClose?.();
    opts.returnFocus?.focus();
    return;
  }
  backdrop.hidden = false;
  const similar = opts.similar ?? [];
  panel.innerHTML = `
    <button class="close" aria-label="Close">&times;</button>
    <div class="detail-scroll">
      <div class="detail-grid">
        ${b.cover ? `<img class="detail-cover" src="${esc(b.cover)}" alt="">` : ''}
        <div>
          <h2 id="detail-title">${esc(b.title)}</h2>
          <p class="author">${
            opts.onFilterAuthor
              ? `<button type="button" class="author-link">${esc(b.author)}</button>`
              : esc(b.author)
          }${b.lang !== 'en' ? ' &middot; ' + esc(b.lang) : ''}${
            b.year ? ' &middot; ' + esc(String(b.year)) : ''
          }</p>
          ${b.hook ? `<p class="hook">${esc(b.hook)}</p>` : ''}
          <p>
            ${b.mood ? `<span class="chip">${esc(b.mood)}</span>` : ''}
            ${(b.themes ?? []).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}
            ${b.difficulty ? `<span class="chip">${esc(b.difficulty)}</span>` : ''}
          </p>
          ${b.summary ? `<p class="summary">${esc(b.summary)}</p>` : ''}
          <p class="downloads">${b.downloads.toLocaleString()} downloads on Project Gutenberg</p>
          ${similar.length ? `
            <section class="similar" aria-label="You might also like">
              <h3>You might also like</h3>
              <div class="similar-list">
                ${similar.map((s) => `
                  <button type="button" class="similar-card" data-id="${s.id}">
                    ${s.cover ? `<img src="${esc(s.cover)}" alt="" loading="lazy">` : ''}
                    <span class="similar-title">${esc(s.title)}</span>
                    <span class="similar-author">${esc(s.author)}</span>
                  </button>`).join('')}
              </div>
            </section>` : ''}
        </div>
      </div>
    </div>
    <p class="read-row"><a class="read" href="${esc(b.url)}" target="_blank" rel="noopener">Read free at Project Gutenberg &rarr;</a></p>`;
  const close = () => showDetail(null, opts);
  panel.querySelector('.close')!.addEventListener('click', close);
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
  panel.querySelector('.author-link')
    ?.addEventListener('click', () => opts.onFilterAuthor?.(b.author));
  for (const btn of panel.querySelectorAll<HTMLButtonElement>('.similar-card')) {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const next = similar.find((s) => s.id === id);
      if (next) opts.onPick?.(next);
    });
  }
  (panel.querySelector('.close') as HTMLElement).focus();
}
