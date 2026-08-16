/* LUMINARY v2 — functional tests.

   WHY THIS EXISTS, AND WHY IT EXISTS LATE

   v1 has 72 automated tests that run on every change. v2 shipped with NONE.
   I verified it by calling functions in a console, which is not the same as
   tapping through it, and the result was three bugs found by Michael instead of
   by me, in a row:

     1. No way to delete a mis-tapped Quick Log entry.
     2. Tapping the team name or password raised the keyboard and dismissed it,
        because the one-second re-render destroyed the focused input.
     3. The bottom Team tab was unreachable: it shared an identifier with the
        header sync button, so tapping it opened the sync sheet instead.

   All three were trivially catchable. The third in particular would have been
   caught by the most obvious test imaginable: tap every navigation item and
   check the right screen appears.

   These tests dispatch REAL events on REAL elements, the same as v1's suite.
   Run from the v2 page:

     fetch('/__harness/v2-test.js').then(r=>r.text()).then(t=>eval(t))
       .then(()=>V2TEST.run()).then(r=>console.log(r));
*/

window.V2TEST = (function () {

  const results = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  function check(name, fn) {
    try {
      const r = fn();
      results.push({ name, pass: r === true, detail: r === true ? '' : String(r) });
    } catch (e) {
      results.push({ name, pass: false, detail: 'THREW ' + e.message });
    }
  }
  const $ = s => document.querySelector(s);
  const click = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  const fire = (el, t) => el.dispatchEvent(new Event(t, { bubbles: true }));
  const shown = sel => { const e = $(sel); return !!e && getComputedStyle(e).display !== 'none'; };

  async function run() {
    results.length = 0;
    const realConfirm = window.confirm, realAlert = window.alert, realPrompt = window.prompt;
    window.confirm = () => true; window.alert = () => {}; window.prompt = () => 'Test';

    try {
      // ---- NAVIGATION. The test that would have caught bug 3 ------------
      check('every bottom-nav item reaches its own screen', () => {
        const bad = [];
        ['race', 'plan', 'team'].forEach(name => {
          const btn = document.querySelector('#v2-nav button[data-v2="' + name + '"]');
          if (!btn) { bad.push(name + ':no button'); return; }
          click(btn);
          const active = $('.v2-screen.on');
          if (!active || active.id !== 'screen-' + name) {
            bad.push(name + ' -> ' + (active ? active.id : 'nothing'));
          }
        });
        return bad.length === 0 || bad.join(', ');
      });
      check('nav buttons do not collide with the header controls', () => {
        // The Team tab and the sync button shared data-v2="team", so the tab
        // opened a sheet and its screen was unreachable.
        const navNames = [...document.querySelectorAll('#v2-nav button')].map(b => b.dataset.v2);
        const headNames = [...document.querySelectorAll('#v2-head [data-v2]')].map(b => b.dataset.v2);
        const clash = navNames.filter(n => headNames.indexOf(n) >= 0);
        return clash.length === 0 || 'shared identifier: ' + clash.join(', ');
      });
      check('closing a sheet leaves the screen underneath usable', () => {
        click(document.querySelector('#v2-nav button[data-v2="team"]'));
        click($('#v2-sync'));
        if (!$('#sheet-team').classList.contains('on')) return 'sync sheet did not open';
        click($('#sheet-team [data-v2="close"]'));
        if ($('#sheet-team').classList.contains('on')) return 'sheet did not close';
        return shown('#screen-team') || 'Team screen not visible after closing the sheet';
      });

      // ---- RACE ----------------------------------------------------------
      click(document.querySelector('#v2-nav button[data-v2="race"]'));
      check('quick log adds an entry and it can be removed again', () => {
        const before = S.raceLog.length;
        click($('[data-v2act="log"][data-type="pit-in"]'));
        if (S.raceLog.length !== before + 1) return 'log did not add';
        const del = $('.feed-del');
        if (!del) return 'no delete control on the feed';
        click(del);
        return S.raceLog.length === before || 'delete did not remove it';
      });
      check('the countdown renders something', () => {
        const t = $('#hero-time').textContent.trim();
        return t.length > 0 || 'hero countdown is empty';
      });

      // ---- ENTRIES -------------------------------------------------------
      check('cars can be added AND deleted', () => {
        click($('#v2-entry'));
        if (!$('#sheet-entries').classList.contains('on')) return 'entries sheet did not open';
        const before = Object.keys(S.entries).length;
        click($('[data-v2act="entry-new"]'));
        if (Object.keys(S.entries).length !== before + 1) return 'add car failed';
        const del = $('.ecard-del');
        if (!del) return 'no delete control on a car';   // v2 shipped without one
        click(del);
        const after = Object.keys(S.entries).length;
        click($('#sheet-entries [data-v2="close"]'));
        return after === before || 'delete car failed: ' + before + ' -> ' + after;
      });

      // ---- TYPING. The test that would have caught bug 2 -----------------
      await (async () => {
        const key = LIVE_KEY;
        if (key) { try { liveDisconnect(); } catch (e) {} }
        click($('#v2-sync'));
        renderTeamSheet();
        const inp = $('#v2-tn');
        if (!inp) { results.push({ name: 'a focused input survives the one-second re-render', pass: false, detail: 'team name field missing' }); return; }
        inp.focus();
        inp.value = 'Wildthings';
        await wait(2400);            // spans at least two render ticks
        const still = $('#v2-tn');
        const ok = still === inp && document.activeElement === still && still.value === 'Wildthings';
        results.push({
          name: 'a focused input survives the one-second re-render',
          pass: ok,
          detail: ok ? '' : 'element replaced or focus lost, which closes the keyboard on iOS'
        });
        still.blur();
        click($('#sheet-team [data-v2="close"]'));
      })();

      // ---- BRAND ----------------------------------------------------------
      check('each screen carries its brand accent', () => {
        // Blue = Racing, Yellow = Engineering, Orange = Performance.
        const want = { race: '142, 199, 230', plan: '255, 138, 28', team: '223, 255, 0' };
        const bad = [];
        Object.keys(want).forEach(name => {
          click(document.querySelector('#v2-nav button[data-v2="' + name + '"]'));
          const btn = document.querySelector('#v2-nav button[data-v2="' + name + '"]');
          const c = getComputedStyle(btn).color.replace(/rgba?\(|\)/g, '');
          if (c.indexOf(want[name]) < 0) bad.push(name + ' is ' + c);
        });
        click(document.querySelector('#v2-nav button[data-v2="race"]'));
        return bad.length === 0 || bad.join('; ');
      });

      // ---- SHARED ENGINE --------------------------------------------------
      check('v2 uses the same engine and data as v1', () => {
        return (typeof buildStints === 'function' && typeof liveInit === 'function'
          && typeof entrySummary === 'function' && localStorage.getItem('lum4') !== null)
          || 'engine or shared state missing';
      });

    } catch (e) {
      results.push({ name: 'suite completed', pass: false, detail: e.message });
    } finally {
      window.confirm = realConfirm; window.alert = realAlert; window.prompt = realPrompt;
    }

    const failed = results.filter(r => !r.pass);
    return {
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      failures: failed.map(f => f.name + ' -> ' + f.detail),
      all: results.map(r => (r.pass ? 'PASS ' : 'FAIL ') + r.name)
    };
  }

  return { run };
})();
