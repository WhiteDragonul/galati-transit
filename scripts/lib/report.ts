import { writeFile } from 'node:fs/promises';
import type { Issue } from '../../shared/model.ts';
import type { MergeNotes } from '../sources/transurb.ts';
import { GAP_TOLERANCE_M, lineHasWarnings, ROUTE_MATCH_WARN } from './quality.ts';
import type { SourceResult } from './types.ts';

const MODE = { bus: 'Autobuz', trolleybus: 'Troleibuz', tram: 'Tramvai' } as const;
const esc = (s: string | null | undefined) => (s ?? '—').replace(/\|/g, '\\|');
const osmLink = (ref: string) => `[${ref}](https://www.openstreetmap.org/${ref})`;
const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);

export async function writeReport(
  file: string,
  data: SourceResult,
  meta: { rawFile: string; tbFile: string | null; notes: MergeNotes | null; overrideLog: string[]; attribution: string },
) {
  const lines = data.lines;
  const variants = lines.flatMap((l) => l.variants.map((v) => ({ line: l, v })));
  const stops = [...data.stops.values()];
  const withIssue = (code: Issue['code']) => variants.filter(({ v }) => v.issues.some((i) => i.code === code));
  const official = !!meta.tbFile;
  const allStops = variants.flatMap(({ v }) => v.stops);

  const md: string[] = [];
  md.push('# Raport calitate date — transport public Galați', '');
  md.push(`Generat: ${new Date().toISOString()}  `);
  md.push(`OSM: \`${meta.rawFile}\` (date la ${data.sourceTimestamp ?? 'necunoscut'})  `);
  md.push(official ? `Program oficial Transurb: \`${meta.tbFile}\` (transurbgalati.ro/program_circulatie)  ` : 'Program oficial Transurb: nefolosit  ');
  md.push(`Date hartă: ${meta.attribution}`, '');
  if (official)
    md.push(
      '**Surse**: lista de linii, stațiile (ordine, tur/retur) și orarele vin de pe site-ul Transurb. ' +
        'Din OpenStreetMap vin doar desenul traseelor și pozițiile stațiilor, legate de stațiile oficiale prin potrivirea numelor în ordine.',
      '',
    );

  md.push('## Sumar', '');
  md.push('| | |', '|---|---|');
  md.push(`| Linii | ${lines.length} (${(['tram', 'trolleybus', 'bus'] as const).map((m) => `${lines.filter((l) => l.mode === m).length} ${MODE[m].toLowerCase()}`).join(', ')}) |`);
  md.push(`| Variante (sensuri) | ${variants.length} |`);
  md.push(`| Stații pe trasee (cu repetări) | ${allStops.length}, dintre care ${allStops.filter((s) => s.stopId).length} cu poziție pe hartă (${pct(allStops.filter((s) => s.stopId).length / Math.max(1, allStops.length))}) |`);
  md.push(`| Stații distincte pe hartă | ${stops.length} |`);
  md.push(`| Linii fără probleme „date incomplete” | ${lines.filter((l) => !lineHasWarnings(l)).length} / ${lines.length} |`);
  md.push(`| Variante fără desen pe hartă | ${withIssue('no_geometry').length} |`);
  md.push(`| Variante cu desen OSM diferit de traseul oficial (< ${pct(ROUTE_MATCH_WARN)} stații regăsite) | ${withIssue('route_mismatch').length} |`);
  md.push(`| Variante cu traseu OSM întrerupt (gol > ${GAP_TOLERANCE_M} m) | ${withIssue('geometry_gaps').length} |`);
  if (official) md.push(`| Variante fără orar | ${withIssue('no_schedule').length} |`);
  md.push('');

  md.push('## Linii', '');
  md.push(
    official
      ? '| Linie | Tip | Sens | Stații oficiale | Cu poziție | Potrivire desen OSM | Relație OSM folosită | Orar | Probleme |'
      : '| Linie | Tip | Sens | Stații | Cu poziție | — | Relație OSM | — | Probleme |',
    '|---|---|---|---|---|---|---|---|---|',
  );
  for (const l of lines)
    for (const v of l.variants) {
      const warn = [...new Set([...l.issues, ...v.issues].filter((i) => i.severity === 'warn').map((i) => i.code))].join(', ');
      md.push(
        `| **${esc(l.ref)}** | ${MODE[l.mode]} | ${v.direction ?? '?'}${v.label ? ` (${esc(v.label)})` : ''} | ${v.stops.length} | ${v.stops.filter((s) => s.stopId).length} | ${v.geometrySource === 'routed' ? 'calculat' : pct(v.geometryMatch)} | ${v.geometryRef ? osmLink(v.geometryRef) : v.geometrySource === 'routed' ? 'traseu calculat pe străzi' : '—'} | ${v.scheduleKey ? '✓' : '—'} | ${warn ? '⚠ ' + warn : '✓'} |`,
      );
    }
  md.push('');

  if (meta.notes) {
    md.push('## Linii din OSM care nu mai apar în programul Transurb', '');
    md.push('Nu sunt afișate în aplicație (probabil desființate sau renumerotate). Dacă circulă, trebuie adăugate pe site-ul operatorului sau corectate în OSM.', '');
    if (!meta.notes.notOnOfficialSite.length) md.push('Niciuna.');
    for (const n of meta.notes.notOnOfficialSite) md.push(`- ${MODE[n.mode]} ${esc(n.ref)}`);
    md.push('');

    md.push('## Tip de vehicul diferit între Transurb și OSM', '');
    md.push('Se folosește tipul de pe site-ul Transurb (grupa de culoare a liniei).', '');
    if (!meta.notes.modeMismatch.length) md.push('Niciuna.');
    for (const n of meta.notes.modeMismatch) md.push(`- ${esc(n.ref)}: Transurb = ${MODE[n.official]}, OSM = ${MODE[n.osm]}`);
    md.push('');

    md.push('## Alias-uri de stații (confirmate manual)', '');
    md.push('Din `stopAliases` în `data/overrides.json`: numele oficial e păstrat, alias-ul e folosit doar la potrivirea cu OSM.', '');
    if (!meta.notes.aliasesUsed.size) md.push('Niciunul.');
    for (const a of meta.notes.aliasesUsed) md.push(`- ${esc(a)}`);
    md.push('');

    md.push('## Trasee calculate pe străzi', '');
    md.push('Linii pe care OpenStreetMap nu le are ca relații: traseul e calculat pe rețeaua de străzi OSM (respectând sensurile unice, preferând străzile cu transport public), trecând prin stațiile oficiale poziționate, în ordine. În aplicație sunt marcate „traseu calculat”.', '');
    if (!meta.notes.routed.length && !meta.notes.routeFailed.length) md.push('Niciunul.');
    for (const r of meta.notes.routed) md.push(`- ${esc(r.lineId)} ${r.key}: ${r.legs} tronsoane, ${(r.lengthM / 1000).toFixed(1)} km`);
    for (const r of meta.notes.routeFailed) md.push(`- ⚠ ${esc(r.lineId)} ${r.key}: nu s-a putut calcula (${r.legs}/${r.needed} tronsoane)`);
    md.push('');

    md.push('## Stații cu nume ambiguu, alese după poziția pe drum', '');
    md.push('Linii fără relație OSM: dintre stațiile OSM cu acel nume s-a ales cea aflată între stațiile vecine (ocol minim).', '');
    if (!meta.notes.detourMatches.length) md.push('Niciuna.');
    for (const n of meta.notes.detourMatches) md.push(`- ${esc(n.lineId)}: „${esc(n.official)}” → „${esc(n.osm)}” (ocol +${n.extraM} m)`);
    md.push('');

    md.push('## Stații legate prin poziția pe traseu', '');
    md.push('Stația oficială e între aceiași vecini ca stația OSM și au un cuvânt semnificativ comun (de ex. tip de stradă diferit).', '');
    if (!meta.notes.gapMatches.length) md.push('Niciuna.');
    for (const n of meta.notes.gapMatches) md.push(`- ${esc(n.lineId)}: „${esc(n.official)}” → „${esc(n.osm)}”`);
    md.push('');

    md.push('## Stații ale liniilor fără traseu în OSM, poziționate după nume', '');
    md.push('Doar când numele e neambiguu în tot orașul (toate stațiile OSM cu acel nume sunt la cel mult 400 m una de alta). Traseul dintre ele nu e desenat.', '');
    if (!meta.notes.uniqueNameMatches.length) md.push('Niciuna.');
    for (const n of meta.notes.uniqueNameMatches) md.push(`- ${esc(n.lineId)}: „${esc(n.official)}” → „${esc(n.osm)}”`);
    md.push('');

    md.push('## Stații legate prin nume + proximitate', '');
    md.push(`Stații oficiale care nu apar pe relația OSM a traseului, dar există în OSM cu același nume la mai puțin de 800 m de stațiile vecine.`, '');
    if (!meta.notes.nearbyMatches.length) md.push('Niciuna.');
    for (const n of meta.notes.nearbyMatches) md.push(`- ${esc(n.lineId)}: „${esc(n.official)}” → „${esc(n.osm)}” (${n.distanceM} m)`);
    md.push('');
  }

  md.push('## Stații fără poziție pe hartă', '');
  md.push('Stații oficiale pentru care nu există în OSM o stație cu nume potrivit pe traseu. Se afișează în listă, dar nu pe hartă.', '');
  const unplaced = variants.filter(({ v }) => v.stops.some((s) => !s.stopId));
  if (!unplaced.length) md.push('Niciuna.');
  for (const { line, v } of unplaced)
    md.push(`- **${esc(line.ref)} ${v.direction ?? ''}**${v.label ? ` (${esc(v.label)})` : ''}: ${v.stops.filter((s) => !s.stopId).map((s) => esc(s.officialName ?? s.name)).join(', ')}`);
  md.push('');

  md.push(`## Trasee OSM întrerupte (gol > ${GAP_TOLERANCE_M} m)`, '');
  const gaps = withIssue('geometry_gaps');
  if (!gaps.length) md.push('Niciunul.');
  for (const { line, v } of gaps) md.push(`- ${esc(line.ref)} ${v.direction ?? ''}: ${v.gaps.count} goluri, max ${v.gaps.maxM} m — ${v.geometryRef ? osmLink(v.geometryRef) : ''}`);
  md.push('');

  md.push('## Rute OSM excluse (alți operatori)', '');
  md.push('Se pot include adăugând rețeaua/operatorul în `includeNetworks` din `data/overrides.json` (doar fără date oficiale).', '');
  if (!data.excluded.length) md.push('Niciuna.');
  for (const e of data.excluded) md.push(`- ${esc(e.name)} — operator: ${esc(e.operator)}, network: ${esc(e.network)} — ${osmLink(e.sourceRef)}`);
  md.push('');

  md.push('## Convenții', '');
  if (official) {
    md.push('- **Tur/retur, ordinea stațiilor, variantele de serviciu și orarele**: exact ca pe transurbgalati.ro.');
    md.push('- **Nume afișate**: numele din OSM (cu diacritice) când stația e potrivită; altfel numele oficial. Numele oficial e păstrat în `officialName`.');
    md.push('- **Orarul de weekend** se aplică și în sărbătorile legale (conform site-ului); aplicația nu cunoaște calendarul sărbătorilor.');
  } else {
    md.push('- **Tur/retur**: prima variantă din `route_master` e considerată „tur”.');
  }
  md.push('- **Culori**: dacă lipsesc din surse, UI-ul folosește o culoare de rezervă și marchează asta.');
  md.push('');

  md.push('## Override-uri aplicate', '');
  md.push(meta.overrideLog.length ? meta.overrideLog.map((l) => `- ${l}`).join('\n') : 'Niciunul.');
  md.push('');

  await writeFile(file, md.join('\n'));
}
