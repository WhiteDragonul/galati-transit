// Randează trailerul cadru cu cadru (determinist) și îl codează în MP4 (H.264) direct în browser.
// Necesită `npm run dev`. Rulare: npm run trailer:render [-- --from=0 --to=62 --out=trailer/galati-transit-atlas.mp4 --bitrate=3000000]
import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';

const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const BASE = process.env.APP_URL ?? 'http://localhost:5173/';
const OUT = arg('out', 'trailer/galati-transit-atlas.mp4');
const BITRATE = Number(arg('bitrate', '3000000')); // ~3 Mbps → ~23 MB pentru 62 s: încape într-un e-mail
const END = process.env.TRAILER_END ?? '';

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('trailer:', e.message));
await page.goto(`${BASE}trailer/?render${END ? `&end=${encodeURIComponent(END)}` : ''}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => (window as unknown as { __trailer?: { ready: boolean } }).__trailer?.ready, null, { timeout: 60_000 });
const { duration, fps } = await page.evaluate(() => (window as unknown as { __trailer: { duration: number; fps: number } }).__trailer);

const from = Number(arg('from', '0')), to = Math.min(duration, Number(arg('to', String(duration))));
const frames = Math.round((to - from) * fps);

const enc = await browser.newPage();
enc.on('pageerror', (e) => console.error('encoder:', e.message));
await enc.goto(`${BASE}trailer/encode.html`, { waitUntil: 'networkidle' });
await enc.waitForFunction(() => (window as unknown as { __encoderReady?: boolean }).__encoderReady);
await enc.evaluate((o) => (window as unknown as { setup: (o: object) => Promise<boolean> }).setup(o), { width: 1920, height: 1080, fps, bitrate: BITRATE });

const t0 = Date.now();
for (let i = 0; i < frames; i++) {
  const t = from + i / fps;
  await page.evaluate((t) => (window as unknown as { __trailer: { renderAt: (t: number) => void } }).__trailer.renderAt(t), t);
  const jpg = await page.screenshot({ type: 'jpeg', quality: 93, animations: 'disabled', caret: 'hide' });
  await enc.evaluate(([url, i]) => (window as unknown as { addFrame: (u: string, i: number) => Promise<void> }).addFrame(url as string, i as number), [`data:image/jpeg;base64,${jpg.toString('base64')}`, i]);
  if (i % fps === 0) process.stdout.write(`\r${(t).toFixed(0).padStart(3)} s / ${to} s  (${Math.round(((i + 1) / frames) * 100)}%, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
const b64 = await enc.evaluate(() => (window as unknown as { finish: () => Promise<string> }).finish());
const buf = Buffer.from(b64, 'base64');
await writeFile(OUT, buf);
console.log(`\n✓ ${OUT} — ${frames} cadre, ${(buf.length / 1e6).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s`);

// poster (cadrul final), util ca imagine în e-mail
await page.evaluate((t) => (window as unknown as { __trailer: { renderAt: (t: number) => void } }).__trailer.renderAt(t), duration - 2);
await page.screenshot({ path: OUT.replace(/\.mp4$/, '-poster.png') });
await browser.close();
