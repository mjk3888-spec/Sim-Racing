/* LUMINARY ENDURANCE MANAGER
   Collapsible sections.

   WHY
   Michael's point, and it is the right one: a lot of this app is setup you do
   once and then stare at forever. Prerequisites you have already met, fuel
   calibration you entered last month, export buttons you use twice a season.
   All of it permanently expanded, pushing the things you actually watch during
   a race further down the screen.

   THE RULE THIS IMPLEMENTS
   Finished setup gets out of the way, but never becomes unreachable. Every
   collapsible section keeps a one-line summary in its header, so a glance still
   tells you the state, and one tap brings the detail back.

   AUTO-COLLAPSE, ONCE
   Some sections collapse themselves the first time they are satisfied (all
   prerequisites met, all calibration filled). That happens ONCE. After that the
   user's own choice wins forever, because nothing is more irritating than a
   panel that keeps re-closing itself when you deliberately opened it.

   These are CLASSIC scripts, not ES modules: top-level declarations stay in the
   shared global scope, where the delegated dispatcher in js/actions.js resolves
   them by name. No inline on*= handlers remain in the markup (Step 5).
   LOAD ORDER MATTERS - js/main.js must be last. */

const COLLAPSE_STORE = 'lum_collapsed';

function loadCollapsed() {
  try { return JSON.parse(localStorage.getItem(COLLAPSE_STORE) || '{}'); }
  catch (e) { return {}; }
}
function saveCollapsed(m) {
  try { localStorage.setItem(COLLAPSE_STORE, JSON.stringify(m)); } catch (e) {}
}

/* Collapsed state is per device, not synced. Whether a panel is folded up on
   Michael's phone has nothing to do with what his teammates want to see. */
/* A section can declare data-collapse-default="closed" to start folded. That is
   how the specialist tools stay present but out of the way for teams that never
   touch them, which is exactly what Michael asked for: keep everything, hide it
   cleanly from those who do not need it. A stored choice always wins over the
   default, so folding one open makes it stay open. */
function defaultsClosed(id) {
  const card = document.querySelector('[data-collapse="' + id + '"]');
  return !!(card && card.getAttribute('data-collapse-default') === 'closed');
}
function isCollapsed(id) {
  const m = loadCollapsed();
  if (!m[id]) return defaultsClosed(id);
  return !!m[id].c;
}
function userHasChosen(id) {
  const m = loadCollapsed();
  return !!(m[id] && m[id].user);
}
function setCollapsed(id, collapsed, byUser) {
  const m = loadCollapsed();
  m[id] = { c: !!collapsed, user: byUser ? true : !!(m[id] && m[id].user) };
  saveCollapsed(m);
  applyCollapse();
}
function toggleCollapse(id) { setCollapsed(id, !isCollapsed(id), true); }

/* Collapse a section the first time it is satisfied, and never again. */
function autoCollapseOnce(id, satisfied) {
  if (!satisfied) return;
  if (userHasChosen(id)) return;
  const m = loadCollapsed();
  if (m[id] && m[id].auto) return;
  m[id] = { c: true, user: false, auto: true };
  saveCollapsed(m);
  applyCollapse();
}

function applyCollapse() {
  document.querySelectorAll('[data-collapse]').forEach(card => {
    const id = card.getAttribute('data-collapse');
    card.classList.toggle('is-collapsed', isCollapsed(id));
    const chev = card.querySelector('.collapse-chev');
    if (chev) chev.textContent = isCollapsed(id) ? '▸' : '▾';
  });
}

/* The one-line summaries shown in each collapsed header. These have to be
   worth reading on their own, otherwise collapsing just hides information. */
function renderCollapseSummaries() {
  const set = (id, text, cls) => {
    const e = el(id);
    if (!e) return;
    e.textContent = text || '';
    e.className = 'collapse-summary' + (cls ? ' ' + cls : '');
  };

  // Prerequisites
  const c = S.config || {};
  const met = [
    S.drivers.length > 0,
    S.drivers.some(d => d.lap && parseLap(d.lap) > 0),
    S.drivers.some(d => d.fpl && parseFloat(d.fpl) > 0),
    !!c.date,
    c.hour !== '' && c.hour !== null && c.hour !== undefined,
    !!(c.dur && parseFloat(c.dur) > 0)
  ];
  const nMet = met.filter(Boolean).length;
  const allMet = nMet === met.length;
  set('prereq-summary', allMet ? 'All met' : (nMet + ' of ' + met.length + ' met'),
      allMet ? 'ok' : 'warn');
  autoCollapseOnce('prereq', allMet);

  // Pit calibration
  const cal = ['ps-full-fuel', 'ps-half-fuel', 'ps-2tire', 'ps-4tire']
    .map(id => parseFloat(gv(id))).filter(v => v > 0);
  set('pitcal-summary', cal.length === 4 ? 'Calibrated' : (cal.length + ' of 4 entered'),
      cal.length === 4 ? 'ok' : 'warn');
  autoCollapseOnce('pitcal', cal.length === 4);

  // Archive
  let archCount = 0;
  try { archCount = JSON.parse(localStorage.getItem('lum_archive') || '[]').length; } catch (e) {}
  set('archive-summary', archCount ? archCount + ' saved' : 'None saved', '');
}
