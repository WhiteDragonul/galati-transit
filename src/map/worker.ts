// MapLibre 6 își calculează URL-ul worker-ului la runtime, deci bundler-ul nu îl vede.
// Îl declarăm explicit: Vite îl împachetează (cu dependențele lui) ca worker ES separat.
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);
