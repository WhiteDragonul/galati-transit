// Surse și straturi pentru linii și stații.
import type { ExpressionSpecification, Map as MlMap } from 'maplibre-gl';
import { type AppData, hasWarnings } from '../data.ts';
import { FONT, FONT_BOLD, LABELS_BEFORE } from './style.ts';

const z = (...stops: number[]): ExpressionSpecification => ['interpolate', ['exponential', 1.5], ['zoom'], ...stops];
/** interpolare după zoom (trebuie să fie exterioară), cu valori diferite pentru capetele de linie */
const byTerminal = (...stops: [zoom: number, terminal: number, normal: number][]): ExpressionSpecification =>
  ['interpolate', ['linear'], ['zoom'], ...stops.flatMap(([zm, t, n]) => [zm, ['case', ['get', 'terminal'], t, n]])] as ExpressionSpecification;

export const LAYER = {
  casing: 'routes-casing',
  line: 'routes-line',
  incomplete: 'routes-incomplete',
  hit: 'routes-hit',
  selCasing: 'sel-casing',
  selLine: 'sel-line',
  stops: 'stops-circle',
  stopLabels: 'stops-label',
  selStops: 'sel-stops',
  selStopLabels: 'sel-stops-label',
  planCasing: 'plan-casing',
  planLine: 'plan-line',
  planWalk: 'plan-walk',
  planStops: 'plan-stops',
  planLabels: 'plan-labels',
} as const;

export const EMPTY = { type: 'FeatureCollection', features: [] } as const;

export function addLayers(map: MlMap, data: AppData) {
  addChipImage(map);

  map.addSource('routes', { type: 'geojson', data: data.routes });
  map.addSource('stops', { type: 'geojson', data: data.stops });
  map.addSource('selected', { type: 'geojson', data: EMPTY as never, lineMetrics: true });
  map.addSource('selected-stops', { type: 'geojson', data: EMPTY as never });

  const incompleteIds = data.lines.filter(hasWarnings).map((l) => l.id);
  const fade = { duration: 450, delay: 0 };

  map.addLayer({
    id: LAYER.casing, type: 'line', source: 'routes',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': z(10, 2.5, 13, 5, 16, 11), 'line-opacity': 0, 'line-opacity-transition': fade },
  }, LABELS_BEFORE);
  map.addLayer({
    id: LAYER.line, type: 'line', source: 'routes',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': ['get', 'colour'], 'line-width': z(10, 1.2, 13, 2.6, 16, 6), 'line-opacity': 0, 'line-opacity-transition': fade },
  }, LABELS_BEFORE);
  // liniile cu date incomplete: o linie albă întreruptă peste culoare = aspect punctat
  map.addLayer({
    id: LAYER.incomplete, type: 'line', source: 'routes',
    filter: ['in', ['get', 'lineId'], ['literal', incompleteIds]],
    paint: { 'line-color': '#ffffff', 'line-width': z(10, 0.8, 13, 1.6, 16, 3.5), 'line-dasharray': [1.2, 1.6], 'line-opacity': 0, 'line-opacity-transition': fade },
  }, LABELS_BEFORE);
  map.addLayer({
    id: LAYER.hit, type: 'line', source: 'routes',
    paint: { 'line-color': '#000', 'line-width': 16, 'line-opacity': 0 },
  }, LABELS_BEFORE);

  map.addLayer({
    id: LAYER.selCasing, type: 'line', source: 'selected',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': z(10, 5, 13, 9, 16, 16), 'line-opacity': 0.95 },
  }, LABELS_BEFORE);
  map.addLayer({
    id: LAYER.selLine, type: 'line', source: 'selected',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-width': z(10, 3, 13, 5.5, 16, 10), 'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,0)'] },
  }, LABELS_BEFORE);

  map.addLayer({
    id: LAYER.stops, type: 'circle', source: 'stops', minzoom: 12.5,
    paint: {
      'circle-radius': z(12.5, 1.5, 15, 3.5, 17, 6),
      'circle-color': '#ffffff',
      'circle-stroke-color': '#3b3b3b',
      'circle-stroke-width': z(12.5, 0.6, 16, 1.6),
      'circle-opacity': 1, 'circle-stroke-opacity': 1,
      'circle-opacity-transition': fade, 'circle-stroke-opacity-transition': fade,
    },
  });
  map.addLayer({
    id: LAYER.stopLabels, type: 'symbol', source: 'stops', minzoom: 15,
    layout: {
      'text-field': ['coalesce', ['get', 'name'], ''], 'text-font': FONT, 'text-size': 11,
      'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true, 'symbol-sort-key': 1,
    },
    paint: { 'text-color': '#4a4a4a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4, 'text-opacity': 1, 'text-opacity-transition': fade },
  });

  map.addLayer({
    id: LAYER.selStops, type: 'circle', source: 'selected-stops',
    paint: {
      'circle-radius': byTerminal([10, 4.5, 2.6], [16, 9, 6]),
      'circle-color': '#ffffff',
      'circle-stroke-color': ['get', 'colour'],
      'circle-stroke-width': byTerminal([10, 2.2, 1.6], [16, 4, 3]),
      'circle-radius-transition': { duration: 300, delay: 0 },
    },
  });
  // etichete-„chip” albe, ca în referință; capetele de linie sunt mereu vizibile
  map.addLayer({
    id: LAYER.selStopLabels, type: 'symbol', source: 'selected-stops',
    layout: {
      'text-field': ['coalesce', ['get', 'name'], '(fără nume)'],
      'text-font': ['case', ['get', 'terminal'], ['literal', FONT_BOLD], ['literal', FONT]],
      'text-size': ['case', ['get', 'terminal'], 12.5, 11],
      'icon-image': 'chip', 'icon-text-fit': 'both', 'icon-text-fit-padding': [3, 7, 3, 7],
      'text-anchor': 'bottom', 'text-offset': [0, -1.1],
      'symbol-sort-key': ['case', ['get', 'terminal'], 0, 1],
      'text-allow-overlap': false, 'icon-allow-overlap': false,
    },
    paint: { 'text-color': '#1d1d1f', 'text-opacity': 1, 'icon-opacity': 1 },
  });

  // ——— călătoria din planificator ———
  map.addSource('plan', { type: 'geojson', data: EMPTY as never });
  map.addSource('plan-stops', { type: 'geojson', data: EMPTY as never });
  map.addLayer({
    id: LAYER.planCasing, type: 'line', source: 'plan', filter: ['!', ['get', 'walk']],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': z(10, 5, 13, 9, 16, 16), 'line-opacity': 0.95 },
  }, LABELS_BEFORE);
  map.addLayer({
    id: LAYER.planLine, type: 'line', source: 'plan', filter: ['!', ['get', 'walk']],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': ['get', 'colour'], 'line-width': z(10, 3, 13, 5.5, 16, 10) },
  }, LABELS_BEFORE);
  map.addLayer({
    id: LAYER.planWalk, type: 'line', source: 'plan', filter: ['get', 'walk'],
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': ['get', 'colour'], 'line-width': z(10, 2, 16, 4), 'line-dasharray': [0.1, 2] },
  }, LABELS_BEFORE);
  map.addLayer({
    id: LAYER.planStops, type: 'circle', source: 'plan-stops',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, ['case', ['==', ['get', 'role'], 'end'], 5, 4], 16, ['case', ['==', ['get', 'role'], 'end'], 10, 8]],
      'circle-color': ['case', ['==', ['get', 'role'], 'end'], ['get', 'colour'], '#ffffff'],
      'circle-stroke-color': ['case', ['==', ['get', 'role'], 'end'], '#ffffff', ['get', 'colour']],
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 16, 3.5],
    },
  });
  map.addLayer({
    id: LAYER.planLabels, type: 'symbol', source: 'plan-stops',
    layout: {
      'text-field': ['get', 'name'], 'text-font': ['literal', FONT_BOLD], 'text-size': 12,
      'icon-image': 'chip', 'icon-text-fit': 'both', 'icon-text-fit-padding': [3, 7, 3, 7],
      'text-anchor': 'bottom', 'text-offset': [0, -1.2],
    },
    paint: { 'text-color': '#1d1d1f' },
  });
}

