// Limba interfeței (RO implicit, EN pentru vizitatori / studenți Erasmus).
// Se traduce doar interfața: numele stațiilor și ale capetelor rămân cele oficiale.
import type { Issue, Mode } from '../shared/model.ts';

export type Lang = 'ro' | 'en';

const ro = {
  skip: 'Sari la lista de linii',
  mapLabel: 'Harta liniilor de transport public',
  panelLabel: 'Linii de transport',
  tagline: 'Atlasul transportului public',
  statLines: 'linii',
  statStops: 'stații',
  searchLabel: 'Caută linie după număr sau capăt',
  searchPlaceholder: 'Caută linia (ex. 102, Micro 19)',
  modesLabel: 'Tip de transport',
  langLabel: 'Limba',
  loading: 'Se încarcă rețeaua…',
  loadError: 'Nu s-au putut încărca datele. Rulează „npm run data” și reîncarcă pagina.',
  all: 'Toate',
  tram: 'Tramvai',
  trolleybus: 'Troleibuz',
  bus: 'Autobuz',
  noMatch: 'Nicio linie pentru „{q}”.',
  extraurban: 'extraurban',
  nStops: '{n} stații',
  noStopsInData: 'fără stații în date',
  incompleteTitle: 'Date incomplete în OpenStreetMap',
  incomplete: 'incomplet',
  back: 'Înapoi la lista de linii',
  unknownTerminals: 'Capete necunoscute în date',
  circular: 'Circular',
  incompleteOnMap: 'Date incomplete pe hartă',
  routeInOsm: 'Traseul în OpenStreetMap ↗',
  routedNote: 'Traseu calculat pe străzi, prin stațiile oficiale, în ordine. OpenStreetMap nu are încă această linie; pe porțiuni drumul real poate diferi.',
  fallbackColour: 'Culoare de rezervă (lipsește din date)',
  direction: 'Sens',
  tur: 'Tur',
  retur: 'Retur',
  variant: 'Variantă',
  towards: 'spre {to}',
  standard: 'Standard',
  stops: 'Stații',
  source: 'Stații și orare:',
  fetched: 'preluate {date}',
  variantNoStops: 'Varianta nu are stații în date.',
  unnamedStop: 'Stație fără nume',
  departure: 'Plecare',
  terminus: 'Capăt',
  noPosTitle: 'Stația nu are poziție în OpenStreetMap',
  noPos: 'fără poziție',
  otherLines: '{n} alte linii',
  loadingTimetable: 'Se încarcă orarul…',
  noTimetable: 'Operatorul nu publică orar pentru această stație.',
  today: 'azi',
  nextDeparture: 'Următoarea plecare:',
  noMoreToday: 'Nu mai sunt plecări azi.',
  noDepartures: 'Fără plecări în acest tip de zi.',
  holidayNote: 'Programul de weekend se aplică și în sărbătorile legale.',
  officialTimetable: 'Orarul oficial ↗',
  weekdays: 'Luni–vineri',
  weekend: 'Weekend',
  now: 'acum',
  inMin: 'în {m} min',
  inHours: 'în {h} h {m} min',
  inHoursExact: 'în {h} h',
  lineStopsHere: '1 linie oprește aici',
  linesStopHere: '{n} linii opresc aici',
  nameMissing: 'Numele lipsește din OpenStreetMap',
  lineN: 'Linia {ref}',
  loadingDepartures: 'Se încarcă plecările…',
  nextDepartures: 'Următoarele plecări',
  notToday: 'nu mai azi',
  linesHere: '{n} linii aici',
  pickLine: 'Alege o linie',
};
type Key = keyof typeof ro;

