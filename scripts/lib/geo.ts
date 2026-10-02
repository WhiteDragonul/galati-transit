export type Coord = [number, number]; // [lon, lat]

export function distanceM(a: Coord, b: Coord): number {
  const R = 6_371_000;
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLon = (b[0] - a[0]) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function lineLengthM(coords: Coord[]): number {
  let sum = 0;
  for (let i = 1; i < coords.length; i++) sum += distanceM(coords[i - 1], coords[i]);
  return sum;
}

/** pentru comparații de nume: fără diacritice, litere mici, spații normalizate */
export function normName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
