// Adaptor OSM → model intern. Nu completează nimic: ce lipsește rămâne null/gol
// și e semnalat ulterior de lib/quality.ts.
import type { Direction, Line, Mode, Variant } from '../../shared/model.ts';
import { type Coord, lineLengthM, normName } from '../lib/geo.ts';
import { assembleWays } from '../lib/geometry.ts';
import type { SourceResult, StopRecord } from '../lib/types.ts';

interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  members?: { type: 'node' | 'way' | 'relation'; ref: number; role: string }[];
  tags?: Record<string, string>;
}

export interface OsmRaw {
  osmBase: string | null;
  elements: OsmElement[];
}

const MODE_LABEL: Record<Mode, string> = { bus: 'Autobuz', trolleybus: 'Troleibuz', tram: 'Tramvai' };
const PLATFORM_ROLES = new Set(['platform', 'platform_entry_only', 'platform_exit_only']);
const STOP_ROLES = new Set(['stop', 'stop_entry_only', 'stop_exit_only']);
const WAY_ROLES = new Set(['', 'forward', 'backward']);

export function fromOsm(raw: OsmRaw, includeNetworks: string[]): SourceResult {
  const nodes = new Map<number, OsmElement>();
  const ways = new Map<number, OsmElement>();
  const rels = new Map<number, OsmElement>();
  for (const el of raw.elements) {
    if (el.type === 'node') nodes.set(el.id, el);
    else if (el.type === 'way') ways.set(el.id, el);
    else rels.set(el.id, el);
  }
  const coordOf = (id: number): Coord | undefined => {
    const n = nodes.get(id);
    return n?.lon !== undefined && n.lat !== undefined ? [n.lon, n.lat] : undefined;
  };

  const routes = [...rels.values()].filter((r) => r.tags?.type === 'route');
  const masters = [...rels.values()].filter((r) => r.tags?.type === 'route_master');
  const masterOf = new Map<number, OsmElement>();
  for (const m of masters) for (const mem of m.members ?? []) if (mem.type === 'relation') masterOf.set(mem.ref, m);

  const inScope = (t: Record<string, string>) =>
    includeNetworks.includes(t.network ?? '') || includeNetworks.includes(t.operator ?? '');

  const excluded: SourceResult['excluded'] = [];
  const linesById = new Map<string, Line>();
  const stops = new Map<string, StopRecord>();
  const geometries = new Map<string, Coord[][]>();

  for (const r of routes) {
    const t = r.tags!;
    const master = masterOf.get(r.id);
    if (!inScope(t) && !(master && inScope(master.tags!))) {
      excluded.push({ sourceRef: `relation/${r.id}`, name: t.name ?? null, operator: t.operator ?? null, network: t.network ?? null });
      continue;
    }
    const mode = t.route as Mode;
    const ref = t.ref ?? master?.tags?.ref ?? null;
    const lineKey = ref ?? `r${master?.id ?? r.id}`;
    const lineId = `${mode}-${lineKey}`;

    let line = linesById.get(lineId);
    if (!line) {
      line = {
        id: lineId,
        ref: ref ?? '?',
        mode,
        colour: master?.tags?.colour ?? t.colour ?? null,
        name: master?.tags?.name ?? (ref ? `${MODE_LABEL[mode]} ${ref}` : t.name ?? null),
        operator: t.operator ?? master?.tags?.operator ?? null,
        network: t.network ?? master?.tags?.network ?? null,
        variants: [],
        source: 'osm',
        sourceRef: master ? `relation/${master.id}` : null,
        issues: [],
      };
      linesById.set(lineId, line);
    }

    // stații: preferăm platformele (au de obicei nume); dacă nu există, stop_position
    const members = r.members ?? [];
    const platformMembers = members.filter((m) => m.type === 'node' && PLATFORM_ROLES.has(m.role));
    const stopMembers = platformMembers.length
      ? platformMembers
      : members.filter((m) => m.type === 'node' && STOP_ROLES.has(m.role));
    const stopIds: string[] = [];
    for (const m of stopMembers) {
      const n = nodes.get(m.ref);
      const c = coordOf(m.ref);
      if (!n || !c) continue;
      const id = `osm:n${n.id}`;
      if (!stops.has(id)) {
        // dacă platforma n-are nume, folosim numele stop_position-ului vecin din relație (tot dată OSM)
        let name = n.tags?.name ?? null;
        let nameFrom: StopRecord['nameFrom'] = name ? 'self' : null;
        if (!name) {
          const idx = members.indexOf(m);
          for (const k of [idx - 1, idx + 1]) {
            const nb = members[k];
            if (nb?.type === 'node' && STOP_ROLES.has(nb.role) && nodes.get(nb.ref)?.tags?.name) {
              name = nodes.get(nb.ref)!.tags!.name;
              nameFrom = 'stop_position';
              break;
            }
          }
        }
        stops.set(id, { id, name, nameFrom, coord: c, sourceRef: `node/${n.id}`, lineIds: new Set() });
      }
      stops.get(id)!.lineIds.add(lineId);
      stopIds.push(id);
    }

    const wayLists = members
      .filter((m) => m.type === 'way' && WAY_ROLES.has(m.role))
      .map((m) => ways.get(m.ref)?.nodes ?? []);
    const geom = assembleWays(wayLists, coordOf);
    const variantId = `osm:r${r.id}`;
    geometries.set(variantId, geom.segments);

    const variant: Variant = {
      id: variantId,
      lineId,
      name: t.name ?? null,
      from: t.from ?? null,
      to: t.to ?? null,
      direction: null,
      directionSource: null,
      stopIds,
      lengthM: Math.round(geom.segments.reduce((s, seg) => s + lineLengthM(seg), 0)),
      gaps: { count: geom.gaps.length, maxM: geom.gaps.length ? Math.max(...geom.gaps) : 0 },
      source: 'osm',
      sourceRef: `relation/${r.id}`,
      issues: [],
    };
    line.variants.push(variant);
  }

  // ordinea variantelor: cea din route_master, altfel id-ul relației
  for (const line of linesById.values()) {
    const master = line.sourceRef ? rels.get(Number(line.sourceRef.split('/')[1])) : undefined;
    const order = master?.members?.map((m) => `osm:r${m.ref}`) ?? [];
    line.variants.sort((a, b) => {
      const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
      if (ia !== -1 && ib !== -1) return ia - ib;
      return a.id.localeCompare(b.id);
    });
    assignDirections(line.variants);
  }

  return { lines: [...linesById.values()], stops, geometries, sourceTimestamp: raw.osmBase, excluded };
}

/**
 * OSM nu are tur/retur explicit. Convenție: prima variantă (ordinea din route_master) = tur;
 * celelalte sunt tur dacă pornesc/ajung în aceleași capete, retur dacă sunt inversate.
 * Dacă nu se poate decide, direcția rămâne null.
 */
function assignDirections(variants: Variant[]) {
  const first = variants[0];
  if (!first) return;
  const n = (s: string | null) => (s ? normName(s) : null);
  for (const v of variants) {
    let dir: Direction | null = null;
    if (v === first) dir = 'tur';
    else if ((n(v.from) && n(v.from) === n(first.from)) || (n(v.to) && n(v.to) === n(first.to))) dir = 'tur';
    else if ((n(v.from) && n(v.from) === n(first.to)) || (n(v.to) && n(v.to) === n(first.from))) dir = 'retur';
    v.direction = dir;
    v.directionSource = dir ? 'order' : null;
  }
}
