// Planificatorul de călătorie în panou: alegi stația de plecare, pe cea de sosire și ora,
// primești variantele (cea mai devreme sosire, cu cât mai puține schimbări) și etapele fiecăreia.
// Orele vin din orarul oficial; unde nu există curse, rămân variantele calculate fără orar.
import { animate, stagger } from 'motion';
import type { AppData } from '../data.ts';
import { isWeekend } from '../days.ts';
import { modeLabel, onLangChange, t } from '../i18n.ts';
import { buildTimetable, type Itinerary, type Network, plan, planTimed, type Place, type Timetable } from '../plan.ts';
import { dayTypeIndexFor, loadSchedule, nowMinutes, upcoming } from '../schedule.ts';
import { DUR, EASE_OUT, reducedMotion } from '../motion/tokens.ts';
import { getState, planFromHash, setState, subscribe, writeHash } from '../state.ts';
import { $, BACK_ICON, badge, esc } from './dom.ts';

export interface PlannerHooks {
  /** varianta afișată s-a schimbat (null = nimic de arătat pe hartă) */
  onItinerary: (it: Itinerary | null) => void;
  /** ambele capete sunt alese și există rezultate: pe telefon se lasă loc hărții */
  onResults: () => void;
}

type End = 'from' | 'to';
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const duration = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);

const WALK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="4.5" r="2"/><path d="M10 21l2-6 3 3v3M9.5 11.5 11 8l3 1 2 3 2.5 1M11 8l-2.5 1.5L7.5 13"/></svg>';
const SWAP_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v15M4.5 15.5 8 19l3.5-3.5M16 20V5M12.5 8.5 16 5l3.5 3.5"/></svg>';
const CLEAR_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';

let api: { setEnd: (which: End, placeId: string) => void } | null = null;
/** din popup-ul unei stații: „De aici” / „Până aici” */
export function planEnd(which: End, placeId: string) {
  api?.setEnd(which, placeId);
  setState({ plan: true });
}

