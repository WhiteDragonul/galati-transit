import { writeFile } from 'node:fs/promises';
import type { Issue } from '../../shared/model.ts';
import { GAP_TOLERANCE_M, lineHasWarnings } from './quality.ts';
import type { SourceResult } from './types.ts';

const MODE = { bus: 'Autobuz', trolleybus: 'Troleibuz', tram: 'Tramvai' } as const;
const DIR = { tur: 'tur', retur: 'retur' } as const;
const esc = (s: string | null | undefined) => (s ?? '—').replace(/\|/g, '\\|');

export async function writeReport(
  file: string,
  data: SourceResult,
  meta: { rawFile: string; overrideLog: string[]; attribution: string },
) {
  const lines = data.lines;
  const variants = lines.flatMap((l) => l.variants.map((v) => ({ line: l, v })));
  const stops = [...data.stops.values()];
  const withIssue = (code: Issue['code']) => variants.filter(({ v }) => v.issues.some((i) => i.code === code));
  const lineIssue = (code: Issue['code']) => lines.filter((l) => l.issues.some((i) => i.code === code));

  const md: string[] = [];
  md.push('# Raport calitate date — transport public Galați', '');
  md.push(`Generat: ${new Date().toISOString()}  `);
  md.push(`Sursă: \`${meta.rawFile}\` (OSM la ${data.sourceTimestamp ?? 'necunoscut'})  `);
  md.push(`Date: ${meta.attribution}`, '');

  md.push('## Sumar', '');
  md.push('| | |', '|---|---|');
  md.push(`| Linii | ${lines.length} (${(['tram', 'trolleybus', 'bus'] as const).map((m) => `${lines.filter((l) => l.mode === m).length} ${MODE[m].toLowerCase()}`).join(', ')}) |`);
  md.push(`| Variante (sensuri) | ${variants.length} |`);
  md.push(`| Stații (platforme) | ${stops.length} |`);
  md.push(`| Linii fără probleme de tip „date incomplete” | ${lines.filter((l) => !lineHasWarnings(l)).length} / ${lines.length} |`);
  md.push(`| Variante cu traseu întrerupt (gol > ${GAP_TOLERANCE_M} m) | ${withIssue('geometry_gaps').length} |`);
  md.push(`| Variante fără geometrie | ${withIssue('no_geometry').length} |`);
  md.push(`| Variante fără stații | ${withIssue('no_stops').length} |`);
  md.push(`| Stații fără nume | ${stops.filter((s) => !s.name).length} |`);
  md.push(`| Stații cu nume preluat de la stop_position | ${stops.filter((s) => s.nameFrom === 'stop_position').length} |`);
  md.push(`| Linii fără ambele sensuri | ${lineIssue('missing_return').length} |`);
  md.push(`| Linii fără culoare în OSM | ${lineIssue('no_colour').length} |`);
  md.push(`| Linii fără route_master | ${lineIssue('no_master').length} |`);
  md.push('');

  md.push('## Linii', '');
  md.push('| Linie | Tip | Variante | Stații (per variantă) | Lungime km | Probleme |', '|---|---|---|---|---|---|');
  for (const l of lines) {
    const issues = [...l.issues, ...l.variants.flatMap((v) => v.issues)].filter((i) => i.severity === 'warn');
    const codes = [...new Set(issues.map((i) => i.code))].join(', ');
    md.push(`| **${esc(l.ref)}** | ${MODE[l.mode]} | ${l.variants.map((v) => v.direction ? DIR[v.direction] : '?').join(', ')} | ${l.variants.map((v) => v.stopIds.length).join(' / ')} | ${l.variants.map((v) => (v.lengthM / 1000).toFixed(1)).join(' / ')} | ${codes ? '⚠ ' + codes : '✓'} |`);
  }
  md.push('');

  md.push(`## Trasee întrerupte (gol > ${GAP_TOLERANCE_M} m)`, '');
  const gaps = withIssue('geometry_gaps');
  if (!gaps.length) md.push('Niciunul.');
  else {
    md.push('| Linie | Variantă | Goluri | Gol maxim (m) | Relație OSM |', '|---|---|---|---|---|');
    for (const { line, v } of gaps) md.push(`| ${esc(line.ref)} | ${esc(v.name)} | ${v.gaps.count} | ${v.gaps.maxM} | [${v.sourceRef}](https://www.openstreetmap.org/${v.sourceRef}) |`);
  }
  md.push('');

  const tiny = variants.filter(({ v }) => v.gaps.count && v.gaps.maxM <= GAP_TOLERANCE_M);
  if (tiny.length) {
    md.push(`## Way-uri neconectate dar suprapuse (gol ≤ ${GAP_TOLERANCE_M} m)`, '');
    md.push('Nu afectează desenul, dar indică noduri duplicate în OSM.', '');
    for (const { line, v } of tiny) md.push(`- ${esc(line.ref)} — ${esc(v.name)}: ${v.gaps.count} (max ${v.gaps.maxM} m) — [${v.sourceRef}](https://www.openstreetmap.org/${v.sourceRef})`);
    md.push('');
  }

  md.push('## Variante fără geometrie sau fără stații', '');
  const empty = [...withIssue('no_geometry'), ...withIssue('no_stops')];
  if (!empty.length) md.push('Niciuna.');
  for (const { line, v } of empty) md.push(`- ${esc(line.ref)} — ${esc(v.name)}: ${v.issues.filter((i) => i.code === 'no_geometry' || i.code === 'no_stops').map((i) => i.message).join('; ')} — [${v.sourceRef}](https://www.openstreetmap.org/${v.sourceRef})`);
  md.push('');

  md.push('## Sensuri lipsă sau neidentificate', '');
  const miss = lineIssue('missing_return');
  if (!miss.length) md.push('Niciunul.');
  for (const l of miss) md.push(`- ${esc(l.ref)} (${MODE[l.mode]}): ${l.variants.map((v) => `${esc(v.name)} → ${v.direction ?? 'nedeterminat'}`).join('; ')}`);
  md.push('');

  md.push('## Stații fără nume', '');
  const unnamed = stops.filter((s) => !s.name);
  if (!unnamed.length) md.push('Niciuna.');
  for (const s of unnamed) md.push(`- [${s.sourceRef}](https://www.openstreetmap.org/${s.sourceRef}) — linii: ${[...s.lineIds].join(', ')}`);
  md.push('');

  md.push('## Capete de linie: tag-uri from/to vs. prima/ultima stație', '');
  md.push('Informativ: diferențe de denumire între tag-urile relației și numele stațiilor.', '');
  const mism = withIssue('terminal_mismatch');
  if (!mism.length) md.push('Niciuna.');
  for (const { line, v } of mism) md.push(`- ${esc(line.ref)}: ${v.issues.find((i) => i.code === 'terminal_mismatch')!.message}`);
  md.push('');

  md.push('## Rute excluse (în afara rețelelor incluse)', '');
  md.push('Se pot include adăugând rețeaua/operatorul în `includeNetworks` din `data/overrides.json`.', '');
  if (!data.excluded.length) md.push('Niciuna.');
  for (const e of data.excluded) md.push(`- ${esc(e.name)} — operator: ${esc(e.operator)}, network: ${esc(e.network)} — [${e.sourceRef}](https://www.openstreetmap.org/${e.sourceRef})`);
  md.push('');

  md.push('## Convenții', '');
  md.push('- **Tur/retur**: OSM nu le definește. Prima variantă din `route_master` e considerată „tur”; celelalte sunt clasificate după capete (from/to). Se pot corecta în `overrides.json`.');
  md.push('- **Stații**: se folosesc platformele (`platform*`); dacă o variantă nu are platforme, se folosesc `stop_position`.');
  md.push('- **Culori**: dacă lipsesc din OSM, UI-ul folosește o culoare de rezervă și marchează asta.');
  md.push('');

  md.push('## Override-uri aplicate', '');
  md.push(meta.overrideLog.length ? meta.overrideLog.map((l) => `- ${l}`).join('\n') : 'Niciunul.');
  md.push('');

  await writeFile(file, md.join('\n'));
}
