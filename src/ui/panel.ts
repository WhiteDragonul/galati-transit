// Panoul lateral: lista de linii (căutare + filtru pe tip) și detaliul liniei selectate.
import { animate, stagger } from 'motion';
import { type AppData, type Line, hasWarnings, MODE_LABEL, terminalsLabel, type Variant } from '../data.ts';
import { DUR, EASE_IN, EASE_OUT, reducedMotion, SPRING } from '../motion/tokens.ts';
import { getState, setState, type State, subscribe } from '../state.ts';
import { $, BACK_ICON, badge, esc, WARN_ICON } from './dom.ts';

export interface PanelHooks {
  onStopClick: (stopId: string) => void;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function initPanel(data: AppData, hooks: PanelHooks) {
  const listView = $('#view-list');
  const detailView = $('#view-detail');
  const list = $('#line-list');
  const search = $<HTMLInputElement>('#search');
  const chips = $('#mode-chips');

  $('#stat-lines').textContent = String(data.lines.length);
  $('#stat-stops').textContent = String(new Set(data.stops.features.map((f) => f.properties.groupId)).size);

  // ——— filtru pe tip ———
  const modes = [['all', 'Toate'], ['tram', 'Tramvai'], ['trolleybus', 'Troleibuz'], ['bus', 'Autobuz']] as const;
  chips.innerHTML = modes
    .map(([m, label]) => {
      const n = m === 'all' ? data.lines.length : data.lines.filter((l) => l.mode === m).length;
      return `<button class="chip" role="radio" data-mode="${m}" aria-checked="${m === 'all'}">${label} <small>${n}</small></button>`;
    })
    .join('');
  chips.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip');
    if (b) setState({ mode: b.dataset.mode as State['mode'] });
  });

  let t = 0;
  search.addEventListener('input', () => {
    clearTimeout(t);
    t = window.setTimeout(() => setState({ query: search.value }), 80);
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') list.querySelector<HTMLButtonElement>('.row')?.click();
  });

  list.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLButtonElement>('.row');
    if (row) setState({ lineId: row.dataset.line!, variantId: null });
  });

  function renderList(animateIn: boolean) {
    const { query, mode } = getState();
    const q = norm(query.trim());
    const match = (l: Line) => {
      if (mode !== 'all' && l.mode !== mode) return false;
      if (!q) return true;
      if (norm(l.ref).startsWith(q)) return true;
      return l.variants.some((v) => [v.from, v.to, v.name].some((s) => s && norm(s).includes(q)));
    };
    const shown = data.lines.filter(match);
    if (!shown.length) {
      list.innerHTML = `<p class="empty">Nicio linie pentru „${esc(query)}”.</p>`;
      return;
    }
    let html = '';
    for (const m of ['tram', 'trolleybus', 'bus'] as const) {
      const group = shown.filter((l) => l.mode === m);
      if (!group.length) continue;
      html += `<h2>${MODE_LABEL[m]}</h2>`;
      for (const l of group) {
        const title = terminalsLabel(l) ?? l.name ?? `${MODE_LABEL[l.mode]} ${l.ref}`;
        const stops = Math.max(0, ...l.variants.map((v) => v.stopIds.length));
        const sub = `${MODE_LABEL[l.mode]} ${esc(l.ref)} · ${stops ? `${stops} stații` : 'fără stații în date'}`;
        html += `<button class="row" data-line="${l.id}">
          ${badge(data, l)}
          <span class="row-text"><span class="row-title">${esc(title)}</span><span class="row-sub">${sub}</span></span>
          ${hasWarnings(l) ? `<span class="flag" title="Date incomplete în OpenStreetMap">${WARN_ICON}incomplet</span>` : ''}
        </button>`;
      }
    }
    list.innerHTML = html;
    if (animateIn && !reducedMotion()) {
      const rows = [...list.querySelectorAll('.row')].slice(0, 14);
      animate(rows, { opacity: [0, 1], transform: ['translateY(8px)', 'translateY(0)'] }, { duration: DUR.base, delay: stagger(0.025), ease: EASE_OUT });
    }
  }

  // ——— detaliu ———
  function renderDetail(line: Line, variantId: string | null) {
    const colour = data.colourOf(line.id);
    const variant = line.variants.find((v) => v.id === variantId) ?? line.variants[0];
    const tur = line.variants.filter((v) => v.direction === 'tur');
    const retur = line.variants.filter((v) => v.direction === 'retur');
    const other = line.variants.filter((v) => !v.direction);
    const dirGroups = [
      ...(tur.length ? [{ label: 'Tur', vs: tur }] : []),
      ...(retur.length ? [{ label: 'Retur', vs: retur }] : []),
      ...(other.length ? [{ label: 'Variantă', vs: other }] : []),
    ];
    const activeGroup = dirGroups.find((g) => g.vs.includes(variant)) ?? dirGroups[0];

    const warnings = [...line.issues, ...line.variants.flatMap((v) => v.issues.map((i) => ({ ...i, v })))].filter((i) => i.severity === 'warn');
    const uniqueMsgs = [...new Set(warnings.map((w) => ('v' in w && line.variants.length > 1 ? `${dirName(w.v as Variant)}: ${w.message}` : w.message)))];
    const osmLink = line.sourceRef ?? variant?.sourceRef;

    detailView.innerHTML = `
      <div class="detail-head">
        <button class="back" aria-label="Înapoi la lista de linii">${BACK_ICON}</button>
        ${badge(data, line, 'lg')}
        <div class="detail-title">
          <h2>${MODE_LABEL[line.mode]} ${esc(line.ref)}</h2>
          <p>${esc(terminalsLabel(line) ?? 'Capete necunoscute în date')}</p>
        </div>
      </div>
      ${uniqueMsgs.length ? `<div class="notice" role="note"><strong>${WARN_ICON} Date incomplete</strong>
        <ul>${uniqueMsgs.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
        ${osmLink ? `<a href="https://www.openstreetmap.org/${osmLink}" target="_blank" rel="noopener">Vezi relația în OpenStreetMap ↗</a>` : ''}</div>` : ''}
      ${data.colourIsFallback(line.id) ? `<p class="note" style="--c:${colour}"><i></i>Culoare de rezervă (lipsește din OSM)</p>` : ''}
      ${dirGroups.length > 1 ? `<div class="seg" role="tablist" aria-label="Sens">
        <span class="seg-thumb"></span>
        ${dirGroups.map((g) => `<button role="tab" data-variant="${g.vs[0].id}" aria-selected="${g === activeGroup}"><b>${g.label}</b><span>${esc(g.vs[0].to ? `spre ${g.vs[0].to}` : '—')}</span></button>`).join('')}
      </div>` : ''}
      ${activeGroup && activeGroup.vs.length > 1 ? `<div class="subvariants">${activeGroup.vs.map((v, i) => `<button class="chip" role="radio" data-variant="${v.id}" aria-checked="${v === variant}">Traseul ${i + 1} <small>${v.stopIds.length} st.</small></button>`).join('')}</div>` : ''}
      <ol class="stops" aria-label="Stații">${renderStops(line, variant, colour)}</ol>`;

    $('.back', detailView).addEventListener('click', () => setState({ lineId: null, variantId: null }));
    detailView.querySelectorAll<HTMLButtonElement>('[data-variant]').forEach((b) =>
      b.addEventListener('click', () => setState({ variantId: b.dataset.variant! })),
    );
    detailView.querySelectorAll<HTMLButtonElement>('.stop button').forEach((b) =>
      b.addEventListener('click', () => hooks.onStopClick(b.dataset.stop!)),
    );
    placeThumb(false);
  }

  function dirName(v: Variant) {
    return v.direction === 'tur' ? 'Tur' : v.direction === 'retur' ? 'Retur' : 'Variantă';
  }

  function renderStops(line: Line, v: Variant | undefined, colour: string) {
    if (!v || !v.stopIds.length) return `<li class="empty">Varianta nu are stații în OpenStreetMap.</li>`;
    return v.stopIds
      .map((id, i, arr) => {
        const s = data.stopById.get(id)!;
        const terminal = i === 0 || i === arr.length - 1;
        const others = (data.groupLines.get(s.groupId) ?? []).filter((l) => l !== line.id).slice(0, 6);
        const dots = others.map((l) => `<i style="--c2:${data.colourOf(l)}" title="${esc(data.lineById.get(l)?.ref ?? '')}"></i>`).join('');
        const name = s.name ? esc(s.name) : '<span class="unnamed">Stație fără nume</span>';
        return `<li class="stop${terminal ? ' terminal' : ''}" style="--c:${colour}">
          <button data-stop="${id}"><span class="dot"></span><span class="name">${name}</span>
          ${terminal ? `<span class="tag">${i === 0 ? 'Plecare' : 'Capăt'}</span>` : `<span class="others" aria-label="${others.length} alte linii">${dots}</span>`}</button></li>`;
      })
      .join('');
  }

  /** indicatorul segmentat alunecă sub tab-ul activ */
  function placeThumb(animated: boolean) {
    const seg = detailView.querySelector<HTMLElement>('.seg');
    if (!seg) return;
    const thumb = $('.seg-thumb', seg);
    const tabs = [...seg.querySelectorAll<HTMLButtonElement>('button')];
    const idx = Math.max(0, tabs.findIndex((b) => b.getAttribute('aria-selected') === 'true'));
    const w = (seg.clientWidth - 8) / tabs.length;
    thumb.style.width = `${w}px`;
    const x = `translateX(${idx * w}px)`;
    if (animated && !reducedMotion()) animate(thumb, { transform: x }, SPRING);
    else thumb.style.transform = x;
  }

  function animateStops() {
    if (reducedMotion()) return;
    const items = [...detailView.querySelectorAll('.stop')].slice(0, 18);
    animate(items, { opacity: [0, 1], transform: ['translateX(-6px)', 'translateX(0)'] }, { duration: DUR.base, delay: stagger(0.03, { startDelay: 0.12 }), ease: EASE_OUT });
  }

  // ——— tranziții între vederi ———
  async function showDetail(line: Line, variantId: string | null, fromList: boolean) {
    if (fromList && !reducedMotion()) {
      await animate(listView, { opacity: [1, 0], transform: ['translateX(0)', 'translateX(-16px)'] }, { duration: DUR.fast, ease: EASE_IN }).finished;
    }
    listView.hidden = true;
    detailView.hidden = false;
    renderDetail(line, variantId);
    if (!reducedMotion()) animate(detailView, { opacity: [0, 1], transform: ['translateX(20px)', 'translateX(0)'] }, { duration: DUR.base, ease: EASE_OUT });
    animateStops();
    ($('.back', detailView) as HTMLButtonElement).focus({ preventScroll: true });
  }

  async function showList() {
    if (!reducedMotion()) await animate(detailView, { opacity: [1, 0], transform: ['translateX(0)', 'translateX(20px)'] }, { duration: DUR.fast, ease: EASE_IN }).finished;
    detailView.hidden = true;
    listView.hidden = false;
    listView.style.opacity = '1';
    if (!reducedMotion()) animate(listView, { opacity: [0, 1], transform: ['translateX(-16px)', 'translateX(0)'] }, { duration: DUR.base, ease: EASE_OUT });
    const row = list.querySelector<HTMLButtonElement>(`[data-line="${CSS.escape(lastLine ?? '')}"]`);
    row?.focus({ preventScroll: false });
  }

  let lastLine: string | null = null;
  subscribe((s, prev) => {
    if (s.mode !== prev.mode) chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-checked', String((c as HTMLElement).dataset.mode === s.mode)));
    if (s.query !== prev.query || s.mode !== prev.mode) renderList(true);

    if (s.lineId !== prev.lineId) {
      if (s.lineId) {
        lastLine = s.lineId;
        showDetail(data.lineById.get(s.lineId)!, s.variantId, !prev.lineId);
      } else showList();
    } else if (s.lineId && s.variantId !== prev.variantId) {
      // schimbare de sens: re-randare + glisarea indicatorului + intrarea stațiilor
      const seg = detailView.querySelector('.seg');
      const prevIdx = seg ? [...seg.querySelectorAll('button')].findIndex((b) => b.getAttribute('aria-selected') === 'true') : 0;
      renderDetail(data.lineById.get(s.lineId)!, s.variantId);
      const thumb = detailView.querySelector<HTMLElement>('.seg-thumb');
      if (thumb) {
        const w = parseFloat(thumb.style.width);
        thumb.style.transform = `translateX(${prevIdx * w}px)`;
        placeThumb(true);
      }
      animateStops();
    }
  });

  renderList(false);
  return {
    enter() {
      const panel = $('#panel');
      if (reducedMotion()) { panel.style.opacity = '1'; return; }
      const mobile = matchMedia('(max-width: 767px)').matches;
      // pe mobil poziția (transform) aparține bottom sheet-ului; aici animăm doar opacitatea
      if (mobile) animate(panel, { opacity: [0, 1] }, { duration: DUR.slow, ease: EASE_OUT });
      else animate(panel, { opacity: [0, 1], transform: ['translateX(-24px)', 'translateX(0)'] }, { duration: DUR.slow, ease: EASE_OUT });
      const rows = [...list.querySelectorAll('.row')].slice(0, 12);
      animate(rows, { opacity: [0, 1], transform: ['translateY(10px)', 'translateY(0)'] }, { duration: DUR.slow, delay: stagger(0.035, { startDelay: 0.18 }), ease: EASE_OUT });
    },
  };
}