const en: Record<Key, string> = {
  skip: 'Skip to the line list',
  mapLabel: 'Public transport map',
  panelLabel: 'Transit lines',
  tagline: 'Public transport atlas',
  statLines: 'lines',
  statStops: 'stops',
  searchLabel: 'Search a line by number or terminus',
  searchPlaceholder: 'Search a line (e.g. 102, Micro 19)',
  modesLabel: 'Transport type',
  langLabel: 'Language',
  loading: 'Loading the network…',
  loadError: 'The data could not be loaded. Run “npm run data” and reload the page.',
  all: 'All',
  tram: 'Tram',
  trolleybus: 'Trolleybus',
  bus: 'Bus',
  noMatch: 'No line matches “{q}”.',
  extraurban: 'suburban',
  nStops: '{n} stops',
  noStopsInData: 'no stops in the data',
  incompleteTitle: 'Incomplete data in OpenStreetMap',
  incomplete: 'incomplete',
  back: 'Back to the line list',
  unknownTerminals: 'Termini unknown in the data',
  circular: 'Circular',
  incompleteOnMap: 'Incomplete data on the map',
  routeInOsm: 'Route on OpenStreetMap ↗',
  routedNote: 'Route computed along streets through the official stops, in order. OpenStreetMap does not have this line yet; in places the real route may differ.',
  fallbackColour: 'Fallback colour (missing from the data)',
  direction: 'Direction',
  tur: 'Outbound',
  retur: 'Inbound',
  variant: 'Variant',
  towards: 'to {to}',
  standard: 'Standard',
  stops: 'Stops',
  source: 'Stops and timetables:',
  fetched: 'retrieved {date}',
  variantNoStops: 'This variant has no stops in the data.',
  unnamedStop: 'Unnamed stop',
  departure: 'Start',
  terminus: 'Terminus',
  noPosTitle: 'This stop has no position in OpenStreetMap',
  noPos: 'no position',
  otherLines: '{n} other lines',
  loadingTimetable: 'Loading the timetable…',
  noTimetable: 'The operator does not publish a timetable for this stop.',
  today: 'today',
  nextDeparture: 'Next departure:',
  noMoreToday: 'No more departures today.',
  noDepartures: 'No departures on this type of day.',
  holidayNote: 'The weekend timetable also applies on public holidays.',
  officialTimetable: 'Official timetable ↗',
  weekdays: 'Mon–Fri',
  weekend: 'Weekend',
  now: 'now',
  inMin: 'in {m} min',
  inHours: 'in {h} h {m} min',
  inHoursExact: 'in {h} h',
  lineStopsHere: '1 line stops here',
  linesStopHere: '{n} lines stop here',
  nameMissing: 'Name missing from OpenStreetMap',
  lineN: 'Line {ref}',
  loadingDepartures: 'Loading departures…',
  nextDepartures: 'Next departures',
  notToday: 'none left today',
  linesHere: '{n} lines here',
  pickLine: 'Pick a line',
};

const DICT: Record<Lang, Record<Key, string>> = { ro, en };
const STORE = 'lang';

function detect(): Lang {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'ro' || q === 'en') return q;
  try {
    const saved = localStorage.getItem(STORE);
    if (saved === 'ro' || saved === 'en') return saved;
  } catch { /* stocare blocată */ }
  // română pentru cine are browserul în română, engleză pentru restul
  return navigator.languages?.some((l) => l.toLowerCase().startsWith('ro')) ? 'ro' : 'en';
}

let lang: Lang = detect();
const listeners = new Set<(l: Lang) => void>();

export const getLang = () => lang;
export const locale = () => (lang === 'ro' ? 'ro-RO' : 'en-GB');

export function t(key: Key, params: Record<string, string | number> = {}) {
  return DICT[lang][key].replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''));
}

export const modeLabel = (m: Mode) => t(m);

export function setLang(next: Lang) {
  if (next === lang) return;
  lang = next;
  try { localStorage.setItem(STORE, next); } catch { /* stocare blocată */ }
  applyStatic();
  listeners.forEach((l) => l(next));
}
export const onLangChange = (l: (lang: Lang) => void) => (listeners.add(l), () => listeners.delete(l));

/** textele fixe din index.html: data-i18n (text), data-i18n-attr="attr:cheie;attr:cheie" */
export function applyStatic(root: ParentNode = document) {
  document.documentElement.lang = lang;
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n as Key)));
  root.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach((el) =>
    el.dataset.i18nAttr!.split(';').forEach((pair) => {
      const [attr, key] = pair.split(':');
      el.setAttribute(attr, t(key as Key));
    }),
  );
}

// Mesajele de calitate vin din build în română; în engleză se reconstruiesc după cod,
// cu numerele preluate din mesajul original (generat de scripts/lib/quality.ts).
const ISSUE_EN: Partial<Record<Issue['code'], (n: string[], msg: string) => string>> = {
  no_geometry: (_, msg) => (msg.includes('OpenStreetMap') ? 'The route is missing (or differs a lot) in OpenStreetMap; it cannot be drawn on the map' : 'The route has no geometry'),
  geometry_gaps: ([gaps, max]) => `Route broken in OSM (${gaps} gaps, the largest ${max} m)`,
  route_mismatch: ([pct]) => `The OSM drawing covers only ${pct}% of the official stops; the real route may differ`,
  no_stops: () => 'This variant has no stops',
  unmatched_stops: ([a, b]) => `${a} of ${b} stops have no position on the map (missing from OSM)`,
  unnamed_stops: ([n]) => `${n} unnamed stops`,
  no_schedule: () => 'The operator does not publish a timetable for this variant',
  missing_return: (_, msg) =>
    msg.includes('singur sens (')
      ? 'The operator publishes only one direction (circular or one-way route)'
      : msg.includes('lipsește') ? 'Only one direction exists (the return is missing)' : 'Both directions could not be identified',
  extra_variants: ([n]) => `${n} route variants`,
};

export function issueText(i: Issue) {
  const fn = lang === 'en' ? ISSUE_EN[i.code] : undefined;
  return fn ? fn(i.message.match(/\d+/g) ?? [], i.message) : i.message;
}
