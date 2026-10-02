// Verificări de calitate. Rezultatul ajunge în issues[] (pentru UI) și în report.md.
import type { Issue, Line } from '../../shared/model.ts';
import { normName } from './geo.ts';
import type { SourceResult } from './types.ts';

/** golurile mai mici de atât (noduri neunite, dar suprapuse) nu sunt semnalate ca rupturi */
export const GAP_TOLERANCE_M = 5;
/** sub acest procent de stații oficiale regăsite pe traseul OSM, desenul poate diferi de traseul real */
export const ROUTE_MATCH_WARN = 0.8;

export function computeIssues(data: SourceResult) {
  for (const line of data.lines) {
    const official = line.source === 'transurb';
    const li: Issue[] = [];
    if (!line.colour) li.push({ code: 'no_colour', severity: 'info', message: 'Culoarea liniei lipsește din sursă' });
    if (!official && !line.sourceRef) li.push({ code: 'no_master', severity: 'info', message: 'Linia nu are route_master în OSM; variantele au fost grupate după număr' });

    for (const v of line.variants) {
      const vi: Issue[] = [];
      const segs = data.geometries.get(v.id) ?? [];
      if (!segs.length)
        vi.push({ code: 'no_geometry', severity: 'warn', message: official ? 'Traseul nu există (sau diferă mult) în OpenStreetMap; nu poate fi desenat pe hartă' : 'Traseul nu are geometrie' });
      else if (v.gaps.count && v.gaps.maxM > GAP_TOLERANCE_M)
        vi.push({ code: 'geometry_gaps', severity: 'warn', message: `Traseu întrerupt în OSM (${v.gaps.count} goluri, cel mai mare ${v.gaps.maxM} m)` });
      if (segs.length && v.geometryMatch !== null && v.geometryMatch < ROUTE_MATCH_WARN)
        vi.push({ code: 'route_mismatch', severity: 'warn', message: `Desenul din OSM acoperă doar ${Math.round(v.geometryMatch * 100)}% din stațiile oficiale; traseul real poate diferi` });
      if (!v.stops.length) vi.push({ code: 'no_stops', severity: 'warn', message: 'Varianta nu are stații' });
      const unplaced = v.stops.filter((s) => !s.stopId).length;
      if (unplaced && v.stops.length)
        vi.push({ code: 'unmatched_stops', severity: 'warn', message: `${unplaced} din ${v.stops.length} stații nu au poziție pe hartă (lipsesc din OSM)` });
      const unnamed = v.stops.filter((s) => !s.name).length;
      if (unnamed) vi.push({ code: 'unnamed_stops', severity: 'warn', message: `${unnamed} stații fără nume` });
      if (official && !v.scheduleKey) vi.push({ code: 'no_schedule', severity: 'warn', message: 'Operatorul nu publică orar pentru această variantă' });

      if (!official) {
        const first = v.stops[0]?.name, last = v.stops[v.stops.length - 1]?.name;
        const mism: string[] = [];
        if (v.from && first && normName(v.from) !== normName(first)) mism.push(`from="${v.from}" ≠ prima stație "${first}"`);
        if (v.to && last && normName(v.to) !== normName(last)) mism.push(`to="${v.to}" ≠ ultima stație "${last}"`);
        if (mism.length) vi.push({ code: 'terminal_mismatch', severity: 'info', message: mism.join('; ') });
      }
      v.issues = vi;
    }

    const dirs = new Set(line.variants.map((v) => v.direction));
    if (!(dirs.has('tur') && dirs.has('retur'))) {
      li.push(
        official
          ? { code: 'missing_return', severity: 'info', message: 'Operatorul publică un singur sens (traseu circular sau cu sens unic)' }
          : { code: 'missing_return', severity: 'warn', message: line.variants.length === 1 ? 'Există un singur sens (lipsește returul)' : 'Nu s-au putut identifica ambele sensuri' },
      );
    }
    const perDir = Math.max(...['tur', 'retur'].map((d) => line.variants.filter((v) => v.direction === d).length));
    if (perDir > 1) li.push({ code: 'extra_variants', severity: 'info', message: `${line.variants.length} variante de traseu` });
    line.issues = li;
  }
}

export function lineHasWarnings(line: Line) {
  return line.issues.some((i) => i.severity === 'warn') || line.variants.some((v) => v.issues.some((i) => i.severity === 'warn'));
}
