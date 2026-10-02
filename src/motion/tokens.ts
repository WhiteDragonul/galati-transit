// Tokenuri de mișcare comune: aceleași durate și curbe în toată aplicația.
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const DUR = {
  fast: 0.16,
  base: 0.26,
  slow: 0.42,
  camera: 1400, // ms, MapLibre
  draw: 1100, // ms, desenarea traseului
  intro: 2600, // ms
} as const;

export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const EASE_IN: [number, number, number, number] = [0.4, 0, 1, 1];
export const SPRING = { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 } as const;
/** resort critic amortizat pentru bottom sheet: ajunge repede, fără să treacă de țintă */
export const SHEET_SPRING = { type: 'spring', stiffness: 380, damping: 42, mass: 1, restDelta: 0.5 } as const;

/** easing pentru cameră: accelerează blând, frânează lung */
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutQuart = (t: number) => 1 - (1 - t) ** 4;

export const ms = (n: number) => (reducedMotion() ? 0 : n);
