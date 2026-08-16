/* LUMINARY ENDURANCE MANAGER
   Delegated event dispatch. Replaces every inline on*= attribute in the markup.

   WHY THIS EXISTS
   Inline handlers (onclick="saveDrv()") resolve their function names against the
   global scope. That is the single thing blocking the ES module conversion in
   Step 6: modules scope every declaration to their own file, so the moment the
   scripts become modules every inline handler goes undefined at once. Moving the
   wiring here means the markup names an ACTION, never a function, and Step 6 can
   proceed without touching a single HTML attribute.

   HOW IT WORKS
   Markup carries  data-action="stint.assign-driver" data-i="3"
   and this file maps that name to a small function that reads what it needs off
   the element. Arguments arrive as strings, so every entry does its own explicit
   coercion (+t.dataset.i). There is deliberately no generic argument-spreading:
   guessing whether "4" means the number 4 or the string "4" is exactly the kind
   of silent breakage this app cannot afford mid-race.

   EVENT TYPES
   Eight event types are delegated, not just click. Two notes that matter:

   - blur does NOT bubble, so it can never be caught on document. The five former
     onblur handlers are registered as 'focusout', which is the bubbling
     equivalent. Get this wrong and the schedule table's Actual End / Actual Laps
     / Position boxes silently stop saving.
   - An element that needs two different events (a text box that saves on
     focusout and blurs on Enter, or a goal row handling all three drag events)
     gets ONE action whose run() switches on e.type. One element cannot carry two
     data-action values.

   RESOLUTION
   Dispatch uses closest('[data-action]'), which finds the NEAREST ancestor. That
   is what replaces the old event.stopPropagation() calls: a delete button nested
   inside a clickable row resolves to the button, and the row never fires. If this
   ever resolved to the outermost match instead, every delete would also toggle.

   These are CLASSIC scripts, not ES modules.
   LOAD ORDER MATTERS - js/main.js must be last and calls initDelegation(). */

/* Each entry is {on, run}. `on` is an event type or array of them, defaulting to
   'click'. `run` receives (event, targetElement). */
