import type { Book } from './types';
import { esc } from './grid';

function similarSection(title: string, books: Book[]): string {
  if (!books.length) return '';
  return `
    <section class="similar" aria-label="${esc(title)}">
      <h3>${esc(title)}</h3>
      <div class="similar-list">
        ${books.map((s) => `
          <button type="button" class="similar-card" data-id="${s.id}">
            ${s.cover ? `<img src="${esc(s.cover)}" alt="" loading="lazy">` : ''}
            <span class="similar-title">${esc(s.title)}</span>
            <span class="similar-author">${esc(s.author)}</span>
          </button>`).join('')}
      </div>
    </section>`;
}

let focusTrapHandler: ((e: KeyboardEvent) => void) | null = null;

function trapFocus(panel: HTMLElement): void {
  if (focusTrapHandler) panel.removeEventListener('keydown', focusTrapHandler);
  focusTrapHandler = (e) => {
    if (e.key !== 'Tab') return;
    const nodes = panel.querySelectorAll<HTMLElement>(
      'button, [href], [tabindex]:not([tabindex="-1"])');
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  panel.addEventListener('keydown', focusTrapHandler);
}

export interface DetailOpts {
  similar?: Book[];
  byAuthor?: Book[];
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
  const byAuthor = opts.byAuthor ?? [];
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
          <button type="button" class="share-btn">Copy link to share</button>
          ${similarSection('You might also like', similar)}
          ${similarSection(`More by ${b.author}`, byAuthor)}
        </div>
      </div>
    </div>
    <p class="read-row"><a class="read" href="${esc(b.url)}" target="_blank" rel="noopener">Read free at Project Gutenberg &rarr;</a></p>`;
  const close = () => opts.onClose?.();
  panel.querySelector('.close')!.addEventListener('click', close);
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
  panel.querySelector('.author-link')
    ?.addEventListener('click', () => opts.onFilterAuthor?.(b.author));
  const allRelated = [...similar, ...byAuthor];
  for (const btn of panel.querySelectorAll<HTMLButtonElement>('.similar-card')) {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const next = allRelated.find((s) => s.id === id);
      if (next) opts.onPick?.(next);
    });
  }
  const shareBtn = panel.querySelector('.share-btn') as HTMLButtonElement;
  shareBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      shareBtn.textContent = 'Link copied!';
      setTimeout(() => { shareBtn.textContent = 'Copy link to share'; }, 2000);
    } catch {
      shareBtn.textContent = 'Could not copy';
      setTimeout(() => { shareBtn.textContent = 'Copy link to share'; }, 2000);
    }
  });
  trapFocus(panel);
  (panel.querySelector('.close') as HTMLElement).focus();
}
