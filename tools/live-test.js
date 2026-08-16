/* LUMINARY ENDURANCE MANAGER — live sync client tests.

   These drive the REAL app client (js/live.js) against the REAL backend, using
   two independent iframes as two independent devices. That is the only way to
   test this honestly: a single page talking to itself would share the same S
   object and prove nothing.

   Run from a page served by tools/serve.ps1:
     fetch('/__harness/live-test.js').then(r=>r.text()).then(t=>eval(t))
       .then(()=>LIVETEST.run()).then(r=>console.log(r));
*/

window.LIVETEST = (function () {

  const wait = ms => new Promise(r => setTimeout(r, ms));

  function bootDevice(tag) {
    return new Promise((resolve, reject) => {
      const f = document.createElement('iframe');
      f.style.cssText = 'width:900px;height:700px;position:fixed;left:-9999px;top:0';
      f.src = '/index.html?device=' + tag;
      f.onload = () => setTimeout(() => resolve(f), 900);
      f.onerror = () => reject(new Error('iframe failed: ' + tag));
      document.body.appendChild(f);
      setTimeout(() => reject(new Error('iframe timeout: ' + tag)), 20000);
    });
  }

  /* IMPORTANT: top-level `let`/`const` in a classic script live in SCRIPT scope,
     not on `window`. So `frame.contentWindow.S` is undefined even though S is
     perfectly reachable inside that document, and the same goes for LIVE_KEY,
     _liveOpen and every other let/const. Only function declarations land on
     window. Everything below therefore reaches into a device through its own
     global eval, which does see those bindings. */
  const ev = (w, expr) => w.eval(expr);

  /* Each iframe is a separate browsing context but shares this origin's
     localStorage, so devices must be given distinct client ids and must not
     fight over the stored team key. We drive them explicitly instead. */
  async function joinTeam(win, key, name) {
    win.localStorage.setItem('lum_live_name', name);
    ev(win, '_liveClientId = ' + JSON.stringify(name.toLowerCase() + '-' + Math.random().toString(36).slice(2, 6)) + ';' +
             'LIVE_KEY = ' + JSON.stringify(key) + '; liveOpenSocket();');
    for (let i = 0; i < 60; i++) {
      if (ev(win, '_liveOpen')) return true;
      await wait(150);
    }
    throw new Error(name + ' never connected');
  }

  async function until(fn, ms) {
    const end = Date.now() + (ms || 6000);
    while (Date.now() < end) { if (fn()) return true; await wait(120); }
    return false;
  }

  function run(teamKey) {
    const KEY = teamKey || ('livetest-' + Math.random().toString(36).slice(2, 10));
    const results = [];
    const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail: pass ? '' : String(detail) });
    let fa, fb;

    return (async () => {
      try {
        fa = await bootDevice('A');
        fb = await bootDevice('B');
        const A = fa.contentWindow, B = fb.contentWindow;

        ok('both app instances booted',
          ev(A, 'typeof S') === 'object' && ev(B, 'typeof S') === 'object', 'app did not initialise');

        await joinTeam(A, KEY, 'Phone');
        await wait(1000);
        ok('first device seeds an empty team', ev(A, '_liveSeeded'), 'did not seed');

        await joinTeam(B, KEY, 'Computer');
        await wait(1800);

        // 1. Config field typed on A must land on B.
        ev(A, 'S.config.track="Spa-Francorchamps";persist();');
        const gotTrack = await until(() => ev(B, 'S.config.track') === 'Spa-Francorchamps', 9000);
        ok('config change syncs phone to computer', gotTrack, 'B track=' + ev(B, 'S.config.track'));

        // 2. And the other direction.
        ev(B, 'S.config.car="Porsche 963";persist();');
        const gotCar = await until(() => ev(A, 'S.config.car') === 'Porsche 963', 9000);
        ok('config change syncs computer to phone', gotCar, 'A car=' + ev(A, 'S.config.car'));

        // 3. Simultaneous edits to DIFFERENT fields must both survive. This is
        //    exactly the property the old whole-state broadcast does not have.
        ev(A, 'S.config.name="Spa 6H";persist();');
        ev(B, 'S.config.carClass="GTP";persist();');
        const bothKept = await until(() =>
          ev(A, 'S.config.name') === 'Spa 6H' && ev(A, 'S.config.carClass') === 'GTP' &&
          ev(B, 'S.config.name') === 'Spa 6H' && ev(B, 'S.config.carClass') === 'GTP', 9000);
        ok('concurrent edits to different fields both survive', bothKept,
          'A=' + ev(A, 'S.config.name') + '/' + ev(A, 'S.config.carClass') +
          ' B=' + ev(B, 'S.config.name') + '/' + ev(B, 'S.config.carClass'));

        // 4. A built schedule must reach the other device.
        ev(A, 'S.config.date="2026-09-12";S.config.hour=13;S.config.dur=6;S.config.green=40;' +
               'S.config.lap="2:18.5";S.config.fpl="3.20";S.config.tank="110";S.config.res="4";' +
               'S.config.pit="1:10";persist();buildStints();');
        await wait(2500);
        const aCount = ev(A, 'S.stints.length');
        const sameCount = await until(() => ev(B, 'S.stints.length') === aCount && aCount > 0, 12000);
        ok('schedule appears on the other device', sameCount,
          'A=' + aCount + ' B=' + ev(B, 'S.stints.length'));

        if (sameCount) {
          ok('both devices compute identical stint times',
            ev(A, 'JSON.stringify(S.stints.map(s=>[s.num,s.startMs,s.endMs]))') ===
            ev(B, 'JSON.stringify(S.stints.map(s=>[s.num,s.startMs,s.endMs]))'), 'times diverged');

          // 5. A per-stint assignment syncs.
          const drv = ev(A, 'S.drivers[0].name');
          ev(A, 'S.stints[1].driver=S.drivers[0].name;persist();');
          const gotDriver = await until(() => ev(B, 'S.stints[1] && S.stints[1].driver') === drv, 9000);
          ok('stint driver assignment syncs', gotDriver, 'B stint2=' + ev(B, '(S.stints[1]||{}).driver'));

          // 6. Two devices editing DIFFERENT stints must not clobber each other.
          ev(A, 'S.stints[0].position="3rd";persist();');
          ev(B, 'S.stints[2].notes="pit window opens";persist();');
          const bothStints = await until(() =>
            ev(A, 'S.stints[0].position') === '3rd' && ev(A, 'S.stints[2].notes') === 'pit window opens' &&
            ev(B, 'S.stints[0].position') === '3rd' && ev(B, 'S.stints[2].notes') === 'pit window opens', 9000);
          ok('edits to different stints both survive', bothStints,
            'A=' + ev(A, 'S.stints[0].position') + '/' + ev(A, 'S.stints[2].notes') +
            ' B=' + ev(B, 'S.stints[0].position') + '/' + ev(B, 'S.stints[2].notes'));
        }

        // 7. Availability cells are individually keyed and must merge.
        ev(A, 'S.avail["0_100"]="blocked";persist();');
        ev(B, 'S.avail["1_101"]="maybe";persist();');
        const availMerged = await until(() =>
          ev(A, 'S.avail["1_101"]') === 'maybe' && ev(B, 'S.avail["0_100"]') === 'blocked', 9000);
        ok('availability edits merge both ways', availMerged,
          'A1101=' + ev(A, 'S.avail["1_101"]') + ' B0100=' + ev(B, 'S.avail["0_100"]'));

        // 8. Applying a remote change must NOT echo back out as a local one, or
        //    two devices would ping-pong forever.
        ev(B, 'S.config.track="Le Mans";persist();');
        await until(() => ev(A, 'S.config.track') === 'Le Mans', 9000);
        await wait(1800);
        ok('no echo loop between devices',
          ev(A, 'S.config.track') === 'Le Mans' && ev(B, 'S.config.track') === 'Le Mans',
          'A=' + ev(A, 'S.config.track') + ' B=' + ev(B, 'S.config.track'));

        // 9. A device that drops off and returns catches up on what it missed.
        ev(B, '_liveWs.close();');
        await wait(800);
        ev(A, 'S.config.name="Bathurst 12H";persist();');
        await wait(800);
        await joinTeam(B, KEY, 'Computer');
        const caughtUp = await until(() => ev(B, 'S.config.name') === 'Bathurst 12H', 12000);
        ok('a device that reconnects catches up', caughtUp, 'B name=' + ev(B, 'S.config.name'));

      } catch (e) {
        ok('suite completed', false, e.message);
      } finally {
        [fa, fb].forEach(f => { try { f && f.remove(); } catch (x) {} });
      }

      const failed = results.filter(r => !r.pass);
      return {
        total: results.length, passed: results.length - failed.length, failed: failed.length,
        failures: failed.map(f => f.name + ' -> ' + f.detail),
        all: results.map(r => (r.pass ? 'PASS ' : 'FAIL ') + r.name)
      };
    })();
  }

  return { run };
})();
