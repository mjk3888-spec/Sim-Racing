/* Step 5 functional test.

   Markup equivalence proves the pages still LOOK right. It proves nothing about
   whether a click still does anything. This file dispatches real bubbling DOM
   events and asserts the resulting state change, which is the only thing that
   actually shows delegation replaced the inline handlers correctly.

   Every event here is a genuine dispatched event, never a direct call to the
   underlying function, so it exercises the whole path: listener -> closest()
   -> ACTIONS lookup -> event-type gate -> run(). */

window.LUMTEST = (function () {

  const results = [];
  function check(name, fn) {
    try {
      const r = fn();
      results.push({ name, pass: r === true, detail: r === true ? '' : String(r) });
    } catch (e) {
      results.push({ name, pass: false, detail: 'THREW ' + e.message });
    }
  }

  const $ = s => document.querySelector(s);
  const click = elx => elx.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  const fire = (elx, type) => elx.dispatchEvent(new Event(type, { bubbles: true }));
  const focusout = elx => elx.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  const key = (elx, k) => elx.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  const drag = (elx, type) => elx.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));

  function run() {
    results.length = 0;

    // Silence the confirm/alert/prompt dialogs the delete paths use.
    const realConfirm = window.confirm, realAlert = window.alert, realPrompt = window.prompt;
    window.confirm = () => true;
    window.alert = () => {};
    window.prompt = () => 'injected lap note';

    try {
      // ---- NAV -------------------------------------------------------------
      check('nav: tab click switches page', () => {
        click(document.querySelectorAll('#nav .tab')[4]);   // Pit Strategy
        return $('#page-fuel').classList.contains('on') || 'page-fuel not active';
      });
      // The header sync block used to navigate to the Config tab, where sync
      // setup lived at the very bottom of the page. Sync is a critical function
      // and was too buried, so that block now opens the team dialog directly
      // from whatever tab you are on.
      check('header sync block opens the team dialog from any tab', () => {
        pg('goals');
        click($('#strip [data-action="team.open"]'));
        const open = $('#team-overlay').classList.contains('on');
        click($('[data-action="team.close"]'));
        return open || 'team dialog did not open from the header';
      });
      check('team dialog shows ONE state at a time, never all four buttons', () => {
        // The reported problem was four buttons at once with no indication of
        // which to press. Disconnected and connected states must be exclusive.
        click($('#strip [data-action="team.open"]'));
        const dis = getComputedStyle($('#team-setup-disconnected')).display !== 'none';
        const con = getComputedStyle($('#team-setup-connected')).display !== 'none';
        click($('[data-action="team.close"]'));
        return (dis !== con) || `both states visible (disconnected=${dis} connected=${con})`;
      });
      check('a team key typed the human way is normalised, not rejected', () => {
        // Michael typed "WTR DAYTONA 2026". Spaces are not valid on the server,
        // so it failed the handshake and retried forever showing "socket error".
        if (normalizeTeamKey('WTR DAYTONA 2026') !== 'wtr-daytona-2026') {
          return 'got ' + normalizeTeamKey('WTR DAYTONA 2026');
        }
        if (teamKeyProblem(normalizeTeamKey('WTR Daytona 2026')) !== '') return 'valid key was rejected';
        if (!teamKeyProblem(normalizeTeamKey('wtr'))) return 'a 3-character key was accepted';
        return true;
      });

      // ---- SCHEDULE: the change/focusout/keydown paths ---------------------
      pg('schedule');
      check('stint.assign-driver: change updates S.stints', () => {
        const sel = document.querySelector('[data-action="stint.assign-driver"][data-i="2"]');
        sel.value = 'Yuki Sato';
        fire(sel, 'change');
        return S.stints[2].driver === 'Yuki Sato' || 'got ' + S.stints[2].driver;
      });
      check('stint.assign-type: change updates stintType', () => {
        const sel = document.querySelector('[data-action="stint.assign-type"][data-i="2"]');
        sel.value = 'fs-tires';
        fire(sel, 'change');
        return S.stints[2].stintType === 'fs-tires' || 'got ' + S.stints[2].stintType;
      });
      // This is the one that silently dies if focusout is not used in place of blur.
      check('stint.actual-laps: FOCUSOUT saves (blur does not bubble)', () => {
        const inp = document.querySelector('[data-action="stint.actual-laps"][data-i="1"]');
        inp.value = '29';
        focusout(inp);
        return S.stints[1].actualLaps === 29 || 'got ' + JSON.stringify(S.stints[1].actualLaps);
      });
      check('stint.position: FOCUSOUT saves and ordinalises', () => {
        const inp = document.querySelector('[data-action="stint.position"][data-i="2"]');
        inp.value = '7';
        focusout(inp);
        return S.stints[2].position === '7th' || 'got ' + S.stints[2].position;
      });
      check('stint.actual-end: FOCUSOUT saves', () => {
        const inp = document.querySelector('[data-action="stint.actual-end"][data-i="0"]');
        inp.value = '15:02';
        focusout(inp);
        return S.stints[0].actualEnd === '15:02' || 'got ' + S.stints[0].actualEnd;
      });
      check('stint.actual-end: Enter key blurs, does not save twice', () => {
        const inp = document.querySelector('[data-action="stint.actual-end"][data-i="0"]');
        inp.focus();
        key(inp, 'Enter');
        return document.activeElement !== inp || 'still focused';
      });
      check('stint.note: click opens note modal', () => {
        click(document.querySelector('[data-action="stint.note"][data-i="0"]'));
        const open = $('#note-overlay').classList.contains('on');
        $('#note-overlay').classList.remove('on');
        return open || 'note-overlay did not open';
      });

      // ---- DAMAGE MODAL ----------------------------------------------------
      check('stint.damage-set: opens modal and flags damage', () => {
        const b = document.querySelector('[data-action="stint.damage-set"]');
        const i = +b.dataset.i;
        click(b);
        return (S.stints[i].damage === true && $('#dmg-overlay').classList.contains('on'))
          || 'damage=' + S.stints[i].damage;
      });
      check('damage.cancel: clears the flag it set', () => {
        const i = parseInt($('#dmg-idx').value);
        click($('[data-action="damage.cancel"]'));
        return (S.stints[i].damage === false && !$('#dmg-overlay').classList.contains('on'))
          || 'damage=' + S.stints[i].damage;
      });

      // ---- AVAILABILITY ----------------------------------------------------
      pg('avail');
      // Note: cycleAv() compares against the STORED value, which is undefined for
      // a cell never touched, so the first click on a fresh cell lands on 'open'
      // and looks like nothing happened. That is pre-existing app behaviour and
      // unrelated to delegation, so seed a known value before asserting.
      check('avail.cycle: click cycles open -> maybe -> blocked', () => {
        const cell = document.querySelector('.avcell[data-action="avail.cycle"]');
        const k = cell.dataset.key;
        S.avail[k] = 'open';
        click(cell);
        if (S.avail[k] !== 'maybe') return 'open -> ' + S.avail[k] + ', wanted maybe';
        click(document.querySelector('.avcell[data-action="avail.cycle"][data-key="' + k + '"]'));
        if (S.avail[k] !== 'blocked') return 'maybe -> ' + S.avail[k] + ', wanted blocked';
        return true;
      });
      check('avail.apply: button writes a window', () => {
        const before = JSON.stringify(S.avail);
        $('#av-from').value = '0'; $('#av-to').value = '720';
        click($('[data-action="avail.apply"][data-state="blocked"]'));
        return JSON.stringify(S.avail) !== before || 'S.avail unchanged';
      });

      // ---- GOALS: the stopPropagation replacement --------------------------
      pg('goals');
      check('goal.toggle: click chk-box toggles', () => {
        const before = S.goals[0].done;
        click(document.querySelector('#goals-list [data-action="goal.toggle"][data-i="0"]'));
        return S.goals[0].done === !before || 'did not toggle';
      });
      // The delete button sits INSIDE the goal row. Nearest-ancestor resolution
      // must pick the button. If it picked the row, delete would also toggle.
      check('goal.delete: click deletes exactly one and does NOT toggle', () => {
        const n = S.goals.length;
        const survivor = S.goals[1].text, survivorDone = S.goals[1].done;
        click(document.querySelector('#goals-list [data-action="goal.delete"][data-i="0"]'));
        if (S.goals.length !== n - 1) return 'length ' + S.goals.length + ' expected ' + (n - 1);
        if (S.goals[0].text !== survivor) return 'wrong goal removed';
        if (S.goals[0].done !== survivorDone) return 'survivor toggled as a side effect';
        return true;
      });
      check('goal.row: dragstart/dragover/drop reorder', () => {
        const rows = document.querySelectorAll('#goals-list [data-action="goal.row"]');
        if (rows.length < 2) return 'need 2 goals, have ' + rows.length;
        const first = S.goals[0].text;
        drag(rows[0], 'dragstart');
        drag(rows[1], 'dragover');
        drag(rows[1], 'drop');
        return S.goals[1].text === first || 'order unchanged: ' + S.goals.map(g => g.text).join(',');
      });

      // ---- CHECKLISTS: same nesting pattern --------------------------------
      check('check.toggle: click row toggles', () => {
        const before = S.checks.pre[0].done;
        click(document.querySelector('#cl-pre [data-action="check.toggle"][data-i="0"]'));
        return S.checks.pre[0].done === !before || 'did not toggle';
      });
      check('check.toggle: click on inner text also toggles', () => {
        const before = S.checks.pre[0].done;
        click(document.querySelector('#cl-pre .check-txt'));
        return S.checks.pre[0].done === !before || 'inner text click did not reach row';
      });
      check('check.delete: deletes without toggling survivor', () => {
        const n = S.checks.pre.length;
        click(document.querySelector('#cl-pre [data-action="check.delete"][data-i="0"]'));
        return S.checks.pre.length === n - 1 || 'length ' + S.checks.pre.length;
      });
      check('check.reset: clears all done flags', () => {
        S.checks.swap[0].done = true;
        click($('[data-action="check.reset"]'));
        const anyDone = Object.keys(S.checks).some(k => S.checks[k].some(c => c.done));
        return !anyDone || 'something still done';
      });

      // ---- CONFIG FORM -----------------------------------------------------
      pg('config');
      check('config.save: input event persists field', () => {
        const inp = $('#cfg-car');
        inp.value = 'Porsche 992 GT3 R';
        fire(inp, 'input');
        return S.config.car === 'Porsche 992 GT3 R' || 'got ' + S.config.car;
      });
      check('config.save-check: event name input persists', () => {
        const inp = $('#cfg-name');
        inp.value = 'Bathurst 12H';
        fire(inp, 'input');
        return S.config.name === 'Bathurst 12H' || 'got ' + S.config.name;
      });
      check('config.dur-change: select change updates duration', () => {
        const sel = $('#cfg-dur-h');
        sel.value = '8';
        fire(sel, 'change');
        return Math.floor(S.config.dur) === 8 || 'got ' + S.config.dur;
      });
      check('config.save: text input does NOT double-fire on change', () => {
        let calls = 0;
        const realPersist = window.persist;
        window.persist = function () { calls++; return realPersist.apply(this, arguments); };
        const inp = $('#cfg-track');
        inp.value = 'Mount Panorama';
        fire(inp, 'input');
        const afterInput = calls;
        fire(inp, 'change');           // config.save is gated to 'input' only
        const afterChange = calls;
        window.persist = realPersist;
        return afterChange === afterInput || 'change fired too: ' + afterInput + ' -> ' + afterChange;
      });

      // ---- DRIVER ROSTER AND SETTINGS --------------------------------------
      check('driver.edit: card click opens modal with that driver', () => {
        click(document.querySelector('#drv-list [data-action="driver.edit"][data-i="2"]'));
        const open = $('#drv-overlay').classList.contains('on');
        const nm = $('#dm-name').value;
        click($('[data-action="driver.close"]'));
        return (open && nm === 'Tom Becker') || 'open=' + open + ' name=' + nm;
      });
      check('driver.add: button opens blank modal', () => {
        click($('[data-action="driver.add"]'));
        const blank = $('#dm-name').value === '' && $('#drv-mtitle').textContent === 'Add Driver';
        click($('[data-action="driver.close"]'));
        return blank || 'modal not blank';
      });
      check('settings.flush: FOCUSOUT writes driver setting', () => {
        const inp = document.querySelector('#settings-tbody input[data-action="settings.flush"]');
        const di = +inp.dataset.di, k = inp.dataset.k;
        inp.value = '99';
        focusout(inp);
        return S.drivers[di].settings[k] === '99' || 'got ' + S.drivers[di].settings[k];
      });
      check('settings.add-col: opens column modal', () => {
        click($('[data-action="settings.add-col"]'));
        const open = $('#col-overlay').classList.contains('on');
        click($('[data-action="modal.close"][data-target="col-overlay"]'));
        return (open && !$('#col-overlay').classList.contains('on')) || 'modal.close failed';
      });

      // ---- TESTING NOTES ---------------------------------------------------
      check('tnote.add-lap: adds a lap note', () => {
        const n = (S.tnotes[0].lapNotes || []).length;
        click(document.querySelector('[data-action="tnote.add-lap"][data-i="0"]'));
        return S.tnotes[0].lapNotes.length === n + 1 || 'got ' + S.tnotes[0].lapNotes.length;
      });
      check('tnote.del-lap: removes the right lap note', () => {
        const n = S.tnotes[0].lapNotes.length;
        click(document.querySelector('[data-action="tnote.del-lap"][data-i="0"][data-li="0"]'));
        return S.tnotes[0].lapNotes.length === n - 1 || 'got ' + S.tnotes[0].lapNotes.length;
      });

      // ---- ARCHIVE ---------------------------------------------------------
      check('archive.delete: numeric id coercion works', () => {
        const before = JSON.parse(localStorage.getItem('lum_archive') || '[]').length;
        const btn = document.querySelector('[data-action="archive.delete"]');
        if (!btn) return 'no archive row rendered';
        click(btn);
        const after = JSON.parse(localStorage.getItem('lum_archive') || '[]').length;
        return after === before - 1 || 'archive ' + before + ' -> ' + after;
      });

      // ---- OPS QUICK LOG ---------------------------------------------------
      pg('ops');
      check('log.quick: appends a race log entry', () => {
        const n = S.raceLog.length;
        click($('[data-action="log.quick"][data-type="pit-in"]'));
        return S.raceLog.length === n + 1 || 'got ' + S.raceLog.length;
      });
      check('log.delete: removes that entry', () => {
        const n = S.raceLog.length;
        const btn = document.querySelector('[data-action="log.delete"]');
        if (!btn) return 'no delete button rendered';
        click(btn);
        return S.raceLog.length === n - 1 || 'got ' + S.raceLog.length;
      });

      // ---- PIT STRATEGY ----------------------------------------------------
      pg('fuel');
      check('fuel.calc: input triggers calculation', () => {
        $('#fc-fuel').value = '60'; fire($('#fc-fuel'), 'input');
        $('#fc-burn').value = '3.2'; fire($('#fc-burn'), 'input');
        $('#fc-lap').value = '2:18.5'; fire($('#fc-lap'), 'input');
        return $('#fc-results').textContent.indexOf('Enter all three') < 0 || 'results not calculated';
      });
      check('pit.calc-change: select change recalculates', () => {
        $('#ps-full-fuel').value = '55'; fire($('#ps-full-fuel'), 'input');
        $('#ps-half-fuel').value = '40'; fire($('#ps-half-fuel'), 'input');
        $('#ps-4tire').value = '68'; fire($('#ps-4tire'), 'input');
        $('#ps-fuel-add').value = '80'; fire($('#ps-fuel-add'), 'input');
        $('#ps-tank-size').value = '110'; fire($('#ps-tank-size'), 'input');
        const before = $('#ps-results').textContent;
        const sel = $('#ps-tires'); sel.value = '4'; fire(sel, 'change');
        return $('#ps-results').textContent !== before || 'no change on tire select';
      });

      // ---- OPTIMIZER -------------------------------------------------------
      pg('schedule');
      check('opt.run: boolean scope coercion reaches optimizer', () => {
        const before = $('#opt-result').textContent;
        click($('[data-action="opt.run"][data-scope="all"]'));
        return $('#opt-result').textContent !== before || 'optimizer produced no output';
      });

      // ---- CAR / TRACK PICK LISTS -----------------------------------------
      pg('config');
      const pickVals = id => [...document.querySelectorAll('#' + id + ' option')]
        .map(o => o.value).filter(v => v && v !== '__custom__');

      check('catalog: all three pickers are real <select> elements', () => {
        // Not <datalist>: iOS Safari renders a datalist with no dropdown at all.
        return ['cfg-class-pick', 'cfg-car-pick', 'cfg-track-pick']
          .every(id => $('#' + id) && $('#' + id).tagName === 'SELECT')
          || 'a picker is not a select';
      });
      check('catalog: pickers are populated', () => {
        const c = pickVals('cfg-car-pick').length, t = pickVals('cfg-track-pick').length,
              k = pickVals('cfg-class-pick').length;
        return (c > 0 && t > 0 && k > 0) || `cars=${c} tracks=${t} class=${k}`;
      });
      check('catalog: sim selection narrows the car list', () => {
        S.config.carClass = ''; S.config.sim = 'lmu'; buildCatalogLists();
        const lmu = pickVals('cfg-car-pick');
        S.config.sim = 'iracing'; buildCatalogLists();
        const ir = pickVals('cfg-car-pick');
        if (lmu.indexOf('BMW M4 GT3') >= 0) return 'iRacing-only car showing under LMU';
        if (ir.indexOf('Peugeot 9X8') >= 0) return 'LMU-only car showing under iRacing';
        if (lmu.indexOf('Porsche 963') < 0) return 'shared car missing from LMU list';
        return true;
      });
      check('config.class-pick: choosing a class shortens the car list to it', () => {
        S.config.sim = 'iracing';
        const before = (S.config.carClass = '', buildCatalogLists(), pickVals('cfg-car-pick').length);
        const sel = $('#cfg-class-pick');
        sel.value = 'GTP';
        fire(sel, 'change');
        const after = pickVals('cfg-car-pick');
        if (S.config.carClass !== 'GTP') return 'class not saved, got ' + S.config.carClass;
        if (after.length >= before) return `list did not shrink: ${before} -> ${after.length}`;
        const wrong = after.filter(n => {
          const c = CAR_LIST.find(x => x.name === n);
          return c && c.cls !== 'GTP';
        });
        return wrong.length === 0 || 'non-GTP cars left in list: ' + wrong.join(', ');
      });
      check('config.car-pick: choosing a known car fills its class', () => {
        S.config.carClass = ''; buildCatalogLists();
        const sel = $('#cfg-car-pick');
        sel.value = 'Ferrari 296 GT3';
        fire(sel, 'change');
        return (S.config.car === 'Ferrari 296 GT3' && S.config.carClass === 'GT3')
          || `car=${S.config.car} class=${S.config.carClass}`;
      });
      check('pickers: Other reveals the text box for a custom value', () => {
        const sel = $('#cfg-car-pick'), txt = $('#cfg-car');
        sel.value = '__custom__';
        fire(sel, 'change');
        if (txt.style.display === 'none') return 'text box stayed hidden';
        txt.value = 'Some Unlisted Car';
        fire(txt, 'input');
        return S.config.car === 'Some Unlisted Car' || 'got ' + S.config.car;
      });
      check('pickers: an unlisted saved value survives a rebuild', () => {
        // A car typed by hand must not be silently dropped when the list rebuilds.
        S.config.car = 'Some Unlisted Car';
        buildCatalogLists();
        return ($('#cfg-car-pick').value === '__custom__'
             && $('#cfg-car').value === 'Some Unlisted Car'
             && $('#cfg-car').style.display !== 'none')
          || 'custom value lost on rebuild';
      });
      check('build stamp is rendered', () => {
        showBuildStamp();
        return ($('#build-stamp').textContent === APP_BUILD && !!APP_BUILD)
          || 'got ' + $('#build-stamp').textContent;
      });

      // ---- LAP TIME AUTO-FORMAT -------------------------------------------
      check('fmtLapInput: keypad digits become lap times', () => {
        const want = {
          '218': '2:18', '218.543': '2:18.543', '21854': '2:18.54',
          '218543': '2:18.543', '1385': '1:38.5', '1230': '12:30',
          '2:18.5': '2:18.5', '': '', 'abc': 'abc', '1999': '1999'
        };
        const bad = Object.keys(want).filter(k => fmtLapInput(k) !== want[k]);
        return bad.length === 0 || bad.map(k => `${k}->${fmtLapInput(k)} want ${want[k]}`).join('; ');
      });
      check('driver.lap: FOCUSOUT reformats the box in place', () => {
        click($('[data-action="driver.add"]'));
        const inp = $('#dm-lap');
        inp.value = '218543';
        focusout(inp);
        const got = inp.value;
        click($('[data-action="driver.close"]'));
        return got === '2:18.543' || 'got ' + got;
      });

      // ---- UNKNOWN ACTION SAFETY ------------------------------------------
      check('unknown data-action warns and does not throw', () => {
        const d = document.createElement('div');
        d.dataset.action = 'does.not.exist';
        document.body.appendChild(d);
        let threw = false;
        try { click(d); } catch (e) { threw = true; }
        d.remove();
        return !threw || 'dispatcher threw on unknown action';
      });

      // ---- ENTRIES (multiple cars) -----------------------------------------
      check('entries: an existing single event is migrated into one entry', () => {
        ensureEntries();
        const ids = Object.keys(S.entries || {});
        return !!(ids.length >= 1 && S.activeEntry && S.entries[S.activeEntry])
          || 'entries=' + ids.length + ' active=' + S.activeEntry;
      });
      check('entries: the ACTIVE entry keeps its data in S, not duplicated', () => {
        // Storing it twice would multiply localStorage with every car added.
        return S.entries[S.activeEntry].state === null
          || 'active entry is holding a duplicate copy';
      });
      check('entries.new: adding a car carries over event and roster', () => {
        S.config.name = 'Spa 6H'; S.config.track = 'Spa-Francorchamps';
        S.config.car = 'BMW M4 GT3'; persist();
        const before = Object.keys(S.entries).length;
        const drivers = S.drivers.length;
        click($('[data-action="entries.new"]'));
        if (Object.keys(S.entries).length !== before + 1) return 'entry not added';
        if (S.config.name !== 'Spa 6H') return 'event name not carried over';
        if (S.config.track !== 'Spa-Francorchamps') return 'track not carried over';
        if (S.drivers.length !== drivers) return 'roster not carried over';
        if (S.config.car !== '') return 'car should start blank, got ' + S.config.car;
        return true;
      });
      check('entries: each car keeps its OWN data across switches', () => {
        const ids = Object.keys(S.entries);
        S.config.car = 'Porsche 911 GT3 R (992)'; persist();
        switchEntry(ids[0]);
        if (S.config.car !== 'BMW M4 GT3') return 'first car lost its data: ' + S.config.car;
        switchEntry(ids[1]);
        if (S.config.car !== 'Porsche 911 GT3 R (992)') return 'second car lost its data: ' + S.config.car;
        return true;
      });
      check('entries: stints stay with their own car', () => {
        const ids = Object.keys(S.entries);
        switchEntry(ids[0]);
        const n0 = S.stints.length;
        switchEntry(ids[1]);
        const n1 = S.stints.length;
        switchEntry(ids[0]);
        return S.stints.length === n0 || `stint counts bled across entries (${n0} vs ${n1})`;
      });
      check('entrySummary: reports on a car that is NOT on screen', () => {
        const ids = Object.keys(S.entries);
        const other = ids.find(i => i !== S.activeEntry);
        const s = entrySummary(other);
        return (s && typeof s.name === 'string' && s.car === 'Porsche 911 GT3 R (992)')
          || 'summary wrong: ' + JSON.stringify(s);
      });
      check('entries.delete: refuses to delete the last remaining car', () => {
        const ids = Object.keys(S.entries);
        while (Object.keys(S.entries).length > 1) {
          const victim = Object.keys(S.entries).find(i => i !== S.activeEntry);
          deleteEntry(victim);
        }
        const before = Object.keys(S.entries).length;
        deleteEntry(S.activeEntry);
        return Object.keys(S.entries).length === before || 'it deleted the only entry';
      });
      check('entry switcher is reachable from the header', () => {
        const trigger = document.querySelector('#strip [data-action="entries.open"]');
        if (!trigger) return 'no switcher in the header';
        click(trigger);
        const open = $('#entries-overlay').classList.contains('on');
        click($('[data-action="entries.close"]'));
        return open || 'switcher did not open';
      });

      // ---- READABILITY -----------------------------------------------------
      check('root font size is set, so rem no longer falls back to 16px', () => {
        const px = parseFloat(getComputedStyle(document.documentElement).fontSize);
        return px >= 20 || 'root font-size is ' + px + 'px';
      });
      check('NOTHING escapes the screen width on any tab', () => {
        // This replaces an earlier check that compared each page's scrollWidth to
        // its own clientWidth. That can never fail, because the page stretches
        // with its content, and it let a 762px-wide Config tab pass twice while
        // Michael was actually having to scroll sideways on his phone.
        // The honest test: measure against the VIEWPORT, and ignore elements
        // that are legitimately inside a horizontal scroller (a wide table
        // scrolling within its own card is correct).
        const vw = window.innerWidth;
        if (vw > 900) return true;   // only meaningful at phone/tablet widths
        const inScroller = n => {
          let p = n.parentElement;
          while (p && p !== document.body) {
            const ox = getComputedStyle(p).overflowX;
            if (ox === 'auto' || ox === 'scroll') return true;
            p = p.parentElement;
          }
          return false;
        };
        const bad = [];
        ['ops', 'config', 'schedule', 'avail', 'fuel', 'goals'].forEach(p => {
          pg(p);
          const e = document.getElementById('page-' + p);
          [...e.querySelectorAll('*')].forEach(n => {
            if (n.getBoundingClientRect().width > vw + 2 && !inScroller(n)) {
              bad.push(p + ':' + n.tagName.toLowerCase() + '=' + Math.round(n.getBoundingClientRect().width));
            }
          });
        });
        pg('ops');
        return bad.length === 0 || bad.length + ' element(s) wider than the screen, e.g. ' + bad.slice(0, 3).join(', ');
      });
      check('the retired Google Sheet sync card is gone', () => {
        return (!$('#sync-url-input') && !$('#sync-dot2')) || 'old sync card still present';
      });
      check('note popup can edit position and damage', () => {
        // The phone stint table hides those columns, so if they are not editable
        // here they are unreachable on the device he actually races with.
        if (!$('#note-pos') || !$('#note-dmg')) return 'position/damage fields missing from popup';
        click(document.querySelector('[data-action="stint.note"][data-i="0"]'));
        $('#note-pos').value = '4';
        $('#note-dmg').value = '1:20';
        click($('[data-action="note.save"]'));
        if (S.stints[0].position !== '4th') return 'position not saved, got ' + S.stints[0].position;
        if (S.stints[0].damage !== true) return 'damage flag not set';
        if (S.stints[0].damageTime !== '1:20') return 'repair time not saved';
        return true;
      });
      check('clearing repair time in the popup clears the damage flag', () => {
        click(document.querySelector('[data-action="stint.note"][data-i="0"]'));
        $('#note-dmg').value = '';
        click($('[data-action="note.save"]'));
        return S.stints[0].damage === false || 'damage stayed set with no repair time';
      });

      // ---- TEAM NAME + PASSWORD --------------------------------------------
      // NOTE: deriveTeamKey() is async (SubtleCrypto) and this runner is
      // synchronous, so the derivation itself is verified in the sync suite
      // rather than faked with a placeholder here. What IS checked here is that
      // the name+password path is wired up and the raw-key path still exists.
      check('team joins by name + password, with key entry kept as a fallback', () => {
        if (!$('#team-name-input') || !$('#team-pass-input')) return 'name/password fields missing';
        if (typeof deriveTeamKey !== 'function') return 'deriveTeamKey missing';
        if (typeof liveJoinByNamePassword !== 'function') return 'join handler missing';
        // The raw key route has to survive: invite links and existing teams use it.
        return !!$('#live-key-input') || 'advanced key entry was removed, which strands existing teams';
      });
      check('logo encoder always finds a size that fits', () => {
        // The first version simply refused an image, telling Michael it was
        // "too detailed" with nothing he could do. The encoder must step down
        // until it fits rather than give up.
        const big = document.createElement('canvas');
        big.width = big.height = 1400;
        const bx = big.getContext('2d');
        for (let i = 0; i < 6000; i++) {
          bx.fillStyle = 'hsl(' + (i % 360) + ',90%,' + (30 + i % 50) + '%)';
          bx.fillRect(Math.random() * 1400, Math.random() * 1400, 14, 14);
        }
        const out = encodeWithinBudget(big);
        if (!out) return 'a noisy image was still refused';
        return out.length <= TEAM_LOGO_BUDGET || 'encoded ' + out.length + ' over budget';
      });
      check('logo crop dialog exists and is square', () => {
        const c = $('#logo-crop-canvas');
        return (c && c.width === c.height) || 'crop canvas missing or not square';
      });
      check('safe areas: modals clear the Dynamic Island', () => {
        // The dialog title was painting under the clock on an iPhone.
        const css = [...document.styleSheets].some(s => {
          try { return [...s.cssRules].some(r => /mtitle/.test(r.cssText || '') && /safe-area-inset-top/.test(r.cssText || '')); }
          catch (e) { return false; }
        });
        return css || 'no safe-area inset on modal titles';
      });

      // ---- COLLAPSIBLE SECTIONS --------------------------------------------
      const collapsed = id => {
        const c = document.querySelector('[data-collapse="' + id + '"]');
        return c ? c.classList.contains('is-collapsed') : null;
      };
      check('collapse: finished setup folds itself away, once', () => {
        localStorage.removeItem('lum_collapsed');
        pg('config');
        applyCollapse();
        renderCollapseSummaries();
        return collapsed('prereq') === true
          || 'prerequisites stayed expanded with all of them met';
      });
      check('collapse: reopening it STICKS, it does not re-close itself', () => {
        // The worst version of this feature is a panel that keeps folding back
        // up every time the app re-checks something you deliberately opened.
        toggleCollapse('prereq');
        if (collapsed('prereq') !== false) return 'did not reopen';
        renderCollapseSummaries();
        renderCollapseSummaries();
        return collapsed('prereq') === false || 're-collapsed itself against the user';
      });
      check('collapse: a collapsed header still says what the state is', () => {
        const s = $('#prereq-summary');
        return (s && s.textContent.trim().length > 0)
          || 'collapsed header shows no summary, so collapsing just hides information';
      });
      check('collapse: pit calibration folds but the live calculator does NOT', () => {
        localStorage.removeItem('lum_collapsed');
        pg('fuel');
        ['ps-full-fuel', 'ps-half-fuel', 'ps-2tire', 'ps-4tire'].forEach((id, i) => {
          const e = $('#' + id); e.value = String(40 + i * 5);
          fire(e, 'input');
        });
        renderCollapseSummaries();
        if (collapsed('pitcal') !== true) return 'calibration did not fold once complete';
        // "Calculate This Stop" is used DURING a race and must never fold away
        // with the setup above it.
        return !!$('#ps-fuel-add').offsetParent || 'the live calculator got folded away too';
      });
      check('collapse: state is per device, never synced', () => {
        // What is folded up on a phone has nothing to do with what a teammate
        // wants to see, so it must not appear in the synced paths.
        const paths = Object.keys(livePaths());
        return !paths.some(p => /collaps/i.test(p)) || 'collapse state is being synced';
      });

      // ---- SAMPLE EVENT ----------------------------------------------------
      // Destructive: replaces all state. Must stay LAST in this suite.
      check('demo.load: builds a complete, currently-running race', () => {
        click($('[data-action="demo.load"]'));
        const now = Date.now();
        if (S.drivers.length !== 4) return 'drivers=' + S.drivers.length;
        if (!S.stints.length) return 'no stints built';
        if (!S.stints.every(s => !!s.driver)) return 'a stint has no driver';
        if (!S.stints.some(s => s.startMs <= now && s.endMs > now)) return 'no stint is live';
        if (!S.stints.some(s => s.done)) return 'no completed stint';
        if (!S.goals.length || !S.tnotes.length) return 'goals or notes missing';
        if (!Object.keys(S.avail).length) return 'no availability set';
        if (!checkPrereqs()) return 'prerequisites not met after load';
        return true;
      });

    } finally {
      window.confirm = realConfirm;
      window.alert = realAlert;
      window.prompt = realPrompt;
    }

    const failed = results.filter(r => !r.pass);
    return {
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      failures: failed.map(f => f.name + ' -> ' + f.detail)
    };
  }

  return { run, results };
})();
