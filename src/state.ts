// Store minimal: selecția curentă + abonați. Starea e oglindită în URL (#linie=bus-9, #de=…&la=…).
type Listener = (s: State, prev: State) => void;

export interface State {
  lineId: string | null;
  variantId: string | null;
  query: string;
  mode: 'all' | 'tram' | 'trolleybus' | 'bus';
  /** panoul planificatorului de călătorie e deschis */
  plan: boolean;
}

let state: State = { lineId: null, variantId: null, query: '', mode: 'all', plan: false };
const listeners = new Set<Listener>();

export const getState = () => state;
export function setState(patch: Partial<State>) {
  const prev = state;
  // o linie selectată închide planificatorul; deschiderea lui deselectează linia
  if (patch.lineId) patch = { plan: false, ...patch };
  if (patch.plan) patch = { lineId: null, variantId: null, ...patch };
  state = { ...state, ...patch };
  if (state.lineId !== prev.lineId || state.plan !== prev.plan) writeHash(state.lineId ? `linie=${state.lineId}` : '');
  listeners.forEach((l) => l(state, prev));
}
export const subscribe = (l: Listener) => (listeners.add(l), () => listeners.delete(l));

const hashParams = () => new URLSearchParams(location.hash.slice(1));
export const lineFromHash = () => hashParams().get('linie');
export const planFromHash = () => ({ from: hashParams().get('de'), to: hashParams().get('la') });
/** fără intrări noi în istoric; parametrii din URL (ex. ?lang=en) rămân */
export function writeHash(hash: string) {
  history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
}
