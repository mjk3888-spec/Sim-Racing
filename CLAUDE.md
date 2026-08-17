# Luminary Endurance Manager: working notes

Read this before changing anything. It exists because sessions do not share
memory and this project has decisions that are not obvious from the code.

Owner: Michael (mjk3888-spec). Team: Wildthings Racing, iRacing endurance.
Repo: github.com/mjk3888-spec/Sim-Racing
Live: https://mjk3888-spec.github.io/Sim-Racing/
Sync backend: https://luminary-sync.mjk3888.workers.dev

---

## Right now (2026-08-16, build 2026-08-16.19)

Everything below is committed, pushed and live. Nothing is half-finished.

**There are TWO apps in this repo and both are live.**

| | | |
|---|---|---|
| **v1** | `/` | the original six-tab app. Untouched, still works, 72/72 tests |
| **v2** | `/v2/` | three destinations, phone-first. Now has EVERY v1 function |

v2 is not a prototype any more. It is the candidate replacement, awaiting
Michael's verdict on a real phone.

**The architecture that makes two apps affordable, and the thing not to break:**
v2 uses **v1's component markup** (identical element ids and `data-action`
attributes) inside v2's layout, and loads the same `js/*.js`. So v1's logic runs
in v2 unchanged and stays covered by v1's tests. `v2/components.css` restyles
that shared vocabulary. Only the Pit Wall screen and the navigation are new
code. **If you find yourself writing a v2 copy of a function that already exists
in `js/`, stop: reuse the id instead.**

v2 does NOT load `js/main.js`. Its boot is `v2LoadState()` + `v2Init()` in
`v2/v2.js`. Calling a main.js function from v2 throws and silently aborts boot,
which presents as a stuck splash screen and a dead clock. That has happened.

**v2's three destinations, and why they are named that:**
Pit Wall (blue/Racing) is live race only. Strategy (orange/Performance) is the
schedule and every number feeding it. Team (yellow/Engineering) is people, the
event and one-time setup. Michael approved the free hand on naming; he has not
yet said whether the Strategy/Team split matches how he works. **That split is
the main open design question.**

**Specialist features are present but folded**, via
`data-collapse-default="closed"` in `js/collapse.js`. A stored choice always
beats the default, so opening one keeps it open. That is the mechanism for
"available to teams who need it, hidden from those who don't". Use it rather
than deleting anything.

**If he reports a problem, check the build number FIRST** (foot of v1's Config
tab, foot of v2's Team screen). An installed PWA serves the previous version on
the first load after a deploy and needs opening twice. Two false bug reports so
far. Note `/v2/` bypasses the service worker entirely so it should NOT have this
problem; v1 still does.

**Nothing on the phone or PC is precious.** Michael has confirmed there is no
event data worth preserving, so migrations and destructive tests are safe. Ask
again before assuming that still holds.

**Known gap, stated not hidden:** v2 above 760px is a centred 760px column with
four tiles across. That is readable on a PC, not a real desktop layout. He wants
this dual purpose PC and mobile, so a genuine wide layout is unbuilt work.

**Awaiting from Michael:** a real-phone and real-PC pass on v2, and his call on
whether v2 replaces v1 or they coexist.

**Next, in his stated priority order:**

1. His verdict on v2.
2. A real desktop layout for v2 if v2 wins.
3. Race Lock and a proper offline queue (Phase 5).
4. Team-level driver library: `lum_drivers` is still per-device and should move
   to team level now that entries exist.
5. Step 6, ES modules. Unblocked but lowest value to him.

**A caution learned the hard way:** every automated test here runs in Chromium
on Windows. That is not an iPhone. A car picker built with `<datalist>` passed
every test and was completely broken on iOS. When shipping anything the user
touches, state the iOS risk explicitly rather than implying the tests cover it.

**Four bugs the v2 build surfaced, all found by tests, none by Michael:** the
main.js call above; a splash fade started only from `requestAnimationFrame`,
which does not fire in a backgrounded tab and could leave the logo up forever
(v1 had the same latent hazard, both now have a hard fallback); brand colour CSS
still targeting the old screen names; and Fair Share rendering nothing because
its code guards on `#fs-card`, which v2 lacked. The pattern worth remembering:
**v2 keeps exposing latent v1 bugs, because it exercises v1's functions in an
environment v1 never had.**

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
index.html          markup shell only, ~42 KB
styles/             tokens -> base -> components -> pages   (ORDER MATTERS)
js/                 16 classic scripts                      (ORDER MATTERS)
  data.js           colours, checklists, timezone + country tables, flags
  state.js          the S object, localStorage load/save, fmtLapInput
  catalog.js        iRacing + LMU car and track pick lists
  config.js         time dropdowns, sim mode, prereqs, config form
  schedule.js       stint building, schedule table, availability grid
  dashboard.js      race clocks, handoff alerts + audio, fair share, pie
  strategy.js       fuel calc, scenario comparator, pit stop calc
  drivers.js        roster, archive/export, driver library, notes, status log
  goals.js          goals and the three checklists
  optimizer.js      stint schedule optimiser
  nav.js            tab navigation
  sync.js           broadcast sync client
  demo.js           Load Sample Event: a complete race, already running
  actions.js        data-action registry + delegated dispatcher (Step 5)
  main.js           boot sequence - MUST LOAD LAST
  pwa.js            service worker registration + update toast
sw.js               service worker
assets/logo.svg     4.8 KB vector logo
wrangler.toml       for a future Cloudflare Workers deploy, not yet used
worker/index.js     sync backend: Worker + TeamRoom Durable Object (Phase 1)
tools/              verification harness, see Verification standard below
  sync-test.js      12 correctness tests over a real WebSocket
  serve.ps1         static localhost server, .NET only, no node needed
  harness.js        deterministic seed + per-tab markup hashing
  functional.js     44 real-DOM-event tests over the delegated wiring
  baseline.json     current expected hashes, with a note on every re-baseline
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

**Top-level `let`/`const` are NOT on `window`.** In a classic script they live in
script scope, so `S`, `LIVE_KEY` and every other `let`/`const` are reachable from
other scripts but invisible as `window.S`. Only `function` declarations get
attached to `window`. This bit the live-sync tests, which drive two app instances
in iframes: reaching in has to go through that frame's own `eval()`, not through
`frame.contentWindow.S`. It also matters for Step 6, since it means the harness's
`LUM.globals()` check only covers functions.

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

**Refactor versus feature, and which half of the harness applies.** These two
kinds of change are checked differently and confusing them wastes a lot of time:

- A **refactor** must not change rendered output. Step 2 is the real test and
  every hash must match. That is what proved Step 5.
- A **feature** is supposed to change output, so matching hashes would mean it
  did nothing. Step 4, the behaviour tests, is the real test, and they must all
  still pass. Then re-baseline and **write down in `tools/baseline.json` which
  hashes moved and why**. If a hash moved that you cannot explain, stop.

Step 5b was a feature change: 44/44 behaviour tests passed, and exactly four
hashes moved, each traceable to a specific edit.

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
| 5b | Less typing: Load Sample Event button, car + track pick lists with class auto-fill, `inputmode` on every numeric field, lap time auto-format |

Step 5 note: the old plan said "63 inline `onclick=` handlers" and "one
delegated listener". The onclick count was right (47 in `index.html`, 16 in JS
template literals) but it omitted 54 more handlers across five other event
types: 25 `oninput`, 17 `onchange`, 5 `onblur`, 4 `onkeydown`, 3 drag. All 117
are gone. It takes eight delegated listeners, not one, because each event type
needs its own.