const ACTIONS = {

  // ---- NAVIGATION ----------------------------------------------------------
  'nav': { run: (e, t) => pg(t.dataset.page) },

  // ---- OPS / QUICK LOG -----------------------------------------------------
  'log.quick':  { run: (e, t) => quickLog(t.dataset.type) },
  'log.delete': { run: (e, t) => delLogEntry(+t.dataset.id) },

  // ---- EVENT CONFIG FORM ---------------------------------------------------
  // sc() writes the form into S.config and persists. Several fields additionally
  // re-check the schedule prerequisites. Split by event type so a text input does
  // not fire on both 'input' and its trailing 'change'.
  'config.save':        { on: 'input',  run: () => sc() },
  'config.save-change': { on: 'change', run: () => sc() },
  'config.save-check':  { on: 'input',  run: () => { sc(); checkPrereqs(); } },
  'config.date-change': { on: 'change', run: () => { sc(); checkPrereqs(); } },
  'config.check':       { on: 'input',  run: () => checkPrereqs() },
  // Changing sim narrows the car and track pick lists to that sim's content.
  'config.sim-change':  { on: 'change', run: () => { sc(); applySimMode(); buildCatalogLists(); } },
  // Pick lists. Picking a class narrows the car list; picking a car fills its class.
  'config.class-pick':  { on: 'change', run: () => onClassPick() },
  'config.car-pick':    { on: 'change', run: () => onCarPick() },
  'config.track-pick':  { on: 'change', run: () => applyPick('cfg-track-pick', 'cfg-track') },
  'config.pit':         { on: ['input', 'focusout'], run: (e, t) => lapFieldOr(e, t, () => sc()) },
  'config.hour-change': { on: 'change', run: () => { syncHourDrop(); sc(); checkPrereqs(); } },
  'config.dur-change':  { on: 'change', run: () => { syncDurDrop(); sc(); checkPrereqs(); } },
  'config.ighr-change': { on: 'change', run: () => { syncIghrDrop(); sc(); } },

  // ---- DRIVER ROSTER AND MODAL ---------------------------------------------
  'driver.add':        { run: () => openDrvModal() },
  'driver.edit':       { run: (e, t) => openDrvModal(+t.dataset.i) },
  'driver.save':       { run: () => saveDrv() },
  'driver.close':      { run: () => closeDrv() },
  'driver.delete':     { run: () => confirmDeleteDriver() },
  'driver.lib-load':   { on: 'change', run: () => loadFromLib() },
  'driver.lib-remove': { run: () => removeFromLib() },
  'driver.tz-change':  { on: 'change', run: () => onTZChange() },
  // Lap time boxes: reformat on focusout, re-check prerequisites as you type.
  'driver.lap':        { on: ['input', 'focusout'], run: (e, t) => lapFieldOr(e, t, () => checkPrereqs()) },
  'driver.lap-format': { on: 'focusout', run: (e, t) => { t.value = fmtLapInput(t.value); } },

  // ---- CAR SETTINGS TABLE --------------------------------------------------
  // Both focusout and change are registered, matching the original pair of
  // onblur/onchange attributes. flushSetting() no-ops when the value is
  // unchanged, so the double fire is harmless and behaviour is preserved.
  'settings.add-col':     { run: () => addCol() },
  'settings.remove-col':  { run: () => removeLastCol() },
  'settings.confirm-col': { run: () => confirmCol() },
  'settings.flush':       { on: ['focusout', 'change'], run: (e, t) => flushSetting(t) },

  // ---- TESTING NOTES -------------------------------------------------------
  'tnote.open':    { run: () => openTNote() },
  'tnote.save':    { run: () => saveTNote() },
  'tnote.add-lap': { run: (e, t) => addLapNote(+t.dataset.i) },
  'tnote.del-lap': { run: (e, t) => delLapNote(+t.dataset.i, +t.dataset.li) },
  'tnote.delete':  { run: (e, t) => delTNote(+t.dataset.i) },

  // ---- ARCHIVE AND EXPORT --------------------------------------------------
  'archive.save':    { run: () => archiveEvent() },
  'archive.restore': { run: (e, t) => restoreArchive(+t.dataset.id) },
  'archive.delete':  { run: (e, t) => delArchive(+t.dataset.id) },
  'export.csv':      { run: () => exportScheduleCSV() },
  'export.text':     { run: () => exportScheduleText() },

  // ---- LIVE SYNC (Cloudflare, current) -------------------------------------
  'live.connect':    { run: () => liveConnect() },
  'live.disconnect': { run: () => liveDisconnect() },
  'live.new':        { run: () => liveNewTeam() },
  'live.invite':     { run: () => liveCopyInvite() },


  // ---- STINT SCHEDULE ------------------------------------------------------
  'opt.run':            { run: (e, t) => optimizeStints(t.dataset.scope === 'unassigned') },
  'sched.meta-driver':  { on: 'change', run: () => saveSchMeta() },
  'sched.meta-notes':   { on: 'input',  run: () => saveSchMeta() },
  'sched.meta-pos':     { on: ['focusout', 'keydown'], run: (e, t) => enterBlurOr(e, t, saveSchMetaPos) },

  'stint.assign-driver': { on: 'change', run: (e, t) => assignDrv(+t.dataset.i, t.value) },
  'stint.assign-type':   { on: 'change', run: (e, t) => assignType(+t.dataset.i, t.value) },
  'stint.actual-end':    { on: ['focusout', 'keydown'], run: (e, t) => enterBlurOr(e, t, () => saveActualEnd(+t.dataset.i, t.value)) },
  'stint.actual-laps':   { on: ['focusout', 'keydown'], run: (e, t) => enterBlurOr(e, t, () => saveActualLaps(+t.dataset.i, t.value)) },
  'stint.position':      { on: ['focusout', 'keydown'], run: (e, t) => enterBlurOr(e, t, () => savePosition(+t.dataset.i, t.value)) },
  'stint.note':          { run: (e, t) => openNote(+t.dataset.i) },
  'stint.damage-set':    { run: (e, t) => toggleDamage(+t.dataset.i, true) },
  'stint.damage-clear':  { run: (e, t) => toggleDamage(+t.dataset.i, false) },

  // ---- STINT NOTE MODAL ----------------------------------------------------
  'note.save':  { run: () => saveNote() },
  'note.done':  { run: () => markDone() },
  'note.close': { run: () => closeNote() },

  // ---- DAMAGE MODAL --------------------------------------------------------
  'damage.save': { run: () => saveDamageModal() },
  // Cancel must also undo the damage flag that toggleDamage() set before opening
  // the modal, otherwise dismissing the dialog leaves the stint marked damaged.
  'damage.cancel': {
    run: () => {
      el('dmg-overlay').classList.remove('on');
      const i = parseInt(el('dmg-idx').value);
      if (!isNaN(i) && S.stints[i]) S.stints[i].damage = false;
      renderSchedule();
    }
  },

  // ---- AVAILABILITY --------------------------------------------------------
  'avail.driver-change': { on: 'change', run: () => refreshAvTimeDrops() },
  'avail.apply':         { run: (e, t) => applyWindow(t.dataset.state) },
  'avail.cycle':         { run: (e, t) => cycleAv(t.dataset.key) },

  // ---- PIT STRATEGY --------------------------------------------------------
  'cmp.calc':        { on: 'input', run: () => calcCompare() },
  'cmp.lap':         { on: ['input', 'focusout'], run: (e, t) => lapFieldOr(e, t, () => calcCompare()) },
  'cmp.prefill':     { run: () => prefillCompare() },
  'fuel.calc':       { on: 'input', run: () => calcFuel() },
  'fuel.lap':        { on: ['input', 'focusout'], run: (e, t) => lapFieldOr(e, t, () => calcFuel()) },
  'pit.calc':        { on: 'input', run: () => calcPit() },
  'pit.calc-change': { on: 'change', run: () => calcPit() },

  // ---- GOALS ---------------------------------------------------------------
  // The goal row carries all three drag events on one element, so it is one
  // action switching on e.type. Its toggle and delete children have their own.
  'goal.open':   { run: () => openGoal() },
  'goal.save':   { run: () => saveGoal() },
  'goal.toggle': { run: (e, t) => toggleGoal(+t.dataset.i) },
  'goal.delete': { run: (e, t) => delGoal(+t.dataset.i) },
  'goal.row': {
    on: ['dragstart', 'dragover', 'drop'],
    run: (e, t) => {
      const i = +t.dataset.i;
      if (e.type === 'dragstart') goalDragStart(i);
      else if (e.type === 'dragover') goalDragOver(e, i);
      else goalDrop(e, i);
    }
  },

  // ---- CHECKLISTS ----------------------------------------------------------
  'check.open':   { run: () => openCheck() },
  'check.save':   { run: () => saveCheck() },
  'check.reset':  { run: () => resetChecks() },
  'check.toggle': { run: (e, t) => toggleCL(t.dataset.cat, +t.dataset.i) },
  'check.delete': { run: (e, t) => delCheck(t.dataset.cat, +t.dataset.i) },

  // ---- ENTRIES (cars) ------------------------------------------------------
  'entries.open':   { run: () => openEntries() },
  'entries.close':  { run: () => closeEntries() },
  'entries.switch': { run: (e, t) => switchEntry(t.dataset.id) },
  'entries.new':    { run: () => addEntry() },
  // Rename and delete sit INSIDE the switch row, so nearest-ancestor resolution
  // is what stops tapping them from also switching entry.
  'entries.rename': { run: (e, t) => renameEntry(t.dataset.id) },
  'entries.delete': { run: (e, t) => deleteEntry(t.dataset.id) },

  // ---- SAMPLE DATA ---------------------------------------------------------
  'demo.load': { run: () => loadDemoEvent() },

  // ---- GENERIC MODAL DISMISS ----------------------------------------------
  'modal.close': { run: (e, t) => { const o = el(t.dataset.target); if (o) o.classList.remove('on'); } }
};

