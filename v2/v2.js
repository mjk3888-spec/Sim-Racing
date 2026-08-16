/* LUMINARY v2 — boot and render layer.

   This is a SHELL, not a fork. It loads the same engine as v1 (state, schedule
   building, sync, entries) and the same Cloudflare backend, so both versions
   read and write the same team and you can run them side by side on two devices
   and watch them agree. The only thing v2 replaces is how it is presented.

   v1's render functions are still loaded and all guard on missing elements, so
   they no-op harmlessly here. v1's boot file (main.js) is deliberately NOT
   loaded, because this file is the boot sequence instead. */

const V2_BUILD = '2026-08-16.14';

/* ---------- helpers ---------- */
const q = s => document.querySelector(s);
const qa = s => [...document.querySelectorAll(s)];
const pad2 = n => String(n).padStart(2, '0');

function fmtCountdown(ms) {
  if (ms == null || !isFinite(ms)) return '—';
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  if (h > 0) return h + ':' + pad2(m) + ':' + pad2(s);
  return m + ':' + pad2(s);
}
function drvOf(name) { return (S.drivers || []).find(d => d.name === name); }
function drvLabel(name) { const d = drvOf(name); return d ? (d.handle || d.name) : (name || ''); }

/* ---------- navigation ---------- */
let V2_SCREEN = 'race';
function v2Go(screen) {
  V2_SCREEN = screen;
  qa('.v2-screen').forEach(s => s.classList.toggle('on', s.id === 'screen-' + screen));
  qa('#v2-nav button').forEach(b => b.classList.toggle('on', b.dataset.v2 === screen));
  v2Render();
}
function openSheet(id) { q('#sheet-' + id).classList.add('on'); v2Render(); }
function closeSheets() { qa('.sheet').forEach(s => s.classList.remove('on')); }

/* ---------- RACE ---------- */
function renderRace() {
  const now = Date.now();
  const stints = S.stints || [];
  const cur = stints.find(s => !s.done && s.startMs <= now && s.endMs > now);
  const next = stints.find(s => s.startMs > now);
  const rs = (typeof raceStart === 'function') ? raceStart() : null;
  const end = rs ? rs.getTime() + (parseFloat(S.config.dur) || 0) * 3600000 : null;

  const hero = q('#hero-time'), label = q('#hero-label'), sub = q('#hero-sub');
  hero.classList.remove('urgent', 'soon');

  if (cur) {
    const left = cur.endMs - now;
    label.textContent = 'Swap in';
    hero.textContent = fmtCountdown(left);
    // Colour is the message: red under 5 minutes, amber under 15.
    if (left < 5 * 60000) hero.classList.add('urgent');
    else if (left < 15 * 60000) hero.classList.add('soon');
    sub.textContent = drvLabel(cur.driver) || 'Unassigned' + ' · stint #' + cur.num;
    sub.textContent = (drvLabel(cur.driver) || 'Unassigned') + ' · stint #' + cur.num;
  } else if (next) {
    label.textContent = 'Race starts in';
    hero.textContent = fmtCountdown(next.startMs - now);
    sub.textContent = (drvLabel(next.driver) || 'Needs a driver') + ' opens';
  } else if (end && now >= end) {
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
    const elapsed = Math.max(0, now - rs.getTime());
    const th = parseFloat(S.config.ighr) || 0;
    const mins = Math.floor(th * 60 + elapsed / 60000) % 1440;
    ig = pad2(Math.floor(mins / 60)) + ':' + pad2(mins % 60);
  }
  q('#race-ig').textContent = ig;

  /* Quick Log is three big buttons you hit fast with one hand, so mis-taps are
     going to happen. Every entry therefore carries its own delete. */
  const feed = q('#race-feed');
  const rows = (S.raceLog || []).slice(-8).reverse().map(l =>
    '<div class="feed-row"><span class="t">' + fmtGMT(new Date(l.ts)) + '</span>'
    + '<span class="fx">' + l.label + (l.driver ? ' · ' + l.driver : '') + '</span>'
    + '<button class="feed-del" data-v2act="unlog" data-id="' + l.id + '" title="Remove">✕</button></div>').join('');
  feed.innerHTML = rows || '<div class="feed-row"><span class="t">—</span><span class="fx">Nothing logged yet</span></div>';
}

