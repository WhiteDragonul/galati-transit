// Trailer: fiecare cadru e o funcție pură de timp (renderAt(t)), deci randarea cadru cu cadru e exactă.
// Previzualizare în timp real: http://localhost:5173/trailer/ (bucla pornește singură; ?t=12 = cadru fix).
import { loadData } from '../src/data.ts';

export const DURATION = 62; // secunde
export const FPS = 30;

// ——— utilitare de animație ———
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const outExpo = (x: number) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x));
const outCubic = (x: number) => 1 - (1 - x) ** 3;
const inCubic = (x: number) => x * x * x;
const inOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
/** apariție + dispariție: 0 → 1 între a..a+inD, 1 → 0 între b-outD..b */
const life = (t: number, a: number, b: number, inD = 0.6, outD = 0.45) =>
  outCubic(seg(t, a, a + inD)) * (1 - inCubic(seg(t, b - outD, b)));

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s)!;
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];

// ——— rețeaua reală de trasee, proiectată în cadru ———
interface NetPath { el: SVGPathElement; casing: SVGPathElement; len: number; order: number }
const net: NetPath[] = [];

async function buildNetwork() {
  const data = await loadData();
  const merc = ([lon, lat]: number[]) => [lon, Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * (180 / Math.PI)];
  const all = data.routes.features.flatMap((f) => (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates));
  // doar orașul (fără capetele extraurbane foarte îndepărtate), ca rețeaua să umple cadrul
  const pts = all.flat().filter(([lon, lat]) => lon > 27.93 && lon < 28.12 && lat > 45.38 && lat < 45.50).map(merc);
  const q = (arr: number[], p: number) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(p * (s.length - 1))]; };
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  // încadrare după zona densă a orașului (percentilele 4–96), nu după capetele izolate
  const [minX, maxX, minY, maxY] = [q(xs, 0.04), q(xs, 0.96), q(ys, 0.04), q(ys, 0.96)];
  const scale = Math.min(1500 / (maxX - minX), 860 / (maxY - minY));
  const ox = 960 - ((minX + maxX) / 2) * scale, oy = 540 + ((minY + maxY) / 2) * scale;
  const proj = (c: number[]) => { const [x, y] = merc(c); return `${(x * scale + ox).toFixed(1)},${(-y * scale + oy).toFixed(1)}`; };

  const lineOrder = new Map(data.lines.map((l, i) => [l.id, i]));
  const casingG = $('#net-casing'), linesG = $('#net-lines');
  for (const f of data.routes.features) {
    const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const d = parts.map((p) => 'M' + p.map(proj).join('L')).join('');
    const mk = (g: Element, colour?: string) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      el.setAttribute('d', d);
      if (colour) el.setAttribute('stroke', colour);
      g.appendChild(el);
      return el;
    };
    const casing = mk(casingG);
    const el = mk(linesG, data.colourOf(f.properties.lineId));
    const len = el.getTotalLength();
    for (const p of [el, casing]) p.style.strokeDasharray = `${len} ${len}`;
    net.push({ el, casing, len, order: lineOrder.get(f.properties.lineId) ?? 0 });
  }
}

// ——— text: cuvinte separate, pentru animații în cascadă ———
function splitWords() {
  for (const h of $$('.words')) {
    h.innerHTML = h.textContent!.trim().split(/\s+/).map((w) => `<span class="w"><span>${w}</span></span>`).join(' ');
  }
}

// ——— cronologie (secunde) ———
// tăieturile de sub benzile „wipe” cad exact când banda acoperă tot cadrul (mijlocul tranziției)
const CUT1 = 14.05, CUT2 = 55.4;
const T = {
  title: [0, 6.6],
  stats: [6.4, CUT1],
  laptop: [CUT1, 41.6],
  map: [CUT1 + 0.35, 23.2],
  line: [23, 32.2],
  tt: [32, 41.4],
  phone: [41.2, 49.6],
  data: [49.4, CUT2],
  end: [CUT2, DURATION],
} as const;

