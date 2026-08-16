/* LUMINARY v2 — boot, navigation and the Pit Wall screen.

   Everything else on this page is v1's components: same ids, same data-action
   attributes, same delegated dispatcher from js/actions.js. That is deliberate.
   It means every function v1 has works here unchanged and stays covered by v1's
   72 tests, and this file only has to own what is genuinely new: the three
   destinations, and the live race screen.

   main.js (v1's boot) is NOT loaded. This is the boot sequence instead. */

const V2_BUILD = '2026-08-16.19';

const q = s => document.querySelector(s);
const qa = s => [...document.querySelectorAll(s)];
const pad2 = n => String(n).padStart(2, '0');

function fmtCountdown(ms) {
  if (ms == null || !isFinite(ms)) return '—';
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h > 0 ? h + ':' + pad2(m) + ':' + pad2(s) : m + ':' + pad2(s);
}
function drvLabel(name) {
  const d = (S.drivers || []).find(x => x.name === name);
  return d ? (d.handle || d.name) : (name || '');
}

/* ---------- navigation ---------- */
let V2_SCREEN = 'pit';
function v2Go(screen) {
  V2_SCREEN = screen;
  qa('.v2-screen').forEach(s => s.classList.toggle('on', s.id === 'screen-' + screen));
  qa('#v2-nav button').forEach(b => b.classList.toggle('on', b.dataset.v2 === screen));
  q('#v2-main').scrollTop = 0;
  // Each destination refreshes the v1 components it owns.
  try {
    if (screen === 'strategy') { renderSchedule(); loadSchMeta(); buildAvail(); }
    if (screen === 'team') {
      populateConfig(); buildCatalogLists(); renderDriverList();
      renderSettingsTable(); renderTNotes(); renderChecklists();
      renderGoals(); renderArchive(); checkPrereqs();
    }
  } catch (e) {}
  v2Render();
}

/* A region being typed into must never be rebuilt: on iOS that drops focus and
   closes the keyboard. v2 re-renders every second, so this matters here. */
function holdsFocus(sel) {
  const root = q(sel), a = document.activeElement;
  if (!root || !a || a === document.body) return false;
  return root.contains(a);
}
function openSheet(id) { q('#sheet-' + id).classList.add('on'); v2Render(); }
function closeSheets() { qa('.sheet').forEach(s => s.classList.remove('on')); }

/* ---------- PIT WALL ---------- */
function renderPitWall() {
  const now = Date.now();
  const stints = S.stints || [];
  const cur = stints.find(s => !s.done && s.startMs <= now && s.endMs > now);
  const next = stints.find(s => s.startMs > now);
  let rs = null; try { rs = raceStart(); } catch (e) {}
  const end = rs ? rs.getTime() + (parseFloat(S.config.dur) || 0) * 3600000 : null;

  const hero = q('#hero-time'), label = q('#hero-label'), sub = q('#hero-sub');
  hero.classList.remove('urgent', 'soon');

  if (cur) {
    const left = cur.endMs - now;
    label.textContent = 'Swap in';
    hero.textContent = fmtCountdown(left);
    // Colour IS the message: amber inside 15 minutes, red and pulsing inside 5.
    if (left < 5 * 60000) hero.classList.add('urgent');
    else if (left < 15 * 60000) hero.classList.add('soon');
    sub.textContent = (drvLabel(cur.driver) || 'Unassigned') + ' · stint #' + cur.num;
  } else if (next) {
    label.textContent = 'Starts in';
    hero.textContent = fmtCountdown(next.startMs - now);
    sub.textContent = (drvLabel(next.driver) || 'Needs a driver') + ' opens';
  } else if (end && now >= end && stints.length) {
    label.textContent = 'Race complete';
    hero.textContent = '✓';
    sub.textContent = stints.length + ' stints run';
  } else {
    label.textContent = 'No active stint';
    hero.textContent = '—';
    sub.textContent = stints.length ? 'Waiting for the green flag' : 'Set up an event to begin';
  }

  q('#race-cur').textContent = cur ? (drvLabel(cur.driver) || 'Unassigned') : '—';
  q('#race-cur-sub').textContent = cur ? ('Stint #' + cur.num) : '';
  q('#race-next').textContent = next ? (drvLabel(next.driver) || 'Needs driver') : '—';
  q('#race-next-sub').textContent = next ? ('Stint #' + next.num) : '';

  const positions = stints.filter(s => s.position);
  q('#race-pos').textContent = positions.length ? positions[positions.length - 1].position : '—';
  q('#race-left').textContent = end ? (now >= end ? 'Done' : fmtDurHM(end - now)) : '—';
  q('#race-stint').textContent = cur ? ('#' + cur.num + ' / ' + stints.length)
    : (stints.length ? '– / ' + stints.length : '—');

  let ig = '—';
  if (rs && S.config.ighr !== '' && S.config.ighr != null) {
    const mins = Math.floor((parseFloat(S.config.ighr) || 0) * 60
      + Math.max(0, now - rs.getTime()) / 60000) % 1440;
    ig = pad2(Math.floor(mins / 60)) + ':' + pad2(mins % 60);
  }
  q('#race-ig').textContent = ig;
}

