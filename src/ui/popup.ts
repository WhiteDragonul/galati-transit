// Popup pentru o stație: numele, liniile care opresc acolo și următoarele plecări (din orarul oficial).
import { Popup, type Map as MlMap } from 'maplibre-gl';
import type { AppData, Line, Variant } from '../data.ts';
import { dayTypeIndexFor, inMinutes, loadSchedule, nowMinutes, upcoming } from '../schedule.ts';
import { t } from '../i18n.ts';
import { setState } from '../state.ts';
import { badge, esc } from './dom.ts';
import { planEnd } from './planner.ts';

let popup: Popup | null = null;
let token = 0;

/** toate opririle (linie, variantă, index) în grupul de stații al acestei stații */
function departuresAt(data: AppData, groupId: string) {
  const out: { line: Line; v: Variant; index: number }[] = [];
  for (const line of data.lines)
    for (const v of line.variants)
      v.stops.forEach((st, index) => {
        if (index === v.stops.length - 1) return; // la capăt nu se pleacă
        if (st.stopId && data.stopById.get(st.stopId)?.groupId === groupId) out.push({ line, v, index });
      });
  return out;
}

export function openStopPopup(map: MlMap, data: AppData, stopId: string) {
  const s = data.stopById.get(stopId);
  if (!s) return;
  const lineIds = data.groupLines.get(s.groupId) ?? s.lineIds;
  const lines = lineIds.map((id) => data.lineById.get(id)!).filter(Boolean);
  const stops = departuresAt(data, s.groupId);
  const my = ++token;

  showPopup(map, s.coord, `
    <h3>${s.name ? esc(s.name) : t('unnamedStop')}</h3>
    <p>${s.name ? (lines.length === 1 ? t('lineStopsHere') : t('linesStopHere', { n: lines.length })) : t('nameMissing')}</p>
    <div class="badges">${lines.map((l) => `<button data-line="${l.id}" aria-label="${esc(t('lineN', { ref: l.ref }))}">${badge(data, l, 'sm')}</button>`).join('')}</div>
    <div class="plan-btns"><button data-plan="from" data-place="${esc(s.groupId)}">${t('planFromHere')}</button><button data-plan="to" data-place="${esc(s.groupId)}">${t('planToHere')}</button></div>
    ${stops.length ? `<div class="deps"><p class="tt-msg">${t('loadingDepartures')}</p></div>` : ''}`);

  if (!stops.length) return;
  Promise.all(stops.map(async (x) => ({ ...x, sch: await loadSchedule(x.line) }))).then((rows) => {
    if (my !== token || !popup) return;
    const now = nowMinutes();
    const items = rows
      .map(({ line, v, index, sch }) => {
        if (!sch || !v.scheduleKey) return null;
        const times = sch.variants[v.scheduleKey]?.stops[index]?.times[dayTypeIndexFor(sch.dayTypes)] ?? [];
        return { line, v, next: upcoming(times, 2, now) };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => (a.next[0] ?? '99:99').localeCompare(b.next[0] ?? '99:99'));
    const el = popup.getElement().querySelector('.deps');
    if (!el) return;
    el.innerHTML = items.length
      ? `<p class="deps-h">${t('nextDepartures')}</p><ul>${items
          .map(({ line, v, next }) => `<li><button data-line="${line.id}" data-variant="${v.id}">${badge(data, line, 'sm')}<span class="to">${v.to ? esc(t('towards', { to: v.to })) : '—'}</span>
            <span class="when">${next.length ? `<b>${next[0]}</b> <small>${inMinutes(next[0], now)}</small>${next[1] ? ` <small>· ${next[1]}</small>` : ''}` : `<small>${t('notToday')}</small>`}</span></button></li>`)
          .join('')}</ul>`
      : '';
    wire();
  });
}

/** clic pe hartă unde se suprapun mai multe linii: alegi linia */
export function openLinesPopup(map: MlMap, data: AppData, at: [number, number], lineIds: string[]) {
  const lines = lineIds.map((id) => data.lineById.get(id)!).filter(Boolean);
  token++;
  showPopup(map, at, `
    <h3>${t('linesHere', { n: lines.length })}</h3>
    <p>${t('pickLine')}</p>
    <div class="badges">${lines.map((l) => `<button data-line="${l.id}" aria-label="${esc(t('lineN', { ref: l.ref }))}">${badge(data, l, 'sm')}</button>`).join('')}</div>`);
}

function showPopup(map: MlMap, at: [number, number], html: string) {
  popup?.remove();
  popup = new Popup({ className: 'stop-popup', offset: 12, maxWidth: '320px', focusAfterOpen: false })
    .setLngLat(at)
    .setHTML(html)
    .addTo(map);
  popup.on('close', () => { popup = null; });
  wire();
}

function wire() {
  popup?.getElement().querySelectorAll<HTMLButtonElement>('[data-plan]:not([data-wired])').forEach((b) => {
    b.dataset.wired = '1';
    b.addEventListener('click', () => {
      popup?.remove();
      planEnd(b.dataset.plan as 'from' | 'to', b.dataset.place!);
    });
  });
  popup?.getElement().querySelectorAll<HTMLButtonElement>('[data-line]:not([data-wired])').forEach((b) => {
    b.dataset.wired = '1';
    b.addEventListener('click', () => {
      popup?.remove();
      setState({ lineId: b.dataset.line!, variantId: b.dataset.variant ?? null });
    });
  });
}

export const closePopup = () => popup?.remove();
