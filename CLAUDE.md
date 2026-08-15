# Luminary Endurance Manager: working notes

Read this before changing anything. It exists because sessions do not share
memory and this project has decisions that are not obvious from the code.

Owner: Michael (mjk3888-spec). Team: Wildthings Racing, iRacing endurance.
Repo: github.com/mjk3888-spec/Sim-Racing
Live: https://mjk3888-spec.github.io/Sim-Racing/

---

## What this is

An installable PWA for endurance race strategy. Six tabbed pages:

| Page | What it does |
|---|---|
| Ops | Live dashboard: race clocks, current/next driver countdowns, position, stint progress, status log, drive-time pie |
| Team / Event Config | Event setup, driver roster with timezones and iRating, track notes, event archive, live sync settings |
| Stint Schedule | Stint table plus an optimiser |
| Availability | Driver availability grid |
| Pit Strategy | Fuel calculator, race-pace vs fuel-save comparator, pit stop calculator |
| Goals & Checklists | Team goals, pre-race / driver-swap / post-race checklists |

State lives in one global object `S`, persisted to `localStorage` under `lum4`,
plus `lum4_sync`, `lum_drivers` and `lum_archive`.

Live sync today is a **broadcast**: one strategist writes, teammates poll every
15 seconds. Backed by a Google Apps Script web app writing to a Google Sheet
(`sync/google-apps-script.gs`). Last write wins, no merging, by design.

**The deployed sync backend is stale and does not match this repo.** A web app
was deployed in May 2026 against a sheet named "WTR Race Manager — Sync
Database". That deployment writes to a tab named `sync`; the script committed
here (`sync/google-apps-script.gs`) expects a tab named `LUM_SYNC`, and the
stored row layout differs too. So live sync will not work end to end today.
This is **deliberately not being repaired** - Steps 7 to 9 replace the whole
transport with Cloudflare Durable Objects, and fixing a backend scheduled for
deletion is wasted effort. Do not "helpfully" fix it. If sync must work before
Step 10, the cheap move is repointing the deployed script, not rewriting either
side.

---

## File map

```
index.html          markup shell only, ~40 KB
styles/             tokens -> base -> components -> pages   (ORDER MATTERS)
js/                 14 classic scripts                      (ORDER MATTERS)
  data.js           colours, checklists, timezone + country tables, flags
  state.js          the S object, localStorage load/save
  config.js         time dropdowns, sim mode, prereqs, config form
  schedule.js       stint building, schedule table, availability grid
  dashboard.js      race clocks, handoff alerts + audio, fair share, pie
  strategy.js       fuel calc, scenario comparator, pit stop calc
  drivers.js        roster, archive/export, driver library, notes, status log
  goals.js          goals and the three checklists
  optimizer.js      stint schedule optimiser
  nav.js            tab navigation
  sync.js           broadcast sync client
  actions.js        data-action registry + delegated dispatcher (Step 5)
  main.js           boot sequence - MUST LOAD LAST
  pwa.js            service worker registration + update toast
sw.js               service worker
assets/logo.svg     4.8 KB vector logo
wrangler.toml       for a future Cloudflare Workers deploy, not yet used
tools/              verification harness, see Verification standard below
  serve.ps1         static localhost server, .NET only, no node needed
  harness.js        deterministic seed + per-tab markup hashing
  functional.js     37 real-DOM-event tests over the delegated wiring
  baseline.json     hashes captured at tag v5-pre-delegation
.claude/launch.json starts tools/serve.ps1 on port 5173
```

---

## Conventions that will bite you

**The scripts are CLASSIC, not ES modules, and that is deliberate.** Converting
to modules scopes every declaration to its file. Step 5 removed the inline
handlers that made that fatal, but the dependency is not gone, only moved: the
dispatcher in `js/actions.js` still resolves `saveDrv`, `pg` and 64 others from
global scope. Step 6 must keep those reachable, by importing them into
`actions.js` or by registering them explicitly.

