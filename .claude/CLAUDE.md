# galati-transit

Hartă 3D a transportului public din Galați (Transurb). Prototip static: fără backend.

- Stack: Vite + TypeScript vanilla, MapLibre GL JS 6 (OpenFreeMap Positron), `motion` pentru animații DOM.
- Date: scripturi Node (tsx) în `scripts/`, cross-platform (utilizatorul lucrează pe Windows/PowerShell).
  - `data:fetch` → OSM prin Overpass (geometrie trasee + poziții stații).
  - `data:fetch-transurb` → transurbgalati.ro: lista oficială de linii, stații tur/retur, orare pe stație.
  - `data:build` → `public/data/*` + `data/report.md`; `data:verify` → verificări + comparare cu site-ul live.
- Potriviri de stații confirmate de utilizator (acronime diferite): `stopAliases` în `data/overrides.json` (ex. F.S.E.A./FSEA/F.E.A.A. → F.E.E.A.).
- Regulă: nu se inventează date. Ce lipsește se marchează (report + UI „date incomplete”). Corecții în `data/overrides.json`.
- Atribuire obligatorie în UI: „© OpenStreetMap contributors” (ODbL).
- MapLibre 6: worker-ul se setează explicit în `src/map/worker.ts` (`?worker&url`), iar `maplibre-gl` e exclus din optimizeDeps.
- Nu folosi `Get-Content`/`Set-Content` din PowerShell 5.1 pe fișiere UTF-8 fără BOM (strică diacriticele).
- Verificare vizuală: `npm run dev` + `npm run snapshot` (Edge headless prin playwright-core).
- Commit-uri mici, mesaje în engleză; README în română.
- Trailer: `trailer/` (timeline determinist `renderAt(t)`), `npm run trailer:assets` + `npm run trailer:render` → MP4 H.264 codat în browser (WebCodecs + mp4-muxer, fără ffmpeg).
- Planificator „Cum ajung?”: algoritm pur în `src/plan.ts` (teste în `src/plan.test.ts`, fără orar), UI în `src/ui/planner.ts`, desen în `src/map/plan.ts`; starea `plan` în `src/state.ts`, link `#de=…&la=…`.
- UI bilingv RO/EN: `src/i18n.ts` (`t()`, comutator în antet, `?lang=en`, salvat în localStorage). Text nou în UI → cheie în ambele dicționare; numele stațiilor nu se traduc.
