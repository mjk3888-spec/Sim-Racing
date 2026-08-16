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

function livePathsForState(st, id, p) {
  const E = 'e/' + id + '/';
  const c = st.config || {};
  Object.keys(c).forEach(k => { p[E + 'config/' + k] = c[k]; });
  p[E + 'drivers'] = st.drivers;
  p[E + 'settingCols'] = st.settingCols;
  p[E + 'goals'] = st.goals;
  p[E + 'tnotes'] = st.tnotes;
  p[E + 'raceLog'] = st.raceLog;
  Object.keys(st.checks || {}).forEach(k => { p[E + 'checks/' + k] = st.checks[k]; });
  Object.keys(st.schMeta || {}).forEach(k => { p[E + 'schMeta/' + k] = st.schMeta[k]; });
  Object.keys(st.avail || {}).forEach(k => { p[E + 'avail/' + k] = st.avail[k]; });
  (st.stints || []).forEach(s => {
    STINT_SYNCED_FIELDS.forEach(f => { p[E + 'stint/' + s.num + '/' + f] = s[f]; });
  });
  return p;
}

/* Every entry syncs, not just the one on screen, because the whole point of the
   car list is watching all of them at once. The active entry's data is read
   from S; the rest from their parked state. */
function livePaths() {
  const p = {};
  // Team-level, shared by every entry: the name and logo belong to the TEAM,
  // not to a car, so they sit outside the e/<id>/ namespace.
  p['team/name'] = (S.team && S.team.name) || '';
  p['team/logo'] = (S.team && S.team.logo) || '';
  const ids = Object.keys(S.entries || {});
  if (!ids.length) return livePathsForState(currentEntryFields(), LIVE_ENTRY, p);
  ids.forEach(id => {
    const meta = S.entries[id] || {};
    p['entries/' + id + '/name'] = meta.name || '';
    p['entries/' + id + '/created'] = meta.created || 0;
    p['entries/' + id + '/deleted'] = !!meta.deleted;
    livePathsForState(entryStateOf(id), id, p);
  });
  return p;
}

/* Applies one server field. Returns 'config' when the change affects the active
   entry's schedule shape, so the caller knows to rebuild stints, or 'entries'
   when only the car list changed. */
function liveApplyPath(path, value) {
  const bits = path.split('/');

  // team/<field> — the team's own name and logo, shared across every car
  if (bits[0] === 'team' && bits[1]) {
    if (!S.team) S.team = { name: '', logo: '' };
    S.team[bits[1]] = value || '';
    return 'team';
  }

  // entries/<id>/<field> — the car list itself
  if (bits[0] === 'entries' && bits[1] && bits[2]) {
    const id = bits[1];
    if (!S.entries) S.entries = {};
    if (!S.entries[id]) S.entries[id] = { id, name: 'Entry', created: 0, state: blankEntryState() };
    if (bits[2] === 'deleted' && value) {
      // Never delete the entry currently on screen out from under someone.
      if (id !== S.activeEntry) delete S.entries[id];
      else S.entries[id].deleted = true;
      return 'entries';
    }
    if (bits[2] === 'name') { S.entries[id].name = value || 'Entry'; S.entries[id].renamed = true; }
    if (bits[2] === 'created') S.entries[id].created = value || 0;
    return 'entries';
  }

  if (bits[0] !== 'e' || !bits[1]) return null;
  const id = bits[1];
  const rest = bits.slice(2);
  if (!rest.length) return null;

  // Route to S directly for the active entry, or into the parked state for the
  // others. Everything the app renders reads S, so this keeps both correct.
  const isActive = (id === S.activeEntry) || (!S.entries || !Object.keys(S.entries).length);
  let t;
  if (isActive) t = S;
  else {
    if (!S.entries) S.entries = {};
    if (!S.entries[id]) S.entries[id] = { id, name: 'Entry', created: 0, state: blankEntryState() };
    if (!S.entries[id].state) S.entries[id].state = blankEntryState();
    t = S.entries[id].state;
  }
  const mark = k => isActive ? k : 'entries';

  if (rest[0] === 'config' && rest[1]) { if (!t.config) t.config = {}; t.config[rest[1]] = value; return mark('config'); }
  if (rest[0] === 'drivers') { t.drivers = value || []; return mark('drivers'); }
  if (rest[0] === 'settingCols') { t.settingCols = value || []; return mark('drivers'); }
  if (rest[0] === 'goals') { t.goals = value || []; return mark('goals'); }
  if (rest[0] === 'tnotes') { t.tnotes = value || []; return mark('tnotes'); }
  if (rest[0] === 'raceLog') { t.raceLog = value || []; return mark('log'); }
  if (rest[0] === 'checks' && rest[1]) { if (!t.checks) t.checks = {}; t.checks[rest[1]] = value || []; return mark('goals'); }
  if (rest[0] === 'schMeta' && rest[1]) { if (!t.schMeta) t.schMeta = {}; t.schMeta[rest[1]] = value; return mark('log'); }
  if (rest[0] === 'avail' && rest[1]) { if (!t.avail) t.avail = {}; t.avail[rest.slice(1).join('/')] = value; return mark('avail'); }
  if (rest[0] === 'stint' && rest[1] && rest[2]) {
    const num = parseInt(rest[1], 10);
    const st = (t.stints || []).find(x => x.num === num);
    // A stint field can arrive before the config that creates that stint.
    // Dropping it is safe: buildStints() runs once config lands, and the value
    // is still on the server for the next snapshot.
    if (st && STINT_SYNCED_FIELDS.indexOf(rest[2]) >= 0) { st[rest[2]] = value; return mark('stint'); }
    return null;
  }
  return null;
}

