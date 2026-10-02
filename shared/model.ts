// Modelul de date comun între scripturi și frontend.
// Orice sursă (OSM, GTFS, overrides) produce exact aceste forme.

export type Mode = 'bus' | 'trolleybus' | 'tram';
export type Source = 'osm' | 'gtfs' | 'override';
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
  | 'terminal_mismatch';

export interface Issue {
  code: IssueCode;
  /** 'warn' = date incomplete (marcat în UI), 'info' = doar de știut */
  severity: 'warn' | 'info';
  message: string; // text în română, afișabil direct în UI
}

export interface Variant {
  id: string; // ex. "osm:r123456"
  lineId: string;
  name: string | null;
  from: string | null; // tag-ul from= din sursă
  to: string | null; // tag-ul to= din sursă
  direction: Direction | null;
  /** cum s-a stabilit direcția: 'role' din route_master, 'order' = ordinea membrilor, 'override' */
  directionSource: 'role' | 'order' | 'override' | null;
  stopIds: string[]; // ordonate
  /** lungimea traseului în metri (doar segmentele existente) */
  lengthM: number;
  gaps: { count: number; maxM: number };
  source: Source;
  sourceRef: string; // ex. "relation/123456"
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
  attribution: string;
  lines: Line[];
}
