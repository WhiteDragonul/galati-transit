// Capturi de ecran ale aplicației (desktop + telefon), pentru verificare vizuală.
// Folosește Edge/Chrome deja instalat, prin playwright-core. Pornește întâi: npm run dev
// Rulare: npm run snapshot -- [url] [director-ieșire]
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const base = process.argv[2] ?? 'http://localhost:5173/';
const outDir = path.resolve(process.argv[3] ?? 'snapshots');

const shots = [
  { name: 'desktop-home', hash: '', viewport: { width: 1440, height: 860 }, wait: 4500 },
  { name: 'desktop-line', hash: '#linie=trolleybus-102', viewport: { width: 1440, height: 860 }, wait: 4500 },
  { name: 'desktop-incomplete', hash: '#linie=tram-40', viewport: { width: 1440, height: 860 }, wait: 4500 },
  { name: 'mobile-home', hash: '', viewport: { width: 390, height: 844 }, wait: 4500, mobile: true },
  { name: 'mobile-line', hash: '#linie=bus-50', viewport: { width: 390, height: 844 }, wait: 4500, mobile: true },
];

const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL ?? 'msedge',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await mkdir(outDir, { recursive: true });
for (const s of shots) {
  const page = await browser.newPage({ viewport: s.viewport, deviceScaleFactor: 1, isMobile: !!s.mobile, hasTouch: !!s.mobile });
  page.on('pageerror', (e) => console.error(`[${s.name}] pageerror:`, e.message));
  page.on('console', (m) => m.type() === 'error' && console.error(`[${s.name}] console:`, m.text()));
  await page.goto(base + s.hash, { waitUntil: 'networkidle' });
  await page.waitForTimeout(s.wait);
  const file = path.join(outDir, `${s.name}.png`);
  await page.screenshot({ path: file });
  console.log('✓', file);
  await page.close();
}
await browser.close();
