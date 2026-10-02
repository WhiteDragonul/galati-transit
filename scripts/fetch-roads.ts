// Descarcă rețeaua de străzi carosabile din Galați și împrejurimi (OSM), folosită doar pentru a calcula
// traseul liniilor pe care OSM nu le are ca relații (ex. liniile noi 1 și 2).
// Se folosește un dreptunghi cu margine de câțiva km în jurul municipiului: unele capete de linie
// (ex. Dimitrie Cantemir) sunt chiar în afara graniței administrative.
// Rulare: npm run data:fetch-roads
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// sud, vest, nord, est — municipiul Galați + ~3 km
const BBOX = '45.36,27.90,45.52,28.12';
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const HIGHWAYS = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|busway|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';
const QUERY = `
[out:json][timeout:180];
way(${BBOX})["highway"~"^(${HIGHWAYS})$"]["area"!="yes"]["access"!~"^(no|private)$"];
out body geom qt;
`;

async function main() {
  for (const endpoint of ENDPOINTS) {
    process.stdout.write(`→ ${endpoint} ... `);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'User-Agent': 'galati-transit/0.1', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(QUERY),
        signal: AbortSignal.timeout(240_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // format compact: doar ce trebuie pentru rutare
      const ways = (data.elements as { id: number; nodes: number[]; geometry: { lat: number; lon: number }[]; tags: Record<string, string> }[])
        .filter((w) => w.geometry?.length >= 2)
        .map((w) => ({
          id: w.id,
          hw: w.tags.highway,
          ow: w.tags['oneway:bus'] === 'no' || w.tags['busway'] ? '' : w.tags.junction === 'roundabout' ? 'yes' : (w.tags.oneway ?? ''),
          n: w.nodes,
          c: w.geometry.map((g) => [Math.round(g.lon * 1e6) / 1e6, Math.round(g.lat * 1e6) / 1e6]),
        }));
      const date = new Date().toISOString().slice(0, 10);
      await mkdir('data/raw', { recursive: true });
      const file = path.resolve(`data/raw/roads-${date}.json`);
      await writeFile(file, JSON.stringify({ fetchedAt: new Date().toISOString(), osmBase: data.osm3s?.timestamp_osm_base ?? null, ways }));
      console.log(`ok — ${ways.length} străzi → ${path.relative(process.cwd(), file)}`);
      return;
    } catch (e) {
      console.log(`eșuat (${(e as Error).message})`);
    }
  }
  console.error('Toate endpoint-urile Overpass au eșuat.');
  process.exit(1);
}

main();
