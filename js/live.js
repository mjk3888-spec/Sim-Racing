/* LUMINARY ENDURANCE MANAGER
   Live sync client. Talks to the Cloudflare Durable Object in worker/index.js.

   WHAT THIS REPLACES
   js/sync.js is a BROADCAST: one strategist writes whole state, everyone else
   polls every 15 seconds and overwrites what they have. That is unsafe for the
   way Michael actually races, switching between phone and PC, because a device
   holding stale data pushes ALL of it and destroys newer work. That client is
   left in place, unused, until this one has been through a real event.

   HOW THIS DIFFERS
   Changes are sent as individual FIELD patches with a timestamp. The server
   resolves last-write-wins per field and REJECTS a stale write rather than
   applying it. Two devices editing different things both keep their change.

   PATH SCHEME — note the entry namespace
     e/<entryId>/config/<key>          e/<entryId>/avail/<slotKey>
     e/<entryId>/stint/<num>/<field>   e/<entryId>/checks/<category>
     e/<entryId>/drivers               e/<entryId>/goals ... etc
   Everything is namespaced under an entry id even though there is exactly one
   entry today. That is deliberate: Phase 2 adds real multi-car entries, and
   this way that lands as ADDITIVE work instead of a breaking change to every
   path already stored on the server.

   ONLY USER-ENTERED STINT FIELDS ARE SYNCED. Start times, durations, laps and
   fuel are derived from config, so each device recomputes them with
   buildStints(). Syncing derived data would be a lot of traffic and a lot of
   ways to disagree.

   These are CLASSIC scripts, not ES modules: top-level declarations stay in the
   shared global scope, where the delegated dispatcher in js/actions.js resolves
   them by name. No inline on*= handlers remain in the markup (Step 5).
   LOAD ORDER MATTERS - js/main.js must be last. */

const LIVE_HTTP = 'https://luminary-sync.mjk3888.workers.dev';
const LIVE_WS = 'wss://luminary-sync.mjk3888.workers.dev';
const LIVE_ENTRY = 'default';           // Phase 2 turns this into a real entry id
const LIVE_KEY_STORE = 'lum_live_key';
const LIVE_NAME_STORE = 'lum_live_name';

const STINT_SYNCED_FIELDS = ['driver', 'stintType', 'actualEnd', 'actualLaps',
                             'notes', 'done', 'damage', 'damageTime', 'position'];

let LIVE_KEY = '';
let _liveWs = null;
let _liveOpen = false;
let _liveClientId = Math.random().toString(36).slice(2, 10);
/* Guard against the obvious infinite loop: applying a remote patch mutates S,
   which calls persist(), which would otherwise send the same change back out. */
let _liveApplying = false;
let _liveSnapshot = {};                 // path -> JSON string, what the server has
let _liveQueue = new Map();             // path -> {value, ts}, pending while offline
let _liveRetry = 0;
let _liveRetryTimer = null;
let _liveRenderTimer = null;
let _livePeers = [];
let _liveSeeded = false;

/* ---------- flattening S into syncable paths ---------- */

function livePaths() {
  const p = {};
  const E = 'e/' + LIVE_ENTRY + '/';
  const c = S.config || {};
  Object.keys(c).forEach(k => { p[E + 'config/' + k] = c[k]; });
  p[E + 'drivers'] = S.drivers;
  p[E + 'settingCols'] = S.settingCols;
  p[E + 'goals'] = S.goals;
  p[E + 'tnotes'] = S.tnotes;
  p[E + 'raceLog'] = S.raceLog;
  Object.keys(S.checks || {}).forEach(k => { p[E + 'checks/' + k] = S.checks[k]; });
  Object.keys(S.schMeta || {}).forEach(k => { p[E + 'schMeta/' + k] = S.schMeta[k]; });
  Object.keys(S.avail || {}).forEach(k => { p[E + 'avail/' + k] = S.avail[k]; });
  (S.stints || []).forEach(s => {
    STINT_SYNCED_FIELDS.forEach(f => { p[E + 'stint/' + s.num + '/' + f] = s[f]; });
  });
  return p;
}

/* Applies one server field onto S. Returns 'config' when the change affects the
   schedule shape, so the caller knows to rebuild stints. */