/* ---------- STRATEGY: stints as cards ---------- */
function renderStintCards() {
  const now = Date.now();
  const list = q('#plan-list');
  if (!list || holdsFocus('#plan-list')) return;
  if (!S.stints || !S.stints.length) {
    list.innerHTML = '<div class="v2-card">No schedule yet. Set the event up on Team, then the schedule builds itself.</div>';
    return;
  }
  list.innerHTML = S.stints.map((s, i) => {
    const live = !s.done && s.startMs <= now && s.endMs > now;
    return '<div class="stint' + (live ? ' live' : '') + (s.done ? ' done' : '')
      + '" data-action="stint.note" data-i="' + i + '">'
      + '<div class="n">' + s.num + '</div>'
      + '<div><div class="who">' + (drvLabel(s.driver) || 'Needs driver') + '</div>'
      + '<div class="when">' + fmtGMT(new Date(s.startMs)) + ' → ' + fmtGMT(new Date(s.endMs))
      + (s.laps ? ' · ' + s.laps + ' laps' : '')
      + (s.position ? ' · ' + s.position : '')
      + (s.damage ? ' · ⚠' : '') + '</div></div>'
      + '<div class="go">›</div></div>';
  }).join('');
}

/* ---------- sheets ---------- */
function renderEntriesSheet() {
  if (holdsFocus('#sheet-entries')) return;
  const ids = Object.keys(S.entries || {});
  q('#v2-entries').innerHTML = ids.map(id => {
    const s = entrySummary(id);
    return '<div class="ecard' + (id === S.activeEntry ? ' on' : '') + '" data-v2act="entry-go" data-id="' + id + '">'
      + '<div class="nm"><b>' + s.name + '</b><span>'
      + ([s.car, s.track].filter(Boolean).join(' · ') || 'Not set up')
      + (s.driver ? ' · ' + s.driver : '') + (s.remaining ? ' · ' + s.remaining : '')
      + '</span></div>'
      + '<button class="ecard-del" data-v2act="entry-del" data-id="' + id + '">✕</button></div>';
  }).join('');
}

/* ---------- render ---------- */
function v2Render() {
  try {
    const logo = q('#v2-logo');
    const want = (S.team && S.team.logo) || '../assets/logo.svg';
    if (logo.getAttribute('src') !== want) logo.setAttribute('src', want);
    const dot = q('#v2-sync-dot');
    dot.className = 'dot' + (!LIVE_KEY ? '' : (_liveOpen ? ' ok' : ' warn'));

    if (V2_SCREEN === 'pit') { renderPitWall(); try { updateDash(); renderStatusLog(); } catch (e) {} }
    else if (V2_SCREEN === 'strategy') renderStintCards();

    try { renderCollapseSummaries(); } catch (e) {}
    if (q('#sheet-entries').classList.contains('on')) renderEntriesSheet();
  } catch (e) { /* never let a render error stop the clock */ }
}

