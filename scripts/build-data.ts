// Transformă cel mai recent fișier din data/raw/ (+ data/overrides.json) în datele frontendului
// și scrie raportul de calitate data/report.md.
// Rulare: npm run data:build
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Feature, FeatureCollection, LineString, MultiLineString, Point } from 'geojson';
import type { LinesFile, RouteProps, StopProps } from '../shared/model.ts';
import { distanceM, normName } from './lib/geo.ts';
import { applyOverrides, type Overrides } from './lib/overrides.ts';
import { computeIssues } from './lib/quality.ts';
import { writeReport } from './lib/report.ts';
import type { StopRecord } from './lib/types.ts';
import { fromOsm, type OsmRaw } from './sources/osm.ts';
import { mergeTransurb } from './sources/transurb.ts';
import type { TransurbRaw } from './lib/transurb-types.ts';

const ATTRIBUTION = '© OpenStreetMap contributors (ODbL)';
const GROUP_RADIUS_M = 300;

async function latestRaw(prefix: string): Promise<string | null> {
  const files = (await readdir('data/raw')).filter((f) => f.startsWith(`${prefix}-`) && f.endsWith('.json')).sort();
  return files.length ? path.join('data/raw', files[files.length - 1]) : null;
}

/** stațiile cu același nume aflate la < GROUP_RADIUS_M una de alta formează un grup (ex. cele două sensuri) */
function groupStops(stops: Map<string, StopRecord>): Map<string, string> {
  const list = [...stops.values()];
  const parent = new Map(list.map((s) => [s.id, s.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  const byName = new Map<string, StopRecord[]>();
  for (const s of list) if (s.name) byName.set(normName(s.name), [...(byName.get(normName(s.name)) ?? []), s]);
  for (const same of byName.values())
    for (let i = 0; i < same.length; i++)
      for (let j = i + 1; j < same.length; j++)
        if (distanceM(same[i].coord, same[j].coord) < GROUP_RADIUS_M) parent.set(find(same[i].id), find(same[j].id));
  return new Map(list.map((s) => [s.id, `g:${find(s.id)}`]));
}

async function main() {
  const rawFile = await latestRaw('osm');
  if (!rawFile) throw new Error('Nu există date OSM. Rulează întâi: npm run data:fetch');
  const tbFile = await latestRaw('transurb');
  console.log(`Surse: ${rawFile}${tbFile ? `, ${tbFile}` : ' (fără date Transurb: rulează npm run data:fetch-transurb)'}`);
  const raw: OsmRaw = JSON.parse(await readFile(rawFile, 'utf8'));
  const tb: TransurbRaw | null = tbFile ? JSON.parse(await readFile(tbFile, 'utf8')) : null;
  const overrides: Overrides = JSON.parse(await readFile('data/overrides.json', 'utf8'));

  const osm = fromOsm(raw, overrides.includeNetworks);
  // cu date oficiale: Transurb dă liniile, stațiile și orarele; OSM doar geometria și pozițiile
  const merged = tb ? mergeTransurb(osm, tb) : null;
  const data = merged?.data ?? osm;
  const overrideLog = applyOverrides(data, overrides);
  computeIssues(data);

  // linii sortate: tramvai, troleibuz, autobuz; apoi numeric
  const modeOrder = { tram: 0, trolleybus: 1, bus: 2 };
  data.lines.sort((a, b) => modeOrder[a.mode] - modeOrder[b.mode] || a.ref.localeCompare(b.ref, 'ro', { numeric: true }));

  // păstrează doar stațiile folosite de liniile rămase
  const used = new Set(data.lines.flatMap((l) => l.variants.flatMap((v) => v.stopIds)));
  for (const id of data.stops.keys()) if (!used.has(id)) data.stops.delete(id);
  const lineIds = new Set(data.lines.map((l) => l.id));
  for (const s of data.stops.values()) for (const l of s.lineIds) if (!lineIds.has(l)) s.lineIds.delete(l);
  const groups = groupStops(data.stops);

  const out = path.resolve('public/data');
  await mkdir(out, { recursive: true });

  const linesFile: LinesFile = {
    generatedAt: new Date().toISOString(),
    sourceTimestamp: data.sourceTimestamp,
    officialFetchedAt: tb?.fetchedAt ?? null,
    officialSource: tb?.source ?? null,
    attribution: ATTRIBUTION,
    lines: data.lines,
  };

  const routeFeatures: Feature<MultiLineString | LineString, RouteProps>[] = [];
  for (const line of data.lines)
    for (const v of line.variants) {
      const segs = data.geometries.get(v.id) ?? [];
      if (!segs.length) continue;
      routeFeatures.push({
        type: 'Feature',
        properties: { variantId: v.id, lineId: line.id, mode: line.mode, colour: line.colour, direction: v.direction },
        geometry: segs.length === 1 ? { type: 'LineString', coordinates: segs[0] } : { type: 'MultiLineString', coordinates: segs },
      });
    }

  const stopFeatures: Feature<Point, StopProps>[] = [...data.stops.values()].map((s) => ({
    type: 'Feature',
    properties: { id: s.id, name: s.name, groupId: groups.get(s.id)!, lineIds: [...s.lineIds].sort(), source: s.nameFrom === 'override' ? 'override' : 'osm', sourceRef: s.sourceRef },
    geometry: { type: 'Point', coordinates: s.coord.map((x) => Math.round(x * 1e6) / 1e6) },
  }));

  const fc = <T,>(features: T[]) => ({ type: 'FeatureCollection', features }) as unknown as FeatureCollection;
  await writeFile(path.join(out, 'lines.json'), JSON.stringify(linesFile));
  await writeFile(path.join(out, 'routes.geojson'), JSON.stringify(fc(routeFeatures)));
  await writeFile(path.join(out, 'stops.geojson'), JSON.stringify(fc(stopFeatures)));
  if (merged) {
    await rm(path.join(out, 'schedules'), { recursive: true, force: true });
    await mkdir(path.join(out, 'schedules'), { recursive: true });
    const kept = new Set(data.lines.map((l) => l.id));
    for (const sch of merged.schedules) if (kept.has(sch.lineId)) await writeFile(path.join(out, 'schedules', `${sch.lineId}.json`), JSON.stringify(sch));
  }
  await writeReport('data/report.md', data, { rawFile, tbFile, notes: merged?.notes ?? null, overrideLog, attribution: ATTRIBUTION });

  console.log(`✓ ${data.lines.length} linii, ${routeFeatures.length} variante cu geometrie, ${stopFeatures.length} stații`);
  console.log(`✓ ${data.excluded.length} rute OSM excluse (alți operatori)`);
  if (merged) console.log(`✓ ${merged.schedules.length} fișiere de orar; ${merged.notes.notOnOfficialSite.length} linii OSM care nu mai apar în programul Transurb`);
  console.log('✓ public/data/{lines.json,routes.geojson,stops.geojson}, data/report.md');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