/** 9-slice cu colțuri rotunjite și umbră fină, pentru etichete */
function addChipImage(map: MlMap) {
  const r = window.devicePixelRatio || 1;
  const w = 24, h = 24, rad = 6;
  const c = document.createElement('canvas');
  c.width = w * r; c.height = h * r;
  const g = c.getContext('2d')!;
  g.scale(r, r);
  g.shadowColor = 'rgba(0,0,0,0.18)'; g.shadowBlur = 3; g.shadowOffsetY = 1;
  g.fillStyle = '#fff';
  g.beginPath(); g.roundRect(2, 2, w - 4, h - 5, rad); g.fill();
  g.shadowColor = 'transparent';
  g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1;
  g.beginPath(); g.roundRect(2.5, 2.5, w - 5, h - 6, rad); g.stroke();
  map.addImage('chip', g.getImageData(0, 0, w * r, h * r), {
    pixelRatio: r,
    stretchX: [[(rad + 2) * r, (w - rad - 2) * r]],
    stretchY: [[(rad + 2) * r, (h - rad - 3) * r]],
    content: [(rad) * r, 4 * r, (w - rad) * r, (h - 5) * r],
  });
}

export function setDimmed(map: MlMap, dimmed: boolean) {
  map.setPaintProperty(LAYER.line, 'line-opacity', dimmed ? 0.14 : 0.92);
  map.setPaintProperty(LAYER.casing, 'line-opacity', dimmed ? 0.35 : 1);
  map.setPaintProperty(LAYER.incomplete, 'line-opacity', dimmed ? 0.1 : 0.9);
  map.setPaintProperty(LAYER.stops, 'circle-opacity', dimmed ? 0.35 : 1);
  map.setPaintProperty(LAYER.stops, 'circle-stroke-opacity', dimmed ? 0.2 : 1);
  map.setPaintProperty(LAYER.stopLabels, 'text-opacity', dimmed ? 0 : 1);
}
