// Verificări de calitate. Rezultatul ajunge în issues[] (pentru UI) și în report.md.
import type { Issue, Line } from '../../shared/model.ts';
import { normName } from './geo.ts';
import type { SourceResult } from './types.ts';

/** golurile mai mici de atât (noduri neunite, dar suprapuse) nu sunt semnalate ca rupturi */
export const GAP_TOLERANCE_M = 5;

export function computeIssues(data: SourceResult) {
  for (const line of data.lines) {
    const li: Issue[] = [];
    if (!line.colour) li.push({ code: 'no_colour', severity: 'info', message: 'Culoarea liniei lipsește din sursă' });
    if (!line.sourceRef) li.push({ code: 'no_master', severity: 'info', message: 'Linia nu are route_master în OSM; variantele au fost grupate după număr' });

    for (const v of line.variants) {
      const vi: Issue[] = [];
      const segs = data.geometries.get(v.id) ?? [];
      if (!segs.length) vi.push({ code: 'no_geometry', severity: 'warn', message: 'Traseul nu are geometrie' });
      const realGaps = v.gaps.count && v.gaps.maxM > GAP_TOLERANCE_M;
      if (realGaps) vi.push({ code: 'geometry_gaps', severity: 'warn', message: `Traseu întrerupt (${v.gaps.count} goluri, cel mai mare ${v.gaps.maxM} m)` });
      if (!v.stopIds.length) vi.push({ code: 'no_stops', severity: 'warn', message: 'Varianta nu are stații' });
      const unnamed = v.stopIds.filter((id) => !data.stops.get(id)?.name).length;
      if (unnamed) vi.push({ code: 'unnamed_stops', severity: 'warn', message: `${unnamed} stații fără nume` });

      const first = data.stops.get(v.stopIds[0])?.name;
      const last = data.stops.get(v.stopIds[v.stopIds.length - 1])?.name;
      const mism: string[] = [];
      if (v.from && first && normName(v.from) !== normName(first)) mism.push(`from="${v.from}" ≠ prima stație "${first}"`);
      if (v.to && last && normName(v.to) !== normName(last)) mism.push(`to="${v.to}" ≠ ultima stație "${last}"`);
      if (mism.length) vi.push({ code: 'terminal_mismatch', severity: 'info', message: mism.join('; ') });
      v.issues = vi;
    }

    const dirs = new Set(line.variants.map((v) => v.direction));
    if (!(dirs.has('tur') && dirs.has('retur'))) {
      li.push({ code: 'missing_return', severity: 'warn', message: line.variants.length === 1 ? 'Există un singur sens (lipsește returul)' : 'Nu s-au putut identifica ambele sensuri' });
    }
    if (line.variants.length > 2) li.push({ code: 'extra_variants', severity: 'info', message: `${line.variants.length} variante de traseu` });
    line.issues = li;
  }
}

export function lineHasWarnings(line: Line) {
  return line.issues.some((i) => i.severity === 'warn') || line.variants.some((v) => v.issues.some((i) => i.severity === 'warn'));
}
