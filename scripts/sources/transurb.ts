// Datele oficiale Transurb (lista de linii, stațiile pe tur/retur, orare) devin sursa de adevăr.
// OSM rămâne sursa pentru geometria traseelor și pozițiile stațiilor; legătura se face prin
// alinierea numelor de stații în ordine (scripts/lib/match.ts). Nimic nu e completat din presupuneri:
// o stație oficială fără corespondent în OSM rămâne fără poziție și e raportată.
import type { Line, Mode, ScheduleFile, Variant, VariantStop } from '../../shared/model.ts';
import { type Coord, distanceM } from '../lib/geo.ts';
import { alignStops, MATCH_THRESHOLD, nameSimilarity, shareSignificantToken, titleCase } from '../lib/match.ts';
import type { Router } from '../lib/router.ts';
import { sentenceCase } from '../lib/transurb-parse.ts';
import type { TransurbRaw } from '../lib/transurb-types.ts';
import type { SourceResult } from '../lib/types.ts';

const MODE_LABEL: Record<Mode, string> = { bus: 'Autobuz', trolleybus: 'Troleibuz', tram: 'Tramvai' };
/** sub acest procent de stații oficiale regăsite în ordine pe traseul OSM, geometria OSM nu e folosită */
export const MIN_GEOMETRY_MATCH = 0.5;
/** o stație oficială nealiniată poate fi legată de o stație OSM cu același nume aflată la cel mult atât */
const NEARBY_M = 800;

export interface MergeNotes {
  notOnOfficialSite: { lineId: string; ref: string; mode: Mode }[];
  modeMismatch: { ref: string; official: Mode; osm: Mode }[];
  nearbyMatches: { lineId: string; official: string; osm: string; distanceM: number }[];
  gapMatches: { lineId: string; official: string; osm: string }[];
  uniqueNameMatches: { lineId: string; official: string; osm: string }[];
  aliasesUsed: Set<string>;
  detourMatches: { lineId: string; official: string; osm: string; extraM: number }[];
  routed: { lineId: string; key: string; legs: number; lengthM: number }[];
  routeFailed: { lineId: string; key: string; legs: number; needed: number }[];
}

/**
 * @param aliases nume oficial → nume OSM pentru stații confirmate manual ca fiind aceeași
 *        (data/overrides.json → stopAliases); se folosesc doar la potrivire, numele oficial rămâne neschimbat
 */