/* ---------- PLAN ---------- */
function renderPlan() {
  const now = Date.now();
  const list = q('#plan-list');
  if (!S.stints || !S.stints.length) {
    list.innerHTML = '<div class="panel">No schedule yet. Fill in the event on the Team screen, then Build schedule.</div>';
  } else {
    list.innerHTML = S.stints.map((s, i) => {
      const live = !s.done && s.startMs <= now && s.endMs > now;
      const d = drvOf(s.driver);
      return '<div class="stint' + (live ? ' live' : '') + (s.done ? ' done' : '') + '" data-v2act="stint" data-i="' + i + '">'
        + '<div class="n">' + s.num + '</div>'
        + '<div><div class="who">' + (drvLabel(s.driver) || 'Needs driver') + '</div>'
        + '<div class="when">' + fmtGMT(new Date(s.startMs)) + ' → ' + fmtGMT(new Date(s.endMs))
        + (s.position ? ' · ' + s.position : '') + '</div></div>'
        + '<div class="go">›</div></div>';
    }).join('');
  }
  renderV2Fuel();
}

function renderV2Fuel() {
  const f = parseFloat(q('#v2-fc-fuel').value);
  const b = parseFloat(q('#v2-fc-burn').value);
  const lap = parseLap(q('#v2-fc-lap').value);
  const out = q('#v2-fc-out');
  if (!(f > 0 && b > 0 && lap > 0)) { out.textContent = 'Enter all three.'; return; }
  const laps = Math.floor(f / b);
  out.innerHTML = '<b>' + laps + '</b> laps left on this fuel<br>'
    + 'about <b>' + fmtDur(laps * lap) + '</b> of running<br>'
    + 'to go 10 more laps you need <b>' + (10 * b).toFixed(1) + 'L</b>';
}

/* ---------- TEAM ---------- */
function renderTeam() {
  q('#team-drivers').innerHTML = (S.drivers || []).map(d =>
    '<div class="drv"><div class="swatch" style="background:' + (d.color || '#888') + '"></div>'
    + '<div class="nm"><b>' + (d.handle || d.name) + '</b><span>' + (d.tzabbr || d.tz || '') + '</span></div>'
    + '<div class="pace">' + (d.lap || '—') + '</div></div>').join('')
    || '<div class="panel">No drivers yet. Load the sample event to see how it works.</div>';

  const c = S.config || {};
  const setIf = (sel, v) => { const e = q(sel); if (e && document.activeElement !== e) e.value = v == null ? '' : v; };
  setIf('#v2-name', c.name); setIf('#v2-track', c.track); setIf('#v2-car', c.car);
  setIf('#v2-date', c.date); setIf('#v2-hour', c.hour === '' ? '' : Math.floor(parseFloat(c.hour) || 0));
  setIf('#v2-dur', c.dur);

  const cats = { pre: 'Pre-race', swap: 'Driver change', post: 'Post-race' };
  q('#team-checks').innerHTML = Object.keys(cats).map(cat =>
    (S.checks[cat] || []).map((it, i) =>
      '<div class="chk' + (it.done ? ' on' : '') + '" data-v2act="check" data-cat="' + cat + '" data-i="' + i + '">'
      + '<div class="box"></div><div class="txt">' + cats[cat] + ' · ' + it.text + '</div></div>').join('')
  ).join('') || '<div class="panel">No checklist items.</div>';

  const st = q('#v2-sync-state');
  const nm = (S.team && S.team.name) || '';
  st.innerHTML = LIVE_KEY
    ? (_liveOpen ? '<b>Synced</b>' : 'Connecting…') + (nm ? ' · ' + nm : '')
      + '<br><span style="color:var(--tx3)">Changes here reach your other devices.</span>'
    : 'Not connected. This device is on its own.';
  q('#v2-build').textContent = V2_BUILD;
}

