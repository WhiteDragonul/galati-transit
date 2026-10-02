// Panoul lateral: lista de linii (căutare + filtru pe tip) și detaliul liniei selectate.
import { animate, stagger } from 'motion';
import { type AppData, type Line, hasWarnings, MODE_LABEL, terminalsLabel, type Variant } from '../data.ts';
import { byHour, dayTypeIndexFor, inMinutes, loadSchedule, nowMinutes, shortDayLabel, toMinutes, upcoming } from '../schedule.ts';
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
      return l.variants.some((v) => [v.from, v.to, ...v.stops.map((s) => s.name)].some((s) => s && norm(s).includes(q)));
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
        const stops = Math.max(0, ...l.variants.map((v) => v.stops.length));
        const sub = `${MODE_LABEL[l.mode]} ${esc(l.ref)}${l.section === 'extraurban' ? ' · extraurban' : ''} · ${stops ? `${stops} stații` : 'fără stații în date'}`;
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
  let openStop: number | null = null; // indexul stației cu orarul deschis
  let dayChoice: number | null = null; // tipul de zi ales manual (altfel: cel de azi)

  function renderDetail(line: Line, variantId: string | null) {
    const colour = data.colourOf(line.id);
    const variant = line.variants.find((v) => v.id === variantId) ?? line.variants[0];
    openStop = null;
    const tur = line.variants.filter((v) => v.direction === 'tur');
    const retur = line.variants.filter((v) => v.direction === 'retur');
    const other = line.variants.filter((v) => !v.direction);
    const dirGroups = [
      ...(tur.length ? [{ label: 'Tur', vs: tur }] : []),
      ...(retur.length ? [{ label: 'Retur', vs: retur }] : []),
      ...(other.length ? [{ label: 'Variantă', vs: other }] : []),
    ];
    const activeGroup = dirGroups.find((g) => g.vs.includes(variant)) ?? dirGroups[0];

    // doar problemele variantei afișate (plus cele ale liniei), ca mesajul să corespundă cu ce vezi
    const warnings = [...line.issues, ...(variant?.issues ?? [])].filter((i) => i.severity === 'warn');
    const geoLink = variant?.geometryRef;

    detailView.innerHTML = `
      <div class="detail-head">
        <button class="back" aria-label="Înapoi la lista de linii">${BACK_ICON}</button>
        ${badge(data, line, 'lg')}
        <div class="detail-title">
          <h2>${MODE_LABEL[line.mode]} ${esc(line.ref)}${line.section === 'extraurban' ? ' <small class="pill">extraurban</small>' : ''}</h2>
          <p>${esc(terminalsLabel(line) ?? 'Capete necunoscute în date')}</p>
        </div>
      </div>
      ${warnings.length ? `<div class="notice" role="note"><strong>${WARN_ICON} Date incomplete pe hartă</strong>
        <ul>${warnings.map((m) => `<li>${esc(m.message)}</li>`).join('')}</ul>
        ${geoLink ? `<a href="https://www.openstreetmap.org/${geoLink}" target="_blank" rel="noopener">Traseul în OpenStreetMap ↗</a>` : ''}</div>` : ''}
      ${data.colourIsFallback(line.id) ? `<p class="note" style="--c:${colour}"><i></i>Culoare de rezervă (lipsește din date)</p>` : ''}
      ${dirGroups.length > 1 ? `<div class="seg" role="tablist" aria-label="Sens">
        <span class="seg-thumb"></span>
        ${dirGroups.map((g) => `<button role="tab" data-variant="${g.vs[0].id}" aria-selected="${g === activeGroup}"><b>${g.label}</b><span>${esc(g.vs[0].to ? `spre ${g.vs[0].to}` : '—')}</span></button>`).join('')}
      </div>` : ''}
      ${activeGroup && activeGroup.vs.length > 1 ? `<div class="subvariants">${activeGroup.vs.map((v) => `<button class="chip" role="radio" data-variant="${v.id}" aria-checked="${v === variant}">${esc(v.label ?? 'Standard')}</button>`).join('')}</div>` : ''}
      <ol class="stops" aria-label="Stații">${renderStops(line, variant, colour)}</ol>
      ${line.officialUrl ? `<p class="source">Stații și orare: <a href="${esc(line.officialUrl)}" target="_blank" rel="noopener">transurbgalati.ro ↗</a>${data.meta.officialFetchedAt ? ` · preluate ${new Date(data.meta.officialFetchedAt).toLocaleDateString('ro-RO')}` : ''}</p>` : ''}`;

    $('.back', detailView).addEventListener('click', () => setState({ lineId: null, variantId: null }));
    detailView.querySelectorAll<HTMLButtonElement>('[data-variant]').forEach((b) =>
      b.addEventListener('click', () => setState({ variantId: b.dataset.variant! })),
    );
    detailView.querySelectorAll<HTMLButtonElement>('.stop > button').forEach((b) =>
      b.addEventListener('click', () => {
        toggleTimetable(line, variant, Number(b.dataset.index));
        if (b.dataset.stop) hooks.onStopClick(b.dataset.stop);
      }),
    );
    placeThumb(false);
  }

  function renderStops(line: Line, v: Variant | undefined, colour: string) {
    if (!v || !v.stops.length) return `<li class="empty">Varianta nu are stații în date.</li>`;
    return v.stops
      .map((st, i, arr) => {
        const s = st.stopId ? data.stopById.get(st.stopId) : undefined;
        const terminal = i === 0 || i === arr.length - 1;
        const others = s ? (data.groupLines.get(s.groupId) ?? []).filter((l) => l !== line.id).slice(0, 6) : [];
        const dots = others.map((l) => `<i style="--c2:${data.colourOf(l)}" title="${esc(data.lineById.get(l)?.ref ?? '')}"></i>`).join('');
        const name = st.name ? esc(st.name) : '<span class="unnamed">Stație fără nume</span>';
        const right = terminal
          ? `<span class="tag">${i === 0 ? 'Plecare' : 'Capăt'}</span>`
          : !st.stopId
            ? `<span class="tag nopos" title="Stația nu are poziție în OpenStreetMap">fără poziție</span>`
            : `<span class="others" aria-label="${others.length} alte linii">${dots}</span>`;
        return `<li class="stop${terminal ? ' terminal' : ''}${st.stopId ? '' : ' unplaced'}" style="--c:${colour}">
          <button data-index="${i}"${st.stopId ? ` data-stop="${st.stopId}"` : ''} aria-expanded="false"${st.officialName ? ` title="${esc(st.officialName)}"` : ''}>
            <span class="dot"></span><span class="name">${name}</span>${right}</button>
          <div class="tt" hidden></div></li>`;
      })
      .join('');
  }

  // ——— orarul unei stații (se deschide sub stație) ———
  async function toggleTimetable(line: Line, v: Variant, index: number) {
    const items = [...detailView.querySelectorAll<HTMLLIElement>('.stop')];
    const li = items[index];
    const box = li.querySelector<HTMLElement>('.tt')!;
    const btn = li.querySelector<HTMLButtonElement>('button')!;
    if (openStop !== null && openStop !== index) {
      items[openStop]?.querySelector<HTMLElement>('.tt')?.setAttribute('hidden', '');
      items[openStop]?.querySelector('button')?.setAttribute('aria-expanded', 'false');
    }
    if (!box.hidden) {
      box.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      openStop = null;
      return;
    }
    openStop = index;
    btn.setAttribute('aria-expanded', 'true');
    box.hidden = false;
    box.innerHTML = '<p class="tt-msg">Se încarcă orarul…</p>';
    const sch = await loadSchedule(line);
    if (openStop !== index) return;
    const entry = v.scheduleKey && sch ? sch.variants[v.scheduleKey]?.stops[index] : undefined;
    if (!sch || !entry) {
      box.innerHTML = '<p class="tt-msg">Operatorul nu publică orar pentru această stație.</p>';
      return;
    }
    renderTimetable(box, sch.dayTypes, entry, line);
    if (!reducedMotion()) animate(box, { opacity: [0, 1], transform: ['translateY(-4px)', 'translateY(0)'] }, { duration: DUR.base, ease: EASE_OUT });
    box.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  function renderTimetable(box: HTMLElement, dayTypes: string[], entry: { url: string; times: string[][] }, line: Line) {
    const today = dayTypeIndexFor(dayTypes);
    const k = dayChoice ?? today;
    const times = entry.times[k] ?? [];
    const now = nowMinutes();
    const next = k === today ? upcoming(times, 1, now)[0] : undefined;
    const rows = byHour(times)
      .map(([h, mins]) => `<tr><th scope="row">${h}</th><td>${mins
        .map((m) => {
          const t = `${h}:${m}`;
          const cls = k !== today ? '' : t === next ? 'next' : toMinutes(t) < now ? 'past' : '';
          return `<span class="${cls}">${m}</span>`;
        })
        .join('')}</td></tr>`)
      .join('');
    box.innerHTML = `
      <div class="tt-tabs" role="tablist">${dayTypes.map((d, i) => `<button role="tab" aria-selected="${i === k}" data-day="${i}"><span>${esc(shortDayLabel(d))}</span>${i === today ? '<small class="today">azi</small>' : ''}</button>`).join('')}</div>
      ${k === today ? `<p class="tt-next">${next ? `Următoarea plecare: <b>${next}</b> · ${inMinutes(next, now)}` : 'Nu mai sunt plecări azi.'}</p>` : ''}
      ${times.length ? `<table class="tt-grid" style="--c:${data.colourOf(line.id)}"><tbody>${rows}</tbody></table>` : '<p class="tt-msg">Fără plecări în acest tip de zi.</p>'}
      <p class="tt-foot">Programul de weekend se aplică și în sărbătorile legale. <a href="${esc(entry.url)}" target="_blank" rel="noopener">Orarul oficial ↗</a></p>`;
    box.querySelectorAll<HTMLButtonElement>('[data-day]').forEach((b) =>
      b.addEventListener('click', () => {
        dayChoice = Number(b.dataset.day);
        renderTimetable(box, dayTypes, entry, line);
      }),
    );
  }

  /** indicatorul segmentat alunecă sub tab-ul activ */
  function placeThumb(animated: boolean) {
    const seg = detailView.querySelector<HTMLElement>('.seg');
    if (!seg) return;
    const thumb = $('.seg-thumb', seg);
    const tabs = [...seg.querySelectorAll<HTMLButtonElement>('button')];
    const active = tabs.find((b) => b.getAttribute('aria-selected') === 'true') ?? tabs[0];
    if (!active || !active.offsetWidth) return;
    thumb.style.width = `${active.offsetWidth}px`;
    // offsetLeft ignoră transform-ul, deci diferența e mereu poziția corectă a tab-ului activ
    const x = `translateX(${active.offsetLeft - thumb.offsetLeft}px)`;
    if (animated && !reducedMotion()) animate(thumb, { transform: x }, SPRING);
    else thumb.style.transform = x;
  }
  // lățimea panoului se schimbă (rotire telefon, redimensionare): indicatorul se repoziționează
  new ResizeObserver(() => placeThumb(false)).observe(detailView);

  function animateStops() {
    if (reducedMotion()) return;
    const items = [...detailView.querySelectorAll('.stop')].slice(0, 18);
    animate(items, { opacity: [0, 1], transform: ['translateY(6px)', 'none'] }, { duration: DUR.base, delay: stagger(0.03, { startDelay: 0.12 }), ease: EASE_OUT });
  }

  // ——— tranziții între vederi ———
  const isMobile = () => matchMedia('(max-width: 767px)').matches;
  // desktop: glisare laterală (listă ← → detaliu); telefon: doar opacitate + 8 px vertical
  const shift = (dir: 1 | -1, px: number) => (isMobile() ? `translateY(${dir * 8}px)` : `translateX(${dir * px}px)`);
  const panelEl = $('#panel');

  async function showDetail(line: Line, variantId: string | null, fromList: boolean) {
    if (fromList && !reducedMotion()) {
      await animate(listView, { opacity: [1, 0], transform: ['none', shift(-1, 16)] }, { duration: DUR.fast, ease: EASE_IN }).finished;
    }
    listView.hidden = true;
    detailView.hidden = false;
    panelEl.classList.add('is-detail');
    renderDetail(line, variantId);
    detailView.scrollTop = 0;
    if (!reducedMotion()) animate(detailView, { opacity: [0, 1], transform: [shift(1, 20), 'none'] }, { duration: DUR.base, ease: EASE_OUT });
    animateStops();
    // focus mutat doar pentru tastatură/desktop; pe telefon ar afișa un contur fără rost
    if (!isMobile()) ($('.back', detailView) as HTMLButtonElement).focus({ preventScroll: true });
  }

  async function showList() {
    if (!reducedMotion()) await animate(detailView, { opacity: [1, 0], transform: ['none', shift(1, 20)] }, { duration: DUR.fast, ease: EASE_IN }).finished;
    detailView.hidden = true;
    listView.hidden = false;
    panelEl.classList.remove('is-detail');
    listView.style.opacity = '1';
    if (!reducedMotion()) animate(listView, { opacity: [0, 1], transform: [shift(-1, 16), 'none'] }, { duration: DUR.base, ease: EASE_OUT });
    const row = list.querySelector<HTMLButtonElement>(`[data-line="${CSS.escape(lastLine ?? '')}"]`);
    if (!isMobile()) row?.focus({ preventScroll: false });
    else row?.scrollIntoView({ block: 'nearest' });
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
      const seg2 = detailView.querySelector<HTMLElement>('.seg');
      const thumb = seg2?.querySelector<HTMLElement>('.seg-thumb');
      const prevBtn = seg2?.querySelectorAll<HTMLButtonElement>('button')[Math.max(0, prevIdx)];
      if (thumb && prevBtn) {
        thumb.style.transform = `translateX(${prevBtn.offsetLeft - thumb.offsetLeft}px)`;
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