function liveApplyPath(path, value) {
  const E = 'e/' + LIVE_ENTRY + '/';
  if (path.indexOf(E) !== 0) return null;     // another entry, not ours yet
  const rest = path.slice(E.length);
  const bits = rest.split('/');

  if (bits[0] === 'config' && bits[1]) { S.config[bits[1]] = value; return 'config'; }
  if (bits[0] === 'drivers') { S.drivers = value || []; return 'drivers'; }
  if (bits[0] === 'settingCols') { S.settingCols = value || []; return 'drivers'; }
  if (bits[0] === 'goals') { S.goals = value || []; return 'goals'; }
  if (bits[0] === 'tnotes') { S.tnotes = value || []; return 'tnotes'; }
  if (bits[0] === 'raceLog') { S.raceLog = value || []; return 'log'; }
  if (bits[0] === 'checks' && bits[1]) { S.checks[bits[1]] = value || []; return 'goals'; }
  if (bits[0] === 'schMeta' && bits[1]) { if (!S.schMeta) S.schMeta = {}; S.schMeta[bits[1]] = value; return 'log'; }
  if (bits[0] === 'avail' && bits[1]) { S.avail[bits.slice(1).join('/')] = value; return 'avail'; }
  if (bits[0] === 'stint' && bits[1] && bits[2]) {
    const num = parseInt(bits[1], 10);
    const st = (S.stints || []).find(x => x.num === num);
    // A stint we do not have yet arrives before the config that creates it.
    // Dropping it is safe: buildStints() runs after config lands, and the
    // sender's value is still on the server for the next snapshot.
    if (st && STINT_SYNCED_FIELDS.indexOf(bits[2]) >= 0) { st[bits[2]] = value; return 'stint'; }
    return null;
  }
  return null;
}

/* ---------- sending ---------- */

