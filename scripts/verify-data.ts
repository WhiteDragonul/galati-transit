// Verifică datele generate:
//  1) consistență internă (public/data ↔ data/raw/transurb-*.json ↔ OSM);
//  2) comparație cu site-ul live transurbgalati.ro: lista de linii, stațiile fiecărei linii (toate),
//     și orarele pentru un eșantion de stații (sau toate, cu --all).
// Scrie data/verify.md și iese cu cod ≠ 0 dacă găsește nepotriviri.
// Rulare: npm run data:verify [-- --all] [-- --sample=60] [-- --offline]
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FeatureCollection } from 'geojson';
import type { LinesFile, ScheduleFile } from '../shared/model.ts';
import { BASE, parseIndex, parseRoute, parseTimetable } from './lib/transurb-parse.ts';
import type { TransurbRaw } from './lib/transurb-types.ts';

const args = process.argv.slice(2);
const ALL = args.includes('--all');
const OFFLINE = args.includes('--offline');
const SAMPLE = Number(args.find((a) => a.startsWith('--sample='))?.split('=')[1] ?? 60);

const fails: string[] = [];
const notes: string[] = [];
const ok: string[] = [];
const check = (cond: boolean, okMsg: string, failMsg: string) => (cond ? ok.push(okMsg) : fails.push(failMsg));

const json = async <T>(f: string): Promise<T> => JSON.parse(await readFile(f, 'utf8'));
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

async function get(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'galati-transit/0.1 (verificare date)' }, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}
const pause = () => new Promise((r) => setTimeout(r, 250));

