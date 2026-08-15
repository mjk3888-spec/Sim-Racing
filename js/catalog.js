/* LUMINARY ENDURANCE MANAGER
   Car and track pick lists for the event config form.

   WHY THIS EXISTS
   Car and Track were free text, so every event meant typing an exact model name
   by hand on a phone. These lists turn them into type-ahead pickers.

   THEY ARE SUGGESTIONS, NOT A CLOSED SET. Both fields are still plain inputs
   backed by a <datalist>, so anything not listed can still be typed. That
   matters because iRacing and LMU add content every season and this file will
   go stale. A missing car is an inconvenience, never a dead end.

   Selecting a car also fills in its class, which is the main time saver.

   These are CLASSIC scripts, not ES modules: top-level declarations stay in the
   shared global scope, where the delegated dispatcher in js/actions.js resolves
   them by name. No inline on*= handlers remain in the markup (Step 5).
   LOAD ORDER MATTERS - js/main.js must be last. */

/* sim: 'iracing' | 'lmu' | 'both'. Used to narrow the list once a sim is picked;
   with no sim selected the full list shows. */
const CAR_LIST = [
  // ---- Top class prototypes ----
  { name: 'Acura ARX-06 GTP',            cls: 'GTP',      sim: 'iracing' },
  { name: 'BMW M Hybrid V8',             cls: 'GTP',      sim: 'both' },
  { name: 'Cadillac V-Series.R',         cls: 'GTP',      sim: 'both' },
  { name: 'Porsche 963',                 cls: 'GTP',      sim: 'both' },
  { name: 'Ferrari 499P',                cls: 'Hypercar', sim: 'both' },
  { name: 'Toyota GR010 Hybrid',         cls: 'Hypercar', sim: 'lmu' },
  { name: 'Peugeot 9X8',                 cls: 'Hypercar', sim: 'lmu' },
  { name: 'Alpine A424',                 cls: 'Hypercar', sim: 'lmu' },
  { name: 'Lamborghini SC63',            cls: 'Hypercar', sim: 'lmu' },
  { name: 'Isotta Fraschini Tipo 6',     cls: 'Hypercar', sim: 'lmu' },

  // ---- LMP ----
  { name: 'Dallara P217',                cls: 'LMP2',     sim: 'iracing' },
  { name: 'Oreca 07',                    cls: 'LMP2',     sim: 'lmu' },
  { name: 'Ligier JS P320',              cls: 'LMP3',     sim: 'iracing' },

  // ---- GT3 ----
  { name: 'Acura NSX GT3 EVO 22',        cls: 'GT3',      sim: 'iracing' },
  { name: 'Aston Martin Vantage GT3',    cls: 'GT3',      sim: 'iracing' },
  { name: 'Audi R8 LMS EVO II GT3',      cls: 'GT3',      sim: 'iracing' },
  { name: 'BMW M4 GT3',                  cls: 'GT3',      sim: 'iracing' },
  { name: 'Chevrolet Corvette Z06 GT3.R',cls: 'GT3',      sim: 'iracing' },
  { name: 'Ferrari 296 GT3',             cls: 'GT3',      sim: 'iracing' },
  { name: 'Ford Mustang GT3',            cls: 'GT3',      sim: 'iracing' },
  { name: 'Lamborghini Huracan GT3 EVO', cls: 'GT3',      sim: 'iracing' },
  { name: 'McLaren 720S GT3 EVO',        cls: 'GT3',      sim: 'iracing' },
  { name: 'Mercedes-AMG GT3 2020',       cls: 'GT3',      sim: 'iracing' },
  { name: 'Porsche 911 GT3 R (992)',     cls: 'GT3',      sim: 'iracing' },

  // ---- LMGT3 ----
  { name: 'Aston Martin Vantage AMR LMGT3',   cls: 'LMGT3', sim: 'lmu' },
  { name: 'BMW M4 LMGT3',                     cls: 'LMGT3', sim: 'lmu' },
  { name: 'Chevrolet Corvette Z06 LMGT3.R',   cls: 'LMGT3', sim: 'lmu' },
  { name: 'Ferrari 296 LMGT3',                cls: 'LMGT3', sim: 'lmu' },
  { name: 'Ford Mustang LMGT3',               cls: 'LMGT3', sim: 'lmu' },
  { name: 'Lamborghini Huracan LMGT3 EVO2',   cls: 'LMGT3', sim: 'lmu' },
  { name: 'McLaren 720S LMGT3 EVO',           cls: 'LMGT3', sim: 'lmu' },
  { name: 'Mercedes-AMG LMGT3',               cls: 'LMGT3', sim: 'lmu' },
  { name: 'Porsche 911 GT3 R LMGT3',          cls: 'LMGT3', sim: 'lmu' },

  // ---- GTE ----
  { name: 'BMW M8 GTE',                  cls: 'GTE',      sim: 'iracing' },
  { name: 'Chevrolet Corvette C8.R GTE', cls: 'GTE',      sim: 'both' },
  { name: 'Ferrari 488 GTE',             cls: 'GTE',      sim: 'both' },
  { name: 'Porsche 911 RSR',             cls: 'GTE',      sim: 'both' },
  { name: 'Aston Martin Vantage AMR GTE',cls: 'GTE',      sim: 'lmu' },

  // ---- GT4 ----
  { name: 'Aston Martin Vantage GT4',    cls: 'GT4',      sim: 'iracing' },
  { name: 'BMW M4 GT4',                  cls: 'GT4',      sim: 'iracing' },
  { name: 'McLaren 570S GT4',            cls: 'GT4',      sim: 'iracing' },
  { name: 'Mercedes-AMG GT4',            cls: 'GT4',      sim: 'iracing' },
  { name: 'Porsche 718 Cayman GT4 Clubsport MR', cls: 'GT4', sim: 'iracing' },
  { name: 'Toyota GR Supra GT4',         cls: 'GT4',      sim: 'iracing' },

  // ---- TCR ----
  { name: 'Audi RS 3 LMS TCR',           cls: 'TCR',      sim: 'iracing' },
  { name: 'Honda Civic Type R TCR',      cls: 'TCR',      sim: 'iracing' },
  { name: 'Hyundai Elantra N TCR',       cls: 'TCR',      sim: 'iracing' }
];