function liveSend(obj) {
  if (!_liveOpen || !_liveWs) return false;
  try { _liveWs.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
}

/* Called from persist() on every local change. Diffs against what the server is
   known to have and sends only what actually moved. */
function liveOnLocalChange() {
  if (!LIVE_KEY || _liveApplying) return;
  const now = livePaths();
  const ts = Date.now();
  let sent = 0;
  for (const path of Object.keys(now)) {
    const enc = JSON.stringify(now[path] === undefined ? null : now[path]);
    if (_liveSnapshot[path] === enc) continue;
    _liveSnapshot[path] = enc;
    const value = now[path] === undefined ? null : now[path];
    if (!liveSend({ type: 'patch', path, value, ts, clientId: _liveClientId })) {
      _liveQueue.set(path, { value, ts });      // offline: keep only the latest
    }
    sent++;
  }
  if (sent && _liveQueue.size) liveSetStatus('pending', _liveQueue.size + ' change(s) queued');
}

function liveFlushQueue() {
  if (!_liveQueue.size) return;
  const n = _liveQueue.size;
  for (const [path, rec] of _liveQueue) {
    liveSend({ type: 'patch', path, value: rec.value, ts: rec.ts, clientId: _liveClientId });
  }
  _liveQueue.clear();
  liveLog('flushed ' + n + ' queued change(s)');
}

/* ---------- receiving ---------- */

function liveScheduleRender(kinds) {
  clearTimeout(_liveRenderTimer);
  _liveRenderTimer = setTimeout(() => {
    _liveApplying = true;
    try {
      // A config change alters the schedule shape, so rebuild it. buildStints()
      // preserves per-stint user data and is deterministic given the same
      // config, which is what makes both devices converge on identical times.
      if (kinds.has('config')) { try { buildStints(); } catch (e) {} }
      try { populateConfig(); buildCatalogLists(); } catch (e) {}
      try { renderDriverList(); renderSettingsTable(); renderTNotes(); } catch (e) {}
      try { renderChecklists(); renderGoals(); renderGoalsDash(); } catch (e) {}
      try { renderSchedule(); buildAvail(); loadSchMeta(); } catch (e) {}
      try { renderStatusLog(); checkPrereqs(); updateDash(); } catch (e) {}
      _lp();
    } finally { _liveApplying = false; }
    kinds.clear();
  }, 120);
}

const _liveKinds = new Set();

function liveApplySnapshot(state) {
  const local = livePaths();
  const serverPaths = Object.keys(state || {});

  if (!serverPaths.length) {
    // Empty team: this device seeds it. Send everything we have.
    liveLog('team is empty, seeding it from this device');
    _liveSnapshot = {};
    _liveSeeded = true;
    liveOnLocalChange();
    liveSetStatus('ok', 'Synced (seeded)');
    return;
  }

  _liveApplying = true;
  try {
    for (const path of serverPaths) {
      const kind = liveApplyPath(path, state[path]);
      if (kind) _liveKinds.add(kind);
      _liveSnapshot[path] = JSON.stringify(state[path] === undefined ? null : state[path]);
    }
  } finally { _liveApplying = false; }

  liveScheduleRender(_liveKinds);

  // Contribute anything the server has never seen, without overwriting what it has.
  const ts = Date.now();
  let extra = 0;
  for (const path of Object.keys(local)) {
    if (Object.prototype.hasOwnProperty.call(state, path)) continue;
    const value = local[path] === undefined ? null : local[path];
    _liveSnapshot[path] = JSON.stringify(value);
    liveSend({ type: 'patch', path, value, ts, clientId: _liveClientId });
    extra++;
  }
  liveLog('snapshot applied: ' + serverPaths.length + ' field(s) in, ' + extra + ' sent up');
  liveSetStatus('ok', 'Synced');
}

/* ---------- connection ---------- */

function liveConnect() {
  const inp = el('live-key-input');
  const key = ((inp ? inp.value : LIVE_KEY) || '').trim().toLowerCase();
  if (!key) { alert('Enter a team key, or tap New Team.'); return; }

  // Joining a team that already has an event will pull that event onto this
  // device. Say so before doing it rather than after.
  if (key !== LIVE_KEY && S.config && S.config.name && !confirm(
      'Join team ' + key + '?\n\n' +
      'If that team already has an event, it will REPLACE "' + S.config.name +
      '" on this device.\n\nArchived events are kept.')) return;

  LIVE_KEY = key;
  localStorage.setItem(LIVE_KEY_STORE, LIVE_KEY);
  liveRenderPanel();
  liveOpenSocket();
}

function liveOpenSocket() {
  if (!LIVE_KEY) return;
  clearTimeout(_liveRetryTimer);
  if (_liveWs) { try { _liveWs.close(); } catch (e) {} _liveWs = null; }

  _liveSnapshot = {};
  liveSetStatus('connecting', 'Connecting...');
  const name = encodeURIComponent(liveDeviceName());
  const url = LIVE_WS + '/team/' + encodeURIComponent(LIVE_KEY) + '/ws' +
              '?clientId=' + _liveClientId + '&name=' + name;

  let ws;
  try { ws = new WebSocket(url); } catch (e) { liveSetStatus('error', 'Cannot connect'); return; }
  _liveWs = ws;

  ws.onopen = () => {
    _liveOpen = true; _liveRetry = 0;
    liveSetStatus('ok', 'Connected');
    liveLog('connected as ' + liveDeviceName());
    liveFlushQueue();
  };

  ws.onclose = () => {
    _liveOpen = false;
    _livePeers = [];
    liveRenderPeers();
    if (!LIVE_KEY) { liveSetStatus('off', 'Offline'); return; }
    _liveRetry = Math.min(_liveRetry + 1, 6);
    const delay = 500 * Math.pow(2, _liveRetry);
    liveSetStatus('error', 'Reconnecting...');
    _liveRetryTimer = setTimeout(liveOpenSocket, delay);
  };

  ws.onerror = () => { liveLog('socket error'); };

  ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (m.type === 'snapshot') { liveApplySnapshot(m.state || {}); return; }
    if (m.type === 'patch') {
      if (m.clientId === _liveClientId) return;         // our own echo
      _liveApplying = true;
      try {
        const kind = liveApplyPath(m.path, m.value);
        _liveSnapshot[m.path] = JSON.stringify(m.value === undefined ? null : m.value);
        if (kind) _liveKinds.add(kind);
      } finally { _liveApplying = false; }
      liveScheduleRender(_liveKinds);
      liveSetStatus('ok', 'Synced');
      return;
    }
    if (m.type === 'rejected') {
      // Our write lost to a newer one. Take the server's value so this device
      // cannot sit on data it thinks it saved.
      liveLog('a change was superseded by a newer edit');
      _liveApplying = true;
      try {
        const kind = liveApplyPath(m.path, m.value);
        _liveSnapshot[m.path] = JSON.stringify(m.value === undefined ? null : m.value);
        if (kind) _liveKinds.add(kind);
      } finally { _liveApplying = false; }
      liveScheduleRender(_liveKinds);
      return;
    }
    if (m.type === 'presence') { _livePeers = m.peers || []; liveRenderPeers(); return; }
    if (m.type === 'ack') { if (!_liveQueue.size) liveSetStatus('ok', 'Synced'); return; }
    if (m.type === 'error') { liveLog('server: ' + m.error); return; }
  };
}

