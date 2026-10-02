import { Map as MlMap, NavigationControl, type Point, type PointLike } from 'maplibre-gl';
import './map/worker.ts';
import { loadData } from './data.ts';
import { applyStatic, getLang, onLangChange, setLang, t, type Lang } from './i18n.ts';
import { addLayers, LAYER, setDimmed } from './map/layers.ts';
import { type Padding, showSelection } from './map/selection.ts';
import { loadBaseStyle } from './map/style.ts';
import { DUR, easeInOutCubic, ms } from './motion/tokens.ts';
import { getState, lineFromHash, setState, subscribe } from './state.ts';
import { $ } from './ui/dom.ts';
import { initPanel } from './ui/panel.ts';
import { closePopup, openLinesPopup, openStopPopup } from './ui/popup.ts';
import { initSheet } from './ui/sheet.ts';

const GALATI: [number, number] = [28.025, 45.435];

applyStatic();
const langSwitch = $('#lang-switch');
const syncLang = () => langSwitch.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.lang === getLang())));
syncLang();
langSwitch.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-lang]');
  if (b) setLang(b.dataset.lang as Lang);
});
onLangChange(() => {
  syncLang();
  closePopup();
});

async function main() {
  const loading = $('#loading');
  const [data, style] = await Promise.all([loadData(), loadBaseStyle()]);

  const map = new MlMap({
    container: 'map',
    style,
    center: GALATI,
    zoom: 11.2,
    pitch: 0,
    bearing: 0,
    maxPitch: 70,
    attributionControl: false,
    canvasContextAttributes: { antialias: true },
  });
  if (import.meta.env.DEV) Object.assign(window, { __map: map });
  map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
  // atribuirea obligatorie (ODbL pentru date, CC-BY pentru schema OpenMapTiles) e un element propriu de un rând
  // (index.html, #attribution): controlul MapLibre ar repeta atribuirea lungă din TileJSON

  // înălțimea vizibilă a sheet-ului: atribuirea stă mereu chiar deasupra lui
  const sheet = initSheet((px) => document.documentElement.style.setProperty('--sheet-visible', `${Math.round(px)}px`));
  const padding = (): Padding => {
    if (sheet.isMobile()) return { top: 70, right: 30, bottom: Math.round(window.innerHeight * 0.52) + 20, left: 30 };
    const panel = $('#panel').getBoundingClientRect();
    return { top: 70, right: 80, bottom: 60, left: panel.right + 40 };
  };

  const panel = initPanel(data, {
    onStopClick(stopId) {
      const s = data.stopById.get(stopId)!;
      // pe telefon sheet-ul rămâne la jumătate (acolo se deschide orarul), iar harta centrează stația deasupra lui
      if (sheet.isMobile() && sheet.snap !== 'half') sheet.snapTo('half');
      map.easeTo({ center: s.coord, zoom: Math.max(map.getZoom(), 15.5), duration: ms(900), easing: easeInOutCubic, padding: padding() });
      // pe telefon orarul din sheet ține deja locul popup-ului
      if (!sheet.isMobile()) openStopPopup(map, data, stopId);
    },
  });

  await new Promise<void>((r) => map.once('load', () => r()));
  addLayers(map, data);

  // ——— intro: harta se înclină, liniile apar, apoi panoul ———
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 600);
  setDimmed(map, false);
  panel.enter();
  sheet.enter();

  // ——— selecție ———
  subscribe((s, prev) => {
    if (s.lineId === prev.lineId && s.variantId === prev.variantId) return;
    closePopup();
    if (s.lineId && sheet.isMobile() && sheet.snap === 'peek') sheet.snapTo('half');
    if (!s.lineId && sheet.isMobile()) sheet.snapTo('peek');
    showSelection(map, data, s.lineId, s.variantId, padding(), s.lineId !== prev.lineId);
  });

  const initial = lineFromHash();
  if (initial && data.lineById.has(initial)) {
    map.jumpTo({ pitch: 52, bearing: -17 });
    setState({ lineId: initial });
  } else {
    map.easeTo({ zoom: 12.5, pitch: 52, bearing: -17, duration: ms(DUR.intro), easing: easeInOutCubic });
  }

  // ——— interacțiuni pe hartă ———
  const box = (p: Point, r: number): [PointLike, PointLike] => [[p.x - r, p.y - r], [p.x + r, p.y + r]];
  map.on('click', (e) => {
    const stop = map.queryRenderedFeatures(box(e.point, 8), { layers: [LAYER.selStops, LAYER.stops] })[0];
    if (stop) return openStopPopup(map, data, stop.properties.id);
    const hits = map.queryRenderedFeatures(box(e.point, 6), { layers: [LAYER.hit] });
    const ids = [...new Set(hits.map((f) => f.properties.lineId as string))];
    if (!ids.length) return;
    const current = getState().lineId;
    if (ids.length === 1 || (current && ids.includes(current) && ids.length === 1)) setState({ lineId: ids[0], variantId: null });
    else openLinesPopup(map, data, [e.lngLat.lng, e.lngLat.lat], ids.sort((a, b) => data.lines.indexOf(data.lineById.get(a)!) - data.lines.indexOf(data.lineById.get(b)!)));
  });
  for (const layer of [LAYER.hit, LAYER.stops, LAYER.selStops]) {
    map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && getState().lineId) setState({ lineId: null, variantId: null });
  });
}

main().catch((err) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) {
    loading.classList.add('error');
    loading.querySelector('p')!.textContent = t('loadError');
  }
});