function renderAt(t: number) {
  // rețeaua: se desenează la început, rămâne fundal discret, revine la final
  const drawn = (i: number, n: number) => outCubic(seg(t, 0.3 + (i / n) * 2.6, 0.3 + (i / n) * 2.6 + 1.6));
  const netOpacity = t < 6.2 ? 1 : t < CUT2 ? lerp(1, 0.13, inOutCubic(seg(t, 6.2, 7.6))) : lerp(0.13, 1, inOutCubic(seg(t, CUT2, CUT2 + 1.6)));
  const netScale = t < 6.2 ? lerp(1.06, 1, outCubic(seg(t, 0, 6.2))) : t < CUT2 ? lerp(1, 1.18, inOutCubic(seg(t, 6.2, 8))) : lerp(1.18, 1.02, inOutCubic(seg(t, CUT2, CUT2 + 2.2)));
  const netEl = $('#net');
  netEl.style.opacity = String(netOpacity);
  netEl.style.transform = `scale(${netScale})`;
  const sorted = net; // ordinea liniilor din date: tramvai, troleibuz, autobuz
  sorted.forEach((p) => {
    const k = drawn(p.order, 30);
    const off = `${p.len * (1 - k)}`;
    p.el.style.strokeDashoffset = off;
    p.casing.style.strokeDashoffset = off;
  });

  // halou în spatele titlurilor (lizibilitate peste rețea)
  const halo = Math.max(outCubic(seg(t, 2.4, 3.4)) * (1 - inCubic(seg(t, 6.0, 6.6))), outCubic(seg(t, T.end[0], T.end[0] + 1)));
  $('#halo').style.opacity = String(halo);

  // tranziții „wipe”: o bandă înclinată, ca o linie de tramvai, trece prin cadru și acoperă tăietura
  const wipe = (el: HTMLElement, a: number, d = 1.1) => {
    const k = inOutCubic(seg(t, a, a + d));
    el.style.transform = `translateX(${lerp(-130, 130, k)}%) skewX(-14deg)`;
    el.style.visibility = k > 0 && k < 1 ? 'visible' : 'hidden';
  };
  wipe($('#wipe-1'), CUT1 - 0.55);
  wipe($('#wipe-2'), CUT2 - 0.55);

  // 1. titlu
  const title = $('#s-title');
  title.style.opacity = String(1 - inCubic(seg(t, T.title[1] - 0.5, T.title[1])));
  const tIn = (a: number) => outExpo(seg(t, a, a + 0.9));
  $('.mark', title).style.transform = `scale(${lerp(0.6, 1, tIn(2.6))})`;
  $('.mark', title).style.opacity = String(tIn(2.6));
  $('h1 span', title).style.transform = `translateY(${(1 - tIn(3.0)) * 110}%)`;
  $('.sub span', title).style.transform = `translateY(${(1 - tIn(3.45)) * 110}%)`;

  // 2. cifre
  const stats = $('#s-stats');
  stats.style.opacity = String(t < CUT1 ? outCubic(seg(t, T.stats[0], T.stats[0] + 0.3)) : 0);
  $$('.stat', stats).forEach((s, i) => {
    const a = 7 + i * 0.55;
    const k = outExpo(seg(t, a, a + 1.4));
    s.style.opacity = String(outCubic(seg(t, a, a + 0.5)));
    s.style.transform = `translateY(${(1 - outCubic(seg(t, a, a + 0.8))) * 40}px)`;
    const b = $('b', s);
    b.textContent = Math.round(Number(b.dataset.to) * k).toLocaleString('ro-RO');
  });
  $('.tagline span', stats).style.transform = `translateY(${(1 - outExpo(seg(t, 10.2, 11.1))) * 110}%)`;

  // 3–5. laptop: intră de jos, schimbă capturile, face zoom pe zonele relevante
  const lap = $('#s-laptop');
  lap.style.opacity = String(t < CUT1 ? 0 : 1 - inCubic(seg(t, T.laptop[1] - 0.5, T.laptop[1])));
  const lapIn = outExpo(seg(t, T.laptop[0], T.laptop[0] + 1.5));
  const lapOut = inCubic(seg(t, T.laptop[1] - 0.8, T.laptop[1]));
  // intră înclinat în 3D (ca un ecran care se ridică) și se îndreaptă; iese spre stânga
  $('.laptop', lap).style.transform = `perspective(2200px) translateY(${(1 - lapIn) * 260}px) translateX(${-lapOut * 300}px) rotateX(${(1 - lapIn) * 22}deg) rotateY(${lerp(-6, -2, seg(t, T.laptop[0], T.laptop[1]))}deg) scale(${lerp(0.92, 1, lapIn)})`;
  const shot = (name: string) => $(`img[data-shot="${name}"]`, lap);
  // vizibilitate: crossfade între capturi
  shot('home').style.opacity = String(1 - outCubic(seg(t, 23, 23.6)));
  shot('line').style.opacity = String(outCubic(seg(t, 23, 23.6)) * (1 - outCubic(seg(t, 32, 32.6))));
  shot('tt').style.opacity = String(outCubic(seg(t, 32, 32.6)));
  // camera în interiorul ecranului: scale + translate (procente din cadru)
  const cam = (img: HTMLElement, keys: [number, number, number, number][]) => {
    // keys: [timp, zoom, x%, y%] — centrul vizat
    let k = keys[0];
    let z = k[1], x = k[2], y = k[3];
    for (let i = 1; i < keys.length; i++) {
      const [ta, za, xa, ya] = keys[i - 1], [tb, zb, xb, yb] = keys[i];
      if (t >= ta) { const e = inOutCubic(seg(t, ta, tb)); z = lerp(za, zb, e); x = lerp(xa, xb, e); y = lerp(ya, yb, e); }
      k = keys[i];
    }
    const tx = clamp(50 - x * z, 100 - 100 * z, 0), ty = clamp(50 - y * z, 100 - 100 * z, 0);
    img.style.transform = `translate(${tx}%, ${ty}%) scale(${z})`;
  };
  cam(shot('home'), [[14, 1.0, 50, 50], [23, 1.12, 62, 48]]);
  cam(shot('line'), [[23, 1.0, 50, 50], [25.2, 1.0, 50, 50], [28, 1.75, 14, 42], [30.4, 1.75, 14, 42], [32, 1.25, 55, 50]]);
  cam(shot('tt'), [[32, 1.0, 50, 50], [33.4, 1.0, 50, 50], [35.6, 1.9, 13, 62], [37.6, 1.9, 13, 62], [39.4, 2.1, 59, 30], [41.4, 2.1, 59, 30]]);

  // legende: kicker + cuvinte în cascadă
  for (const c of $$('.caption')) {
    const [a, b] = T[c.dataset.scene as keyof typeof T];
    c.style.opacity = String(c.dataset.scene === 'data' ? (t < CUT2 ? outCubic(seg(t, a, a + 0.4)) : 0) : life(t, a, b, 0.4, 0.4));
    $('.kicker', c).style.transform = `translateY(${(1 - outExpo(seg(t, a, a + 0.8))) * 24}px)`;
    $$('.w > span', c).forEach((w, i) => {
      const s = a + 0.15 + i * 0.045;
      w.style.transform = `translateY(${(1 - outExpo(seg(t, s, s + 0.8))) * 110}%)`;
    });
  }

  // 6. telefoane
  const ph = $('#s-phones');
  ph.style.opacity = String(life(t, T.phone[0], T.phone[1], 0.3, 0.5));
  $$('.phone', ph).forEach((p, i) => {
    const a = T.phone[0] + 0.2 + i * 0.35;
    const k = outExpo(seg(t, a, a + 1.4));
    const drift = seg(t, a, T.phone[1]) * 18;
    p.style.transform = `translateY(${(1 - k) * 700 - drift + (i ? 40 : 0)}px) rotate(${(i ? 4 : -3) * (1 - k * 0.6)}deg)`;
  });

  // 7. date
  const dt = $('#s-data');
  dt.style.opacity = String(t < CUT2 ? outCubic(seg(t, T.data[0], T.data[0] + 0.3)) : 0);
  $$('li', dt).forEach((li, i) => {
    const a = T.data[0] + 0.5 + i * 0.4;
    li.style.opacity = String(outCubic(seg(t, a, a + 0.5)));
    li.style.transform = `translateX(${(1 - outExpo(seg(t, a, a + 1))) * 60}px)`;
    $('i', li).style.transform = `scale(${lerp(0.4, 1, outExpo(seg(t, a, a + 0.7)))})`;
  });

  // 8. final
  const end = $('#s-end');
  end.style.opacity = String(t < CUT2 ? 0 : 1);
  const eIn = (a: number) => outExpo(seg(t, a, a + 1));
  $('.mark', end).style.transform = `scale(${lerp(0.6, 1, eIn(T.end[0] + 0.2))})`;
  $('h1 span', end).style.transform = `translateY(${(1 - eIn(T.end[0] + 0.5)) * 110}%)`;
  $('.sub span', end).style.transform = `translateY(${(1 - eIn(T.end[0] + 0.9)) * 110}%)`;
  $('.credits', end).style.opacity = String(outCubic(seg(t, T.end[0] + 1.6, T.end[0] + 2.4)));

  // intrare/ieșire din negru-alb
  $('#fade').style.opacity = String(Math.max(1 - seg(t, 0, 0.5), seg(t, DURATION - 0.8, DURATION)));
}

async function init() {
  splitWords();
  await buildNetwork();
  await document.fonts.ready;
  await Promise.all($$<HTMLImageElement>('img').map((i) => (i.complete ? Promise.resolve() : i.decode().catch(() => {}))));
  const end = new URLSearchParams(location.search).get('end');
  if (end) $('#end-line').textContent = end;
  const w = window as unknown as { __trailer: object };
  w.__trailer = { renderAt, duration: DURATION, fps: FPS, ready: true };

  // previzualizare: ?t=12 → cadru fix; altfel buclă în timp real (dacă nu e randare)
  const fixed = new URLSearchParams(location.search).get('t');
  if (fixed !== null) renderAt(Number(fixed));
  else if (!new URLSearchParams(location.search).has('render')) {
    const t0 = performance.now();
    const loop = (now: number) => { renderAt(((now - t0) / 1000) % DURATION); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  } else renderAt(0);
}

init();