function liveDisconnect() {
  LIVE_KEY = '';
  localStorage.removeItem(LIVE_KEY_STORE);
  clearTimeout(_liveRetryTimer);
  if (_liveWs) { try { _liveWs.close(); } catch (e) {} _liveWs = null; }
  _liveOpen = false; _livePeers = []; _liveQueue.clear(); _liveSnapshot = {};
  liveSetStatus('off', 'Offline');
  liveRenderPanel(); liveRenderPeers();
}

async function liveNewTeam() {
  try {
    const r = await fetch(LIVE_HTTP + '/team/new');
    const j = await r.json();
    if (!j.teamKey) throw new Error('no key returned');
    const inp = el('live-key-input');
    if (inp) inp.value = j.teamKey;
    LIVE_KEY = j.teamKey;
    localStorage.setItem(LIVE_KEY_STORE, LIVE_KEY);
    liveRenderPanel();
    liveOpenSocket();
  } catch (e) {
    alert('Could not reach the sync server. Check your connection and try again.');
  }
}

function liveCopyInvite() {
  if (!LIVE_KEY) { alert('Connect to a team first.'); return; }
  const link = location.origin + location.pathname + '#team=' + encodeURIComponent(LIVE_KEY);
  const msg = 'Luminary team link:\n' + link + '\n\nOpen it, then Add to Home Screen.';
  if (navigator.clipboard) navigator.clipboard.writeText(msg).then(
    () => alert('Invite link copied. Paste it in Discord.'),
    () => prompt('Copy this:', msg));
  else prompt('Copy this:', msg);
}

function liveDeviceName() {
  let n = localStorage.getItem(LIVE_NAME_STORE);
  if (!n) {
    n = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 'Phone' : 'Computer';
    localStorage.setItem(LIVE_NAME_STORE, n);
  }
  return n;
}

/* ---------- panel ---------- */

function liveSetStatus(state, msg) {
  const colors = { off: 'var(--muted)', connecting: 'var(--yellow)', ok: 'var(--green)',
                   pending: 'var(--yellow)', error: 'var(--red)' };
  const d = el('live-dot');
  if (d) { d.style.background = colors[state] || 'var(--muted)'; d.className = 's-sync-dot' + (state === 'ok' ? ' live' : ''); }
  const s = el('live-status');
  if (s) s.textContent = msg;
  // The header strip dot doubles as the live indicator now.
  const hd = el('sync-dot');
  if (hd) { hd.style.background = colors[state] || 'var(--muted)'; hd.className = 's-sync-dot' + (state === 'ok' ? ' live' : ''); }
  const hs = el('sync-status');
  if (hs) hs.textContent = msg;
}

function liveRenderPeers() {
  const e = el('live-peers');
  if (!e) return;
  const others = _livePeers.filter(p => p.clientId !== _liveClientId);
  e.textContent = !LIVE_KEY ? ''
    : others.length ? 'Also connected: ' + others.map(p => p.name).join(', ')
    : 'No other device connected';
}

function liveRenderPanel() {
  const inp = el('live-key-input');
  if (inp && LIVE_KEY && inp.value.trim().toLowerCase() !== LIVE_KEY) inp.value = LIVE_KEY;
  const disp = el('live-key-disp');
  if (disp) {
    disp.style.display = LIVE_KEY ? 'block' : 'none';
    disp.textContent = LIVE_KEY ? 'Team: ' + LIVE_KEY : '';
  }
}

function liveLog(msg) {
  const e = el('live-log');
  if (!e) return;
  const t = new Date().toLocaleTimeString();
  e.textContent = (t + '  ' + msg + '\n' + e.textContent).split('\n').slice(0, 14).join('\n');
}

/* An invite link carries #team=<key>. Honour it on load so a teammate only has
   to tap the link, which is the entire onboarding story: no accounts. */
function liveInit() {
  const m = (location.hash || '').match(/team=([a-z0-9-]+)/i);
  const fromLink = m ? m[1].toLowerCase() : '';
  const stored = (localStorage.getItem(LIVE_KEY_STORE) || '').toLowerCase();
  const key = fromLink || stored;
  const inp = el('live-key-input');
  if (inp && key) inp.value = key;
  if (!key) { liveSetStatus('off', 'Offline'); return; }
  if (fromLink && fromLink !== stored) {
    LIVE_KEY = fromLink;
    localStorage.setItem(LIVE_KEY_STORE, LIVE_KEY);
  } else {
    LIVE_KEY = stored;
  }
  liveRenderPanel();
  liveOpenSocket();
}
