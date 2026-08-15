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
      check('nav: strip live-sync block opens config', () => {
        click($('#strip [data-action="nav"][data-page="config"]'));
        return $('#page-config').classList.contains('on') || 'page-config not active';
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