/* Deleting an entry has to be broadcast as a tombstone rather than by removing
   fields: another device that never sees the removal would otherwise resurrect
   the whole car from its own copy on the next reconnect. */
function liveDeleteEntry(id) {
  if (!LIVE_KEY) return;
  const ts = Date.now();
  const path = 'entries/' + id + '/deleted';
  _liveSnapshot[path] = JSON.stringify(true);
  if (!liveSend({ type: 'patch', path, value: true, ts, clientId: _liveClientId })) {
    _liveQueue.set(path, { value: true, ts });
  }
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
      // Car list and switcher, cheap and always worth keeping current.
      try { renderTeamIdentity(); updateEntryLabel(); if (el('entries-overlay').classList.contains('on')) renderEntries(); } catch (e) {}
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
  // Normalise rather than reject: "WTR Daytona 2026" becomes
  // "wtr-daytona-2026", which is what the person meant. Before this, a typed
  // key with spaces failed the server's format check, the handshake failed,
  // and the client retried forever showing only "socket error".
  const key = normalizeTeamKey(inp ? inp.value : LIVE_KEY);
  const problem = teamKeyProblem(key);
  if (problem) { alert(problem); return; }
  if (inp) inp.value = key;

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

/* An installed iOS app has its own storage, separate from the Safari tab it was
   installed from, so it starts with no team key and syncs nothing. Saying so is
   the difference between "this is broken" and "tap here once". */
function liveRenderJoinBanner() {
  const b = el('join-banner');
  if (b) b.style.display = LIVE_KEY ? 'none' : 'flex';
}

function liveRenderPanel() {
  liveRenderJoinBanner();
  renderTeamIdentity();
  try{ if(el('team-overlay').classList.contains('on')) renderTeamPanel(); }catch(e){}
  renderSyncSummary();
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
  if (!key) { liveSetStatus('off', 'Offline'); liveRenderJoinBanner(); return; }
  if (fromLink && fromLink !== stored) {
    LIVE_KEY = fromLink;
    localStorage.setItem(LIVE_KEY_STORE, LIVE_KEY);
  } else {
    LIVE_KEY = stored;
  }
  liveRenderPanel();
  liveOpenSocket();
}

/* ---------- team identity: name and logo ---------- */

/* The team name and logo are TEAM-level, shared by every car and every
   teammate, so they sync under team/ rather than inside an entry. */
function saveTeamName() {
  if (!S.team) S.team = { name: '', logo: '' };
  S.team.name = (gv('team-name-input') || '').slice(0, 60);
  persist();
  renderTeamIdentity();
}

/* Uploaded logos are downscaled and re-encoded before storage. A photo straight
   off a phone is several megabytes, which would blow past both the sync
   message limit and the localStorage quota. 512px is far more than the header
   or splash ever needs. */
const TEAM_LOGO_MAX_PX = 512;
const TEAM_LOGO_MAX_BYTES = 90 * 1024;

function onTeamLogoPicked(input) {
  const file = input && input.files && input.files[0];
  if (!file) return;
  if (!/^image\//.test(file.type)) { alert('That is not an image file.'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onerror = () => { alert('Could not read that file.'); input.value = ''; };
  reader.onload = () => {
    const img = new Image();
    img.onerror = () => { alert('That image could not be read. Try a PNG or JPEG.'); input.value = ''; };
    img.onload = () => {
      const scale = Math.min(1, TEAM_LOGO_MAX_PX / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const cx = c.getContext('2d');
      cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
      cx.drawImage(img, 0, 0, w, h);
      // PNG keeps transparency, which most team logos rely on. Fall back to
      // JPEG only if PNG comes out too big to sync.
      let out = c.toDataURL('image/png');
      if (out.length > TEAM_LOGO_MAX_BYTES) out = c.toDataURL('image/jpeg', 0.86);
      if (out.length > TEAM_LOGO_MAX_BYTES) {
        alert('That image is too detailed to sync. Try a simpler or smaller logo.');
        input.value = '';
        return;
      }
      if (!S.team) S.team = { name: '', logo: '' };
      S.team.logo = out;
      persist();
      renderTeamIdentity();
      input.value = '';
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function clearTeamLogo() {
  if (!S.team) S.team = { name: '', logo: '' };
  if (!S.team.logo) return;
  if (!confirm('Remove the team logo and go back to the Luminary mark?')) return;
  S.team.logo = '';
  persist();
  renderTeamIdentity();
}

function renderTeamIdentity() {
  const t = S.team || { name: '', logo: '' };
  const inp = el('team-name-input');
  if (inp && document.activeElement !== inp) inp.value = t.name || '';

  const brand = document.querySelector('.s-brand img');
  if (brand) {
    const want = t.logo || 'assets/logo.svg';
    if (brand.getAttribute('src') !== want) brand.setAttribute('src', want);
    brand.alt = t.name || 'LUMINARY MANAGER';
  }
  const prev = el('team-logo-preview');
  if (prev) {
    prev.innerHTML = t.logo
      ? '<img src="' + t.logo + '" alt="" style="max-height:46px;max-width:150px;display:block">'
      : '<span style="font-family:var(--mono);font-size:var(--fs-sm);color:var(--muted);text-transform:none">Using the Luminary mark</span>';
  }
  const nameSlot = el('team-name-display');
  if (nameSlot) {
    nameSlot.textContent = t.name || '';
    nameSlot.style.display = t.name ? '' : 'none';
  }
}

/* A custom key is the user's decision, made with the trade-off explained. This
   only flags the obviously trivial ones and never blocks. */
function liveKeyWarning() {
  const w = el('live-key-warn');
  if (!w) return;
  const k = ((el('live-key-input') || {}).value || '').trim().toLowerCase();
  const weak = k && (k.length < 12 || /^(test|team|demo|luminary|racing|wildthings|admin|password)$/.test(k));
  w.style.display = weak ? 'block' : 'none';
  if (weak) {
    w.textContent = k.length < 12
      ? 'Short keys are easy to guess. Anyone who guesses it can edit your race.'
      : 'That is an easy key to guess. Anyone who guesses it can edit your race.';
  }
}

/* ---------- key handling ---------- */

/* People type "WTR Daytona 2026". The server only accepts [a-z0-9-]{8,64}, so
   an unnormalised key produced a handshake failure and an endless reconnect
   loop with nothing but "socket error" to show for it. Normalise instead of
   rejecting: spaces and punctuation become hyphens, which is what the person
   meant anyway. */
function normalizeTeamKey(raw) {
  return String(raw == null ? '' : raw)
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function teamKeyProblem(key) {
  if (!key) return 'Enter a team key, or start a new team.';
  if (key.length < 8) return 'Team keys need at least 8 characters. Try adding the track or the year.';
  return '';
}

/* ---------- team dialog ---------- */

function openTeamPanel(){ renderTeamPanel(); el('team-overlay').classList.add('on'); }
function closeTeamPanel(){ const o=el('team-overlay'); if(o) o.classList.remove('on'); }

/* Two states, never both on screen at once. The old panel showed Connect, New
   Team, Copy Invite Link and Disconnect together with no indication of which to
   press first, which is exactly the confusion reported. */
function renderTeamPanel() {
  const connected = !!LIVE_KEY;
  const dis = el('team-setup-disconnected'), con = el('team-setup-connected');
  if (dis) dis.style.display = connected ? 'none' : '';
  if (con) con.style.display = connected ? '' : 'none';

  const shown = el('team-key-shown');
  if (shown) shown.textContent = LIVE_KEY || '';
  const label = el('team-connected-label');
  if (label) {
    const nm = (S.team && S.team.name) || '';
    label.textContent = _liveOpen ? ('Synced' + (nm ? ' as ' + nm : '')) : 'Connecting...';
  }
  const dot = el('team-dot');
  if (dot) dot.style.background = _liveOpen ? 'var(--green)' : 'var(--yellow)';
  const pl = el('team-peers-line');
  if (pl) {
    const others = _livePeers.filter(p => p.clientId !== _liveClientId);
    pl.textContent = others.length
      ? 'Also connected right now: ' + others.map(p => p.name).join(', ')
      : 'No other device connected right now. That is normal if nobody else has the app open.';
  }
  renderSyncSummary();
  renderTeamIdentity();
}

/* The Config tab keeps only a one-line summary. Sync setup is something you do
   once, so it should not occupy a card forever, but it must stay reachable. */
function renderSyncSummary() {
  const e = el('sync-summary');
  if (!e) return;
  const nm = (S.team && S.team.name) || '';
  if (!LIVE_KEY) {
    e.innerHTML = '<div style="font-family:var(--mono);font-size:var(--fs-md);color:var(--yellow);text-transform:none">Not connected. This device is not sharing with anyone.</div>';
    return;
  }
  e.innerHTML = '<div style="font-family:var(--mono);font-size:var(--fs-md);color:var(--text-mid);text-transform:none">'
    + '<span style="color:' + (_liveOpen ? 'var(--green)' : 'var(--yellow)') + '">●</span> '
    + (_liveOpen ? 'Synced' : 'Connecting') + (nm ? ' · ' + nm : '')
    + '<br><span style="color:var(--muted);font-size:var(--fs-sm)">Key: ' + LIVE_KEY + '</span></div>';
}
