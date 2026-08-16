/* LUMINARY ENDURANCE MANAGER
   Multiple entries: one car in one event. Wildthings has fielded four at once,
   and Michael's pre-app workflow was one spreadsheet per car per event, so this
   is the shape he was already maintaining by hand.

   THE DESIGN DECISION THAT MATTERS
   The ACTIVE entry's data stays exactly where it has always been: S.config,
   S.drivers, S.stints and so on. Every render function, the optimiser, the
   dashboard and the schedule builder therefore need no changes at all. Only
   INACTIVE entries are parked in S.entries[id].state. Switching entries swaps
   the two.

   The alternative, rewriting every S.config reference to
   S.entries[active].config, touches roughly two hundred call sites for no
   behavioural gain and a great deal of risk.

   Inactive entries hold their state; the active entry's state field is null
   because its data is live in S. That avoids storing everything twice in
   localStorage, which would otherwise multiply with each car added.

   These are CLASSIC scripts, not ES modules: top-level declarations stay in the
   shared global scope, where the delegated dispatcher in js/actions.js resolves
   them by name. No inline on*= handlers remain in the markup (Step 5).
   LOAD ORDER MATTERS - js/main.js must be last. */

const ENTRY_FIELDS = ['config', 'drivers', 'stints', 'avail', 'goals', 'checks',
                      'tnotes', 'schMeta', 'raceLog', 'settingCols'];

