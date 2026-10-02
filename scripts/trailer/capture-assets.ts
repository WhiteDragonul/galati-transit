// Capturi reale din aplicație, folosite în trailer (trailer/assets/*.png).
// Necesită `npm run dev` pornit. Rulare: npm run trailer:assets
import { chromium, type Page } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.APP_URL ?? 'http://localhost:5173/';
const OUT = 'trailer/assets';
// ora afișată în capturi (ziua lucrătoare, după-amiază), ca „următoarea plecare” să fie realistă
const FAKE_NOW = new Date('2026-10-01T16:52:00+03:00');

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
await mkdir(OUT, { recursive: true });

async function open(hash: string, viewport: { width: number; height: number }, dpr: number, mobile = false): Promise<Page> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' }); // capturi statice: traseul complet, fără puls continuu
  await ctx.clock.install({ time: FAKE_NOW });
  await ctx.clock.resume();
  const p = await ctx.newPage();
  await p.goto(BASE + hash, { waitUntil: 'networkidle' });
  await p.waitForTimeout(4000); // tile-uri
  if (!hash) await p.evaluate(() => (window as unknown as { __map: { jumpTo: (o: object) => void } }).__map.jumpTo({ zoom: 12.6, pitch: 52, bearing: -17 }));
  await p.waitForTimeout(2500);
  return p;
}

const shot = async (p: Page, name: string) => {
  await p.screenshot({ path: `${OUT}/${name}.png`, timeout: 90_000 });
  console.log('✓', name);
};

// desktop: privire de ansamblu
let p = await open('', { width: 1600, height: 900 }, 2);
await shot(p, 'desktop-home');
await p.context().close();

// desktop: linia 102 selectată
p = await open('#linie=trolleybus-102', { width: 1600, height: 900 }, 2);
await shot(p, 'desktop-line');
// orarul unei stații + popup cu plecările
await p.locator('.stop > button').nth(3).click();
await p.waitForTimeout(2500);
await shot(p, 'desktop-timetable');
await p.context().close();

// telefon: listă (sheet la jumătate) și detaliu cu orar
p = await open('', { width: 390, height: 844 }, 3, true);
// atingere scurtă pe mâner: sheet-ul urcă la jumătate
await p.locator('.sheet-handle').click();
await p.waitForTimeout(1200);
await shot(p, 'phone-list');
await p.context().close();

p = await open('#linie=bus-24', { width: 390, height: 844 }, 3, true);
await p.locator('.stop > button').nth(5).click();
await p.waitForTimeout(2500);
await shot(p, 'phone-timetable');
await p.context().close();

await browser.close();
