// Planificator de călătorie: de la o stație la alta, cu schimbări între linii.
// Nu folosește orarul: caută după ordinea stațiilor pe fiecare variantă (în sensul de mers),
// cu cât mai puține schimbări și cât mai puține stații, plus scurte drumuri pe jos între stații apropiate.
// Modul e pur (fără DOM), ca să poată fi testat în Node.
import type { Line, StopProps, Variant } from '../shared/model.ts';

/** o „stație” în sensul călătorului: grupul de stâlpi cu același nume (ambele sensuri) */
export interface Place {
  id: string; // groupId
  name: string | null;
  coord: [number, number];
  lineIds: string[];
}

export type Leg =
  | { kind: 'walk'; from: string; to: string; meters: number }
  | { kind: 'ride'; lineId: string; variantId: string; fromIndex: number; toIndex: number; from: string; to: string };

export interface Itinerary {
  legs: Leg[];
  rides: number;
  stops: number; // stații parcurse cu vehiculul
  walkM: number;
  cost: number;
}

// costuri relative (unități ≈ minute), folosite doar pentru ordonare; nu se afișează
const RIDE = 1.6; // per stație
const TRANSFER = 6; // per schimbare
// mersul pe jos e penalizat mai mult decât timpul real: oamenii preferă să nu care bagaje între stații
const WALK = (m: number) => 3 + m / 45;
const WALK_MAX_M = 400; // în linie dreaptă
const MAX_RIDES = 4;

export function distanceM(a: [number, number], b: [number, number]) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** drumul pe jos estimat: linia dreaptă × 1.25, rotunjit la 10 m */
const walkMeters = (a: [number, number], b: [number, number]) => Math.round((distanceM(a, b) * 1.25) / 10) * 10;

export interface Network {
  places: Map<string, Place>;
  /** pentru fiecare variantă: grupul fiecărei stații (null = stație fără poziție) */
  seq: Map<string, (string | null)[]>;
  variants: Map<string, Variant>;
  /** groupId → unde se poate urca: (variantă, index) */
  boardings: Map<string, { variantId: string; index: number }[]>;
  /** groupId → stații apropiate, la care se poate merge pe jos */
  near: Map<string, { id: string; meters: number }[]>;
}

export function buildNetwork(lines: Line[], stops: { properties: StopProps; geometry: { coordinates: number[] } }[]): Network {
  const groupOf = new Map<string, string>();
  const acc = new Map<string, { names: Map<string, number>; xs: number[]; ys: number[]; lineIds: Set<string> }>();
  for (const f of stops) {
    const p = f.properties;
    groupOf.set(p.id, p.groupId);
    const g = acc.get(p.groupId) ?? { names: new Map<string, number>(), xs: [] as number[], ys: [] as number[], lineIds: new Set<string>() };
    if (p.name) g.names.set(p.name, (g.names.get(p.name) ?? 0) + 1);
    g.xs.push(f.geometry.coordinates[0]);
    g.ys.push(f.geometry.coordinates[1]);
    p.lineIds.forEach((l) => g.lineIds.add(l));
    acc.set(p.groupId, g);
  }
  const order = new Map(lines.map((l, i) => [l.id, i]));
  const places = new Map<string, Place>();
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  for (const [id, g] of acc) {
    const name = [...g.names].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    places.set(id, { id, name, coord: [avg(g.xs), avg(g.ys)], lineIds: [...g.lineIds].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)) });
  }

  const seq = new Map<string, (string | null)[]>();
  const variants = new Map<string, Variant>();
  const boardings = new Map<string, { variantId: string; index: number }[]>();
  for (const l of lines)
    for (const v of l.variants) {
      const s = v.stops.map((st) => (st.stopId ? groupOf.get(st.stopId) ?? null : null));
      seq.set(v.id, s);
      variants.set(v.id, v);
      s.forEach((g, index) => {
        if (!g || index === s.length - 1) return; // la capăt nu se urcă
        const list = boardings.get(g) ?? [];
        list.push({ variantId: v.id, index });
        boardings.set(g, list);
      });
    }

  const near = new Map<string, { id: string; meters: number }[]>();
  const all = [...places.values()];
  for (const a of all)
    near.set(a.id, all.filter((b) => b !== a && distanceM(a.coord, b.coord) <= WALK_MAX_M).map((b) => ({ id: b.id, meters: walkMeters(a.coord, b.coord) })));

  return { places, seq, variants, boardings, near };
}

