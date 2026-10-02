import type { Line } from '../../shared/model.ts';
import type { Coord } from './geo.ts';

export interface StopRecord {
  id: string;
  name: string | null;
  /** de unde vine numele: elementul însuși, stop_position-ul vecin, sau override */
  nameFrom: 'self' | 'stop_position' | 'override' | null;
  coord: Coord;
  sourceRef: string;
  lineIds: Set<string>;
}

/** ce trebuie să producă orice adaptor de sursă (OSM acum, GTFS mai târziu) */
export interface SourceResult {
  lines: Line[];
  stops: Map<string, StopRecord>;
  geometries: Map<string, Coord[][]>; // variantId → segmente
  sourceTimestamp: string | null;
  excluded: { sourceRef: string; name: string | null; operator: string | null; network: string | null }[];
}
