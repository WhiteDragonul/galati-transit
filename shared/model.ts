// Modelul de date comun între scripturi și frontend.
// Orice sursă (OSM, Transurb, GTFS, overrides) produce exact aceste forme.

export type Mode = 'bus' | 'trolleybus' | 'tram';
export type Source = 'osm' | 'transurb' | 'gtfs' | 'override';
export type Direction = 'tur' | 'retur';

export type IssueCode =
  | 'no_geometry'
  | 'geometry_gaps'
  | 'no_stops'
  | 'unnamed_stops'
  | 'missing_return'
  | 'extra_variants'
  | 'no_colour'
  | 'no_master'
  | 'terminal_mismatch'
  | 'unmatched_stops' // stații oficiale fără poziție în OSM
  | 'route_mismatch' // traseul din OSM nu acoperă bine stațiile oficiale
  | 'no_schedule'
  | 'routed_geometry'; // traseu calculat pe străzi (OSM nu are relația liniei)

export interface Issue {
  code: IssueCode;
  /** 'warn' = date incomplete (marcat în UI), 'info' = doar de știut */
  severity: 'warn' | 'info';
  message: string; // text în română, afișabil direct în UI
}

export interface VariantStop {
  /** numele afișat: din OSM când stația e potrivită (are diacritice), altfel numele oficial */
  name: string;
  /** numele exact de pe site-ul operatorului (null dacă sursa e doar OSM) */
  officialName: string | null;
  /** stația OSM (poziție pe hartă); null = nu are poziție cunoscută */
  stopId: string | null;
}

export interface Variant {
  id: string; // ex. "tb:9:v1:tur" sau "osm:r123456"
  lineId: string;
  name: string | null;
  /** eticheta variantei de serviciu, ex. „Sâmbătă, duminică și sărbători legale către Grădina Publică” */
  label: string | null;
  from: string | null;
  to: string | null;
  direction: Direction | null;
  /** 'official' = de pe site-ul operatorului, 'role'/'order' = dedus din OSM, 'override' */
  directionSource: 'official' | 'role' | 'order' | 'override' | null;
  stops: VariantStop[]; // ordonate
  /** id-urile stațiilor cu poziție, în ordine (derivat din stops) */
  stopIds: string[];
  /** relația OSM din care vine geometria (poate diferi de sursa stațiilor) */
  geometryRef: string | null;
  /** 'osm' = relația OSM a liniei; 'routed' = calculat pe rețeaua de străzi prin stațiile oficiale; null = fără desen */
  geometrySource: 'osm' | 'routed' | null;
  /** câte stații oficiale au fost găsite, în ordine, pe traseul OSM (0..1); null dacă nu e cazul */
  geometryMatch: number | null;
  lengthM: number;
  gaps: { count: number; maxM: number };
  /** indexul variantei în fișierul de orar al liniei; null = fără orar */
  scheduleKey: string | null;
  source: Source;
  sourceRef: string;
  issues: Issue[];
}

export interface Line {
  id: string; // ex. "bus-102"
  ref: string;
  mode: Mode;
  colour: string | null; // null = lipsește din sursă (UI folosește un fallback marcat)
  name: string | null;
  operator: string | null;
  network: string | null;
  /** 'urban' / 'extraurban' (de pe site-ul operatorului) */
  section: 'urban' | 'extraurban' | null;
  /** pagina oficială a liniei */
  officialUrl: string | null;
  /** fișier cu orare, relativ la /data/ (ex. "schedules/bus-9.json") */
  scheduleFile: string | null;
  variants: Variant[];
  source: Source;
  sourceRef: string | null;
  issues: Issue[];
}

export interface StopProps {
  id: string; // ex. "osm:n123"
  name: string | null;
  /** stații cu același nume aflate apropiate (ambele sensuri) împart același grup */
  groupId: string;
  lineIds: string[];
  source: Source;
  sourceRef: string;
}

export interface RouteProps {
  variantId: string;
  lineId: string;
  mode: Mode;
  colour: string | null;
  direction: Direction | null;
}

export interface LinesFile {
  generatedAt: string;
  sourceTimestamp: string | null;
  /** când au fost descărcate datele operatorului (null = nu sunt folosite) */
  officialFetchedAt: string | null;
  officialSource: string | null;
  attribution: string;
  lines: Line[];
}

/** public/data/schedules/<lineId>.json */
export interface ScheduleFile {
  lineId: string;
  fetchedAt: string;
  source: string;
  /** tipurile de zi, în ordinea de pe site (ex. „De luni până vineri”, „Weekend și sărbători legale”) */
  dayTypes: string[];
  /** scheduleKey → pentru fiecare stație a variantei (aliniat cu Variant.stops): orele pe tip de zi */
  variants: Record<string, { stops: { url: string; times: string[][] }[] }>;
}
