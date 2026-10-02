// Călătoria aleasă în planificator, pe hartă: porțiunile de traseu parcurse cu fiecare linie,
// drumurile pe jos (punctat) și stațiile unde urci, cobori sau schimbi.
import { LngLatBounds, type GeoJSONSource, type Map as MlMap } from 'maplibre-gl';
import type { Feature, LineString, Point } from 'geojson';
import type { AppData } from '../data.ts';
import type { Itinerary, Network } from '../plan.ts';
import { DUR, easeInOutCubic, ms } from '../motion/tokens.ts';
import { EMPTY, setDimmed } from './layers.ts';
import type { Padding } from './selection.ts';

type XY = [number, number];

/** coordonatele traseului unei variante, într-o singură listă (părțile întrerupte se leagă) */
function variantPath(data: AppData, variantId: string): XY[] {
  const out: XY[] = [];
  for (const f of data.routes.features) {
    if (f.properties.variantId !== variantId) continue;
    const g = f.geometry;
    for (const part of g.type === 'LineString' ? [g.coordinates] : g.coordinates) out.push(...(part as XY[]));
  }
  return out;
}

/** proiecția unui punct pe segmentul [a, b], în metri locali: distanța și poziția (0..1) */
function project(p: XY, a: XY, b: XY) {
  const k = Math.cos((p[1] * Math.PI) / 180) * 111320, m = 110540;
  const ax = (a[0] - p[0]) * k, ay = (a[1] - p[1]) * m, bx = (b[0] - p[0]) * k, by = (b[1] - p[1]) * m;
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len)) : 0;
  return { d: Math.hypot(ax + t * dx, ay + t * dy), t };
}

/** porțiunea de traseu dintre două stații ale variantei; stațiile se așază pe traseu în ordine,
 *  ca liniile circulare sau cele care trec de două ori pe aceeași stradă să nu sară înainte */
function slice(path: XY[], stopCoords: XY[], fromIndex: number, toIndex: number): XY[] {
  const straight = stopCoords.slice(fromIndex, toIndex + 1);
  if (path.length < 2) return straight;
  const pos: { seg: number; t: number; d: number }[] = [];
  let from = 0;
  for (const c of stopCoords.slice(0, toIndex + 1)) {
    let best = { seg: from, t: 0, d: Infinity };
    for (let i = from; i < path.length - 1; i++) {
      const r = project(c, path[i], path[i + 1]);
      if (r.d < best.d) best = { seg: i, t: r.t, d: r.d };
      if (r.d < 35) break; // prima trecere pe lângă stație e cea bună
    }
    pos.push(best);
    from = best.seg;
  }
  const a = pos[fromIndex], b = pos[toIndex];
  // traseul nu trece pe lângă stații: mai bine linii drepte între ele decât un desen greșit
  if (a.d > 150 || b.d > 150 || b.seg < a.seg || (b.seg === a.seg && b.t <= a.t)) return straight;
  const at = (s: { seg: number; t: number }): XY => {
    const p = path[s.seg], q = path[s.seg + 1];
    return [p[0] + (q[0] - p[0]) * s.t, p[1] + (q[1] - p[1]) * s.t];
  };
  return [at(a), ...path.slice(a.seg + 1, b.seg + 1), at(b)];
}

export function drawPlan(map: MlMap, data: AppData, net: Network, it: Itinerary | null, padding: Padding) {
  const lineSrc = map.getSource('plan') as GeoJSONSource | undefined;
  const stopSrc = map.getSource('plan-stops') as GeoJSONSource | undefined;
  if (!lineSrc || !stopSrc) return;
  if (!it) {
    lineSrc.setData(EMPTY as never);
    stopSrc.setData(EMPTY as never);
    return;
  }
  const coordOf = (stopId: string | null) => (stopId ? data.stopById.get(stopId)?.coord : undefined);
  const lines: Feature<LineString>[] = [];
  const points: Feature<Point>[] = [];
  const point = (c: XY, name: string | null, colour: string, role: 'end' | 'change') =>
    points.push({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: { name: name ?? '', colour, role } });

  it.legs.forEach((leg, i) => {
    const last = i === it.legs.length - 1;
    if (leg.kind === 'ride') {
      const v = net.variants.get(leg.variantId)!;
      const colour = data.colourOf(leg.lineId);
      const coords = v.stops.map((s) => coordOf(s.stopId) ?? null);
      // stațiile fără poziție nu există în date (toate au stopId), dar rămâne o plasă de siguranță
      if (coords.some((c) => !c)) return;
      const path = slice(variantPath(data, v.id), coords as XY[], leg.fromIndex, leg.toIndex);
      lines.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: path }, properties: { colour, walk: false } });
      const a = coords[leg.fromIndex]!, b = coords[leg.toIndex]!;
      point(a, v.stops[leg.fromIndex].name, colour, i === 0 ? 'end' : 'change');
      point(b, v.stops[leg.toIndex].name, colour, last ? 'end' : 'change');
    } else {
      const a = net.places.get(leg.from)!, b = net.places.get(leg.to)!;
      lines.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [a.coord, b.coord] }, properties: { colour: '#55555c', walk: true } });
      if (i === 0) point(a.coord, a.name, '#17171a', 'end');
      if (last) point(b.coord, b.name, '#17171a', 'end');
    }
  });

  lineSrc.setData({ type: 'FeatureCollection', features: lines } as never);
  stopSrc.setData({ type: 'FeatureCollection', features: points } as never);
  setDimmed(map, true);

  const bounds = new LngLatBounds();
  for (const f of lines) for (const c of f.geometry.coordinates) bounds.extend(c as XY);
  if (!bounds.isEmpty())
    map.fitBounds(bounds, { padding, pitch: 45, bearing: map.getBearing(), maxZoom: 15.5, duration: ms(DUR.camera), easing: easeInOutCubic, essential: false });
}
