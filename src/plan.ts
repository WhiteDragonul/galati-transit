// Planificator de călătorie: de la o stație la alta, cu schimbări între linii.
// `plan` caută după ordinea stațiilor pe fiecare variantă (în sensul de mers), fără orar:
// cu cât mai puține schimbări și cât mai puține stații, plus scurte drumuri pe jos între stații apropiate.
// `planTimed` folosește orarul oficial: pleci la o oră și afli când ajungi.
// Modul e pur (fără DOM), ca să poată fi testat în Node.
import type { Line, ScheduleFile, StopProps, Variant } from '../shared/model.ts';
import { dayIndex } from './days.ts';

/** o „stație” în sensul călătorului: grupul de stâlpi cu același nume (ambele sensuri) */
export interface Place {
  id: string; // groupId
  name: string | null;
  coord: [number, number];
  lineIds: string[];
}

/** orele (în minute de la miezul nopții) apar doar în rezultatele cu orar */
export type Leg =
  | { kind: 'walk'; from: string; to: string; meters: number; start?: number; end?: number }
  | { kind: 'ride'; lineId: string; variantId: string; fromIndex: number; toIndex: number; from: string; to: string; dep?: number; arr?: number };

export interface Itinerary {
  legs: Leg[];
  rides: number;
  stops: number; // stații parcurse cu vehiculul
  walkM: number;
  cost: number;
  /** cu orar: când pleci de la stația de plecare și când ajungi */
  depart?: number;
  arrive?: number;
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

// ——— cu orar ———

/** pentru fiecare variantă: orele de trecere pe stație (minute, sortate); null = nu circulă în ziua aleasă */
export type Timetable = Map<string, number[][] | null>;

export const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** mersul pe jos (distanța e deja estimată pe străzi) */
export const walkMinutes = (m: number) => Math.max(1, Math.ceil(m / 75));
const TRANSFER_MIN = 2; // timp minim de schimbare între vehicule
/** între două stații consecutive o cursă nu face mai mult de atât; peste, cursa s-a oprit */
const HOP_MAX = 30;

export function buildTimetable(lines: Line[], schedules: Map<string, ScheduleFile | null>, weekend: boolean): Timetable {
  const tt: Timetable = new Map();
  for (const l of lines) {
    const sch = schedules.get(l.id);
    const k = sch ? dayIndex(sch.dayTypes, weekend) : -1;
    for (const v of l.variants) {
      const sv = sch && v.scheduleKey ? sch.variants[v.scheduleKey] : undefined;
      tt.set(v.id, sv && k >= 0 ? v.stops.map((_, i) => (sv.stops[i]?.times[k] ?? []).map(toMin).sort((a, b) => a - b)) : null);
    }
  }
  return tt;
}

/** primul element ≥ x dintr-o listă sortată */
function firstAtLeast(a: number[], x: number) {
  let lo = 0, hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo < a.length ? a[lo] : undefined;
}

interface TRide { time: number; dep: number; variantId: string; fromIndex: number; toIndex: number; fromGroup: string }
interface TAny { time: number; walkFrom?: string; meters?: number }

/** cea mai devreme sosire, plecând la `depart` (minute); variante cu mai multe schimbări doar dacă ajung
 *  clar mai devreme. Cursa e urmărită din stație în stație (prima trecere ≥ ora curentă), deci merge
 *  și unde orele nu sunt perfect aliniate între stații. Rezultatele sunt ordonate după ora de sosire. */
export function planTimed(net: Network, tt: Timetable, fromId: string, toId: string, depart: number): Itinerary[] {
  if (fromId === toId || !net.places.has(fromId) || !net.places.has(toId)) return [];
  const best = new Map<string, number>([[fromId, depart]]);
  const any: Map<string, TAny>[] = [new Map([[fromId, { time: depart }]])];
  const ride: Map<string, TRide>[] = [new Map()];
  for (const n of net.near.get(fromId) ?? []) {
    const time = depart + walkMinutes(n.meters);
    any[0].set(n.id, { time, walkFrom: fromId, meters: n.meters });
    best.set(n.id, time);
  }

  const results: Itinerary[] = [];
  let bestDest = Infinity;
  if (any[0].has(toId)) {
    bestDest = any[0].get(toId)!.time;
    results.push(rebuildTimed(net, any, ride, 0, toId, depart));
  }
  for (let k = 1; k <= MAX_RIDES; k++) {
    const rk = new Map<string, TRide>();
    for (const [g, lab] of any[k - 1]) {
      const ready = lab.time + (k > 1 ? TRANSFER_MIN : 0);
      for (const b of net.boardings.get(g) ?? []) {
        const cols = tt.get(b.variantId);
        if (!cols) continue;
        const dep = firstAtLeast(cols[b.index], ready);
        if (dep === undefined) continue;
        const s = net.seq.get(b.variantId)!;
        let t = dep;
        for (let j = b.index + 1; j < s.length; j++) {
          const next = firstAtLeast(cols[j], t);
          if (next === undefined || next - t > HOP_MAX) break;
          t = next;
          const h = s[j];
          if (!h || h === g) continue;
          if (t >= bestDest || t >= (best.get(h) ?? Infinity)) continue;
          if (t < (rk.get(h)?.time ?? Infinity)) rk.set(h, { time: t, dep, variantId: b.variantId, fromIndex: b.index, toIndex: j, fromGroup: g });
        }
      }
    }
    if (!rk.size) break;
    const ak = new Map<string, TAny>();
    for (const [h, r] of rk) {
      ak.set(h, { time: r.time });
      best.set(h, Math.min(best.get(h) ?? Infinity, r.time));
    }
    for (const [h, r] of rk)
      for (const n of net.near.get(h) ?? []) {
        const time = r.time + walkMinutes(n.meters);
        if (time >= (best.get(n.id) ?? Infinity) || time >= (ak.get(n.id)?.time ?? Infinity)) continue;
        ak.set(n.id, { time, walkFrom: h, meters: n.meters });
        best.set(n.id, time);
      }
    ride.push(rk);
    any.push(ak);

    const dest = ak.get(toId);
    // o schimbare în plus merită doar dacă ajungi cu cel puțin 5 minute mai devreme
    if (dest && dest.time < bestDest - (results.length ? 5 : 0)) {
      bestDest = dest.time;
      results.push(rebuildTimed(net, any, ride, k, toId, depart));
    }
  }
  return results.sort((a, b) => a.arrive! - b.arrive! || a.rides - b.rides);
}

function rebuildTimed(net: Network, any: Map<string, TAny>[], ride: Map<string, TRide>[], k: number, toId: string, depart: number): Itinerary {
  const legs: Leg[] = [];
  let g = toId;
  for (let r = k; r >= 0; r--) {
    const a = any[r].get(g)!;
    if (a.walkFrom) {
      legs.push({ kind: 'walk', from: a.walkFrom, to: g, meters: a.meters!, end: a.time });
      g = a.walkFrom;
    }
    if (r === 0) break;
    const l = ride[r].get(g)!;
    const v = net.variants.get(l.variantId)!;
    legs.push({ kind: 'ride', lineId: v.lineId, variantId: v.id, fromIndex: l.fromIndex, toIndex: l.toIndex, from: l.fromGroup, to: g, dep: l.dep, arr: l.time });
    g = l.fromGroup;
  }
  legs.reverse();
  // pe jos la început: pleci cât să prinzi cursa; după o coborâre: mergi imediat
  legs.forEach((l, i) => {
    if (l.kind !== 'walk') return;
    const mins = walkMinutes(l.meters);
    const prev = legs[i - 1], next = legs[i + 1];
    if (prev?.kind === 'ride') l.end = prev.arr! + mins;
    else if (next?.kind === 'ride') l.end = next.dep!;
    l.start = l.end! - mins;
  });
  let stops = 0, walkM = 0;
  for (const l of legs) l.kind === 'ride' ? (stops += l.toIndex - l.fromIndex) : (walkM += l.meters);
  const first = legs[0], last = legs[legs.length - 1];
  const start = first.kind === 'walk' ? first.start! : first.dep!;
  const end = last.kind === 'walk' ? last.end! : last.arr!;
  return { legs, rides: k, stops, walkM, cost: end - depart, depart: start, arrive: end };
}
