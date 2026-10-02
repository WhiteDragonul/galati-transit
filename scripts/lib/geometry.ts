// Asamblează way-urile unei relații route, în ordinea membrilor, într-o polilinie.
// Unde două way-uri consecutive nu au un nod comun, începe un segment nou
// și înregistrează golul (nu îl umple).
import { type Coord, distanceM } from './geo.ts';

export interface AssembledGeometry {
  segments: Coord[][];
  gaps: number[]; // distanța fiecărui gol, în metri
}

export function assembleWays(
  ways: number[][], // liste de id-uri de noduri, în ordinea membrilor
  coordOf: (nodeId: number) => Coord | undefined,
): AssembledGeometry {
  const segments: number[][] = [];
  const gaps: number[] = [];
  let cur: number[] = [];

  for (let i = 0; i < ways.length; i++) {
    let w = ways[i];
    if (w.length < 2) continue;
    const next = ways[i + 1];
    const closed = w[0] === w[w.length - 1];

    if (cur.length === 0) {
      // primul way din segment: orientează-l spre următorul
      if (next && !closed && (w[0] === next[0] || w[0] === next[next.length - 1])) w = [...w].reverse();
      cur = [...w];
      continue;
    }

    const end = cur[cur.length - 1];
    if (closed && w.includes(end)) {
      // sens giratoriu: parcurge de la nodul de intrare până la nodul de ieșire
      const ring = w.slice(0, -1);
      const start = ring.indexOf(end);
      const rotated = [...ring.slice(start), ...ring.slice(0, start), end];
      let exit = rotated.length - 1;
      if (next) {
        const idx = rotated.findIndex((n, k) => k > 0 && (n === next[0] || n === next[next.length - 1]));
        if (idx > 0) exit = idx;
      }
      cur.push(...rotated.slice(1, exit + 1));
    } else if (w[0] === end) {
      cur.push(...w.slice(1));
    } else if (w[w.length - 1] === end) {
      cur.push(...[...w].reverse().slice(1));
    } else {
      // gol: noul segment pornește din capătul cel mai apropiat
      const endC = coordOf(end);
      const a = coordOf(w[0]);
      const b = coordOf(w[w.length - 1]);
      const da = endC && a ? distanceM(endC, a) : Infinity;
      const db = endC && b ? distanceM(endC, b) : Infinity;
      if (db < da) w = [...w].reverse();
      gaps.push(Math.round(Math.min(da, db)));
      segments.push(cur);
      cur = [...w];
    }
  }
  if (cur.length) segments.push(cur);

  return {
    segments: segments
      .map((seg) => seg.map(coordOf).filter((c): c is Coord => !!c))
      .filter((seg) => seg.length >= 2),
    gaps,
  };
}
