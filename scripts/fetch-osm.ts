// Descarcă din Overpass toate rutele de transport public (bus/trolleybus/tram)
// din municipiul Galați, plus route_master-ele lor, și le salvează brut în data/raw/.
// Rulare: npm run data:fetch
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// relation/10487103 = Municipiul Galați (boundary=administrative, admin_level=8)
const AREA_RELATION_ID = 10487103;
const AREA_ID = 3_600_000_000 + AREA_RELATION_ID;

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const QUERY = `
[out:json][timeout:180];
area(id:${AREA_ID})->.city;
rel(area.city)["type"="route"]["route"~"^(bus|trolleybus|tram)$"]->.routes;
rel(br.routes)["type"="route_master"]->.masters;
(.routes; .masters;)->.rels;
.rels out body;
.routes >> ->.members;
.members out body qt;
`;

async function query(endpoint: string): Promise<unknown> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'User-Agent': 'galati-transit/0.1 (prototip harta transport public)',
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'data=' + encodeURIComponent(QUERY),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trimStart().startsWith('{')) throw new Error('răspuns non-JSON');
  return JSON.parse(text);
}

async function main() {
  let data: any = null;
  let used = '';
  for (const endpoint of ENDPOINTS) {
    process.stdout.write(`→ ${endpoint} ... `);
    try {
      data = await query(endpoint);
      used = endpoint;
      console.log('ok');
      break;
    } catch (err) {
      console.log(`eșuat (${(err as Error).message})`);
    }
  }
  if (!data) {
    console.error('Toate endpoint-urile Overpass au eșuat. Încearcă din nou mai târziu.');
    process.exit(1);
  }
  if (data.remark) console.warn('Overpass remark:', data.remark);

  const counts: Record<string, number> = {};
  for (const el of data.elements) {
    const key = el.type === 'relation' ? `relation:${el.tags?.type ?? '?'}` : el.type;
    counts[key] = (counts[key] ?? 0) + 1;
  }

  const date = new Date().toISOString().slice(0, 10);
  const dir = path.resolve('data/raw');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `osm-${date}.json`);
  const payload = {
    fetchedAt: new Date().toISOString(),
    endpoint: used,
    areaRelationId: AREA_RELATION_ID,
    query: QUERY.trim(),
    osmBase: data.osm3s?.timestamp_osm_base ?? null,
    elements: data.elements,
  };
  await writeFile(file, JSON.stringify(payload));
  console.log(`Salvat ${path.relative(process.cwd(), file)}`);
  console.table(counts);
}

main();
