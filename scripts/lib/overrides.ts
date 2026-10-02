// Corecții manuale din data/overrides.json, aplicate după sursă și înainte de verificările de calitate.
import type { Direction } from '../../shared/model.ts';
import type { SourceResult } from './types.ts';

export interface Overrides {
  /** rețelele/operatorii incluși (tag network= sau operator= din OSM) */
  includeNetworks: string[];
  lines?: Record<string, { colour?: string; name?: string; hidden?: boolean }>;
  variants?: Record<string, { direction?: Direction; hidden?: boolean }>;
  stops?: Record<string, { name?: string }>;
}

export function applyOverrides(data: SourceResult, ov: Overrides): string[] {
  const log: string[] = [];
  const lineById = new Map(data.lines.map((l) => [l.id, l]));

  for (const [id, o] of Object.entries(ov.lines ?? {})) {
    const line = lineById.get(id);
    if (!line) { log.push(`⚠ override pentru linia inexistentă "${id}"`); continue; }
    if (o.hidden) { data.lines = data.lines.filter((l) => l.id !== id); log.push(`linia ${id} ascunsă`); continue; }
    if (o.colour) { line.colour = o.colour; log.push(`linia ${id}: culoare ${o.colour}`); }
    if (o.name) { line.name = o.name; log.push(`linia ${id}: nume "${o.name}"`); }
  }

  for (const [id, o] of Object.entries(ov.variants ?? {})) {
    const line = data.lines.find((l) => l.variants.some((v) => v.id === id));
    const v = line?.variants.find((x) => x.id === id);
    if (!line || !v) { log.push(`⚠ override pentru varianta inexistentă "${id}"`); continue; }
    if (o.hidden) { line.variants = line.variants.filter((x) => x.id !== id); log.push(`varianta ${id} ascunsă`); continue; }
    if (o.direction) { v.direction = o.direction; v.directionSource = 'override'; log.push(`varianta ${id}: ${o.direction}`); }
  }

  for (const [id, o] of Object.entries(ov.stops ?? {})) {
    const s = data.stops.get(id);
    if (!s) { log.push(`⚠ override pentru stația inexistentă "${id}"`); continue; }
    if (o.name) { s.name = o.name; s.nameFrom = 'override'; log.push(`stația ${id}: nume "${o.name}"`); }
  }
  return log;
}
