// Linia selectată: desenare progresivă a traseului, puls care curge în sensul de mers,
// zbor al camerei spre traseu. Totul cu MapLibre nativ (line-gradient + line-progress).
import { LngLatBounds, type ExpressionSpecification, type GeoJSONSource, type Map as MlMap } from 'maplibre-gl';
import type { Feature, Point } from 'geojson';
import type { AppData } from '../data.ts';
import { DUR, easeInOutCubic, easeOutQuart, ms, reducedMotion } from '../motion/tokens.ts';
import { EMPTY, LAYER, setDimmed } from './layers.ts';

let raf = 0;

const TRANSPARENT = 'rgba(255,255,255,0)';

/** expresie line-progress din perechi [poziție, culoare]; elimină pozițiile care nu cresc strict */
function ramp(stops: [number, string][]): ExpressionSpecification {
  const out: (number | string)[] = [];
  let last = -1;
  for (const [pos, c] of stops) {
    const p = Math.min(1, Math.max(0, pos));
    if (p <= last) continue;
    out.push(p, c);
    last = p;
  }
  return ['interpolate', ['linear'], ['line-progress'], ...out] as ExpressionSpecification;
}

/** traseul vizibil de la 0 la p; capătul de desen are un mic „vârf” luminos */
function drawGradient(colour: string, p: number): ExpressionSpecification {
  if (p >= 1) return ramp([[0, colour], [1, colour]]);
  const a = Math.max(0.001, p);
  return ramp([[0, colour], [a - 0.02, colour], [a, '#ffffff'], [a + 0.0005, TRANSPARENT], [1, TRANSPARENT]]);
}

/** o bandă luminoasă care parcurge traseul de la început la sfârșit */
function pulseGradient(colour: string, q: number): ExpressionSpecification {
  const w = 0.06;
  return ramp([[0, colour], [q - w, colour], [q, mix(colour, 0.55)], [q + w, colour], [1, colour]]);
}

function mix(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) * (1 - t) + 255 * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

export interface Padding { top: number; right: number; bottom: number; left: number }

export function showSelection(map: MlMap, data: AppData, lineId: string | null, variantId: string | null, padding: Padding, fly = true) {
  cancelAnimationFrame(raf);
  const selSrc = map.getSource('selected') as GeoJSONSource;
  const stopSrc = map.getSource('selected-stops') as GeoJSONSource;

  if (!lineId) {
    selSrc.setData(EMPTY as never);
    stopSrc.setData(EMPTY as never);
    setDimmed(map, false);
    return;
  }
  const line = data.lineById.get(lineId)!;
  const colour = data.colourOf(lineId);
  const variant = line.variants.find((v) => v.id === variantId) ?? line.variants[0];

  // pe hartă: varianta activă, desenată în sensul de mers
  const features = data.routes.features.filter((f) => f.properties.variantId === variant?.id);
  selSrc.setData({ type: 'FeatureCollection', features } as never);

  // doar stațiile cu poziție; capetele de linie sunt cele oficiale (prima/ultima din listă)
  const all = variant?.stops ?? [];
  const stopFeatures: Feature<Point>[] = all.flatMap((st, i) => {
    const s = st.stopId ? data.stopById.get(st.stopId) : undefined;
    if (!s) return [];
    return [{
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: s.coord },
      properties: { id: s.id, name: st.name, groupId: s.groupId, colour, terminal: i === 0 || i === all.length - 1 },
    }];
  });
  stopSrc.setData({ type: 'FeatureCollection', features: [] } as never);
  setDimmed(map, true);

  if (fly) {
    // încadrează toate variantele liniei, ca harta să nu sară la schimbarea sensului
    const b = new LngLatBounds();
    for (const f of data.routes.features)
      if (f.properties.lineId === lineId) {
        const g = f.geometry;
        const parts = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
        for (const part of parts) for (const c of part) b.extend(c as [number, number]);
      }
    for (const s of stopFeatures) b.extend(s.geometry.coordinates as [number, number]);
    if (!b.isEmpty())
      map.fitBounds(b, {
        padding, pitch: 50, bearing: map.getBearing(), maxZoom: 15.2,
        duration: ms(DUR.camera), easing: easeInOutCubic, essential: false,
      });
  }

  if (reducedMotion()) {
    map.setPaintProperty(LAYER.selLine, 'line-gradient', drawGradient(colour, 1));
    stopSrc.setData({ type: 'FeatureCollection', features: stopFeatures } as never);
    return;
  }

  // 1) desenarea traseului; stațiile apar pe rând, pe măsură ce linia ajunge la ele
  const start = performance.now() + (fly ? 250 : 0);
  let shown = 0;
  const step = (now: number) => {
    const t = Math.min(1, Math.max(0, (now - start) / DUR.draw));
    const p = easeOutQuart(t);
    map.setPaintProperty(LAYER.selLine, 'line-gradient', drawGradient(colour, p));
    const due = Math.ceil(p * stopFeatures.length);
    if (due !== shown) {
      shown = due;
      stopSrc.setData({ type: 'FeatureCollection', features: stopFeatures.slice(0, shown) } as never);
    }
    if (t < 1) raf = requestAnimationFrame(step);
    else {
      stopSrc.setData({ type: 'FeatureCollection', features: stopFeatures } as never);
      raf = requestAnimationFrame(pulse(performance.now()));
    }
  };
  raf = requestAnimationFrame(step);

  // 2) pulsul: o bandă luminoasă parcurge traseul la fiecare ~3.2 s
  const pulse = (t0: number) => {
    const loop = (now: number) => {
      const period = 3200;
      const q = ((now - t0) % period) / period;
      // ~70% din perioadă banda e pe traseu, apoi o scurtă pauză
      const pos = q < 0.7 ? q / 0.7 : -1;
      map.setPaintProperty(LAYER.selLine, 'line-gradient', pos < 0 ? drawGradient(colour, 1) : pulseGradient(colour, pos));
      raf = requestAnimationFrame(loop);
    };
    return loop;
  };
}

export function stopSelectionAnimation() {
  cancelAnimationFrame(raf);
}
