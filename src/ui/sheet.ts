// Pe telefon panoul e un bottom sheet cu trei poziții (peek / jumătate / plin),
// tras cu degetul și eliberat cu fizică de resort.
import { animate } from 'motion';
import { reducedMotion, SHEET_SPRING } from '../motion/tokens.ts';
import { $ } from './dom.ts';

export type Snap = 'peek' | 'half' | 'full';
const mq = matchMedia('(max-width: 767px)');

export function initSheet(onChange: (visiblePx: number) => void) {
  const panel = $('#panel');
  let y = 0; // translateY curent
  let snap: Snap = 'peek';

  const height = () => panel.getBoundingClientRect().height;
  const peekPx = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sheet-peek')) || 168;
  const yFor = (s: Snap) => {
    const h = height();
    if (s === 'full') return 0;
    if (s === 'half') return Math.max(0, h - window.innerHeight * 0.52);
    return h - peekPx();
  };
  const apply = (v: number) => {
    y = v;
    panel.style.transform = `translateY(${v}px)`;
  };

  /** partea de jos a panoului rămasă sub ecran: conținutul derulabil primește atâta spațiu în plus,
   *  ca ultimele elemente să poată ajunge în zona vizibilă și la jumătate */
  const setHidden = (px: number) => panel.style.setProperty('--sheet-hidden', `${Math.max(0, Math.round(px))}px`);

  let anim: { stop: () => void } | null = null;
  function snapTo(s: Snap, velocity = 0) {
    if (!mq.matches) return;
    snap = s;
    const target = yFor(s);
    anim?.stop(); // un singur resort activ: altfel două animații se luptă pe aceeași poziție
    setHidden(target);
    if (reducedMotion()) apply(target);
    // fără depășire în sus: panoul nu se desprinde niciodată de marginea de jos a ecranului
    else anim = animate(y, target, { ...SHEET_SPRING, velocity, onUpdate: (v) => apply(Math.max(0, v)) });
    onChange(height() - target);
  }

  // ——— tragere ———
  let startY = 0, startT = 0, lastY = 0, lastT = 0, dragging = false;
  const grabZones = () => [$('.sheet-handle', panel), $('.brand', panel), panel.querySelector<HTMLElement>('.detail-head')].filter(Boolean) as HTMLElement[];

  panel.addEventListener('pointerdown', (e) => {
    if (!mq.matches) return;
    if (!grabZones().some((z) => z.contains(e.target as Node))) return;
    if ((e.target as HTMLElement).closest('button, input')) return;
    dragging = true;
    anim?.stop();
    startY = lastY = e.clientY;
    startT = lastT = performance.now();
    panel.setPointerCapture(e.pointerId);
  });
  panel.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const base = yFor(snap);
    // peste limita de sus: rezistență, dar maxim 24 px, ca panoul să nu se desprindă de jos
    let next = base + (e.clientY - startY);
    if (next < 0) next = Math.max(-24, next * 0.2);
    apply(next);
    lastY = e.clientY;
    lastT = performance.now();
  });
  const end = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    const dt = Math.max(1, performance.now() - lastT);
    const v = ((e.clientY - lastY) / dt) * 1000; // px/s
    const moved = Math.abs(e.clientY - startY);
    if (moved < 6 && performance.now() - startT < 300) {
      // atingere scurtă pe mâner: comută
      snapTo(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'half');
      return;
    }
    // proiectează poziția după inerție și alege cel mai apropiat punct
    const projected = y + v * 0.18;
    const options: Snap[] = ['full', 'half', 'peek'];
    const best = options.reduce((a, b) => (Math.abs(yFor(b) - projected) < Math.abs(yFor(a) - projected) ? b : a));
    snapTo(best, v);
  };
  panel.addEventListener('pointerup', end);
  panel.addEventListener('pointercancel', end);

  // focusul în căutare deschide sheet-ul complet (tastatura ocupă jumătate de ecran)
  $('#search').addEventListener('focus', () => snap !== 'full' && snapTo('full'));

  const reset = () => {
    if (mq.matches) apply(yFor(snap));
    else { panel.style.transform = ''; y = 0; }
  };
  window.addEventListener('resize', reset);
  mq.addEventListener('change', reset);

  return {
    snapTo,
    get snap() { return snap; },
    isMobile: () => mq.matches,
    /** pornește din afara ecranului și urcă la poziția curentă (peek, sau half dacă e deja o linie selectată) */
    enter() {
      if (!mq.matches) return;
      apply(height());
      requestAnimationFrame(() => snapTo(snap));
    },
    visiblePx: () => (mq.matches ? height() - yFor(snap) : 0),
  };
}