/* v1's loadState() lives in main.js, which v2 does not load, so v2 needs its
   own. Same shape: read the saved state, fill in anything missing, then build
   the dropdowns and render every shared component once.

   Getting this wrong is expensive and quiet: the first version called
   loadState() anyway, which threw "not defined", aborted the rest of boot, and
   left the app with no clock interval and a splash screen that never lifted. */
function v2LoadState() {
  try {
    const raw = localStorage.getItem('lum4');
    if (raw) {
      const p = JSON.parse(raw);
      S = { ...S, ...p };
      if (!S.drivers || !S.drivers.length) S.drivers = [];
      if (!S.checks) S.checks = JSON.parse(JSON.stringify(DEFAULT_CHECKS));
      if (!S.settingCols) S.settingCols = JSON.parse(JSON.stringify(DC));
      if (!S.goals) S.goals = [];
      if (!S.tnotes) S.tnotes = [];
      if (!S.schMeta) S.schMeta = {};
      if (!S.raceLog) S.raceLog = [];
      if (!S.team) S.team = { name: '', logo: '' };
      if (!S.config.sim) S.config.sim = '';
    }
  } catch (e) {}
  ensureEntries();
  const step = fn => { try { fn(); } catch (e) {} };
  step(buildHourOpts); step(buildTimeDDs);
  step(populateConfig); step(buildCatalogLists);
  step(renderDriverList); step(renderSettingsTable); step(renderTNotes);
  step(renderChecklists); step(renderGoals); step(renderGoalsDash);
  step(buildAvail); step(renderSchedule); step(loadSchMeta);
  step(renderArchive); step(renderStatusLog);
  step(updateDash); step(checkPrereqs);
  step(applyCollapse); step(renderCollapseSummaries);
}

/* ---------- boot ---------- */
function v2Init() {
  /* v2's own navigation. Everything else on the page is handled by v1's
     delegated dispatcher, which initDelegation() below switches on. */
  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-v2]');
    if (nav) {
      const t = nav.dataset.v2;
      if (t === 'close') { closeSheets(); return; }
      if (t === 'entries') { openSheet('entries'); renderEntriesSheet(); return; }
      // 'team' is the bottom-nav SCREEN; the sync dialog is 'team-sync'.
      if (t === 'team-sync') { try { openTeamPanel(); } catch (err) {} return; }
      v2Go(t); return;
    }
    const a = e.target.closest('[data-v2act]');
    if (!a) return;
    const act = a.dataset.v2act;
    if (act === 'entry-go') { switchEntry(a.dataset.id); closeSheets(); v2Go(V2_SCREEN); }
    else if (act === 'entry-new') { addEntry(); renderEntriesSheet(); v2Render(); }
    else if (act === 'entry-del') { deleteEntry(a.dataset.id); renderEntriesSheet(); v2Render(); }
  });

  initDelegation();          // v1's dispatcher drives every shared component
  v2LoadState();
  try { liveInit(); } catch (e) {}
  const bs = el('build-stamp'); if (bs) bs.textContent = V2_BUILD;

  v2Go('pit');
  setInterval(v2Render, 1000);   // the clock is the product

  /* The fade is started from a double rAF so it never begins on a blocked main
     thread and drop its first frames. But rAF does NOT fire in a backgrounded
     or non-painting tab, and relying on it alone left the splash stuck at full
     opacity forever, i.e. an app that looks permanently broken. So there is a
     hard fallback that lifts it regardless. Smooth when it can be, gone either
     way. */
  let splashLifted = false;
  const liftSplash = () => {
    if (splashLifted) return;
    splashLifted = true;
    const sp = q('#v2-splash');
    if (!sp) return;
    sp.classList.add('gone');
    setTimeout(() => { if (sp.parentNode) sp.remove(); }, 850);
  };
  setTimeout(() => {
    requestAnimationFrame(() => requestAnimationFrame(liftSplash));
    setTimeout(liftSplash, 400);   // fires if rAF never does
  }, 1400);
}

v2Init();
