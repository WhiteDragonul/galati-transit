// Descarcă de pe transurbgalati.ro lista oficială de linii, stațiile pe tur/retur (pe variante)
// și orarul fiecărei stații. Paginile de orar rămân în cache (data/raw/transurb-cache/, ignorat de git),
// deci o rulare repetată nu mai încarcă serverul. Cu --refresh se re-descarcă tot.
// Rulare: npm run data:fetch-transurb [-- --refresh]
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BASE, CATEGORY, parseIndex, parseRoute, parseTimetable, sentenceCase } from './lib/transurb-parse.ts';
import type { TransurbLine, TransurbRaw, TransurbStop, TransurbVariant } from './lib/transurb-types.ts';

const CACHE = path.resolve('data/raw/transurb-cache');
const CONCURRENCY = 3;
const DELAY_MS = 250;
const refresh = process.argv.includes('--refresh');

// ——— HTTP politicos (max 3 cereri simultan, pauză între ele), cu cache ———
let active = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  while (active >= CONCURRENCY) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    await new Promise((r) => setTimeout(r, DELAY_MS));
    active--;
    waiting.shift()?.();
  }
}

let fetched = 0, cached = 0;
async function get(url: string, useCache = true): Promise<string> {
  const file = path.join(CACHE, createHash('sha1').update(url).digest('hex').slice(0, 16) + '.html');
  if (useCache && !refresh) {
    try {
      const html = await readFile(file, 'utf8');
      cached++;
      return html;
    } catch { /* nu e în cache */ }
  }
  const html = await slot(async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'galati-transit/0.1 (prototip harta transport public)' }, signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } catch (e) {
        if (attempt >= 3) throw new Error(`${url}: ${(e as Error).message}`);
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  });
  fetched++;
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, html);
  return html;
}

async function main() {
  // lista de linii și paginile de traseu se descarcă mereu (sunt puține și se pot schimba)
  const index = parseIndex(await get(BASE, false));
  console.log(`${index.length} linii pe site: ${index.map((l) => l.ref).join(', ')}`);

  const lines: TransurbLine[] = [];
  for (const entry of index) {
    const url = `${BASE}veziTraseu?numarTraseu=${encodeURIComponent(entry.ref)}`;
    const variants: TransurbVariant[] = [];
    for (const vr of parseRoute(await get(url, false))) {
      const v: TransurbVariant = { key: vr.key, label: sentenceCase(vr.label), tur: [], retur: [] };
      for (const d of ['tur', 'retur'] as const) {
        v[d] = await Promise.all(
          vr[d].map(async (s): Promise<TransurbStop> => {
            const tUrl = BASE + s.href;
            return { name: s.name, url: tUrl, timetables: parseTimetable(await get(tUrl)) };
          }),
        );
      }
      variants.push(v);
    }
    const nStops = variants.reduce((n, v) => n + v.tur.length + v.retur.length, 0);
    console.log(`  ${entry.ref.padEnd(4)} ${variants.length} variante, ${nStops} stații  (${fetched} descărcate, ${cached} din cache)`);
    lines.push({
      ref: entry.ref,
      section: entry.section,
      colorClass: entry.colorClass,
      category: (entry.colorClass && CATEGORY[entry.colorClass]) || 'bus',
      url,
      variants,
    });
  }

  const date = new Date().toISOString().slice(0, 10);
  const raw: TransurbRaw = { fetchedAt: new Date().toISOString(), source: BASE, lines };
  const file = path.resolve(`data/raw/transurb-${date}.json`);
  await writeFile(file, JSON.stringify(raw));
  console.log(`Salvat ${path.relative(process.cwd(), file)} (${fetched} pagini descărcate, ${cached} din cache)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