/* ---------- sheets ---------- */
function renderEntriesSheet() {
  const ids = Object.keys(S.entries || {});
  q('#v2-entries').innerHTML = ids.map(id => {
    const s = entrySummary(id);
    return '<div class="ecard' + (id === S.activeEntry ? ' on' : '') + '" data-v2act="entry-go" data-id="' + id + '">'
      + '<div class="nm"><b>' + s.name + '</b><span>'
      + ([s.car, s.track].filter(Boolean).join(' · ') || 'Not set up')
      + (s.driver ? ' · ' + s.driver : '') + (s.remaining ? ' · ' + s.remaining : '')
      + '</span></div></div>';
  }).join('');
}

function renderTeamSheet() {
  const body = q('#v2-team-body');
  if (LIVE_KEY) {
    body.innerHTML = '<div class="panel"><div class="sync-state">'
      + (_liveOpen ? '<b>Synced</b>' : 'Connecting…')
      + '<br><span style="color:var(--tx3);word-break:break-all">Key: ' + LIVE_KEY + '</span></div>'
      + '<button class="wide" data-v2act="invite">Copy invite link</button>'
      + '<button class="wide ghost" data-v2act="leave">Leave team</button></div>';
  } else {
    body.innerHTML = '<div class="panel">'
      + '<label>Team name<input id="v2-tn" placeholder="Wildthings Racing"></label>'
      + '<label style="margin-top:12px">Team password<input type="password" id="v2-tp" placeholder="something your team knows"></label>'
      + '<button class="wide" data-v2act="join">Connect</button>'
      + '<div style="margin-top:12px;font-size:var(--f1);color:var(--tx3)">Everyone on the team uses the same two. Or tap an invite link.</div></div>';
  }
}

let V2_STINT = -1;
function openStint(i) {
  V2_STINT = i;
  const s = S.stints[i];
  if (!s) return;
  q('#v2-stint-num').textContent = '#' + s.num;
  q('#v2-stint-driver').innerHTML = '<option value="">— Needs driver —</option>'
    + (S.drivers || []).map(d => '<option value="' + d.name + '"' + (s.driver === d.name ? ' selected' : '') + '>' + (d.handle || d.name) + '</option>').join('');
  q('#v2-stint-end').value = s.actualEnd || '';
  q('#v2-stint-laps').value = s.actualLaps || '';
  q('#v2-stint-pos').value = s.position || '';
  q('#v2-stint-notes').value = s.notes || '';
  openSheet('stint');
}
function saveStint(markDone) {
  const s = S.stints[V2_STINT];
  if (!s) return;
  s.driver = q('#v2-stint-driver').value;
  const ae = q('#v2-stint-end').value.trim();
  const prev = s.actualEnd;
  s.actualEnd = ae;
  s.actualLaps = q('#v2-stint-laps').value;
  const rawPos = q('#v2-stint-pos').value.trim();
  const pn = parseInt(rawPos);
  s.position = rawPos ? (isNaN(pn) ? rawPos : ordinal(pn)) : '';
  s.notes = q('#v2-stint-notes').value;
  if (markDone) s.done = true;
  if (ae && ae !== prev) { try { cascade(V2_STINT, ae); } catch (e) {} }
  persist();
  closeSheets();
  v2Render();
}

/* ---------- render ---------- */
function v2Render() {
  try {
    q('#v2-entry-name').textContent = (S.config && S.config.name) || 'No Event';
    const dot = q('#v2-sync-dot');
    dot.className = 'dot' + (!LIVE_KEY ? '' : (_liveOpen ? ' ok' : ' warn'));
    const logo = q('#v2-logo');
    const want = (S.team && S.team.logo) || '../assets/logo.svg';
    if (logo.getAttribute('src') !== want) logo.setAttribute('src', want);

    if (V2_SCREEN === 'race') renderRace();
    else if (V2_SCREEN === 'plan') renderPlan();
    else renderTeam();

    if (q('#sheet-entries').classList.contains('on')) renderEntriesSheet();
    if (q('#sheet-team').classList.contains('on')) renderTeamSheet();
  } catch (e) { /* never let a render error stop the clock */ }
}