export function mergeTransurb(osm: SourceResult, tb: TransurbRaw, aliases: Record<string, string> = {}, router: Router | null = null): { data: SourceResult; schedules: ScheduleFile[]; notes: MergeNotes } {
  const notes: MergeNotes = { notOnOfficialSite: [], modeMismatch: [], nearbyMatches: [], gapMatches: [], uniqueNameMatches: [], aliasesUsed: new Set(), detourMatches: [], routed: [], routeFailed: [] };
  const byRef = new Map<string, Line[]>();
  for (const l of osm.lines) byRef.set(l.ref.toUpperCase(), [...(byRef.get(l.ref.toUpperCase()) ?? []), l]);

  const geometries = new Map<string, Coord[][]>();
  const schedules: ScheduleFile[] = [];
  const lines: Line[] = [];
  const allStops = [...osm.stops.values()];

  for (const t of tb.lines) {
    const mode = t.category as Mode;
    const candidates = byRef.get(t.ref.toUpperCase()) ?? [];
    for (const c of candidates) if (c.mode !== mode) notes.modeMismatch.push({ ref: t.ref, official: mode, osm: c.mode });
    const osmVariants = candidates.flatMap((c) => c.variants);
    const lineId = `${mode}-${t.ref}`;

    // tipurile de zi ale liniei, în ordinea în care apar pe site
    const dayTypes: string[] = [];
    for (const tv of t.variants) for (const s of [...tv.tur, ...tv.retur]) for (const tt of s.timetables) {
      const day = sentenceCase(tt.dayType)!;
      if (!dayTypes.includes(day)) dayTypes.push(day);
    }
    const schedule: ScheduleFile = { lineId, fetchedAt: tb.fetchedAt, source: t.url, dayTypes, variants: {} };
    const line: Line = {
      id: lineId,
      ref: t.ref,
      mode,
      colour: candidates.find((c) => c.colour)?.colour ?? null,
      name: `${MODE_LABEL[mode]} ${t.ref}`,
      operator: 'Transurb',
      network: 'Transurb',
      section: t.section,
      officialUrl: t.url,
      scheduleFile: `schedules/${lineId}.json`,
      variants: [],
      source: 'transurb',
      sourceRef: t.url,
      issues: [],
    };

    t.variants.forEach((tv, vi) => {
      for (const d of ['tur', 'retur'] as const) {
        const official = tv[d];
        if (!official.length) continue;
        // numele folosite la potrivire (cu alias-urile confirmate); afișarea păstrează numele oficial
        const names = official.map((s) => aliases[s.name] ?? s.name);
        official.forEach((s) => aliases[s.name] && notes.aliasesUsed.add(`${s.name} → ${aliases[s.name]}`));

        // varianta OSM care conține cele mai multe stații oficiale, în aceeași ordine
        let best: { v: Variant; map: number[]; matched: number } | null = null;
        for (const ov of osmVariants) {
          const { map, matched } = alignStops(names, ov.stopIds.map((id) => osm.stops.get(id)?.name ?? null));
          if (!best || matched > best.matched) best = { v: ov, map, matched };
        }
        const ratio = best ? best.matched / names.length : 0;
        const use = best && ratio >= MIN_GEOMETRY_MATCH ? best : null;

        const stopIds: (string | null)[] = names.map((_, i) => (use && use.map[i] >= 0 ? use.v.stopIds[use.map[i]] : null));

        // 1) gol între doi vecini poziționați pe același traseu OSM: dacă exact o stație OSM din acel gol
        //    are un cuvânt semnificativ comun cu cea oficială, sunt aceeași stație („BLD. OTELARILOR” ↔ „Strada Oțelarilor”).
        //    Rulează de două ori: a doua oară folosește și vecinii poziționați la pasul 2.
        const fillGaps = () => {
          if (!use) return;
          const seq = use.v.stopIds;
          for (let i = 0; i < names.length; i++) {
            if (stopIds[i]) continue;
            let lo = i > 0 ? (stopIds[i - 1] ? seq.indexOf(stopIds[i - 1]!) : -2) : -1;
            let hi = i < names.length - 1 ? (stopIds[i + 1] ? seq.indexOf(stopIds[i + 1]!) : -2) : seq.length;
            // un vecin poziționat, dar în afara relației OSM (legat prin proximitate): fereastra e
            // limitată la cele 2 stații OSM de după/dinaintea celuilalt vecin
            if (lo >= 0 && hi === -1) hi = Math.min(seq.length, lo + 3);
            if (hi >= 0 && lo === -1 && i > 0) lo = Math.max(-1, hi - 3);
            if (lo === -2 || hi === -2 || (i > 0 && lo < 0) || (i < names.length - 1 && hi < 0) || hi <= lo) continue;
            const gap = seq.slice(lo + 1, hi).filter((id) => !stopIds.includes(id));
            const hits = gap.filter((id) => {
              const n = osm.stops.get(id)?.name;
              return n ? shareSignificantToken(names[i], n) : false;
            });
            if (hits.length === 1) {
              stopIds[i] = hits[0];
              notes.gapMatches.push({ lineId, official: official[i].name, osm: osm.stops.get(hits[0])!.name! });
            }
          }
        };
        fillGaps();

        // 2) stații încă nepoziționate: o stație OSM cu același nume, aproape de vecinii deja poziționați
        if (use)
          for (let i = 0; i < names.length; i++) {
            if (stopIds[i]) continue;
            const near = [stopIds[i - 1], stopIds[i + 1]].map((id) => (id ? osm.stops.get(id)?.coord : undefined)).filter(Boolean) as [number, number][];
            if (!near.length) continue;
            let pick: { id: string; sim: number; dist: number } | null = null;
            for (const s of allStops) {
              if (!s.name) continue;
              const sim = nameSimilarity(names[i], s.name);
              if (sim < 0.75) continue;
              const dist = Math.min(...near.map((c) => distanceM(c, s.coord)));
              if (dist > NEARBY_M) continue;
              if (!pick || sim > pick.sim || (sim === pick.sim && dist < pick.dist)) pick = { id: s.id, sim, dist };
            }
            if (pick) {
              stopIds[i] = pick.id;
              notes.nearbyMatches.push({ lineId, official: official[i].name, osm: osm.stops.get(pick.id)!.name!, distanceM: Math.round(pick.dist) });
            }
          }
        fillGaps();

        // 3) linie fără traseu în OSM: stațiile se poziționează doar dacă numele e neambiguu în tot orașul
        //    (toate stațiile OSM cu acel nume sunt la cel mult 400 m una de alta, adică aceeași stație în ambele sensuri)
        if (!use)
          for (let i = 0; i < names.length; i++) {
            const cands = allStops.filter((s) => s.name && nameSimilarity(names[i], s.name) >= 0.75);
            if (!cands.length) continue;
            if (cands.some((c) => distanceM(c.coord, cands[0].coord) > 400)) continue;
            const best = cands.reduce((a, b) => (nameSimilarity(names[i], b.name!) > nameSimilarity(names[i], a.name!) ? b : a));
            stopIds[i] = best.id;
            notes.uniqueNameMatches.push({ lineId, official: official[i].name, osm: best.name! });
          }

        // 4) linie fără traseu în OSM, stații cu nume ambiguu (există în mai multe locuri din oraș):
        //    se alege candidatul aflat pe drum între vecinii deja poziționați (ocol minim, cel mult +25% + 200 m)
        if (!use)
          for (let i = 0; i < names.length; i++) {
            if (stopIds[i]) continue;
            const a = stopIds[i - 1] ? osm.stops.get(stopIds[i - 1]!)!.coord : null;
            const b = stopIds[i + 1] ? osm.stops.get(stopIds[i + 1]!)!.coord : null;
            if (!a || !b) continue;
            const direct = distanceM(a, b);
            let pick: { id: string; detour: number } | null = null;
            for (const s of allStops) {
              if (!s.name || nameSimilarity(names[i], s.name) < MATCH_THRESHOLD) continue;
              const detour = distanceM(a, s.coord) + distanceM(s.coord, b);
              if (detour > direct * 1.25 + 200) continue;
              if (!pick || detour < pick.detour) pick = { id: s.id, detour };
            }
            if (pick) {
              stopIds[i] = pick.id;
              notes.detourMatches.push({ lineId, official: official[i].name, osm: osm.stops.get(pick.id)!.name!, extraM: Math.round(pick.detour - direct) });
            }
          }

        const stops: VariantStop[] = official.map((_, i) => {
          const id = stopIds[i];
          const osmName = id ? osm.stops.get(id)?.name : null;
          return { name: osmName ?? titleCase(official[i].name), officialName: official[i].name, stopId: id };
        });

        const key = `v${vi + 1}:${d}`;
        const variantId = `tb:${t.ref}:${key}`;
        let geometrySource: Variant['geometrySource'] = null;
        let routedLength = 0;
        if (use) {
          geometries.set(variantId, osm.geometries.get(use.v.id) ?? []);
          geometrySource = 'osm';
        } else if (router) {
          // 5) OSM nu are relația liniei: traseul se calculează pe străzi, prin stațiile oficiale poziționate, în ordine
          const pts = stopIds.filter((x): x is string => !!x).map((id) => osm.stops.get(id)!.coord);
          const line: Coord[] = [];
          let okLegs = 0;
          for (let k = 1; k < pts.length; k++) {
            const from = router.nearest(pts[k - 1]), to = router.nearest(pts[k]);
            const leg = from.dist < 120 && to.dist < 120 ? router.route(from.node, to.node) : null;
            if (!leg) continue;
            okLegs++;
            line.push(...(line.length ? leg.slice(1) : leg));
          }
          if (pts.length >= 2 && okLegs === pts.length - 1) {
            geometries.set(variantId, [line]);
            geometrySource = 'routed';
            routedLength = Math.round(line.reduce((s, c, k) => (k ? s + distanceM(line[k - 1], c) : 0), 0));
            notes.routed.push({ lineId, key, legs: okLegs, lengthM: routedLength });
          } else notes.routeFailed.push({ lineId, key, legs: okLegs, needed: Math.max(0, pts.length - 1) });
        }

        // orare, aliniate cu lista de stații; tipurile de zi în ordinea de pe site
        schedule.variants[key] = {
          stops: official.map((s) => {
            const times: string[][] = dayTypes.map(() => []);
            for (const tt of s.timetables) times[dayTypes.indexOf(sentenceCase(tt.dayType)!)] = tt.times;
            return { url: s.url, times };
          }),
        };
        const hasTimes = schedule.variants[key].stops.some((s) => s.times.some((x) => x.length));

        line.variants.push({
          id: variantId,
          lineId,
          name: `${line.name}: ${stops[0].name} → ${stops[stops.length - 1].name}`,
          label: tv.label && !/^standard$/i.test(tv.label) ? tv.label : null,
          from: stops[0].name,
          to: stops[stops.length - 1].name,
          direction: d,
          directionSource: 'official',
          stops,
          stopIds: stopIds.filter((x): x is string => !!x),
          geometryRef: use ? use.v.sourceRef : null,
          geometrySource,
          geometryMatch: Math.round(ratio * 100) / 100,
          lengthM: use ? use.v.lengthM : routedLength,
          gaps: use ? use.v.gaps : { count: 0, maxM: 0 },
          scheduleKey: hasTimes ? key : null,
          source: 'transurb',
          sourceRef: t.url,
          issues: [],
        });
      }
    });
    lines.push(line);
    schedules.push(schedule);
  }

  // liniile din OSM (rețeaua Transurb) care nu mai apar în programul oficial
  const official = new Set(lines.map((l) => l.ref.toUpperCase()));
  for (const l of osm.lines) if (!official.has(l.ref.toUpperCase())) notes.notOnOfficialSite.push({ lineId: l.id, ref: l.ref, mode: l.mode });

  // stațiile primesc liniile care opresc efectiv acolo, conform datelor oficiale
  for (const s of osm.stops.values()) s.lineIds.clear();
  for (const l of lines) for (const v of l.variants) for (const id of v.stopIds) osm.stops.get(id)?.lineIds.add(l.id);

  return {
    data: { lines, stops: osm.stops, geometries, sourceTimestamp: osm.sourceTimestamp, excluded: osm.excluded },
    schedules,
    notes,
  };
}
