# Luminary: Revised Plan (v2)

Updated August 2026, after Michael raised multi-car and multi-event use.

---

## What changed and why

The original plan assumed one team, one event, one car. Michael's actual case is
Wildthings Racing running **four cars in a single event**, and potentially two
teams running two different events at the same time.

That is not a feature that bolts onto the current design. Today the entire app
is one global state object `S`, and every function assumes it. Multi-car means
reshaping that object. Doing it before the sync backend is built is cheap.
Doing it after would mean rewriting the backend.

Steps 0 to 4 are unaffected and already shipped.

---

## The data model

Three concepts replace today's single global state:

### Team
Wildthings Racing. One team, one **team key**, carried in an invite link.
Holds the entry list and the roster of people currently connected.

### Entry
**One car in one event.** "Car 27, Spa 6H". This is the unit that everything the
app does today applies to: the stint schedule, fuel plan, driver assignments,
goals, checklists, notes and status log.

Four cars at Spa = four entries under one team.
Two teams at different events = two teams, each with their own entries.

### Person
A display name set once per device. **No account, no password.** Used for
presence ("who is connected"), edit attribution, and soft locks.

```
Team: Wildthings Racing            (key: in the invite link)
 |
 +-- Entry: Car 27 - Spa 6H        <- today's entire app state lives here
 +-- Entry: Car 44 - Spa 6H
 +-- Entry: Car 91 - Spa 6H
 +-- Entry: Car 12 - Spa 6H
 |
 +-- People: Michael, Dave, Sam, ... (names, presence, current entry)
```

---

## What teammates actually see

**First launch.** Open the invite link, type your name, done. The team key is
stored on the device so the link is needed only once.

**Home screen (new).** A live board of the team's active entries. Each row shows
current driver, time remaining, last known position, and stint progress. This is
the view a team manager keeps open to watch all four cars at once.

**Entry view.** Tap a row and you get the app exactly as it works today: the six
tabs, the ops dashboard, the schedule.

**Switcher.** A control in the header strip flips between entries without going
back home, so a strategist covering two cars can bounce between them.

**Archive.** Finished entries drop off the home screen into an archive rather
than being deleted.

---

## Backend shape

**One Durable Object per team.** It holds the entry list, every entry's state,
and presence.

Not one DO per entry, because the home screen needs a consistent cross-entry
view. Four cars and six people is trivial load for a single DO; splitting later
if a team ever outgrows it is straightforward.

**Transport.** A WebSocket per connected client, subscribed to the team. The
server always pushes the compact entry summaries that feed the home screen, and
pushes full state only for the entry that client is currently viewing. That
keeps payloads small on a phone on cellular in the paddock.

**Writes.** Every edit is a patch: entry id, field path, new value, timestamp,
client id. The DO applies last write wins **per field** and broadcasts. Two
people editing different stints never collide. Two people editing the same field,
later one wins.

**Presence and soft locks.** You see who is connected and which entry they are
on. While someone has a stint row open, others see "Dave is editing" on that row.

**Race Lock.** A toggle per entry, flipped by that car's strategist at green.
Freezes that entry's schedule to strategist only. Checklists, lap logs, damage
reports and notes stay open to everyone. Per entry, so locking Car 27 does not
affect Car 44.

**Offline queue.** Edits made with no signal queue on the device and flush on
reconnect instead of vanishing.

---

## Migration: do not lose the current event

Today's data sits in `localStorage` under `lum4`, `lum4_sync`, `lum_drivers`
and `lum_archive`. On first launch of the new version, that state is read and
promoted into a single entry named from the existing event config, so nothing
Michael already has is lost. The driver library (`lum_drivers`) is genuinely
cross-event and moves up to the **team** level, where it belongs.

---

## Security, stated plainly

The team key in the invite link is the only gate. Anyone holding the link can
read and edit that team's entries. That is **unlisted, not secure**.

This is the right call for a sim racing team: zero friction for a teammate
trying to get in five minutes before green, and no password resets to handle on
race night. The information at risk is fuel strategy.

If stronger control is ever wanted, in rough order of effort: rotate the team
key, require the strategist to approve a new person's first join, or add real
accounts. None of these require rebuilding what is described above.

---

## Revised step list

| Step | State |
|---|---|
| 0. Tag rollback point | done |
| 1. Replace 602 KB logo with SVG | done |
| 2. Get the app live | done, on GitHub Pages |
| 3. Split the CSS | done |
| 4. Split the JavaScript | done |
| 5. Replace 63 inline handlers with delegation | next |
| 6. Convert to ES modules | after 5 |
| 7. **Reshape state into team / entry / person** | new, was not in v1 |
| 8. **Build the Durable Object backend on Cloudflare** | merged with the multi-entry work |
| 9. **Build the home screen and entry switcher** | new |
| 10. Cut over from Google Apps Script sync | fallback kept one release |
| 11. Docs: README, architecture map, teammate setup card | |
| 12. Full dry run with all drivers and multiple cars | |

Steps 7 through 9 are one job, not three. They ship together.

**Cloudflare note.** The dashboard Git integration wizard is being skipped. Step
8 deploys with `wrangler` from a command line, which never touches it. The
`wrangler.toml` already committed to the repo is what that will use. GitHub
Pages keeps running in parallel as a fallback.

---

## Open decisions

1. **Entry naming.** Auto-generate from car number and event ("Car 27, Spa 6H"),
   or let the strategist type a free-form name?
2. **Who can create entries?** Anyone on the team, or only whoever set it up?
3. **One team or several?** If Wildthings ever fields entries under a second
   banner, does a person belong to multiple teams and switch between them, or is
   each team a separate invite link and a separate install?
