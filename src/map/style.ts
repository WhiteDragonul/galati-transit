// Stilul de bază: OpenFreeMap Positron (deschis, minimal), cu clădiri 3D și tonuri ajustate.
import type { StyleSpecification } from 'maplibre-gl';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

export async function loadBaseStyle(): Promise<StyleSpecification> {
  const style: StyleSpecification = await fetch(STYLE_URL).then((r) => r.json());

  const layers = [];
  for (const layer of style.layers) {
    if (layer.id === 'building') {
      // clădiri extrudate: apar treptat între zoom 13 și 14.5
      layers.push({
        id: 'building-3d',
        type: 'fill-extrusion',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 12,
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, '#e9e7e2', 40, '#dcd9d2'],
          'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 12, 0, 14, ['coalesce', ['get', 'render_height'], 6]],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 13, 0.85],
          'fill-extrusion-vertical-gradient': true,
        },
      } as StyleSpecification['layers'][number]);
      continue;
    }
    if (layer.id === 'background' && layer.type === 'background') layer.paint = { ...layer.paint, 'background-color': '#f4f3ef' };
    if (layer.id === 'water' && layer.type === 'fill') layer.paint = { ...layer.paint, 'fill-color': '#d7e3ea' };
    if (layer.id === 'park' && layer.type === 'fill') layer.paint = { ...layer.paint, 'fill-color': '#e6ece0' };
    layers.push(layer);
  }
  style.layers = layers;
  return style;
}

/** primul strat de etichete: liniile noastre se desenează sub el */
export const LABELS_BEFORE = 'highway-name-path';
export const FONT = ['Noto Sans Regular'];
export const FONT_BOLD = ['Noto Sans Bold'];
