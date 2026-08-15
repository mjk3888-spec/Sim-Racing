/* Step 5 verification harness for Luminary Endurance Manager.
   Served from the scratchpad at /__harness/harness.js so nothing lands in the repo.

   Procedure per capture run, so both sides start from byte-identical state:
     1. LUM.seed()      write the fixed event into localStorage
     2. reload
     3. LUM.capture()   build a schedule, exercise the render paths, hash each tab

   Hashes ignore every event-wiring attribute (on* and the data-* delegation set)
   so pre-change and post-change markup is directly comparable. */

window.LUM = (function () {

  const DELEG_ATTRS = [
    'data-action', 'data-i', 'data-li', 'data-id', 'data-cat', 'data-page',
    'data-mode', 'data-scope', 'data-state', 'data-type', 'data-key',
    'data-target', 'data-close', 'data-enter-blur', 'data-v'
  ];

  const SEED = {
    config: {
      name: 'Spa 6H Test', car: 'BMW M4 GT3', carClass: 'GT3',
      track: 'Spa-Francorchamps', sim: 'iracing', date: '2026-09-12',
      hour: 13, dur: 6, green: 40, ighr: 14,
      lap: '2:18.5', fpl: '3.20', fslap: '2:20.0', fsburn: '3.05',
      tank: '110', pit: '1:10', res: '4'
    },
    drivers: [
      { id: 1, name: 'Michael Kelly', handle: 'MJK', ir: 3120, tz: 'America/New_York', gmt: -4, tzabbr: 'ET', country: 'US', countryName: 'United States', countryFlag: 'us', color: '#DFFF00', maxConsec: 2, timefmt: '12', lap: '2:18.5', fpl: '3.20', fslap: '2:20.0', fsburn: '3.05', settings: { c_a: '12', c_b: '4.5' } },
      { id: 2, name: 'Ana Silva', handle: 'ANA', ir: 2840, tz: 'Europe/Lisbon', gmt: 1, tzabbr: 'WEST', country: 'PT', countryName: 'Portugal', countryFlag: 'pt', color: '#8EC7E6', maxConsec: 3, timefmt: '24', lap: '2:19.1', fpl: '3.25', fslap: '2:20.8', fsburn: '3.08', settings: { c_a: '12', c_b: '4.0' } },
      { id: 3, name: 'Tom Becker', handle: 'TB', ir: 3600, tz: 'Europe/Berlin', gmt: 2, tzabbr: 'CEST', country: 'DE', countryName: 'Germany', countryFlag: 'de', color: '#FF8A1C', maxConsec: 2, timefmt: '24', lap: '2:17.9', fpl: '3.18', fslap: '2:19.4', fsburn: '3.02', settings: { c_a: '11', c_b: '4.5' } },
      { id: 4, name: 'Yuki Sato', handle: 'YS', ir: 2450, tz: 'Asia/Tokyo', gmt: 9, tzabbr: 'JST', country: 'JP', countryName: 'Japan', countryFlag: 'jp', color: '#C060E8', maxConsec: 1, timefmt: '24', lap: '2:20.2', fpl: '3.30', fslap: '2:21.9', fsburn: '3.12', settings: { c_a: '12', c_b: '5.0' } }
    ],
    settingCols: [{ n: 'Wing', k: 'c_a' }, { n: 'Pressure', k: 'c_b' }],
    stints: [],
    avail: { '0_100': 'blocked', '1_101': 'maybe', '2_102': 'open', '3_103': 'blocked' },
    goals: [
      { id: 1, text: 'Finish on lead lap', done: false, order: 0 },
      { id: 2, text: 'Zero incidents in stint 1', done: true, order: 1 },
      { id: 3, text: 'Average under 2:19', done: false, order: 2 }
    ],
    checks: {
      pre: [{ id: 11, text: 'Fuel map confirmed', done: true }, { id: 12, text: 'Discord audio check', done: false }],
      swap: [{ id: 21, text: 'Belts tight', done: false }],
      post: [{ id: 31, text: 'Save telemetry', done: false }]
    },
    tnotes: [{ id: 41, driver: 'Michael Kelly', lap: '2:18.3', air: '22', trk: '31', unit: 'C', fuel: '3.2', lapNotes: ['Kerb at Pouhon unsettles car', 'Brake bias 54.5 better'] }],
    schMeta: { qualiDriver: 'Tom Becker', qualiPos: '4th', qualiNotes: 'Traffic on final run' },
    raceLog: [
      { id: 51, type: 'pit-in', label: 'Pit In', driver: 'MJK', ts: 1789045200000 },
      { id: 52, type: 'contact', label: 'Contact / Damage', driver: 'MJK', ts: 1789046400000 }
    ],
    editDrvIdx: null
  };

  function seed() {
    localStorage.clear();
    localStorage.setItem('lum4', JSON.stringify(SEED));
    localStorage.setItem('lum_drivers', JSON.stringify([
      { name: 'Michael Kelly', handle: 'MJK', ir: 3120, tz: 'America/New_York', country: 'US', color: '#DFFF00', timefmt: '12', maxConsec: 2 }
    ]));
    localStorage.setItem('lum_archive', JSON.stringify([{
      id: 61, name: 'Daytona 24 2026', track: 'Daytona', car: 'BMW M4 GT3',
      date: '2026-01-24', savedAt: '2026-01-25T18:00:00.000Z',
      state: { config: { name: 'Daytona 24 2026' }, drivers: [], stints: [], avail: {}, goals: [], checks: { pre: [], swap: [], post: [] }, tnotes: [], schMeta: {}, raceLog: [], settingCols: [] }
    }]));
    return 'seeded';
  }

  function norm(root) {
    const c = root.cloneNode(true);
    c.querySelectorAll('*').forEach(n => {
      [...n.attributes].forEach(a => {
        const nm = a.name.toLowerCase();
        if (/^on/.test(nm) || DELEG_ATTRS.indexOf(nm) >= 0) n.removeAttribute(a.name);
      });
    });
    return c.innerHTML.replace(/\s+/g, ' ').trim();
  }

  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(16) + ':' + s.length;
  }

  /* The Ops dashboard and the header strip render live race clocks and driver
     countdowns. Without pinning the clock their markup changes every second and
     the hashes are meaningless. Pin to 15:30 GMT on race day, which is inside
     stint 2: that leaves stint 1 past/done, stint 2 live, the rest scheduled,
     so all three render branches are exercised. */
  const FROZEN_AT = Date.UTC(2026, 8, 12, 15, 30, 0);
  const RealDate = Date;
  function freezeTime(fixed) {
    if (window.Date !== RealDate) return;   // already frozen
    const F = function (...a) { return a.length ? new RealDate(...a) : new RealDate(fixed); };
    F.now = () => fixed;
    F.parse = RealDate.parse;
    F.UTC = RealDate.UTC;
    F.prototype = RealDate.prototype;
    window.Date = F;
  }

  function capture() {
    freezeTime(FROZEN_AT);
    buildStints();
    S.stints[0].driver = 'Tom Becker';
    S.stints[1].driver = 'Michael Kelly';
    S.stints[2].driver = 'Ana Silva';
    S.stints[3].driver = 'Yuki Sato';
    S.stints[3].stintType = 'fs';
    S.stints[0].done = true;
    S.stints[0].actualLaps = 24;
    S.stints[0].position = '3rd';
    S.stints[0].notes = 'Clean opening stint';
    S.stints[1].damage = true;
    S.stints[1].damageTime = '1:20';
    S.stints[1].position = '5th';
    persist();
    renderSchedule(); buildAvail(); updateDash(); renderStatusLog();

    const out = {
      stintCount: S.stints.length,
      digest: S.stints.map(s => [s.num, s.driver || '-', s.stintType, s.laps, s.fuel, s.durMs, s.isFinal ? 'F' : ''].join('|')).join(';')
    };
    out.digestHash = hash(out.digest);
    ['ops', 'config', 'schedule', 'avail', 'fuel', 'goals'].forEach(p => {
      pg(p);
      out['tab_' + p] = hash(norm(document.getElementById('page-' + p)));
    });
    out.strip = hash(norm(document.getElementById('strip')));
    out.modalCount = document.querySelectorAll('.overlay').length;
    out.modals = hash([...document.querySelectorAll('.overlay')].map(norm).join('|'));
    pg('ops');
    return out;
  }

  /* Every function name referenced by an inline handler in the pre-change build.
     After conversion these must still all exist as globals: the delegated
     dispatcher calls them, so a missing one is a dead button. */
  const REFERENCED = ['pg', 'quickLog', 'sc', 'applySimMode', 'checkPrereqs', 'syncHourDrop',
    'syncDurDrop', 'syncIghrDrop', 'openDrvModal', 'addCol', 'removeLastCol', 'openTNote',
    'archiveEvent', 'exportScheduleCSV', 'exportScheduleText', 'saveSyncUrl', 'disconnectSync',
    'optimizeStints', 'saveSchMeta', 'saveSchMetaPos', 'refreshAvTimeDrops', 'applyWindow',
    'calcCompare', 'prefillCompare', 'calcFuel', 'calcPit', 'openGoal', 'openCheck',
    'resetChecks', 'loadFromLib', 'removeFromLib', 'onTZChange', 'confirmDeleteDriver',
    'closeDrv', 'saveDrv', 'closeNote', 'markDone', 'saveNote', 'confirmCol', 'saveGoal',
    'saveCheck', 'saveTNote', 'saveDamageModal', 'restoreArchive', 'delArchive',
    'flushSetting', 'addLapNote', 'delTNote', 'delLapNote', 'delLogEntry', 'goalDragStart',
    'goalDragOver', 'goalDrop', 'toggleGoal', 'delGoal', 'toggleCL', 'delCheck',
    'toggleDamage', 'assignDrv', 'assignType', 'saveActualEnd', 'saveActualLaps',
    'savePosition', 'openNote', 'cycleAv', 'renderSchedule'];

  function globals() {
    const missing = REFERENCED.filter(n => typeof window[n] !== 'function');
    return { checked: REFERENCED.length, missing: missing };
  }

  /* Count leftover inline handlers anywhere in the live DOM, and confirm every
     data-action in the DOM resolves to a registered action. */
  function wiring() {
    const inline = [];
    document.querySelectorAll('*').forEach(n => {
      [...n.attributes].forEach(a => {
        if (/^on/i.test(a.name)) inline.push(n.tagName.toLowerCase() + '[' + a.name + ']');
      });
    });
    const used = [...document.querySelectorAll('[data-action]')].map(n => n.dataset.action);
    const uniqUsed = [...new Set(used)].sort();
    const registered = (typeof ACTIONS !== 'undefined') ? Object.keys(ACTIONS).sort() : null;
    return {
      inlineCount: inline.length,
      inlineSample: [...new Set(inline)].slice(0, 20),
      actionNodes: used.length,
      uniqUsed: uniqUsed.length,
      unregistered: registered ? uniqUsed.filter(a => registered.indexOf(a) < 0) : 'ACTIONS not defined',
      registeredUnused: registered ? registered.filter(a => uniqUsed.indexOf(a) < 0) : null
    };
  }

  return { seed, capture, globals, wiring, norm, hash, SEED };
})();
