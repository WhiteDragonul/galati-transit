import type { AppData, Line } from '../data.ts';

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function badge(data: AppData, line: Line, size: '' | 'sm' | 'lg' = '') {
  const long = line.ref.length > 3 ? ' data-long' : '';
  return `<span class="badge ${size}" data-mode="${line.mode}" style="--c:${data.colourOf(line.id)}"${long} aria-hidden="true">${esc(line.ref)}</span>`;
}

export const WARN_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 15 14H1L8 1.5Zm-.75 4.5v4h1.5V6h-1.5Zm0 5.25v1.5h1.5v-1.5h-1.5Z"/></svg>';
export const BACK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
