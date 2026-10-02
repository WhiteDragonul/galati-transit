// Popup pentru o stație: numele și toate liniile care opresc în grupul de stații (ambele sensuri).
import { Popup, type Map as MlMap } from 'maplibre-gl';
import type { AppData } from '../data.ts';
import { setState } from '../state.ts';
import { badge, esc } from './dom.ts';

let popup: Popup | null = null;

export function openStopPopup(map: MlMap, data: AppData, stopId: string) {
  const s = data.stopById.get(stopId);
  if (!s) return;
  const lineIds = data.groupLines.get(s.groupId) ?? s.lineIds;
  const lines = lineIds.map((id) => data.lineById.get(id)!).filter(Boolean);
  showPopup(map, s.coord, `
    <h3>${s.name ? esc(s.name) : 'Stație fără nume'}</h3>
    <p>${s.name ? `${lines.length} ${lines.length === 1 ? 'linie oprește' : 'linii opresc'} aici` : 'Numele lipsește din OpenStreetMap'}</p>
    <div class="badges">${lines.map((l) => `<button data-line="${l.id}" aria-label="${esc(`Linia ${l.ref}`)}">${badge(data, l, 'sm')}</button>`).join('')}</div>`);
}

/** clic pe hartă unde se suprapun mai multe linii: alegi linia */
export function openLinesPopup(map: MlMap, data: AppData, at: [number, number], lineIds: string[]) {
  const lines = lineIds.map((id) => data.lineById.get(id)!).filter(Boolean);
  showPopup(map, at, `
    <h3>${lines.length} linii aici</h3>
    <p>Alege o linie</p>
    <div class="badges">${lines.map((l) => `<button data-line="${l.id}" aria-label="${esc(`Linia ${l.ref}`)}">${badge(data, l, 'sm')}</button>`).join('')}</div>`);
}

function showPopup(map: MlMap, at: [number, number], html: string) {
  popup?.remove();
  popup = new Popup({ className: 'stop-popup', offset: 12, maxWidth: '300px', focusAfterOpen: false })
    .setLngLat(at)
    .setHTML(html)
    .addTo(map);
  popup.getElement().querySelectorAll<HTMLButtonElement>('[data-line]').forEach((b) =>
    b.addEventListener('click', () => {
      popup?.remove();
      setState({ lineId: b.dataset.line!, variantId: null });
    }),
  );
}

export const closePopup = () => popup?.remove();