/* ---------- one delegated listener, same lesson as v1 ---------- */
function v2Init() {
  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-v2]');
    if (nav) {
      const t = nav.dataset.v2;
      if (t === 'close') { closeSheets(); return; }
      if (t === 'entries') { openSheet('entries'); renderEntriesSheet(); return; }
      if (t === 'team' || t === 'team-setup') { openSheet('team'); renderTeamSheet(); return; }
      v2Go(t); return;
    }
    const a = e.target.closest('[data-v2act]');
    if (!a) return;
    const act = a.dataset.v2act;
    if (act === 'log') { quickLog(a.dataset.type); v2Render(); }
    else if (act === 'unlog') { delLogEntry(+a.dataset.id); v2Render(); }
    else if (act === 'stint') openStint(+a.dataset.i);
    else if (act === 'stint-save') saveStint(false);
    else if (act === 'stint-done') saveStint(true);
    else if (act === 'check') { toggleCL(a.dataset.cat, +a.dataset.i); v2Render(); }
    else if (act === 'build') { buildStints(); v2Go('plan'); }
    else if (act === 'demo') { loadDemoEvent(); v2Go('race'); }
    else if (act === 'entry-go') { switchEntry(a.dataset.id); closeSheets(); v2Render(); }
    else if (act === 'entry-new') { addEntry(); renderEntriesSheet(); v2Render(); }
    else if (act === 'invite') liveCopyInvite();
    else if (act === 'leave') { liveDisconnect(); renderTeamSheet(); v2Render(); }
    else if (act === 'join') {
      const n = q('#v2-tn'), p = q('#v2-tp');
      const hn = el('team-name-input'), hp = el('team-pass-input');
      // liveJoinByNamePassword reads v1's field ids, so mirror into them.
      if (!hn) { const i = document.createElement('input'); i.id = 'team-name-input'; i.style.display = 'none'; document.body.appendChild(i); }
      if (!hp) { const i = document.createElement('input'); i.id = 'team-pass-input'; i.style.display = 'none'; document.body.appendChild(i); }
      el('team-name-input').value = n ? n.value : '';
      el('team-pass-input').value = p ? p.value : '';
      liveJoinByNamePassword().then(() => { renderTeamSheet(); v2Render(); });
    }
  });

  document.addEventListener('input', e => {
    const a = e.target.closest('[data-v2act]');
    if (!a) return;
    if (a.dataset.v2act === 'fuel') renderV2Fuel();
    else if (a.dataset.v2act === 'cfg') {
      const k = a.dataset.k;
      S.config[k] = (k === 'hour' || k === 'dur') ? parseFloat(a.value) || 0 : a.value;
      persist();
    }
  });

  ensureEntries();
  try { liveInit(); } catch (e) {}
  v2Go('race');

  // The clock is the product, so it ticks every second rather than every five.
  setInterval(v2Render, 1000);

  setTimeout(() => {
    const sp = q('#v2-splash');
    if (!sp) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      sp.classList.add('gone');
      setTimeout(() => sp.remove(), 850);
    }));
  }, 1400);
}

/* Load v1's saved state, then boot. */
try {
  const raw = localStorage.getItem('lum4');
  if (raw) {
    const p = JSON.parse(raw);
    S = { ...S, ...p };
    if (!S.checks) S.checks = JSON.parse(JSON.stringify(DEFAULT_CHECKS));
    if (!S.team) S.team = { name: '', logo: '' };
    if (!S.raceLog) S.raceLog = [];
  }
} catch (e) {}
v2Init();