export function initPlanner(data: AppData, net: Network, hooks: PlannerHooks) {
  const view = $('#view-plan');
  const ends: Record<End, Place | null> = { from: null, to: null };
  /** „acum” urmează ceasul; altfel ora și tipul zilei alese de mână */
  const when = { now: true, minutes: nowMinutes(), weekend: isWeekend(new Date()) };
  let options: Itinerary[] = [];
  let timed = false; // rezultatele au ore
  let loading = false;
  let selected = 0;
  let active: End | null = null; // câmpul cu sugestiile deschise
  let token = 0, searchToken = 0;

  const places = [...net.places.values()].filter((p) => p.name).sort((a, b) => a.name!.localeCompare(b.name!, 'ro'));
  const placeName = (id: string) => net.places.get(id)?.name ?? t('unnamedStop');

  // orarele tuturor liniilor (~120 KB comprimat), încărcate o singură dată, la prima căutare
  let schedules: Promise<Map<string, Awaited<ReturnType<typeof loadSchedule>>>> | null = null;
  const tables = new Map<boolean, Timetable>();
  async function timetable(weekend: boolean) {
    schedules ??= Promise.all(data.lines.map(async (l) => [l.id, await loadSchedule(l)] as const)).then((e) => new Map(e));
    const s = await schedules;
    if (!tables.has(weekend)) tables.set(weekend, buildTimetable(data.lines, s, weekend));
    return tables.get(weekend)!;
  }

  function render() {
    view.innerHTML = `
      <div class="detail-head plan-head">
        <button class="back" aria-label="${t('planBack')}">${BACK_ICON}</button>
        <div class="detail-title"><h2>${t('planTitle')}</h2></div>
      </div>
      <div class="plan-form">
        ${(['from', 'to'] as const).map((w) => `
          <div class="plan-field" data-end="${w}">
            <span class="plan-dot ${w}" aria-hidden="true"></span>
            <input type="text" autocomplete="off" spellcheck="false" enterkeyhint="search"
              aria-label="${w === 'from' ? t('planFrom') : t('planTo')}" placeholder="${w === 'from' ? t('planFromPh') : t('planToPh')}"
              role="combobox" aria-expanded="false" aria-controls="plan-suggest" value="${esc(ends[w]?.name ?? '')}" />
            <button class="plan-clear" data-clear="${w}" aria-label="${t('planClear')}"${ends[w] ? '' : ' hidden'}>${CLEAR_ICON}</button>
          </div>`).join('')}
        <button class="plan-swap" aria-label="${t('planSwap')}" title="${t('planSwap')}">${SWAP_ICON}</button>
        <ul class="plan-suggest" id="plan-suggest" role="listbox" hidden></ul>
      </div>
      <div class="plan-when">
        <span class="plan-when-label">${t('planLeave')}</span>
        <button class="chip" data-now aria-pressed="${when.now}">${t('planNow')}</button>
        <input class="plan-time" type="time" aria-label="${t('planTimeLabel')}" value="${hm(when.minutes)}" />
        <div class="plan-day" role="radiogroup" aria-label="${t('planDayLabel')}">
          <button class="chip" role="radio" data-weekend="0" aria-checked="${!when.weekend}">${t('weekdays')}</button>
          <button class="chip" role="radio" data-weekend="1" aria-checked="${when.weekend}">${t('weekend')}</button>
        </div>
      </div>
      <div class="plan-results" aria-live="polite"></div>`;

    $('.back', view).addEventListener('click', () => setState({ plan: false }));
    $('.plan-swap', view).addEventListener('click', () => {
      [ends.from, ends.to] = [ends.to, ends.from];
      syncInputs();
      search();
    });
    view.querySelectorAll<HTMLInputElement>('.plan-field input').forEach((input) => {
      const which = input.closest<HTMLElement>('.plan-field')!.dataset.end as End;
      input.addEventListener('focus', () => { input.select(); suggest(which, ''); });
      input.addEventListener('input', () => suggest(which, input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); view.querySelector<HTMLButtonElement>('.plan-suggest button')?.click(); }
        if (e.key === 'Escape') { e.stopPropagation(); closeSuggest(); input.blur(); }
        if (e.key === 'ArrowDown') { e.preventDefault(); view.querySelector<HTMLButtonElement>('.plan-suggest button')?.focus(); }
      });
    });
    view.querySelectorAll<HTMLButtonElement>('[data-clear]').forEach((b) =>
      b.addEventListener('click', () => {
        const which = b.dataset.clear as End;
        ends[which] = null;
        syncInputs();
        search();
        view.querySelector<HTMLInputElement>(`[data-end="${which}"] input`)!.focus();
      }),
    );
    const list = $('.plan-suggest', view);
    list.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-place]');
      if (!b || !active) return;
      pick(active, b.dataset.place!);
    });
    list.addEventListener('keydown', (e) => {
      const b = (e.target as HTMLElement).closest('li');
      if (e.key === 'ArrowDown') { e.preventDefault(); (b?.nextElementSibling?.querySelector('button') as HTMLButtonElement | null)?.focus(); }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = b?.previousElementSibling?.querySelector('button') as HTMLButtonElement | null;
        if (prev) prev.focus();
        else view.querySelector<HTMLInputElement>(`[data-end="${active}"] input`)?.focus();
      }
      if (e.key === 'Escape') { e.stopPropagation(); closeSuggest(); }
    });
    // clic în afara câmpurilor: sugestiile se închid
    view.addEventListener('pointerdown', (e) => {
      if (!(e.target as HTMLElement).closest('.plan-field, .plan-suggest')) closeSuggest();
    });

    // ——— ora și ziua ———
    $('[data-now]', view).addEventListener('click', () => {
      setWhen({ now: true, minutes: nowMinutes(), weekend: isWeekend(new Date()) });
      search();
    });
    $<HTMLInputElement>('.plan-time', view).addEventListener('change', (e) => {
      const v = (e.target as HTMLInputElement).value;
      if (!/^\d\d:\d\d$/.test(v)) return;
      setWhen({ ...when, now: false, minutes: Number(v.slice(0, 2)) * 60 + Number(v.slice(3)) });
      search();
    });
    view.querySelectorAll<HTMLButtonElement>('[data-weekend]').forEach((b) =>
      b.addEventListener('click', () => {
        const weekend = b.dataset.weekend === '1';
        if (weekend === when.weekend) return;
        setWhen({ ...when, now: false, weekend });
        search();
      }),
    );
    renderResults(false);
  }

  function setWhen(next: typeof when) {
    Object.assign(when, next);
    const root = view.querySelector('.plan-when');
    if (!root) return;
    $('[data-now]', root).setAttribute('aria-pressed', String(when.now));
    $<HTMLInputElement>('.plan-time', root).value = hm(when.minutes);
    root.querySelectorAll('[data-weekend]').forEach((b) => b.setAttribute('aria-checked', String((b as HTMLElement).dataset.weekend === (when.weekend ? '1' : '0'))));
  }

  function syncInputs() {
    for (const w of ['from', 'to'] as const) {
      const field = view.querySelector<HTMLElement>(`[data-end="${w}"]`);
      if (!field) continue;
      $<HTMLInputElement>('input', field).value = ends[w]?.name ?? '';
      $('[data-clear]', field).hidden = !ends[w];
    }
  }

  function suggest(which: End, query: string) {
    active = which;
    const list = $('.plan-suggest', view);
    const q = norm(query.trim());
    const other = ends[which === 'from' ? 'to' : 'from'];
    const hits = (q ? places.filter((p) => norm(p.name!).includes(q)) : places)
      .filter((p) => p !== other)
      .sort((a, b) => Number(norm(b.name!).startsWith(q)) - Number(norm(a.name!).startsWith(q)))
      .slice(0, q ? 8 : 60);
    list.innerHTML = hits.length
      ? hits.map((p) => `<li><button role="option" data-place="${esc(p.id)}"><span class="plan-sname">${esc(p.name!)}</span>
          <span class="plan-slines">${p.lineIds.slice(0, 5).map((id) => badge(data, data.lineById.get(id)!, 'sm')).join('')}${p.lineIds.length > 5 ? `<small>+${p.lineIds.length - 5}</small>` : ''}</span></button></li>`).join('')
      : `<li class="plan-empty">${t('planNoStation', { q: esc(query) })}</li>`;
    list.hidden = false;
    // lista stă imediat sub câmpul activ
    const field = view.querySelector<HTMLElement>(`[data-end="${which}"]`)!;
    list.style.top = `${field.offsetTop + field.offsetHeight + 4}px`;
    view.querySelectorAll('.plan-field input').forEach((i) => i.setAttribute('aria-expanded', String(i.closest<HTMLElement>('.plan-field')!.dataset.end === which)));
  }

  function closeSuggest() {
    const list = view.querySelector<HTMLElement>('.plan-suggest');
    if (list) list.hidden = true;
    view.querySelectorAll('.plan-field input').forEach((i) => i.setAttribute('aria-expanded', 'false'));
    active = null;
    syncInputs(); // textul scris fără să alegi o stație revine la stația aleasă
  }

  function pick(which: End, id: string) {
    ends[which] = net.places.get(id) ?? null;
    closeSuggest();
    const next = which === 'from' && !ends.to ? 'to' : null;
    if (next) view.querySelector<HTMLInputElement>(`[data-end="to"] input`)!.focus();
    else (document.activeElement as HTMLElement | null)?.blur();
    search();
  }

  async function search(depart?: number) {
    const my = ++searchToken;
    const { from, to } = ends;
    if (getState().plan) writeHash(from && to ? `de=${encodeURIComponent(from.id)}&la=${encodeURIComponent(to.id)}` : '');
    if (when.now && depart === undefined) setWhen({ now: true, minutes: nowMinutes(), weekend: isWeekend(new Date()) });
    options = [];
    selected = 0;
    timed = false;
    if (from && to && from !== to) {
      loading = true;
      renderResults(false);
      const tt = await timetable(when.weekend);
      if (my !== searchToken) return;
      options = planTimed(net, tt, from.id, to.id, depart ?? when.minutes);
      timed = options.length > 0;
      // fără curse (ex. noaptea): rămân variantele după ordinea stațiilor, marcate ca atare
      if (!timed) options = plan(net, from.id, to.id);
    }
    loading = false;
    renderResults(true);
    hooks.onItinerary(options[0] ?? null);
    if (options.length) hooks.onResults();
  }

  function chain(it: Itinerary) {
    if (!it.legs.some((l) => l.kind === 'ride')) return `<span class="plan-walk">${WALK_ICON}</span>`;
    return it.legs
      .map((l) => (l.kind === 'walk' ? `<span class="plan-walk">${WALK_ICON}</span>` : badge(data, data.lineById.get(l.lineId)!, 'sm')))
      .join('<span class="plan-sep" aria-hidden="true">›</span>');
  }

  function meta(it: Itinerary) {
    return [
      it.rides === 0 ? t('planWalkOnly') : it.rides === 1 ? t('planDirect') : it.rides === 2 ? t('planOneChange') : t('planChanges', { n: it.rides - 1 }),
      ...(it.stops ? [it.stops === 1 ? t('oneStop') : t('nStops', { n: it.stops })] : []),
      ...(it.walkM ? [t('planWalkM', { m: it.walkM })] : []),
    ].join(' · ');
  }

  const time = (m: number | undefined) => (m === undefined ? '' : `<time>${hm(m)}</time> `);

  function legs(it: Itinerary) {
    return `<ol class="plan-legs">${it.legs
      .map((l, i) => {
        if (l.kind === 'walk')
          return `<li class="leg walk"><span class="leg-icon">${WALK_ICON}</span><p>${time(l.start)}${t('planWalkTo', { m: l.meters })} <b>${esc(placeName(l.to))}</b></p></li>`;
        const line = data.lineById.get(l.lineId)!;
        const v = net.variants.get(l.variantId)!;
        const n = l.toIndex - l.fromIndex;
        // așteptarea la schimbare (după coborâre sau după drumul pe jos până la stație)
        const before = it.legs[i - 1];
        const ready = before?.kind === 'ride' ? before.arr : before?.kind === 'walk' && i > 1 ? before.end : undefined;
        const wait = l.dep !== undefined && ready !== undefined ? l.dep - ready : 0;
        return `<li class="leg ride" style="--c:${data.colourOf(line.id)}">
          ${wait > 0 ? `<p class="leg-wait">${t('planWait', { n: wait })}</p>` : ''}
          <button class="leg-line" data-line="${line.id}" data-variant="${v.id}">${badge(data, line, 'sm')}
            <span><b>${modeLabel(line.mode)} ${esc(line.ref)}</b>${v.to ? ` <span>${esc(t('towards', { to: v.to }))}</span>` : ''}</span></button>
          ${v.label ? `<p class="leg-label"><small class="pill">${esc(v.label)}</small></p>` : ''}
          <p>${time(l.dep)}${t('planBoard')} <b>${esc(v.stops[l.fromIndex].name ?? t('unnamedStop'))}</b></p>
          <p class="leg-count">${n === 1 ? t('oneStop') : t('nStops', { n })}</p>
          <p>${time(l.arr)}${t('planAlight')} <b>${esc(v.stops[l.toIndex].name ?? t('unnamedStop'))}</b></p>
          ${timed ? '' : `<p class="leg-next" data-next="${l.variantId}:${l.fromIndex}" hidden></p>`}
        </li>`;
      })
      .join('')}</ol>`;
  }

  function summary(it: Itinerary, i: number) {
    const best = i === 0 && options.length > 1 ? `<b>${t('planBest')}</b> · ` : '';
    if (!timed) return `<span class="plan-chain">${chain(it)}</span><span class="plan-meta">${best}${meta(it)}</span>`;
    return `<span class="plan-times"><b>${hm(it.depart!)} → ${hm(it.arrive!)}</b><span>${duration(it.arrive! - it.depart!)}</span></span>
      <span class="plan-chain">${chain(it)}</span><span class="plan-meta">${best}${meta(it)}</span>`;
  }

  function renderResults(animateIn: boolean) {
    const box = view.querySelector<HTMLElement>('.plan-results');
    if (!box) return;
    const { from, to } = ends;
    if (!from || !to) box.innerHTML = `<p class="plan-msg">${t('planHint')}</p>`;
    else if (from === to) box.innerHTML = `<p class="plan-msg">${t('planSame')}</p>`;
    else if (loading) box.innerHTML = `<p class="plan-msg">${t('planLoadingTimes')}</p>`;
    else if (!options.length) box.innerHTML = `<p class="plan-msg">${t('planNone')}</p>`;
    else {
      const head = timed ? '' : `<p class="plan-msg plan-warn">${t('planNoTrips', { time: hm(when.minutes), day: when.weekend ? t('weekend') : t('weekdays') })}</p>`;
      box.innerHTML = head + options
        .map((it, i) => `<section class="plan-opt" aria-label="${t('planOption', { n: i + 1 })}"${i === selected ? ' data-open' : ''}>
          <button class="plan-sum" data-opt="${i}" aria-expanded="${i === selected}">${summary(it, i)}</button>
          ${i === selected ? legs(it) : ''}
        </section>`)
        .join('')
        + (timed ? `<button class="plan-later">${t('planLater')}</button>` : '')
        + `<p class="plan-note">${timed ? t('planTimedNote') : t('planNote')}</p>`;
      box.querySelectorAll<HTMLButtonElement>('[data-opt]').forEach((b) =>
        b.addEventListener('click', () => {
          const i = Number(b.dataset.opt);
          if (i === selected) return;
          selected = i;
          renderResults(false);
          hooks.onItinerary(options[i]);
        }),
      );
      box.querySelectorAll<HTMLButtonElement>('.leg-line').forEach((b) =>
        b.addEventListener('click', () => setState({ lineId: b.dataset.line!, variantId: b.dataset.variant! })),
      );
      // următoarea cursă: imediat după plecarea celei mai devreme variante
      box.querySelector('.plan-later')?.addEventListener('click', () => {
        const first = Math.min(...options.map((it) => it.legs.find((l) => l.kind === 'ride')?.dep ?? it.depart!));
        setWhen({ ...when, now: false, minutes: first + 1 });
        search(first + 1);
      });
      if (!timed) nextDepartures(box);
      if (animateIn && !reducedMotion())
        animate([...box.querySelectorAll('.plan-opt')], { opacity: [0, 1], transform: ['translateY(6px)', 'none'] }, { duration: DUR.base, delay: stagger(0.04), ease: EASE_OUT });
    }
  }

  /** fără orar pe traseu: măcar următoarele plecări din stația de urcare a primei curse */
  async function nextDepartures(box: HTMLElement) {
    const my = ++token;
    const el = box.querySelector<HTMLElement>('[data-next]');
    if (!el) return;
    const [variantId, index] = el.dataset.next!.split(/:(?=\d+$)/);
    const v = net.variants.get(variantId)!;
    const sch = await loadSchedule(data.lineById.get(v.lineId)!);
    if (my !== token || !sch || !v.scheduleKey) return;
    const times = sch.variants[v.scheduleKey]?.stops[Number(index)]?.times[dayTypeIndexFor(sch.dayTypes)] ?? [];
    const next = upcoming(times, 3);
    if (!next.length) return;
    el.innerHTML = `${t('planNext')} <b>${next.join(' · ')}</b>`;
    el.hidden = false;
  }

  api = {
    setEnd(which, id) {
      const p = net.places.get(id);
      if (!p) return;
      ends[which] = p;
      if (ends.from === ends.to) ends[which === 'from' ? 'to' : 'from'] = null;
      syncInputs();
      search();
    },
  };

  subscribe((s, prev) => {
    if (s.plan === prev.plan) return;
    if (s.plan) {
      search();
      if (!ends.from) requestAnimationFrame(() => view.querySelector<HTMLInputElement>('[data-end="from"] input')?.focus({ preventScroll: true }));
    } else {
      closeSuggest();
      hooks.onItinerary(null);
    }
  });
  onLangChange(() => {
    render();
    if (getState().plan) hooks.onItinerary(options[selected] ?? null);
  });

  // link partajat: #de=…&la=…
  const h = planFromHash();
  if (h.from && net.places.has(h.from)) ends.from = net.places.get(h.from)!;
  if (h.to && net.places.has(h.to)) ends.to = net.places.get(h.to)!;
  render();
  return { openFromHash: !!(h.from || h.to) };
}