**Markup names an ACTION, never a function.** `data-action="stint.note"` plus
`data-i="3"`, and `js/actions.js` maps that to a function that reads the dataset
and does its own coercion. Three rules that are easy to break:

- **`blur` does not bubble.** The five former `onblur` handlers are registered
  as `focusout`. Use `blur` and the schedule table's Actual End / Actual Laps /
  Position boxes stop saving with no error anywhere.
- **Dispatch uses `closest()`, nearest ancestor wins.** That is what replaced
  the old `event.stopPropagation()` calls in goals and checklists, where a
  delete button sits inside a clickable row. Resolve to the outermost match
  instead and every delete also toggles.
- **One element, one `data-action`.** An element needing two events (save on
  focusout, blur on Enter; a goal row handling all three drag events) gets ONE
  action whose `run()` switches on `e.type`.

Actions are gated by event type, so `config.save` fires on `input` only and a
text box does not also fire it on the trailing `change`.

**Load order is load order.** `js/main.js` holds the only top-level executable
code and must stay last. In CSS, `styles/pages.css` must stay last because its
media queries override everything above.

**The splits were verbatim extractions, and Step 5 ended that.** Concatenating
the files used to reproduce the original inline blocks exactly. Replacing the
handlers necessarily edited `index.html`, `schedule.js`, `drivers.js`,
`goals.js` and `main.js`, so that property is gone for good. The replacement
proof is `tools/baseline.json`: rendered markup hashed per tab at
`v5-pre-delegation` and required to match afterwards.

**Bump `CACHE_VERSION` in `sw.js` on every release.** Otherwise installed phones
keep serving the old cached app.

---

## Verification standard

Every structural change so far was proven, not eyeballed. Keep this up.

**There is no `node`, `npm` or usable `python` on Michael's machine.** The
`node --check` step in the old version of this standard could never have run
here. Use the browser instead, which suits DOM work better anyway.

**Tag `v5-original` does not exist.** Not locally, not on the remote. It was
referenced as the rollback point but `git tag` and `git ls-remote --tags` both
come back empty. The real rollback point is **`v5-pre-delegation`**, created at
commit `04a66b3`, which is the state just before Step 5.

