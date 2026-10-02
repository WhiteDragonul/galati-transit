// Calcul de traseu pe rețeaua de străzi OSM (Dijkstra), pentru liniile care nu au relație în OSM.
// Respectă sensurile unice și preferă străzile pe care circulă deja transport public.
import { type Coord, distanceM } from './geo.ts';

export interface RoadsRaw {
  fetchedAt: string;
  osmBase: string | null;
  ways: { id: number; hw: string; ow: string; n: number[]; c: Coord[] }[];
}

// cost relativ pe tip de stradă (autobuzele merg pe artere, nu pe alei)
const HW_FACTOR: Record<string, number> = {
  motorway: 1, trunk: 1, primary: 1, secondary: 1, tertiary: 1.1, busway: 0.8,
  motorway_link: 1, trunk_link: 1, primary_link: 1, secondary_link: 1, tertiary_link: 1.1,
  unclassified: 1.4, residential: 1.6, living_street: 3, service: 3,
};
/** străzile folosite deja de alte linii (relații OSM) costă mai puțin */
const TRANSIT_FACTOR = 0.6;

export class Router {
  private coord = new Map<number, Coord>();
  private adj = new Map<number, { to: number; w: number }[]>();
  private snapNodes: number[] = [];

  constructor(roads: RoadsRaw, transitWayIds: Set<number>) {
    const snap = new Set<number>();
    for (const w of roads.ways) {
      const f = (HW_FACTOR[w.hw] ?? 2) * (transitWayIds.has(w.id) ? TRANSIT_FACTOR : 1);
      const fwd = w.ow !== '-1';
      const back = !(w.ow === 'yes' || w.ow === '1' || w.ow === 'true');
      for (let i = 0; i < w.n.length; i++) {
        this.coord.set(w.n[i], w.c[i]);
        if (w.hw !== 'service' && w.hw !== 'living_street') snap.add(w.n[i]);
        if (i === 0) continue;
        const a = w.n[i - 1], b = w.n[i];
        const d = distanceM(w.c[i - 1], w.c[i]) * f;
        if (fwd) this.edge(a, b, d);
        if (back || w.ow === '-1') this.edge(b, a, d);
      }
    }
    this.snapNodes = [...snap];
  }

  private edge(a: number, b: number, w: number) {
    let l = this.adj.get(a);
    if (!l) this.adj.set(a, (l = []));
    l.push({ to: b, w });
  }

  /** cel mai apropiat nod de pe o stradă carosabilă (fără alei/servicii) */
  nearest(c: Coord): { node: number; dist: number } {
    let best = -1, bd = Infinity;
    for (const n of this.snapNodes) {
      const p = this.coord.get(n)!;
      // pre-filtru ieftin pe grade (~ 1 km)
      if (Math.abs(p[0] - c[0]) > 0.015 || Math.abs(p[1] - c[1]) > 0.01) continue;
      const d = distanceM(p, c);
      if (d < bd) { bd = d; best = n; }
    }
    return { node: best, dist: bd };
  }

  /** drumul cel mai ieftin între două noduri; null dacă nu există */
  route(from: number, to: number): Coord[] | null {
    if (from === to) return [this.coord.get(from)!];
    const dist = new Map<number, number>([[from, 0]]);
    const prev = new Map<number, number>();
    const heap = new MinHeap();
    heap.push(0, from);
    while (heap.size) {
      const [d, u] = heap.pop()!;
      if (u === to) break;
      if (d > (dist.get(u) ?? Infinity)) continue;
      for (const { to: v, w } of this.adj.get(u) ?? []) {
        const nd = d + w;
        if (nd < (dist.get(v) ?? Infinity)) {
          dist.set(v, nd);
          prev.set(v, u);
          heap.push(nd, v);
        }
      }
    }
    if (!prev.has(to)) return null;
    const path: Coord[] = [];
    for (let n: number | undefined = to; n !== undefined; n = prev.get(n)) {
      path.push(this.coord.get(n)!);
      if (n === from) break;
    }
    return path.reverse();
  }
}

class MinHeap {
  private a: [number, number][] = [];
  get size() { return this.a.length; }
  push(k: number, v: number) {
    const a = this.a;
    a.push([k, v]);
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0], last = a.pop()!;
    if (a.length) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** distanța minimă de la un punct la o polilinie (aproximare plană locală, suficientă la scara unui oraș) */
export function distanceToLine(p: Coord, line: Coord[]): number {
  const k = Math.cos((p[1] * Math.PI) / 180);
  const toXY = (c: Coord) => [(c[0] - p[0]) * 111_320 * k, (c[1] - p[1]) * 110_540] as const;
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = toXY(line[i - 1]);
    const [bx, by] = toXY(line[i]);
    const dx = bx - ax, dy = by - ay;
    const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return line.length === 1 ? distanceM(p, line[0]) : best;
}
