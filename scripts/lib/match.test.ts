import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alignStops, MATCH_THRESHOLD, nameSimilarity, shareSignificantToken, titleCase, tokens } from './match.ts';

const same = (a: string, b: string) => assert.ok(nameSimilarity(a, b) >= MATCH_THRESHOLD, `${a} ~ ${b}: ${nameSimilarity(a, b)}`);
const diff = (a: string, b: string) => assert.ok(nameSimilarity(a, b) < MATCH_THRESHOLD, `${a} ≁ ${b}: ${nameSimilarity(a, b)}`);

test('tokens: diacritice, abrevieri, cifre romane, inițiale', () => {
  assert.deepEqual(tokens('Țiglina I'), ['tiglina', '1']);
  assert.deepEqual(tokens('STR. PRUNDULUI'), ['strada', 'prundului']);
  assert.deepEqual(tokens('PARC C.F.R.'), ['parc', 'cfr']);
  assert.deepEqual(tokens('Gara C.F.R.'), ['gara', 'cfr']);
});

test('potriviri reale Transurb ↔ OSM', () => {
  same('SPITALUL JUDETEAN', 'Spitalul Județean de Urgență');
  same('TIGLINA I', 'Țiglina 1');
  same('CAMINE STUDENTESTI', 'Căminele studențești');
  same('UNIVERSITATE', 'Universitatea „Dunărea de Jos”');
  same('GALERIILE DE ARTA', 'Galeriile de artă');
  same('ROMTELECOM', 'Romtelecom - Bănci');
  same('MICRO 19', 'Micro 19');
  same('NEACSU', 'Neacșu');
  same('BLD. GALATI', 'Bulevardul Galați');
  same('BIS. SF. DUMITRU', 'Biserica Sfântul Dumitru');
});

test('cuvânt semnificativ comun (pentru umplerea golurilor între vecini potriviți)', () => {
  assert.ok(shareSignificantToken('BLD. OTELARILOR', 'Strada Oțelarilor'));
  assert.ok(shareSignificantToken('POLICULTURA-FLORICULTURA', 'Poligonului-Floricultura'));
  assert.ok(!shareSignificantToken('F.S.E.A.', 'F.E.E.A.'));
  assert.ok(!shareSignificantToken('STR. PRUNDULUI', 'Strada Radu Negru'));
  assert.ok(!shareSignificantToken('MICRO 13', 'Micro 13b'));
  assert.ok(!shareSignificantToken('TIGLINA I', 'Țiglina 2'));
});

test('nu potrivește stații diferite', () => {
  diff('TIGLINA I', 'Țiglina 2');
  diff('MICRO 19', 'Micro 20');
  diff('PARC C.F.R.', 'Gara C.F.R.');
  diff('PRIVILEGE', 'Mazepa');
});

test('aliniere în ordine, cu stații lipsă de o parte și de alta', () => {
  const official = ['MICRO 19', 'NEACSU', 'SPITALUL JUDETEAN', 'STATIE NOUA', 'TIGLINA I'];
  const osm = ['Micro 19', 'Neacșu', 'Altă stație', 'Spitalul Județean de Urgență', 'Țiglina 1'];
  const { map, matched } = alignStops(official, osm);
  assert.deepEqual(map, [0, 1, 3, -1, 4]);
  assert.equal(matched, 4);
});

test('titleCase păstrează acronimele', () => {
  assert.equal(titleCase('PARC C.F.R.'), 'Parc C.F.R.');
  assert.equal(titleCase('TIGLINA II'), 'Tiglina II');
  assert.equal(titleCase('STR. PRUNDULUI'), 'Str. Prundului');
});
