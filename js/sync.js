/* LUMINARY ENDURANCE MANAGER
   Local persistence, and the single choke point every state change passes
   through.

   HISTORY: this file used to hold a Google Apps Script broadcast client. That
   model wrote WHOLE state on every change, so a device holding stale data
   overwrote everything when it pushed, which made it unsafe for the way Michael
   actually races (switching between phone and PC mid-event). The deployed
   script had also drifted out of step with this repo and no longer worked.
   It has been removed rather than left as a trap. Live sync now lives in
   js/live.js and patches individual fields with per-field conflict resolution.
   The old client is recoverable from git history if it is ever wanted.

   These are CLASSIC scripts, not ES modules: top-level declarations stay in the
   shared global scope, where the delegated dispatcher in js/actions.js resolves
   them by name. No inline on*= handlers remain in the markup (Step 5).
   LOAD ORDER MATTERS - js/main.js must be last. */

const _lp = () => { try { localStorage.setItem('lum4', JSON.stringify(S)); } catch (e) {} };

/* persist() is called after every change in the app, which is exactly why the
   live client hooks in here rather than in sixty call sites. liveOnLocalChange()
   diffs S, sends only the fields that actually moved, and no-ops when not
   connected or while a remote patch is being applied. */
function persist() {
  _lp();
  saveEntrySnapshot();
  try { liveOnLocalChange(); } catch (e) {}
}
