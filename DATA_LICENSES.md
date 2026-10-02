# Licențele datelor

Codul sursă e sub licența MIT (vezi `LICENSE`). **Datele nu sunt acoperite de licența MIT.** Fiecare sursă are propriile condiții:

| Date | Fișiere | Sursă și condiții |
|---|---|---|
| Trasee, poziții de stații, rețeaua de străzi | `data/raw/osm-*.json`, `data/raw/roads-*.json`, `public/data/routes.geojson`, `public/data/stops.geojson` | © OpenStreetMap contributors, [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/). Bazele de date derivate trebuie distribuite tot sub ODbL, cu atribuire. |
| Lista de linii, stațiile oficiale, tur/retur, orare | `data/raw/transurb-*.json`, `public/data/schedules/*.json`, câmpurile oficiale din `public/data/lines.json` | Preluate de pe [transurbgalati.ro](https://transurbgalati.ro/program_circulatie/) (TRANSURB S.A. Galați). Site-ul indică „Toate drepturile sunt rezervate”. Datele sunt incluse aici doar pentru prototip, cu menționarea sursei. **Nu le reutiliza în alte scopuri fără acordul TRANSURB S.A.** La cererea operatorului, vor fi eliminate. |
| Fundalul hărții (tile-uri) | încărcate la rulare, nu sunt în repo | [OpenFreeMap](https://openfreemap.org/), schemă [OpenMapTiles](https://openmaptiles.org/) (CC-BY 4.0), date © OpenStreetMap contributors |

Atribuirea „© OpenStreetMap · OpenMapTiles · OpenFreeMap” trebuie să rămână vizibilă în aplicație.