const TRACK_LIST = [
  { name: 'Circuit de la Sarthe (Le Mans)', sim: 'both' },
  { name: 'Spa-Francorchamps',              sim: 'both' },
  { name: 'Monza',                          sim: 'both' },
  { name: 'Imola',                          sim: 'both' },
  { name: 'Silverstone',                    sim: 'both' },
  { name: 'Portimao',                       sim: 'both' },
  { name: 'Circuit de Barcelona-Catalunya', sim: 'both' },
  { name: 'Bahrain International Circuit',  sim: 'both' },
  { name: 'Losail International Circuit',   sim: 'both' },
  { name: 'Fuji Speedway',                  sim: 'both' },
  { name: 'Interlagos',                     sim: 'both' },
  { name: 'Circuit of the Americas',        sim: 'both' },
  { name: 'Sebring International Raceway',  sim: 'iracing' },
  { name: 'Daytona International Speedway', sim: 'iracing' },
  { name: 'Watkins Glen International',     sim: 'iracing' },
  { name: 'Road Atlanta',                   sim: 'iracing' },
  { name: 'Road America',                   sim: 'iracing' },
  { name: 'Indianapolis Motor Speedway',    sim: 'iracing' },
  { name: 'WeatherTech Raceway Laguna Seca',sim: 'iracing' },
  { name: 'Canadian Tire Motorsport Park',  sim: 'iracing' },
  { name: 'Virginia International Raceway', sim: 'iracing' },
  { name: 'Mid-Ohio Sports Car Course',     sim: 'iracing' },
  { name: 'Long Beach',                     sim: 'iracing' },
  { name: 'Detroit Belle Isle',             sim: 'iracing' },
  { name: 'Nurburgring GP',                 sim: 'iracing' },
  { name: 'Nurburgring Nordschleife',       sim: 'iracing' },
  { name: 'Nurburgring Combined (24h)',     sim: 'iracing' },
  { name: 'Mount Panorama (Bathurst)',      sim: 'iracing' },
  { name: 'Phillip Island',                 sim: 'iracing' },
  { name: 'Suzuka Circuit',                 sim: 'iracing' },
  { name: 'Okayama International Circuit',  sim: 'iracing' },
  { name: 'Red Bull Ring',                  sim: 'iracing' },
  { name: 'Hungaroring',                    sim: 'iracing' },
  { name: 'Zandvoort',                      sim: 'iracing' },
  { name: 'Brands Hatch',                   sim: 'iracing' },
  { name: 'Oulton Park',                    sim: 'iracing' },
  { name: 'Snetterton',                     sim: 'iracing' },
  { name: 'Donington Park',                 sim: 'iracing' },
  { name: 'Motorland Aragon',               sim: 'iracing' },
  { name: 'Circuit Paul Ricard',            sim: 'iracing' },
  { name: 'Kyalami Grand Prix Circuit',     sim: 'iracing' },
  { name: 'Sonoma Raceway',                 sim: 'iracing' },
  { name: 'Charlotte Roval',                sim: 'iracing' },
  { name: 'Autodromo Algarve',              sim: 'lmu' }
];

