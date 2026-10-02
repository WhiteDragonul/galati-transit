import { defineConfig } from 'vite';

export default defineConfig({
  // pe GitHub Pages: https://<user>.github.io/galati-transit/ (setat de workflow prin BASE_PATH)
  base: process.env.BASE_PATH ?? '/',
  // MapLibre 6 își încarcă worker-ul ESM relativ la propriul fișier;
  // pre-bundling-ul Vite ar muta modulul și ar strica acel URL.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