/* Shared by every lap-time-shaped box. Recalculates live as you type, then
   tidies the value into m:ss.fff once you leave the field. Same one-element-
   one-action constraint as enterBlurOr below. */
function lapFieldOr(e, t, onInput) {
  if (e.type === 'focusout') {
    const tidy = fmtLapInput(t.value);
    if (tidy !== t.value) { t.value = tidy; onInput(); }
    return;
  }
  onInput();
}

/* Shared by every text box that saved on blur and blurred on Enter. One action
   handles both events because one element cannot carry two data-action values. */
function enterBlurOr(e, t, onCommit) {
  if (e.type === 'keydown') { if (e.key === 'Enter') t.blur(); return; }
  onCommit();
}

/* All eight delegated event types. Every one of these bubbles to document.
   'focusout' stands in for the non-bubbling 'blur'. */
const DELEGATED_EVENTS = ['click', 'input', 'change', 'focusout', 'keydown', 'dragstart', 'dragover', 'drop'];

function dispatchAction(e) {
  const src = e.target;
  if (!src || typeof src.closest !== 'function') return;
  const t = src.closest('[data-action]');
  if (!t) return;
  const name = t.dataset.action;
  const entry = ACTIONS[name];
  if (!entry) { console.warn('[luminary] unknown data-action:', name, t); return; }
  const on = entry.on || 'click';
  const types = Array.isArray(on) ? on : [on];
  if (types.indexOf(e.type) < 0) return;
  entry.run(e, t);
}

/* Listeners live on document, so markup rendered later (schedule rows, driver
   cards, availability cells, goals) is wired automatically with no re-binding. */
function initDelegation() {
  DELEGATED_EVENTS.forEach(type => document.addEventListener(type, dispatchAction));
}
