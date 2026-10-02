// Parsere pentru paginile transurbgalati.ro/program_circulatie (HTML randat pe server).
import type { TransurbLine } from './transurb-types.ts';

export const BASE = 'https://transurbgalati.ro/program_circulatie/';

const strip = (h: string) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
export const decode = (s: string) =>
  s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, ' ').trim();

export const CATEGORY: Record<string, TransurbLine['category']> = {
  'text-red': 'tram', 'text-purple': 'trolleybus', 'text-sky': 'bus', 'text-green': 'bus', 'text-orange': 'bus',
};

/** pagina principală: numerele de linie în ordinea de pe site, cu grupa de culoare și secțiunea */
export function parseIndex(html: string) {
  const h = strip(html);
  const extra = h.indexOf('TRASEE EXTRAURBANE');
  const urban = h.indexOf('TRASEE URBANE');
  const out: { ref: string; colorClass: string | null; section: 'urban' | 'extraurban' }[] = [];
  const re = /veziTraseu\?numarTraseu=([^'"&]+)['"]/g;
  for (let m; (m = re.exec(h)); ) {
    const ref = decodeURIComponent(m[1]);
    if (out.some((x) => x.ref === ref)) continue;
    // culoarea e fie pe <a class=...> chiar înaintea href-ului (39 | 39B), fie pe <strong> imediat după
    const before = h.slice(Math.max(0, m.index - 40), m.index).match(/text-(red|purple|sky|green|orange)/);
    const after = h.slice(m.index, m.index + 160).match(/text-(red|purple|sky|green|orange)/);
    const c = before ?? after;
    const section = extra >= 0 && m.index > extra && (urban < extra || m.index < urban) ? 'extraurban' : 'urban';
    out.push({ ref, colorClass: c ? `text-${c[1]}` : null, section });
  }
  return out;
}

/** pagina unei linii: variante → tur/retur → stații, cu linkul de orar al fiecăreia */
export function parseRoute(html: string) {
  const h = strip(html);
  const variants: { key: string; label: string | null; tur: { name: string; href: string }[]; retur: { name: string; href: string }[] }[] = [];
  let label: string | null = null;
  let dir: 'tur' | 'retur' | null = null;
  const re = /varianta-badge[^>]*>([^<]*)<|dir-label dir-(tur|retur)|href='(veziProgram\?[^']+)'[^>]*>([^<]*)</g;
  for (let m; (m = re.exec(h)); ) {
    if (m[1] !== undefined) { label = decode(m[1]); continue; }
    if (m[2]) { dir = m[2] as 'tur' | 'retur'; continue; }
    const href = decode(m[3]);
    const params = new URLSearchParams(href.split('?')[1]);
    const key = params.get('variantaStatii') ?? 'standard';
    const d = (params.get('turRetur') as 'tur' | 'retur' | null) ?? dir;
    if (!d) continue;
    let v = variants.find((x) => x.key === key);
    if (!v) variants.push((v = { key, label, tur: [], retur: [] }));
    v[d].push({ name: decode(m[4]), href });
  }
  return variants;
}

/** pagina de orar a unei stații: un tabel pe tip de zi */
export function parseTimetable(html: string) {
  const h = strip(html);
  const tables: { dayType: string; times: string[]; other: string[] }[] = [];
  for (const m of h.matchAll(/<table[\s\S]*?<\/table>/g)) {
    const t = m[0];
    const th = t.match(/<th[^>]*>([\s\S]*?)<\/th>/);
    const tds = [...t.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => decode(x[1].replace(/<[^>]+>/g, '')));
    const times: string[] = [], other: string[] = [];
    for (const td of tds) {
      // site-ul înlocuiește următoarea plecare (după ora la care s-a încărcat pagina) cu „Urmează: HH:MM”;
      // e tot o oră din orar, deci o păstrăm
      const tm = td.match(/^(?:Urmeaz[ăa]:\s*)?(\d{1,2}):(\d{2})$/i);
      if (tm) times.push(`${tm[1].padStart(2, '0')}:${tm[2]}`);
      else if (td) other.push(td);
    }
    tables.push({ dayType: th ? decode(th[1].replace(/<[^>]+>/g, '')) : '?', times, other });
  }
  return tables;
}

/** etichetele de pe site au majuscule stricate („SâMBăTă”); le aducem la forma de propoziție */
export const sentenceCase = (s: string | null) =>
  s ? s.toLocaleLowerCase('ro').replace(/^\p{L}/u, (c) => c.toLocaleUpperCase('ro')) : null;