To run the app locally:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File tools/serve.ps1 -Root . -Port 5173 -BlockSW
```

`-BlockSW` makes `sw.js` 404 so a service worker cannot serve stale files
mid-test. `tools/*` is also exposed at `/__harness/`.

Then, in the page:

1. **Deterministic state.** `LUM.seed()`, reload, `LUM.capture()`. Capture
   mutates state, so it is only valid as the first call after a fresh reload,
   and it pins the clock to 2026-09-12T15:30Z. Without that pin the Ops
   dashboard and header strip re-render every second and every hash is noise.
2. **Markup equivalence.** Compare the per-tab hashes against
   `tools/baseline.json`. The hashes strip `on*` and `data-*` wiring attributes,
   so pre- and post-change markup is directly comparable.
3. **Function reachability.** `LUM.globals()` asserts all 66 functions the
   dispatcher calls still exist. `LUM.wiring()` asserts zero inline handlers
   remain, every `data-action` in the DOM is registered, and every registered
   action is actually used. Both directions, so typos fail loudly.
4. **Behaviour.** `LUMTEST.run()` dispatches real bubbling DOM events and
   asserts the resulting state change. Identical markup proves the pages look
   right; it proves nothing about whether a click still does anything.
5. **Syntax.** Fetch each JS file and `new Function(src)` to parse without
   executing. This is the `node --check` replacement.
6. **Visual.** Screenshot at 430x932 and compare.

Step 5 passed all six: markup identical on all six tabs plus strip and modals,
66/66 functions reachable, 0 inline handlers, 0 unregistered actions, 0 unused
registrations, 37/37 behaviour tests, 15/15 files parse.

---

## Done so far

| Step | |
|---|---|
| 0 | Tagged `v5-original` |
| 1 | Replaced a 602 KB base64 logo embedded in index.html with a 4.8 KB SVG. index.html went 755 KB -> 152 KB |
| 2 | Deployed. GitHub Pages, auto-deploys on push |
| 3 | Split the 300-line `<style>` block into four stylesheets |
| 4 | Split the 998-line `<script>` block into 13 files. index.html now 40 KB |
| 5 | Replaced all 117 inline handlers with `data-action` + delegation. Tagged `v5-pre-delegation` first. Added `js/actions.js` and `tools/` |

Step 5 note: the old plan said "63 inline `onclick=` handlers" and "one
delegated listener". The onclick count was right (47 in `index.html`, 16 in JS
template literals) but it omitted 54 more handlers across five other event
types: 25 `oninput`, 17 `onchange`, 5 `onblur`, 4 `onkeydown`, 3 drag. All 117
are gone. It takes eight delegated listeners, not one, because each event type
needs its own.

---

## What is next

**Step 6. Convert to ES modules.** Now unblocked. The markup no longer names any
function, but `js/actions.js` still resolves 66 of them from global scope, so
that file is the one that has to change shape. Re-run the Verification standard
against `tools/baseline.json` afterwards: the rendered markup must still match.

**Steps 7 to 9 ship together. This is the big one.**

Michael runs **multiple cars in one event** (Wildthings has fielded four) and
possibly two teams at two events at once. The current one-global-state model
cannot express that.

This is confirmed by how he worked before this app existed: his spreadsheet
workflow was **one sheet per car per event**. The Entry concept below is not a
speculative generalisation, it is the shape he was already maintaining by hand.

The reshape:

- **Team** - one team, one team key carried in an invite link. Holds the entry
  list and presence.
- **Entry** - one car in one event ("Car 27, Spa 6H"). Everything the app does
  today applies to an entry. Four cars = four entries.
- **Person** - a display name set once per device. No accounts, no passwords.

New UX: a **home screen** listing the team's live entries with current driver,
time remaining and position, so a team manager watches all cars at once. Tap in
for the full six-tab app. A header switcher flips between entries.

Backend: **one Durable Object per team** on Cloudflare, holding the entry list,
all entry state, and presence. Not one per entry, because the home screen needs
a consistent cross-entry view. WebSocket per client. Edits are patches
(entry id, field path, value, timestamp, client id), last write wins per field.
Per-entry **Race Lock** freezes that car's schedule to its strategist at green
while leaving checklists and logs open. Offline edits queue and flush.

**Migration matters:** existing `localStorage` state must be promoted into a
single entry on first launch so Michael does not lose his current event. The
driver library (`lum_drivers`) is cross-event and moves to team level.

**Step 10.** Cut over from Apps Script sync, keeping it as fallback one release.

**Step 11.** README rewrite, architecture map, teammate setup card for Discord.

**Step 12.** Dry run with all drivers and multiple cars.

---

## Deployment

**Live on GitHub Pages**, serving the default branch root. Commit and push and
it redeploys in about a minute. Keep this running as a fallback even after
Cloudflare.

**Cloudflare is deferred to Step 8** and will deploy with `wrangler` from a
command line. The dashboard's Git integration wizard was abandoned after
repeated failures and is not worth revisiting. `wrangler.toml` is committed and
ready. Free tier limits confirmed as ample: Workers and Durable Objects 100k
requests/day, DO duration 13,000 GB-s/day. A six-hour race with six drivers is
roughly 2,700 GB-s.

The default branch is `claude/luminary-pwa-conversion-uhm617`, not `main`.
Renaming it is fine and overdue.

---

## Working with Michael

He is a capable sim racer, not a developer. Explain the why, not just the what.
He has explicitly asked to be told when an idea is bad. Do that.

Do not use em dashes in responses to him.

Ask before generating code.

Verify before claiming something works. He has been burned by tools that
reported success while doing nothing.
