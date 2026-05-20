import { isGameLogFlipLine, type GameLogEntry } from '../../../shared/types';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface RenderedLogEntry {
  id: string;
  html: string;
}

/** Newest first, matching the game-log panel. */
export function renderGameLog(entries: GameLogEntry[] | undefined): RenderedLogEntry[] {
  if (!entries?.length) return [];

  return [...entries].reverse().map((entry) => {
    if (isGameLogFlipLine(entry)) {
      const title = escapeHtml(entry.title);
      const html = entry.correct
        ? `<span class="log-highlight">${title}</span> — <span class="log-correct">✓ Correct!</span>`
        : `<span class="log-highlight">${title}</span> — <span class="log-wrong">✗ Wrong</span>`;
      return { id: entry.id, html };
    }
    const who = escapeHtml(entry.who);
    const action = escapeHtml(entry.action);
    const consequence = escapeHtml(entry.consequence);
    return {
      id: entry.id,
      html: `<span class="log-who">${who}</span> <span class="log-action">${action}</span> — <span class="log-result">${consequence}</span>`,
    };
  });
}