function newEntryId() {
  return 'en' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function blankEntryState() {
  return {
    config: { name: '', car: '', carClass: '', track: '', sim: '', date: '', hour: '', dur: '',
              green: 40, ighr: '', lap: '', fpl: '', fslap: '', fsburn: '',
              tank: '110', pit: '1:10', res: '4' },
    drivers: [], stints: [], avail: {}, goals: [],
    checks: JSON.parse(JSON.stringify(DEFAULT_CHECKS)),
    tnotes: [], schMeta: {}, raceLog: [], settingCols: JSON.parse(JSON.stringify(DC))
  };
}

/* Live fields off S, by reference. Callers must not mutate the result unless
   they mean to mutate S. */
function currentEntryFields() {
  const o = {};
  ENTRY_FIELDS.forEach(f => { o[f] = S[f]; });
  return o;
}

function loadEntryFields(state) {
  const blank = blankEntryState();
  ENTRY_FIELDS.forEach(f => {
    S[f] = (state && state[f] !== undefined && state[f] !== null) ? state[f] : blank[f];
  });
  S.editDrvIdx = null;
}

/* MIGRATION. An existing install has a single event sitting in S with no
   entries at all. Wrap it as the first entry rather than losing it. Runs once;
   after that ensureEntries is a no-op. */
function ensureEntries() {
  if (!S.entries || typeof S.entries !== 'object') S.entries = {};
  const ids = Object.keys(S.entries);
  if (!ids.length) {
    const id = newEntryId();
    S.entries[id] = { id, name: entryAutoName(S.config), created: Date.now(), state: null };
    S.activeEntry = id;
    return;
  }
  if (!S.activeEntry || !S.entries[S.activeEntry]) S.activeEntry = ids[0];
  // The active entry's data lives in S, never in its own state slot.
  if (S.entries[S.activeEntry]) S.entries[S.activeEntry].state = null;
}

function entryAutoName(cfg) {
  cfg = cfg || {};
  const bits = [cfg.car || '', cfg.name || ''].filter(Boolean);
  return bits.length ? bits.join(' · ') : 'New Entry';
}

/* Called from persist(). Keeps the entry's display name in step with its config
   so the switcher and home screen stay meaningful, without duplicating state. */
function saveEntrySnapshot() {
  if (!S.entries || !S.activeEntry || !S.entries[S.activeEntry]) return;
  const e = S.entries[S.activeEntry];
  e.state = null;
  if (!e.renamed) e.name = entryAutoName(S.config);
}

function switchEntry(id) {
  if (!S.entries[id] || id === S.activeEntry) { closeEntries(); return; }
  // Park the outgoing entry's data, then load the incoming one into S.
  const out = S.entries[S.activeEntry];
  if (out) out.state = JSON.parse(JSON.stringify(currentEntryFields()));
  S.activeEntry = id;
  loadEntryFields(S.entries[id].state);
  S.entries[id].state = null;
  _lp();
  refreshEntryViews();
  closeEntries();
  try { liveOnLocalChange(); } catch (e) {}
}

function addEntry() {
  const out = S.entries[S.activeEntry];
  if (out) out.state = JSON.parse(JSON.stringify(currentEntryFields()));
  const id = newEntryId();
  const blank = blankEntryState();
  // A new car in the same event almost always shares the roster, the track and
  // the timing. Carrying those over saves retyping all of it.
  const src = S.config || {};
  blank.config.name = src.name || '';
  blank.config.track = src.track || '';
  blank.config.sim = src.sim || '';
  blank.config.date = src.date || '';
  blank.config.hour = src.hour;
  blank.config.dur = src.dur;
  blank.config.green = src.green;
  blank.drivers = JSON.parse(JSON.stringify(S.drivers || []));
  blank.settingCols = JSON.parse(JSON.stringify(S.settingCols || []));
  S.entries[id] = { id, name: 'New Car', created: Date.now(), state: null, renamed: false };
  S.activeEntry = id;
  loadEntryFields(blank);
  _lp();
  refreshEntryViews();
  renderEntries();
  try { liveOnLocalChange(); } catch (e) {}
}

function renameEntry(id) {
  const e = S.entries[id];
  if (!e) return;
  const n = prompt('Name this entry (e.g. "Car 27"):', e.name || '');
  if (n === null) return;
  e.name = n.trim() || entryAutoName(id === S.activeEntry ? S.config : (e.state || {}).config);
  e.renamed = !!n.trim();
  persist();
  renderEntries();
  updateEntryLabel();
}

function deleteEntry(id) {
  const e = S.entries[id];
  if (!e) return;
  if (Object.keys(S.entries).length < 2) { alert('This is your only entry. Add another before deleting this one.'); return; }
  if (!confirm('Delete "' + (e.name || 'this entry') + '" permanently?\n\nThis cannot be undone.')) return;
  const wasActive = id === S.activeEntry;
  delete S.entries[id];
  if (wasActive) {
    const next = Object.keys(S.entries)[0];
    S.activeEntry = next;
    loadEntryFields(S.entries[next].state);
    S.entries[next].state = null;
    refreshEntryViews();
  }
  persist();
  renderEntries();
  try { liveDeleteEntry(id); } catch (e2) {}
}

/* Read an entry's data whether it is the active one (live in S) or parked. */
function entryStateOf(id) {
  if (id === S.activeEntry) return currentEntryFields();
  return (S.entries[id] && S.entries[id].state) || blankEntryState();
}

/* Everything the home screen shows for one car. Deliberately standalone rather
   than reusing raceStart()/updateDash(), which read the active entry only. */
function entrySummary(id) {
  const st = entryStateOf(id);
  const c = st.config || {};
  const out = { name: (S.entries[id] || {}).name || 'Entry', car: c.car || '', track: c.track || '',
                event: c.name || '', driver: '', remaining: '', position: '', status: 'idle', stint: '' };
  if (!c.date || c.hour === '' || c.hour === null || c.hour === undefined) return out;
  const th = parseFloat(c.hour) || 0;
  const h = Math.floor(th), m = Math.round((th - h) * 60);
  const d = new Date(c.date + 'T' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':00Z');
  if (isNaN(d)) return out;
  const green = d.getTime() + (parseInt(c.green) || 40) * 60000;
  const end = green + (parseFloat(c.dur) || 0) * 3600000;
  const now = Date.now();

  const positions = (st.stints || []).filter(s => s.position);
  out.position = positions.length ? positions[positions.length - 1].position : '';

  if (now < green) {
    out.status = 'pre';
    out.remaining = 'Starts in ' + fmtDurHM(green - now);
  } else if (now >= end) {
    out.status = 'done';
    out.remaining = 'Finished';
  } else {
    out.status = 'live';
    out.remaining = fmtDurHM(end - now) + ' left';
    const cur = (st.stints || []).find(s => !s.done && s.startMs <= now && s.endMs > now);
    if (cur) {
      out.stint = '#' + cur.num;
      const drv = (st.drivers || []).find(x => x.name === cur.driver);
      out.driver = drv ? (drv.handle || drv.name) : (cur.driver || 'Unassigned');
    }
  }
  return out;
}

/* ---------- UI ---------- */

function updateEntryLabel() {
  const n = Object.keys(S.entries || {}).length;
  const badge = el('entry-count');
  if (badge) { badge.textContent = n > 1 ? n + ' cars' : ''; badge.style.display = n > 1 ? '' : 'none'; }
}

function openEntries() { renderEntries(); el('entries-overlay').classList.add('on'); }
function closeEntries() { const o = el('entries-overlay'); if (o) o.classList.remove('on'); }

function renderEntries() {
  const wrap = el('entries-list');
  if (!wrap) return;
  const ids = Object.keys(S.entries || {});
  wrap.innerHTML = ids.map(id => {
    const s = entrySummary(id);
    const active = id === S.activeEntry;
    const col = s.status === 'live' ? 'var(--green)' : s.status === 'pre' ? 'var(--yellow)' : 'var(--muted)';
    const sub = [s.car, s.track].filter(Boolean).join(' · ') || 'Not set up yet';
    return `<div class="entry-card${active ? ' active' : ''}" data-action="entries.switch" data-id="${id}">
      <div style="flex:1;min-width:0">
        <div class="entry-name">${active ? '▸ ' : ''}${s.name}</div>
        <div class="entry-sub">${sub}</div>
        <div class="entry-live" style="color:${col}">
          ${s.status === 'live' ? '● LIVE' : s.status === 'pre' ? '○ Scheduled' : s.status === 'done' ? '✓ Finished' : '· Idle'}
          ${s.driver ? ' · ' + s.driver + (s.stint ? ' ' + s.stint : '') : ''}
          ${s.remaining ? ' · ' + s.remaining : ''}
          ${s.position ? ' · ' + s.position : ''}
        </div>
      </div>
      <div class="brow" style="flex-shrink:0;gap:6px">
        <button class="btn xs" data-action="entries.rename" data-id="${id}">Rename</button>
        <button class="btn xs rd" data-action="entries.delete" data-id="${id}">✕</button>
      </div>
    </div>`;
  }).join('');
  updateEntryLabel();
}

/* Re-render everything after an entry swap. Same set as the boot sequence. */
function refreshEntryViews() {
  try { populateConfig(); buildCatalogLists(); } catch (e) {}
  try { renderDriverList(); renderSettingsTable(); renderTNotes(); } catch (e) {}
  try { renderChecklists(); renderGoals(); renderGoalsDash(); } catch (e) {}
  try { renderSchedule(); buildAvail(); loadSchMeta(); } catch (e) {}
  try { renderStatusLog(); renderArchive(); checkPrereqs(); updateDash(); } catch (e) {}
  updateEntryLabel();
}
