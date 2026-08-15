/* LUMINARY ENDURANCE MANAGER
   Sample event loader.

   WHY THIS EXISTS
   Testing anything used to mean retyping an event, four drivers, pace data,
   goals and checklists by hand, on every device separately. One tap now fills
   the app with a realistic, complete event.

   The sample race is deliberately placed LIVE: green flag roughly 1h50m ago on
   a 6 hour race. That puts stint 1 in the past, stint 2 running, and the rest
   scheduled, so the dashboard clocks, the handoff countdowns, the status log
   and all three schedule row states are populated and visible immediately. A
   sample event dated next month would leave most of the app looking empty.

   Driver names here are placeholders, not real teammates.

   These are CLASSIC scripts, not ES modules: top-level declarations stay in the
   shared global scope, where the delegated dispatcher in js/actions.js resolves
   them by name. No inline on*= handlers remain in the markup (Step 5).
   LOAD ORDER MATTERS - js/main.js must be last. */

const DEMO_DRIVERS = [
  { name: 'Michael Kelly', handle: 'MJK', ir: 3120, tz: 'America/New_York',   country: 'US', color: '#DFFF00', timefmt: '12', maxConsec: 2, lap: '2:18.5', fpl: '3.20', fslap: '2:20.0', fsburn: '3.05', settings: { c_a: '12', c_b: '4.5' } },
  { name: 'Ana Silva',     handle: 'ANA', ir: 2840, tz: 'Europe/Lisbon',      country: 'PT', color: '#8EC7E6', timefmt: '24', maxConsec: 3, lap: '2:19.1', fpl: '3.25', fslap: '2:20.8', fsburn: '3.08', settings: { c_a: '12', c_b: '4.0' } },
  { name: 'Tom Becker',    handle: 'TB',  ir: 3600, tz: 'Europe/Berlin',      country: 'DE', color: '#FF8A1C', timefmt: '24', maxConsec: 2, lap: '2:17.9', fpl: '3.18', fslap: '2:19.4', fsburn: '3.02', settings: { c_a: '11', c_b: '4.5' } },
  { name: 'Yuki Sato',     handle: 'YS',  ir: 2450, tz: 'Asia/Tokyo',         country: 'JP', color: '#C060E8', timefmt: '24', maxConsec: 1, lap: '2:20.2', fpl: '3.30', fslap: '2:21.9', fsburn: '3.12', settings: { c_a: '12', c_b: '5.0' } }
];

function loadDemoEvent() {
  if (!confirm(
    'Load the sample event?\n\n' +
    'This REPLACES the event, drivers, schedule, goals and checklists ' +
    'currently on THIS device.\n\n' +
    'Archived events are kept. Other devices are not affected.'
  )) return;

  // Session start 2h30m ago: green flag is 40 min after that, so the race has
  // been running about 1h50m and stint 2 is live.
  const startMs = Date.now() - (2 * 60 + 30) * 60000;
  const start = new Date(startMs);
  const mins = Math.round(start.getUTCMinutes());

  S.config = {
    name: 'Spa 6H — Sample Event',
    car: 'BMW M4 GT3', carClass: 'GT3', track: 'Spa-Francorchamps',
    sim: 'iracing',
    date: start.toISOString().slice(0, 10),
    hour: start.getUTCHours() + mins / 60,
    dur: 6, green: 40, ighr: 14,
    lap: '2:18.5', fpl: '3.20', fslap: '2:20.0', fsburn: '3.05',
    tank: '110', pit: '1:10', res: '4'
  };

  // Timezone offset and abbreviation depend on the event date, so these are
  // computed only after S.config.date is set above.
  const ref = getEventRefDate();
  S.drivers = DEMO_DRIVERS.map((d, i) => {
    const c = COUNTRY_LIST.find(x => x.code === d.country) || { code: '', name: '', flag: '' };
    return {
      id: Date.now() + i,
      name: d.name, handle: d.handle, ir: d.ir,
      tz: d.tz, gmt: getOffsetFromTZ(d.tz, ref), tzabbr: getTZAbbr(d.tz, ref),
      country: c.code, countryName: c.name, countryFlag: c.flag,
      color: d.color, timefmt: d.timefmt, maxConsec: d.maxConsec,
      lap: d.lap, fpl: d.fpl, fslap: d.fslap, fsburn: d.fsburn,
      settings: Object.assign({}, d.settings)
    };
  });

  S.settingCols = [{ n: 'Wing', k: 'c_a' }, { n: 'Tyre Pressure', k: 'c_b' }];
  S.goals = [
    { id: 1, text: 'Finish on the lead lap', done: false, order: 0 },
    { id: 2, text: 'Zero incidents in the opening stint', done: true, order: 1 },
    { id: 3, text: 'Hold an average under 2:19', done: false, order: 2 }
  ];
  S.checks = JSON.parse(JSON.stringify(DEFAULT_CHECKS));
  S.tnotes = [{
    id: 41, driver: 'Michael Kelly', lap: '2:18.3',
    air: '22', trk: '31', unit: 'C', fuel: '3.2',
    lapNotes: ['Kerb at Pouhon unsettles the car on used tyres', 'Brake bias 54.5 is better into Les Combes']
  }];
  S.schMeta = { qualiDriver: 'Tom Becker', qualiPos: '4th', qualiNotes: 'Traffic on the final run' };
  S.raceLog = [];
  S.avail = {};
  S.stints = [];
  S.editDrvIdx = null;

  persist();
  buildStints();

  // Rotate the drivers through the stints and fill in plausible history for the
  // ones already run, so the status log and position tracking have something in
  // them rather than rendering empty.
  const now = Date.now();
  const order = ['Tom Becker', 'Michael Kelly', 'Ana Silva', 'Yuki Sato'];
  const positions = ['4th', '3rd', '3rd', '2nd', '2nd'];
  S.stints.forEach((s, i) => {
    s.driver = order[i % order.length];
    if (s.endMs <= now) {
      s.done = true;
      s.actualLaps = s.laps;
      s.position = positions[Math.min(i, positions.length - 1)];
      if (i === 0) s.notes = 'Clean opening stint, no traffic issues.';
    }
  });
  if (S.stints.length > 3) S.stints[3].stintType = 'fs';

  // A blocked availability window for the driver furthest from the race clock,
  // so the availability grid and the schedule's driver warnings have something
  // real to show.
  const rs = raceStart();
  if (rs) {
    const yuki = S.drivers.findIndex(d => d.name === 'Yuki Sato');
    const ana = S.drivers.findIndex(d => d.name === 'Ana Silva');
    const raceEnd = rs.getTime() + 6 * 3600000;
    for (let t = raceEnd - 2 * 3600000; t < raceEnd; t += 1800000) {
      if (yuki >= 0) S.avail[yuki + '_' + Math.floor(t / 1800000)] = 'blocked';
    }
    for (let t = rs.getTime(); t < rs.getTime() + 3600000; t += 1800000) {
      if (ana >= 0) S.avail[ana + '_' + Math.floor(t / 1800000)] = 'maybe';
    }
  }

  persist();

  populateConfig();
  buildCatalogLists();
  applySimMode();
  renderDriverList(); renderSettingsTable(); renderTNotes();
  renderChecklists(); renderGoals(); renderGoalsDash();
  renderSchedule(); buildAvail(); loadSchMeta();
  renderStatusLog(); renderArchive(); checkPrereqs(); updateDash();

  pg('ops');
  alert('Sample event loaded.\n\n' +
        S.stints.length + ' stints built. The race is running, so the dashboard ' +
        'clocks and driver countdowns are live.');
}
