# Galați Transit Atlas

Hartă 3D interactivă a liniilor de transport public din Galați (Transurb: autobuz, troleibuz, tramvai).
Prototip static: fără backend, datele sunt fișiere JSON/GeoJSON generate din OpenStreetMap.

Date: © OpenStreetMap contributors, licență [ODbL](https://opendatacommons.org/licenses/odbl/).

## Cerințe

Node.js 20+ (testat pe 24). Toate comenzile merg în PowerShell, cmd sau bash.

```powershell
npm install
npm run dev        # http://localhost:5173
```

## Interfață

- **Hartă**: MapLibre GL JS, stil OpenFreeMap Positron, clădiri 3D (`fill-extrusion`) de la zoom 12.
- **Panou**: pe desktop e în stânga; pe telefon (sub 768 px) devine un bottom sheet cu trei poziții, tras cu degetul.
- **Link direct** către o linie: `/#linie=bus-9` (id-urile sunt în `public/data/lines.json`).
- **Linii cu date incomplete**: traseu punctat pe hartă, eticheta „incomplet” în listă și un bloc explicativ în detaliu, cu link spre relația OSM.
- **Culori**: OSM nu are culori pentru liniile din Galați, deci UI-ul folosește o paletă de rezervă, marcată ca atare. Culorile oficiale se pun în `overrides.json`.

### Motion design

Toate duratele și curbele sunt centralizate în `src/motion/tokens.ts`, iar animațiile DOM folosesc biblioteca [`motion`](https://motion.dev).

| Moment | Ce se întâmplă |
|---|---|
| Intro | camera coboară din vederea de sus într-o vedere înclinată (52°); liniile apar treptat, panoul intră, rândurile listei apar pe rând |
| Selecție linie | celelalte linii se estompează; camera zboară spre traseu; traseul se desenează progresiv în sensul de mers, iar stațiile apar pe măsură ce linia ajunge la ele |
| După desenare | un puls luminos parcurge traseul în buclă (`line-gradient` + `line-progress`, fără deck.gl) |
| Tur / retur | indicatorul segmentat alunecă cu resort, iar stațiile intră pe rând |
| Telefon | sheet cu fizică de resort și inerție la eliberare |

`prefers-reduced-motion` dezactivează toate animațiile: camera sare direct, iar traseul apare complet.

### Capturi de ecran

```powershell
npm run dev                   # într-un terminal
npm run snapshot              # în altul: capturi desktop + telefon în snapshots/, prin Edge instalat
```

`BROWSER_CHANNEL=chrome` folosește Chrome în loc de Edge.

## Date

```powershell
npm run data:fetch   # Overpass → data/raw/osm-YYYY-MM-DD.json (cu fallback pe mirror-uri)
npm run data:build   # cel mai recent raw + data/overrides.json → public/data/* + data/report.md
npm run data         # ambele
```

`data:build` nu accesează rețeaua. După ce editezi `overrides.json`, rulează doar `data:build`.

### Fluxul datelor

```
sursă (scripts/sources/osm.ts; ulterior gtfs.ts)
  → model intern (shared/model.ts)
  → data/overrides.json
  → verificări de calitate (scripts/lib/quality.ts)
  → public/data/lines.json, routes.geojson, stops.geojson + data/report.md
```

Frontendul citește doar `public/data/*` și tipurile din `shared/model.ts`. O sursă nouă, cum ar fi GTFS, trebuie doar să producă același `SourceResult` (`scripts/lib/types.ts`).

### Fișiere generate

| Fișier | Conținut |
|---|---|
| `public/data/lines.json` | linii → variante (tur/retur), stații ordonate, `issues[]` pentru afișarea „date incomplete” |
| `public/data/routes.geojson` | geometria fiecărei variante (`LineString` sau `MultiLineString` dacă traseul e întrerupt) |
| `public/data/stops.geojson` | stații (platforme), cu `lineIds` și `groupId` (același nume la < 300 m, ex. cele două sensuri) |
| `data/report.md` | raport de calitate: trasee rupte, variante fără stații, sensuri lipsă, rute excluse |

Nimic nu e completat din presupuneri. Golurile din trasee rămân goluri, iar culorile lipsă rămân `null`.

### Corecții manuale: `data/overrides.json`

```json
{
  "includeNetworks": ["Transurb"],
  "lines":    { "bus-9":       { "colour": "#d62828", "name": "Autobuz 9", "hidden": false } },
  "variants": { "osm:r395899": { "direction": "retur", "hidden": true } },
  "stops":    { "osm:n123":    { "name": "Nume corectat" } }
}
```

- `includeNetworks`: valorile tag-urilor `network=`/`operator=` incluse. Pentru microbuzele suburbane, adaugă de ex. `"Tegaltrans"`.
- Id-urile de linii, variante și stații se iau din `lines.json`, `stops.geojson` sau din raport.
- Override-urile aplicate apar listate la finalul `report.md`.

Cea mai bună corecție rămâne una făcută direct în OpenStreetMap: repari acolo, apoi rulezi `npm run data`.
