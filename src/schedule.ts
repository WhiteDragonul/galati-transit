// Orare oficiale: încărcare leneșă pe linie + calcule de „următoarea plecare”.
import type { ScheduleFile } from '../shared/model.ts';
import type { Line } from './data.ts';

const cache = new Map<string, Promise<ScheduleFile | null>>();

export function loadSchedule(line: Line): Promise<ScheduleFile | null> {
  if (!line.scheduleFile) return Promise.resolve(null);
  let p = cache.get(line.id);
  if (!p) {
    p = fetch(`/data/${line.scheduleFile}`)
      .then((r) => (r.ok ? (r.json() as Promise<ScheduleFile>) : null))
      .catch(() => null);
    cache.set(line.id, p);
  }
  return p;
}

const isWeekendLabel = (s: string) => /weekend|s[âa]mb[ăa]t|duminic/i.test(s);
const isWeekdayLabel = (s: string) => /luni|lucr[ăa]toare/i.test(s);

/** tipul de zi aplicabil azi (luni–vineri / weekend); sărbătorile legale nu sunt cunoscute */
export function dayTypeIndexFor(dayTypes: string[], date = new Date()): number {
  const weekend = date.getDay() === 0 || date.getDay() === 6;
  const i = dayTypes.findIndex((d) => (weekend ? isWeekendLabel(d) : isWeekdayLabel(d)));
  return i >= 0 ? i : 0;
}

export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const nowMinutes = (d = new Date()) => d.getHours() * 60 + d.getMinutes();

/** următoarele plecări (de azi) față de ora curentă */
export function upcoming(times: string[], count = 3, now = nowMinutes()) {
  return times.filter((t) => toMinutes(t) >= now).slice(0, count);
}

export function inMinutes(t: string, now = nowMinutes()) {
  const d = toMinutes(t) - now;
  if (d <= 0) return 'acum';
  if (d < 60) return `în ${d} min`;
  return `în ${Math.floor(d / 60)} h ${d % 60 ? `${d % 60} min` : ''}`.trim();
}

/** grupează orele pe oră: [["05", ["06","19"]], ...] */
export function byHour(times: string[]) {
  const m = new Map<string, string[]>();
  for (const t of times) m.set(t.slice(0, 2), [...(m.get(t.slice(0, 2)) ?? []), t.slice(3)]);
  return [...m];
}

export const shortDayLabel = (s: string) => (isWeekendLabel(s) ? 'Weekend și sărbători' : isWeekdayLabel(s) ? 'Luni – vineri' : s);
