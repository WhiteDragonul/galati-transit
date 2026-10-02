import type { FeatureCollection, LineString, MultiLineString, Point } from 'geojson';
import type { Line, LinesFile, Mode, RouteProps, StopProps, Variant } from '../shared/model.ts';

export type { Line, Mode, Variant, StopProps };

export interface AppData {
  meta: Omit<LinesFile, 'lines'>;
  lines: Line[];
  lineById: Map<string, Line>;
  routes: FeatureCollection<LineString | MultiLineString, RouteProps>;
  stops: FeatureCollection<Point, StopProps>;
  stopById: Map<string, StopProps & { coord: [number, number] }>;
  /** groupId → id-urile liniilor care opresc în grup (ambele sensuri) */
  groupLines: Map<string, string[]>;
  /** culoarea afișată: din date sau din paleta de rezervă */
  colourOf: (lineId: string) => string;
  colourIsFallback: (lineId: string) => boolean;
}

// Paletă de rezervă (folosită doar când sursa nu are culoare). Ordinea alternează nuanțele
// ca liniile cu numere apropiate să nu semene între ele.
const FALLBACK: Record<Mode, string[]> = {
  tram: ['#e4002b', '#c2185b', '#ef6c00', '#8e24aa', '#d81b60', '#bf360c', '#ad1457'],
  trolleybus: ['#00897b', '#2e7d32'],
  bus: [
    '#1565c0', '#00a3a1', '#7cb342', '#f9a825', '#5e35b1', '#00838f', '#6d4c41', '#3949ab',
    '#43a047', '#0277bd', '#9e9d24', '#546e7a', '#039be5', '#558b2f', '#00695c', '#4527a0',
  ],
};

/** baza datelor statice; pe GitHub Pages aplicația nu stă la rădăcina domeniului */
export const DATA = `${import.meta.env.BASE_URL}data/`;

export const MODE_LABEL: Record<Mode, string> = { tram: 'Tramvai', trolleybus: 'Troleibuz', bus: 'Autobuz' };

export async function loadData(): Promise<AppData> {
  const [linesFile, routes, stops] = await Promise.all([
    fetch(`${DATA}lines.json`).then((r) => r.json() as Promise<LinesFile>),
    fetch(`${DATA}routes.geojson`).then((r) => r.json()),
    fetch(`${DATA}stops.geojson`).then((r) => r.json()),
  ]);
  const { lines, ...meta } = linesFile;
  const lineById = new Map(lines.map((l) => [l.id, l]));

  const colours = new Map<string, string>();
  const counters: Record<Mode, number> = { tram: 0, trolleybus: 0, bus: 0 };
  for (const l of lines) {
    if (l.colour) colours.set(l.id, l.colour);
    else {
      const pal = FALLBACK[l.mode];
      colours.set(l.id, pal[counters[l.mode]++ % pal.length]);
    }
  }

  const stopById = new Map<string, StopProps & { coord: [number, number] }>();
  const groupLines = new Map<string, Set<string>>();
  for (const f of (stops as FeatureCollection<Point, StopProps>).features) {
    const p = f.properties;
    stopById.set(p.id, { ...p, coord: f.geometry.coordinates as [number, number] });
    const g = groupLines.get(p.groupId) ?? new Set();
    p.lineIds.forEach((id) => g.add(id));
    groupLines.set(p.groupId, g);
  }
  const order = new Map(lines.map((l, i) => [l.id, i]));

  // culoarea afișată intră în proprietățile feature-urilor, pentru expresiile MapLibre
  for (const f of (routes as AppData['routes']).features) f.properties.colour = colours.get(f.properties.lineId)!;

  return {
    meta,
    lines,
    lineById,
    routes,
    stops,
    stopById,
    groupLines: new Map([...groupLines].map(([g, s]) => [g, [...s].sort((a, b) => order.get(a)! - order.get(b)!)])),
    colourOf: (id) => colours.get(id) ?? '#888',
    colourIsFallback: (id) => !lineById.get(id)?.colour,
  };
}

export function hasWarnings(line: Line) {
  return line.issues.some((i) => i.severity === 'warn') || line.variants.some((v) => v.issues.some((i) => i.severity === 'warn'));
}

/** „Capăt A ↔ Capăt B”, doar din date; null dacă nu se știe */
export function terminalsLabel(line: Line): string | null {
  const v = line.variants.find((x) => x.direction === 'tur') ?? line.variants[0];
  if (!v) return null;
  if (v.from && v.to) return v.from === v.to ? `Circular · ${v.from}` : `${v.from} ↔ ${v.to}`;
  return null;
}
