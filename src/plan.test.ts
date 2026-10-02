// Teste pentru planificator, pe datele reale din public/data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { LinesFile } from '../shared/model.ts';
import { buildNetwork, plan } from './plan.ts';

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

test('aceeași stație sau stație necunoscută: niciun rezultat', () => {
  const a = byName('Flora');
  assert.deepEqual(plan(net, a, a), []);
  assert.deepEqual(plan(net, a, 'nu-exista'), []);
});
