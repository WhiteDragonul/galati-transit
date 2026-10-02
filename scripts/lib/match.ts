// Potrivirea numelor de stații între Transurb (MAJUSCULE, fără diacritice, abrevieri)
// și OpenStreetMap (diacritice, nume lungi). Nu ghicește poziții: doar leagă nume.

const STOP = new Set(['de', 'la', 'si', 'din', 'a', 'al', 'cu', 'pe', 'nr', 'statia']);
const ABBR: Record<string, string> = {
  str: 'strada', bl: 'bloc', bd: 'bulevardul', b: 'bulevardul', bld: 'bulevardul', blvd: 'bulevardul', bulevard: 'bulevardul',
  bis: 'biserica', sf: 'sfantul', sfintii: 'sfintii', univ: 'universitatea', fac: 'facultatea',
  facult: 'facultatea', sp: 'spitalul', spit: 'spitalul', sc: 'scoala', lic: 'liceul', pta: 'piata', p: 'piata',
  st: 'statia', cart: 'cartier', cartierul: 'cartier', micro: 'micro', mag: 'magazin', cam: 'camine',
};
const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4', v: '5' };

export function tokens(name: string): string[] {
  const raw = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  // „C.F.R.” / „C F R” → „cfr”: litere izolate consecutive (cel puțin două) se unesc
  const merged: string[] = [];
  for (let k = 0; k < raw.length; k++) {
    if (raw[k].length === 1 && raw[k + 1]?.length === 1 && /[a-z]/.test(raw[k])) {
      let acc = '';
      while (raw[k]?.length === 1 && /[a-z]/.test(raw[k])) acc += raw[k++];
      k--;
      merged.push(acc);
    } else merged.push(raw[k]);
  }
  const out: string[] = [];
  for (let t of merged) {
    if (ROMAN[t] && out.length) t = ROMAN[t];
    t = ABBR[t] ?? t;
    if (STOP.has(t)) continue;
    out.push(t);
  }
  return out;
}

function tokenEq(a: string, b: string) {
  if (a === b) return true;
  if (/^\d+$/.test(a) || /^\d+$/.test(b)) return false; // numerele trebuie să fie identice
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length >= 4 && l.startsWith(s)) return true;
  return s.length >= 5 && l.slice(0, 5) === s.slice(0, 5);
}

/** similaritate 0..1 între două nume de stații */
export function nameSimilarity(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.length || !B.length) return 0;
  const used = new Set<number>();
  let hits = 0;
  for (const x of A) {
    const j = B.findIndex((y, k) => !used.has(k) && tokenEq(x, y));
    if (j >= 0) { used.add(j); hits++; }
  }
  const dice = (2 * hits) / (A.length + B.length);
  // un nume cuprins integral în celălalt („Spitalul Județean” ⊂ „Spitalul Județean de Urgență”)
  const contained = hits === Math.min(A.length, B.length) && hits >= 2;
  if (contained) return Math.max(dice, 0.8);
  // un singur cuvânt lung, identic cu primul cuvânt al celuilalt nume („UNIVERSITATE” ~ „Universitatea Dunărea de Jos”)
  const [S, L] = A.length <= B.length ? [A, B] : [B, A];
  if (S.length === 1 && S[0].length >= 6 && !/^\d+$/.test(S[0]) && tokenEq(S[0], L[0])) return Math.max(dice, 0.7);
  return dice;
}

export const MATCH_THRESHOLD = 0.6;

/**
 * Aliniere în ordine (ca LCS) între lista oficială și lista OSM.
 * Întoarce, pentru fiecare stație oficială, indexul stației OSM potrivite sau -1.
 */
export function alignStops(official: string[], osm: (string | null)[]): { map: number[]; matched: number } {
  const n = official.length, m = osm.length;
  const sim = official.map((a) => osm.map((b) => (b ? nameSimilarity(a, b) : 0)));
  // dp[i][j] = cel mai bun scor pentru prefixele official[0..i), osm[0..j)
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      const s = sim[i - 1][j - 1];
      const diag = s >= MATCH_THRESHOLD ? dp[i - 1][j - 1] + 1 + s * 0.01 : -Infinity;
      dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], diag);
    }
  const map = new Array<number>(n).fill(-1);
  let i = n, j = m, matched = 0;
  while (i > 0 && j > 0) {
    const s = sim[i - 1][j - 1];
    if (s >= MATCH_THRESHOLD && Math.abs(dp[i][j] - (dp[i - 1][j - 1] + 1 + s * 0.01)) < 1e-9) {
      map[i - 1] = j - 1; matched++; i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return { map, matched };
}

/** au cel puțin un cuvânt semnificativ (≥ 5 litere, nu tip de stradă) în comun */
const GENERIC = new Set(['strada', 'bulevardul', 'bloc', 'piata', 'statia', 'cartier', 'scoala', 'liceul', 'spitalul', 'biserica', 'sfantul', 'micro']);
export function shareSignificantToken(a: string, b: string): boolean {
  // numerele (Micro 13 / Micro 13b, Țiglina 1 / 2) trebuie să coincidă
  const nums = (x: string) => tokens(x).filter((t) => /\d/.test(t)).sort().join(' ');
  if (nums(a) && nums(b) && nums(a) !== nums(b)) return false;
  const B = tokens(b).filter((t) => t.length >= 5 && !GENERIC.has(t));
  return tokens(a).some((x) => x.length >= 5 && !GENERIC.has(x) && B.some((y) => tokenEq(x, y)));
}

/** „SPITALUL JUDETEAN” → „Spitalul Judetean” (fără a adăuga diacritice care nu există în sursă) */
export function titleCase(s: string): string {
  return s
    .toLocaleLowerCase('ro')
    .replace(/(^|[\s(\-./])(\p{L})/gu, (_, p, c) => p + c.toLocaleUpperCase('ro'))
    .replace(/\b(Cfr|Ajofm|Cec|Bcr|Brd|Ireg|Ups|Dmt|Ctp)\b/gi, (x) => x.toUpperCase())
    .replace(/(?<=\s)(i{1,3}|iv)\b/gi, (x) => x.toUpperCase());
}
