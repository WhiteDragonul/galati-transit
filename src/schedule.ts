// Orare oficiale: încărcare leneșă pe linie + calcule de „următoarea plecare”.
import type { ScheduleFile } from '../shared/model.ts';
import { DATA, type Line } from './data.ts';
import { t } from './i18n.ts';
import { dayIndex, isWeekdayLabel, isWeekend, isWeekendLabel } from './days.ts';

const cache = new Map<string, Promise<ScheduleFile | null>>();

export function loadSchedule(line: Line): Promise<ScheduleFile | null> {
  if (!line.scheduleFile) return Promise.resolve(null);
  let p = cache.get(line.id);
  if (!p) {
    p = fetch(`${DATA}${line.scheduleFile}`)
      .then((r) => (r.ok ? (r.json() as Promise<ScheduleFile>) : null))
      .catch(() => null);
    cache.set(line.id, p);
  }
  return p;
}

/** tipul de zi aplicabil azi (luni–vineri / weekend); sărbătorile legale nu sunt cunoscute */
export function dayTypeIndexFor(dayTypes: string[], date = new Date()): number {
  const i = dayIndex(dayTypes, isWeekend(date));
  return i >= 0 ? i : 0;
}

export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const nowMinutes = (d = new Date()) => d.getHours() * 60 + d.getMinutes();

/** următoarele plecări (de azi) față de ora curentă */
export function upcoming(times: string[], count = 3, now = nowMinutes()) {
  return times.filter((t) => toMinutes(t) >= now).slice(0, count);
}

export function inMinutes(hhmm: string, now = nowMinutes()) {
  const d = toMinutes(hhmm) - now;
  if (d <= 0) return t('now');
  if (d < 60) return t('inMin', { m: d });
  return d % 60 ? t('inHours', { h: Math.floor(d / 60), m: d % 60 }) : t('inHoursExact', { h: d / 60 });
}

/** grupează orele pe oră: [["05", ["06","19"]], ...] */
export function byHour(times: string[]) {
  const m = new Map<string, string[]>();
  for (const t of times) m.set(t.slice(0, 2), [...(m.get(t.slice(0, 2)) ?? []), t.slice(3)]);
  return [...m];
}

export const shortDayLabel = (s: string) => (isWeekendLabel(s) ? t('weekend') : isWeekdayLabel(s) ? t('weekdays') : s);