interface RideLabel { cost: number; variantId: string; fromIndex: number; toIndex: number; fromGroup: string }
interface AnyLabel { cost: number; walkFrom?: string; meters?: number }

/** variante Pareto (mai multe schimbări doar dacă scurtează vizibil drumul), cea mai bună prima */
export function plan(net: Network, fromId: string, toId: string): Itinerary[] {
  if (fromId === toId || !net.places.has(fromId) || !net.places.has(toId)) return [];
  const best = new Map<string, number>(); // cel mai mic cost găsit până acum, pe orice număr de curse
  const any: Map<string, AnyLabel>[] = [new Map([[fromId, { cost: 0 }]])];
  const ride: Map<string, RideLabel>[] = [new Map()];
  best.set(fromId, 0);
  // la plecare se poate merge pe jos până la o stație apropiată
  for (const n of net.near.get(fromId) ?? []) {
    const cost = WALK(n.meters);
    any[0].set(n.id, { cost, walkFrom: fromId, meters: n.meters });
    best.set(n.id, cost);
  }

  const results: Itinerary[] = [];
  let bestDest = Infinity;
  // destinația e la câțiva pași: drumul pe jos e și el o variantă
  if (any[0].has(toId)) {
    bestDest = any[0].get(toId)!.cost;
    results.push(rebuild(net, any, ride, 0, toId));
  }
  for (let k = 1; k <= MAX_RIDES; k++) {
    const rk = new Map<string, RideLabel>();
    for (const [g, lab] of any[k - 1]) {
      for (const b of net.boardings.get(g) ?? []) {
        const s = net.seq.get(b.variantId)!;
        for (let j = b.index + 1; j < s.length; j++) {
          const h = s[j];
          if (!h || h === g) continue;
          const cost = lab.cost + (j - b.index) * RIDE + (k > 1 ? TRANSFER : 0);
          if (cost >= (best.get(h) ?? Infinity) || cost >= bestDest) continue;
          if (cost < (rk.get(h)?.cost ?? Infinity)) rk.set(h, { cost, variantId: b.variantId, fromIndex: b.index, toIndex: j, fromGroup: g });
        }
      }
    }
    if (!rk.size) break;
    const ak = new Map<string, AnyLabel>();
    for (const [h, r] of rk) {
      ak.set(h, { cost: r.cost });
      best.set(h, Math.min(best.get(h) ?? Infinity, r.cost));
    }
    // după coborâre: pe jos până la o stație apropiată (o singură dată, nu în lanț)
    for (const [h, r] of rk)
      for (const n of net.near.get(h) ?? []) {
        const cost = r.cost + WALK(n.meters);
        if (cost >= (best.get(n.id) ?? Infinity) || cost >= (ak.get(n.id)?.cost ?? Infinity)) continue;
        ak.set(n.id, { cost, walkFrom: h, meters: n.meters });
        best.set(n.id, cost);
      }
    ride.push(rk);
    any.push(ak);

    const dest = ak.get(toId);
    // o schimbare în plus trebuie să aducă un câștig clar (măcar ~3 stații), altfel e zgomot
    if (dest && dest.cost < bestDest - (results.length ? 5 : 0)) {
      bestDest = dest.cost;
      results.push(rebuild(net, any, ride, k, toId));
    }
  }
  return results.sort((a, b) => a.cost - b.cost);
}

function rebuild(net: Network, any: Map<string, AnyLabel>[], ride: Map<string, RideLabel>[], k: number, toId: string): Itinerary {
  const legs: Leg[] = [];
  let g = toId;
  const cost = any[k].get(toId)!.cost;
  for (let r = k; r >= 0; r--) {
    const a = any[r].get(g)!;
    if (a.walkFrom) {
      legs.push({ kind: 'walk', from: a.walkFrom, to: g, meters: a.meters! });
      g = a.walkFrom;
    }
    if (r === 0) break;
    const l = ride[r].get(g)!;
    const v = net.variants.get(l.variantId)!;
    legs.push({ kind: 'ride', lineId: v.lineId, variantId: v.id, fromIndex: l.fromIndex, toIndex: l.toIndex, from: l.fromGroup, to: g });
    g = l.fromGroup;
  }
  legs.reverse();
  let stops = 0, walkM = 0;
  for (const l of legs) l.kind === 'ride' ? (stops += l.toIndex - l.fromIndex) : (walkM += l.meters);
  return { legs, rides: k, stops, walkM, cost };
}
