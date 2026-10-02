// Teste pentru planificator, pe datele reale din public/data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { LinesFile, ScheduleFile } from '../shared/model.ts';
import { buildNetwork, buildTimetable, plan, planTimed } from './plan.ts';

const lines = (JSON.parse(readFileSync('public/data/lines.json', 'utf8')) as LinesFile).lines;
const stops = JSON.parse(readFileSync('public/data/stops.geojson', 'utf8')).features;
const net = buildNetwork(lines, stops);
const byName = (name: string) => [...net.places.values()].find((p) => p.name === name)!.id;

test('pe aceeași linie: o singură cursă, în sensul de mers', () => {
  const v = lines.find((l) => l.id === 'tram-7')!.variants[0];
  const a = net.seq.get(v.id)![0]!, b = net.seq.get(v.id)![4]!;
  const [first] = plan(net, a, b);
  assert.ok(first);
  assert.equal(first.rides, 1);
  const ride = first.legs.find((l) => l.kind === 'ride')!;
  assert.equal(ride.kind === 'ride' && ride.toIndex - ride.fromIndex <= 4, true);
});

test('orice stație poate ajunge la oricare alta (rețeaua e conexă)', () => {
  const ids = [...net.places.keys()];
  let missing = 0;
  for (let i = 0; i < ids.length; i += 7) for (let j = 3; j < ids.length; j += 11) if (ids[i] !== ids[j] && !plan(net, ids[i], ids[j]).length) missing++;
  assert.ok(missing === 0, `${missing} perechi fără traseu`);
});

test('fiecare traseu e coerent: etapele se leagă, cursele urmează ordinea variantei', () => {
  const ids = [...net.places.keys()];
  for (let i = 0; i < ids.length; i += 13)
    for (let j = 5; j < ids.length; j += 17) {
      if (ids[i] === ids[j]) continue;
      const opts = plan(net, ids[i], ids[j]);
      for (const it of opts) {
        let at = ids[i];
        for (const l of it.legs) {
          assert.equal(l.from, at);
          if (l.kind === 'ride') {
            const s = net.seq.get(l.variantId)!;
            assert.ok(l.fromIndex < l.toIndex);
            assert.equal(s[l.fromIndex], l.from);
            assert.equal(s[l.toIndex], l.to);
          }
          at = l.to;
        }
        assert.equal(at, ids[j]);
      }
      // ordonate după cost; mai multe curse doar dacă e mai scurt
      for (let k = 1; k < opts.length; k++) assert.ok(opts[k - 1].cost <= opts[k].cost);
    }
});

const schedules = new Map(lines.map((l) => [l.id, l.scheduleFile ? (JSON.parse(readFileSync(`public/data/${l.scheduleFile}`, 'utf8')) as ScheduleFile) : null]));
const weekday = buildTimetable(lines, schedules, false);

test('cu orar: orele se leagă (urci după ce ajungi, cobori după ce urci, schimbarea are timp)', () => {
  const ids = [...net.places.keys()];
  let found = 0;
  for (let i = 0; i < ids.length; i += 11)
    for (let j = 4; j < ids.length; j += 19) {
      if (ids[i] === ids[j]) continue;
      for (const it of planTimed(net, weekday, ids[i], ids[j], 8 * 60)) {
        found++;
        let t = 8 * 60;
        for (const l of it.legs) {
          if (l.kind === 'ride') {
            assert.ok(l.dep! >= t, `urcare ${l.dep} înainte de ${t}`);
            assert.ok(l.arr! > l.dep!);
            const cols = weekday.get(l.variantId)!;
            assert.ok(cols[l.fromIndex].includes(l.dep!) && cols[l.toIndex].includes(l.arr!), 'orele vin din orar');
            t = l.arr! + 2;
          } else {
            assert.ok(l.start! >= 8 * 60 - 0 && l.end! > l.start!);
            t = l.end!;
          }
        }
        assert.ok(it.arrive! >= it.depart! && it.depart! >= 8 * 60);
      }
    }
  assert.ok(found > 50, `prea puține rezultate cu orar (${found})`);
});

test('cu orar: rezultatele sunt ordonate după sosire; noaptea târziu nu se inventează curse', () => {
  const v = lines.find((l) => l.id === 'tram-7')!.variants[0];
  const a = net.seq.get(v.id)![0]!, b = net.seq.get(v.id)![5]!;
  const day = planTimed(net, weekday, a, b, 7 * 60);
  assert.ok(day.length);
  for (let k = 1; k < day.length; k++) assert.ok(day[k - 1].arrive! <= day[k].arrive!);
  assert.deepEqual(planTimed(net, weekday, a, b, 23 * 60 + 59).filter((it) => it.rides > 0), []);
});

test('cu orar: liniile fără orar de weekend nu circulă în weekend', () => {
  const weekend = buildTimetable(lines, schedules, true);
  for (const l of lines) {
    const sch = schedules.get(l.id);
    if (sch && !sch.dayTypes.some((d) => /weekend/i.test(d))) for (const v of l.variants) assert.equal(weekend.get(v.id), null);
  }
});

test('aceeași stație sau stație necunoscută: niciun rezultat', () => {
  const a = byName('Flora');
  assert.deepEqual(plan(net, a, a), []);
  assert.deepEqual(plan(net, a, 'nu-exista'), []);
});