---

## What is next

**Phase 1 of the sync work is DONE and deployed.** See Deployment below. The
backend exists and is proven correct; the app is not yet wired to it, so nothing
in the UI has changed. Protocol:

```
client -> {type:'patch', path, value, ts, clientId}   {type:'get'}  {type:'ping'}
server -> {type:'snapshot', state}   {type:'patch', ...}   {type:'ack'}
          {type:'rejected', path, value, ts}   {type:'presence', peers}
```

Conflicts resolve **last write wins per FIELD**, and a stale write is rejected
rather than applied, with the winning value returned to the sender. That is the
property the Apps Script backend lacks and the reason it is not safe to patch:
it writes whole state, so a device holding old data overwrites everything.

**Phase 3 is DONE and live** (built before Phase 2 deliberately, see below).
`js/live.js` wires the app to the backend. `persist()` is the single choke point
every change passes through, so the client hooks there, diffs `S` into field
paths, and sends only what moved. `sync-check.html` is a standalone two-device
proof that shares nothing with the app but the URL, which makes it the fastest
way to tell whether a sync problem is the backend or the app.

**Phase 2 was deliberately deferred behind Phase 3.** The full Team/Entry/Person
reshape is the riskier, more invisible job, and Michael needed working
phone-to-PC sync more than he needed the data model. The cost of that ordering
was made near zero by namespacing every path under an entry id from day one:
`e/default/config/track`. Adding real entries later is additive, not a breaking
change to paths already stored on the server. Do NOT flatten those paths.

Still to do in Phase 2: multiple entries, the team-level driver library, and
migrating `lum_drivers` to team level.

**Phase 4. Home screen, entry switcher, and the mobile redesign together.**
Do NOT redesign before this: the home screen and switcher change navigation, so
designing the six tabs first means designing twice.

**Phase 5. Race Lock and the offline queue.**

**Step 6, ES modules,** is unblocked but deferred behind the sync work, which is
what actually blocks how Michael races. The markup no longer names any function,
but `js/actions.js` still resolves 66 of them from global scope, so that file is
the one that has to change shape.

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

**Cloudflare sync backend is DEPLOYED and live** as of Phase 1:

```
https://luminary-sync.mjk3888.workers.dev
  /health            service check
  /team/new          issues a random 160-bit team key
  /team/<key>/ws     WebSocket
  /team/<key>/state  read-only snapshot, for debugging
```

Account `988a58379850d03d24f1b0333c4f6a7e`. Deploy with `npx wrangler deploy`
from the repo root. `node_modules/` is gitignored, so run `npm install` first on
a fresh clone. The dashboard's Git integration wizard was abandoned after
repeated failures and is not worth revisiting.

**The app is NOT served from Cloudflare and should not be.** It stays on GitHub
Pages. `wrangler.toml` deliberately has no `[assets]` block: a Cloudflare
problem should be able to break syncing, never take the app offline.

Free tier limits confirmed as ample: Workers and Durable Objects 100k
requests/day, DO duration 13,000 GB-s/day. A six-hour race with six drivers is
roughly 2,700 GB-s, and the Hibernation API means idle connections between
stints accrue no duration at all.

**A 500 immediately after the first `wrangler deploy` is normal.** The Durable
Object migration takes a moment to propagate. It resolved on retry with no code
change; `wrangler tail` showed the request had actually returned 200 with no
exceptions. Do not go chasing a bug there.

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
