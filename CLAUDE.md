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

---

## File map

```
index.html          markup shell only, ~40 KB
styles/             tokens -> base -> components -> pages   (ORDER MATTERS)
js/                 13 classic scripts                      (ORDER MATTERS)
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
  main.js           boot sequence - MUST LOAD LAST
  pwa.js            service worker registration + update toast
sw.js               service worker
assets/logo.svg     4.8 KB vector logo
wrangler.toml       for a future Cloudflare Workers deploy, not yet used
```

---

## Conventions that will bite you

**The scripts are CLASSIC, not ES modules, and that is deliberate.** The markup
has 63 inline `onclick=` handlers that resolve against global scope. Converting
to modules scopes every declaration to its file and breaks all 63 at once.
Replace the handlers with delegation FIRST, then convert. Not the other way.

**Load order is load order.** `js/main.js` holds the only top-level executable
code and must stay last. In CSS, `styles/pages.css` must stay last because its
media queries override everything above.

**Both splits are verbatim extractions.** Concatenating the files reproduces the
original inline blocks exactly. If you rewrite while moving, that property is
gone and so is the ability to prove nothing broke.

**Bump `CACHE_VERSION` in `sw.js` on every release.** Otherwise installed phones
keep serving the old cached app.

---

## Verification standard

Every structural change so far was proven, not eyeballed. Keep this up:

1. Concatenate the split files and diff against the original block, normalising
   whitespace. Must be identical.
2. `node --check` every JS file.
3. Screenshot the app at 430x932 and pixel-diff against tag `v5-original`.
   Expect 0.018% difference, all of it inside the logo bounding box.
4. Run original and modified builds side by side headless: confirm every inline
   handler still resolves to a function, all six tabs render the same, and
   building a 6-hour schedule yields the same stint count and output.

Tag `v5-original` is the rollback point. It is the untouched single-file app.

---

## Done so far

| Step | |
|---|---|
| 0 | Tagged `v5-original` |
| 1 | Replaced a 602 KB base64 logo embedded in index.html with a 4.8 KB SVG. index.html went 755 KB -> 152 KB |
| 2 | Deployed. GitHub Pages, auto-deploys on push |
| 3 | Split the 300-line `<style>` block into four stylesheets |
| 4 | Split the 998-line `<script>` block into 13 files. index.html now 40 KB |

---

## What is next

**Step 5. Replace the 63 inline `onclick=` handlers** with `data-action`
attributes and one delegated listener. Prerequisite for everything below.

**Step 6. Convert to ES modules.** Only after 5.

**Steps 7 to 9 ship together. This is the big one.**

Michael runs **multiple cars in one event** (Wildthings has fielded four) and
possibly two teams at two events at once. The current one-global-state model
cannot express that. The reshape:

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