const CAR_CLASSES = ['GTP', 'LMDh', 'Hypercar', 'LMP2', 'LMP3', 'GT3', 'LMGT3', 'GTE', 'GT2', 'GT4', 'TCR', 'Prototype'];

/* Narrow to the selected sim. A car marked 'both' always shows. With no sim
   chosen yet, show everything rather than an empty list. */
function catalogFor(list) {
  const sim = (S.config && S.config.sim) || '';
  if (sim !== 'iracing' && sim !== 'lmu') return list;
  return list.filter(x => x.sim === 'both' || x.sim === sim);
}

/* Sentinel for the trailing "Other" option in every pick list. */
const PICK_CUSTOM = '__custom__';

/* Fills one <select> and wires it to the text box that backs it.

   The text input is the CANONICAL value: sc() reads cfg-car / cfg-track /
   cfg-class exactly as it always has, so nothing downstream had to change. The
   select only drives that input. When the stored value is not in the list (an
   older event, or a car typed by hand) the select lands on "Other" and the text
   box is revealed already holding it, so nothing is ever silently lost. */
function fillPick(pickId, textId, values, current) {
  const pick = el(pickId), txt = el(textId);
  if (!pick || !txt) return;
  const cur = current || '';
  const known = cur && values.indexOf(cur) >= 0;
  pick.innerHTML =
    '<option value="">— Select —</option>' +
    values.map(v => `<option value="${v}">${v}</option>`).join('') +
    `<option value="${PICK_CUSTOM}">Other / type it in</option>`;
  pick.value = known ? cur : (cur ? PICK_CUSTOM : '');
  txt.style.display = (cur && !known) ? '' : 'none';
  txt.value = cur;
}

/* Cars narrowed to the chosen class, which is the whole point: picking GTP
   should not leave 47 cars in the picker. If a class has no cars in the current
   sim's catalogue, fall back to the full list rather than an empty picker. */
function carsForClass() {
  const cls = (S.config.carClass || '').trim().toLowerCase();
  const all = catalogFor(CAR_LIST);
  if (!cls) return all.map(c => c.name);
  const hit = all.filter(c => c.cls.toLowerCase() === cls);
  return (hit.length ? hit : all).map(c => c.name);
}

function buildCatalogLists() {
  fillPick('cfg-class-pick', 'cfg-class', CAR_CLASSES, S.config.carClass);
  fillPick('cfg-car-pick', 'cfg-car', carsForClass(), S.config.car);
  fillPick('cfg-track-pick', 'cfg-track', catalogFor(TRACK_LIST).map(t => t.name), S.config.track);
}

/* Shared by all three pickers: copy the choice into the backing text box, or
   reveal that box for a custom entry. Returns the chosen value. */
function applyPick(pickId, textId) {
  const pick = el(pickId), txt = el(textId);
  if (!pick || !txt) return '';
  if (pick.value === PICK_CUSTOM) {
    txt.style.display = '';
    txt.value = '';
    txt.focus();
    sc();
    return '';
  }
  txt.style.display = 'none';
  txt.value = pick.value;
  sc();
  return pick.value;
}

function onClassPick() {
  applyPick('cfg-class-pick', 'cfg-class');
  // Narrow the car picker to the new class. Clear a car that no longer belongs.
  const cars = carsForClass();
  if (S.config.car && cars.indexOf(S.config.car) < 0) {
    const known = CAR_LIST.some(c => c.name === S.config.car);
    if (known) { sv('cfg-car', ''); sc(); }
  }
  fillPick('cfg-car-pick', 'cfg-car', cars, S.config.car);
}

/* Picking a car fills its class, which is the main time saver. Only ever fills
   a blank or mismatched class, and then re-narrows the car list to match. */
function onCarPick() {
  const chosen = applyPick('cfg-car-pick', 'cfg-car');
  if (!chosen) return;
  const hit = CAR_LIST.find(c => c.name === chosen);
  if (!hit) return;
  if ((S.config.carClass || '').trim().toLowerCase() === hit.cls.toLowerCase()) return;
  sv('cfg-class', hit.cls);
  sc();
  fillPick('cfg-class-pick', 'cfg-class', CAR_CLASSES, hit.cls);
  fillPick('cfg-car-pick', 'cfg-car', carsForClass(), chosen);
}
