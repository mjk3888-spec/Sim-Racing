# Luminary Endurance Manager

Installable Progressive Web App for endurance race strategy and stint management —
Wildthings Racing on iRacing. Single-file app, free static hosting on GitHub Pages,
no backend, no paid services.

---

## What every file does

| File | What it is |
|---|---|
| `index.html` | The entire application (v5 logic, unchanged) plus the PWA install layer: manifest link, iOS meta tags, splash screen links, safe-area CSS, and service worker registration. This is the only file with app logic. |
| `manifest.json` | Web app manifest — app name, Luminary brand colors, standalone display, portrait orientation, icon set. What makes Android/Chromium treat the site as installable and names the app. |
| `sw.js` | Service worker — precaches the app shell so the installed app launches offline, and revalidates `index.html` in the background so a new deploy actually reaches phones (see "Shipping an update"). |
| `icons/icon-source.svg` | The master icon artwork (Luminary "L" mark with Gulf Blue / Volt / Performance Orange chevrons). Edit this and re-export if the brand changes. |
| `icons/icon-192.png`, `icons/icon-512.png` | Manifest icons (Android home screen / install prompt). |
| `icons/icon-maskable-192.png`, `icons/icon-maskable-512.png` | Maskable variants with extra padding so Android can crop them into circles/squircles without clipping the mark. |
| `icons/apple-touch-icon.png` | 180×180 iOS Home Screen icon. Safari uses this, not the manifest icons. |
| `icons/favicon-32.png` | Browser tab icon. |
| `splash/splash-*.png` | iOS launch screens, one per iPhone screen class (SE 2/3 through 16 Pro Max). Safari ignores manifest splash behavior and needs these explicit per-device images. |
| `sync/google-apps-script.gs` | The "Luminary Sync Script" referenced by the app's Live Sync setup — paste into a Google Sheet's Apps Script editor and deploy as a web app. This is the free broadcast backend for teammate sharing. |
| `.nojekyll` | Tells GitHub Pages to serve files as-is without Jekyll processing. |
| `README.md` | This file. |

## Enabling GitHub Pages

1. Push this repository to GitHub (default branch, e.g. `main`).
2. On GitHub: **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`.
4. Set **Branch** to `main` (or your default branch) and folder to `/ (root)`. Save.
5. Wait ~1 minute. The app is live at `https://<username>.github.io/<repo-name>/`.

All paths in the app are relative, so it works from that project subpath as-is —
no configuration needed.

## Installing on an iPhone (each teammate)

1. Open `https://<username>.github.io/<repo-name>/` in **Safari** (must be Safari —
   Chrome on iOS cannot add PWAs to the Home Screen).
2. Tap the **Share** button (square with an up arrow).
3. Scroll and tap **Add to Home Screen**.
4. The name shows as **Luminary** with the L icon. Tap **Add**.
5. Launch it **from the Home Screen icon** (not the Safari tab) from now on.

To see live team data: open **Team / Event Config → Live Sync**, paste the sync
Web App URL the strategist shares, and tap **Connect**. That's it — teammates are
read-mostly viewers; one strategist owns and edits the schedule.

## Verifying the install worked

- [ ] **Icon**: Home Screen shows the dark Luminary "L" icon (not a Safari screenshot thumbnail).
- [ ] **Splash**: launching shows the Luminary logo on black for a moment.
- [ ] **Fullscreen**: no Safari address bar or toolbars; the header strip sits below the notch/Dynamic Island.
- [ ] **Offline**: enable Airplane Mode, close and relaunch from the icon — the app still opens with your data (open it once online first so the shell gets cached).
- [ ] **Live data**: with sync connected, the Live Sync dot pulses green ("Synced"/"Live") and the strategist's schedule appears within ~15 seconds.

## Shipping an update

1. Edit `index.html` (or icons/manifest).
2. **Bump `CACHE_VERSION` at the top of `sw.js`** (e.g. `2026-07-02.1` → `2026-07-09.1`).
3. Commit and push. GitHub Pages redeploys automatically.

Devices pick it up like this: on next launch the service worker serves the cached
app instantly, revalidates in the background, sees the changed file, refreshes its
cache, and shows an **"UPDATE READY — TAP TO RELOAD"** toast. If the toast is
ignored, the following launch serves the new version. No one is ever stuck on a
stale cache, and nothing auto-reloads mid-race.

## Live sync setup (strategist, one time)

1. Create a Google Sheet at [sheets.google.com](https://sheets.google.com) — any name.
2. **Extensions → Apps Script**, delete the placeholder code, paste in
   [`sync/google-apps-script.gs`](sync/google-apps-script.gs).
3. **Deploy → New deployment → Web app** — Execute as: **Me**, Who has access: **Anyone**. Deploy and authorize.
4. Copy the Web App URL into the app (**Team / Event Config → Live Sync → Connect**)
   and share the same URL with teammates.

The sync is a broadcast: every push overwrites the stored state, teammates poll it
every 15 seconds. There is deliberately no multi-writer merging — one strategist edits.

## Known iOS limitations (accepted by design)

- **Backgrounded = silent.** iOS suspends timers and WebAudio when the app is
  backgrounded or the phone is locked, so handoff tones and countdown flashing only
  work while the app is foregrounded. Keep the app open during a stint. Building
  around this would require push infrastructure beyond free static hosting.
- Local data (`localStorage`) lives per-device. iOS may evict it if the app is
  unused for many weeks — the Live Sync state and event archive exports are the recovery paths.