async function main() {
  const tbFile = (await readdir('data/raw')).filter((f) => /^transurb-.*\.json$/.test(f)).sort().pop();
  if (!tbFile) throw new Error('Lipsesc datele Transurb (npm run data:fetch-transurb).');
  const raw = await json<TransurbRaw>(path.join('data/raw', tbFile));
  const lf = await json<LinesFile>('public/data/lines.json');
  const routes = await json<FeatureCollection>('public/data/routes.geojson');
  const stops = await json<FeatureCollection>('public/data/stops.geojson');
  const stopIds = new Set(stops.features.map((f) => (f.properties as { id: string }).id));
  const variantIds = new Set(lf.lines.flatMap((l) => l.variants.map((v) => v.id)));

  // ——— 1. consistență internă ———
  const rawRefs = raw.lines.map((l) => l.ref).sort().join(',');
  const outRefs = lf.lines.map((l) => l.ref).sort().join(',');
  check(rawRefs === outRefs, `Liniile din aplicație = liniile oficiale (${raw.lines.length})`, `Liniile diferă: oficial [${rawRefs}] vs aplicație [${outRefs}]`);

  let stopsChecked = 0, timesChecked = 0;
  for (const rl of raw.lines) {
    const line = lf.lines.find((l) => l.ref === rl.ref);
    if (!line) continue;
    const sch = await json<ScheduleFile>(path.join('public/data', line.scheduleFile!)).catch(() => null);
    if (!sch) { fails.push(`${rl.ref}: lipsește fișierul de orar ${line.scheduleFile}`); continue; }
    rl.variants.forEach((rv, vi) => {
      for (const d of ['tur', 'retur'] as const) {
        if (!rv[d].length) continue;
        const key = `v${vi + 1}:${d}`;
        const v = line.variants.find((x) => x.scheduleKey === key || x.id === `tb:${rl.ref}:${key}`);
        if (!v) { fails.push(`${rl.ref} ${key}: varianta lipsește din aplicație`); continue; }
        const official = rv[d].map((s) => s.name).join(' | ');
        const shown = v.stops.map((s) => s.officialName).join(' | ');
        if (official !== shown) fails.push(`${rl.ref} ${key}: ordinea/numele stațiilor diferă de sursa oficială`);
        if (v.direction !== d) fails.push(`${rl.ref} ${key}: sens ${v.direction} ≠ ${d}`);
        for (const s of v.stops) if (s.stopId && !stopIds.has(s.stopId)) fails.push(`${rl.ref} ${key}: stația ${s.stopId} lipsește din stops.geojson`);
        const sv = sch.variants[key];
        if (!sv || sv.stops.length !== rv[d].length) { fails.push(`${rl.ref} ${key}: orarul nu e aliniat cu stațiile`); continue; }
        rv[d].forEach((rs, i) => {
          stopsChecked++;
          for (const tt of rs.timetables) {
            const k = sch.dayTypes.findIndex((x) => x.toLocaleLowerCase('ro') === tt.dayType.toLocaleLowerCase('ro'));
            const got = sv.stops[i].times[k] ?? [];
            timesChecked += got.length;
            if (got.join() !== tt.times.join()) fails.push(`${rl.ref} ${key} „${rs.name}” (${tt.dayType}): orele diferă de sursa brută`);
            if (got.some((t) => !HHMM.test(t))) fails.push(`${rl.ref} ${key} „${rs.name}”: oră invalidă`);
            for (let j = 1; j < got.length; j++) if (got[j] <= got[j - 1]) { fails.push(`${rl.ref} ${key} „${rs.name}”: ore nesortate/duplicate (${got[j - 1]}, ${got[j]})`); break; }
            if (tt.other.length) fails.push(`${rl.ref} ${key} „${rs.name}”: celule neinterpretate: ${tt.other.join(', ')}`);
          }
        });
      }
    });
  }
  ok.push(`${stopsChecked} stații × tip de zi: orele din aplicație = sursa brută (${timesChecked} ore)`);
  const orphan = routes.features.filter((f) => !variantIds.has((f.properties as { variantId: string }).variantId)).length;
  check(orphan === 0, 'Toate traseele desenate aparțin unei variante', `${orphan} trasee desenate fără variantă`);

  // ——— 2. comparație cu site-ul live ———
  if (!OFFLINE) {
    const liveIndex = parseIndex(await get(BASE));
    const liveRefs = liveIndex.map((l) => l.ref).sort().join(',');
    check(liveRefs === rawRefs, `Lista de linii = site-ul live (${liveIndex.length})`, `Lista de linii s-a schimbat pe site: [${liveRefs}] (local [${rawRefs}]) — rulează npm run data:fetch-transurb`);

    let routesOk = 0;
    const timetableJobs: { ref: string; key: string; name: string; url: string; local: { dayType: string; times: string[] }[] }[] = [];
    for (const rl of raw.lines) {
      await pause();
      const live = parseRoute(await get(rl.url));
      const a = live.map((v) => `${v.tur.map((s) => s.name).join('|')}#${v.retur.map((s) => s.name).join('|')}`).join('§');
      const b = rl.variants.map((v) => `${v.tur.map((s) => s.name).join('|')}#${v.retur.map((s) => s.name).join('|')}`).join('§');
      if (a === b) routesOk++;
      else fails.push(`${rl.ref}: stațiile de pe site s-au schimbat față de datele locale — rulează npm run data:fetch-transurb`);
      rl.variants.forEach((rv, vi) => {
        for (const d of ['tur', 'retur'] as const)
          for (const s of rv[d]) timetableJobs.push({ ref: rl.ref, key: `v${vi + 1}:${d}`, name: s.name, url: s.url, local: s.timetables });
      });
    }
    ok.push(`Stațiile (tur/retur, toate variantele) = site-ul live pentru ${routesOk}/${raw.lines.length} linii`);

    // eșantion determinist, distribuit pe toate liniile (sau toate stațiile cu --all)
    const step = ALL ? 1 : Math.max(1, Math.floor(timetableJobs.length / SAMPLE));
    const sample = timetableJobs.filter((_, i) => i % step === 0);
    let ttOk = 0;
    for (const job of sample) {
      await pause();
      const live = parseTimetable(await get(job.url));
      const same = live.length === job.local.length && live.every((t, i) => t.dayType === job.local[i].dayType && t.times.join() === job.local[i].times.join());
      if (same) ttOk++;
      else fails.push(`${job.ref} ${job.key} „${job.name}”: orarul de pe site diferă de cel local`);
    }
    ok.push(`Orare = site-ul live pentru ${ttOk}/${sample.length} stații verificate${ALL ? ' (toate)' : ` (eșantion din ${timetableJobs.length})`}`);
  } else notes.push('Comparația cu site-ul live a fost sărită (--offline).');

  // ——— 3. acoperire hartă (informativ) ———
  const all = lf.lines.flatMap((l) => l.variants.flatMap((v) => v.stops));
  const placed = all.filter((s) => s.stopId).length;
  const drawn = lf.lines.flatMap((l) => l.variants).filter((v) => routes.features.some((f) => (f.properties as { variantId: string }).variantId === v.id)).length;
  notes.push(`Stații oficiale cu poziție pe hartă: ${placed}/${all.length} (${Math.round((placed / all.length) * 100)}%).`);
  notes.push(`Variante desenate pe hartă: ${drawn}/${lf.lines.flatMap((l) => l.variants).length}.`);

  const md = [
    '# Verificare date', '',
    `Rulat: ${new Date().toISOString()}  `,
    `Date oficiale: \`${tbFile}\` (preluate ${raw.fetchedAt})`, '',
    `**Rezultat: ${fails.length ? `❌ ${fails.length} probleme` : '✅ totul corespunde'}**`, '',
    '## Verificări trecute', '', ...ok.map((x) => `- ✅ ${x}`), '',
    ...(fails.length ? ['## Probleme', '', ...fails.map((x) => `- ❌ ${x}`), ''] : []),
    '## Note', '', ...notes.map((x) => `- ${x}`), '',
  ].join('\n');
  await writeFile('data/verify.md', md);
  console.log(md);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
