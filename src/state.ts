// Store minimal: selecția curentă + abonați. Starea e oglindită în URL (#linie=bus-9).
type Listener = (s: State, prev: State) => void;

export interface State {
  lineId: string | null;
  variantId: string | null;
  query: string;
  mode: 'all' | 'tram' | 'trolleybus' | 'bus';
}

let state: State = { lineId: null, variantId: null, query: '', mode: 'all' };
const listeners = new Set<Listener>();

export const getState = () => state;
export function setState(patch: Partial<State>) {
  const prev = state;
  state = { ...state, ...patch };
  if (patch.lineId !== undefined && patch.lineId !== prev.lineId) {
    const hash = state.lineId ? `#linie=${state.lineId}` : ' ';
    history.replaceState(null, '', hash === ' ' ? location.pathname : hash);
  }
  listeners.forEach((l) => l(state, prev));
}
export const subscribe = (l: Listener) => (listeners.add(l), () => listeners.delete(l));
export const lineFromHash = () => new URLSearchParams(location.hash.slice(1)).get('linie');
