/* LUMINARY ENDURANCE MANAGER — sync backend tests.

   Run these against a LOCAL worker before every deploy:

     npx wrangler dev --port 8787

   then in any browser page (the app served from tools/serve.ps1 will do):

     fetch('/__harness/sync-test.js').then(r=>r.text()).then(t=>eval(t))
       .then(()=>SYNCTEST.run()).then(r=>console.log(r));

   Point it at the deployed worker instead by passing the base URL:
     SYNCTEST.run('wss://luminary-sync.<subdomain>.workers.dev')

   These are correctness tests, not smoke tests. Each one targets a specific way
   a sync design silently loses a strategist's data mid-race. */

window.SYNCTEST = (function () {

  const wait = ms => new Promise(r => setTimeout(r, ms));

  function run(base) {
    const WS = (base || 'ws://127.0.0.1:8787').replace(/\/+$/, '');
    // A fresh team key per run, so tests never inherit state from each other.
    const KEY = 'test-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
    const url = WS + '/team/' + KEY + '/ws';

    const results = [];
    const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail: pass ? '' : String(detail) });

    function open(tag) {
      return new Promise((res, rej) => {
        const ws = new WebSocket(url + '?clientId=' + tag + '&name=' + tag);
        ws.msgs = [];
        ws.onmessage = e => { try { ws.msgs.push(JSON.parse(e.data)); } catch (x) {} };
        ws.onopen = () => res(ws);
        ws.onerror = () => rej(new Error('connection failed: ' + tag));
        setTimeout(() => rej(new Error('timeout opening ' + tag)), 10000);
      });
    }

    return (async () => {
      const t0 = Date.now();
      let a, b, c, d;
      try {
        a = await open('phone');
        b = await open('pc');
        await wait(400);

        ok('two clients connect', a.readyState === 1 && b.readyState === 1, 'readyState');

        // 1. A change on one device reaches the other with nobody asking for it.
        //    This is the whole point of the phase.
        a.send(JSON.stringify({ type: 'patch', path: 'config.track', value: 'Spa', ts: t0 }));
        await wait(500);
        const onB = b.msgs.filter(m => m.type === 'patch' && m.path === 'config.track').slice(-1)[0];
        ok('phone edit appears on pc', onB && onB.value === 'Spa', JSON.stringify(onB));
        ok('sender is acknowledged', a.msgs.some(m => m.type === 'ack' && m.path === 'config.track'), 'no ack');

        // 2. Different fields edited at once must BOTH survive. Whole-document
        //    sync is what loses one of them; per-field patching is why we do this.
        b.send(JSON.stringify({ type: 'patch', path: 'config.car', value: 'BMW M4 GT3', ts: t0 + 10 }));
        await wait(500);

        // 3. A device joining late catches up with no action from anyone.
        c = await open('tablet');
        await wait(600);
        const snap = c.msgs.find(m => m.type === 'snapshot');
        ok('late joiner receives a snapshot', !!snap, 'no snapshot');
        ok('late joiner has BOTH fields',
          snap && snap.state['config.track'] === 'Spa' && snap.state['config.car'] === 'BMW M4 GT3',
          snap ? JSON.stringify(snap.state) : 'none');

        // 4. Same field, newer timestamp wins.
        b.send(JSON.stringify({ type: 'patch', path: 'config.track', value: 'Le Mans', ts: t0 + 5000 }));
        await wait(500);
        const latest = a.msgs.filter(m => m.type === 'patch' && m.path === 'config.track').slice(-1)[0];
        ok('newer edit wins', latest && latest.value === 'Le Mans', JSON.stringify(latest));

        // 5. THE IMPORTANT ONE. A stale write, e.g. a device that was offline
        //    flushing an old queue, must be REJECTED rather than applied over
        //    newer data, and the sender must be told the winning value.
        a.msgs.length = 0;
        a.send(JSON.stringify({ type: 'patch', path: 'config.track', value: 'STALE', ts: t0 - 60000 }));
        await wait(500);
        const rej = a.msgs.find(m => m.type === 'rejected');
        ok('stale write is rejected', rej && rej.path === 'config.track', JSON.stringify(rej));
        ok('rejection returns the winning value', rej && rej.value === 'Le Mans', JSON.stringify(rej));
        ok('stale write did not reach other clients',
          !b.msgs.some(m => m.type === 'patch' && m.value === 'STALE'), 'STALE leaked');

        // 6. State survives every client disconnecting. A race lasts hours and
        //    phones drop off constantly.
        a.close(); b.close(); c.close();
        await wait(900);
        d = await open('reconnect');
        await wait(600);
        const snap2 = d.msgs.find(m => m.type === 'snapshot');
        ok('state survives all clients leaving',
          snap2 && snap2.state['config.track'] === 'Le Mans' && snap2.state['config.car'] === 'BMW M4 GT3',
          snap2 ? JSON.stringify(snap2.state) : 'none');

        // 7. Rubbish input must not take the worker down.
        d.send('this is not json');
        await wait(300);
        d.send(JSON.stringify({ type: 'patch' }));   // no path
        await wait(300);
        ok('bad input is handled, connection stays up', d.readyState === 1, 'socket died');
        ok('bad input produces errors not silence', d.msgs.some(m => m.type === 'error'), 'no error reply');

      } catch (e) {
        ok('suite completed', false, e.message);
      } finally {
        [a, b, c, d].forEach(w => { try { w && w.close(); } catch (x) {} });
      }

      const failed = results.filter(r => !r.pass);
      return {
        total: results.length,
        passed: results.length - failed.length,
        failed: failed.length,
        failures: failed.map(f => f.name + ' -> ' + f.detail),
        all: results.map(r => (r.pass ? 'PASS ' : 'FAIL ') + r.name)
      };
    })();
  }

  return { run };
})();
