// UI vine în pașii 4+. Deocamdată doar verificăm că datele generate se încarcă.
const res = await fetch('/data/lines.json');
const lines = res.ok ? await res.json() : null;
document.getElementById('map')!.textContent = lines
  ? `${lines.lines.length} linii încărcate`
  : 'Rulează npm run data pentru a genera datele.';
