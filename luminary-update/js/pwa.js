/* LUMINARY ENDURANCE MANAGER
   Service worker registration and the UPDATE READY toast.
   Deliberately separate: the app works fine without any of this.

   Extracted verbatim from index.html lines 1597-1620.
   These are CLASSIC scripts, not ES modules: top-level declarations stay in the
   shared global scope so the existing inline onclick= handlers keep working.
   LOAD ORDER MATTERS - js/main.js must be last. */

// ===== PWA: service worker registration & update flow =====
// Kept separate from the application script — the app is fully functional without it
// (e.g. when opened as a plain file or on a browser without service worker support).
// 'sw.js' is a relative path so registration works from a GitHub Pages project subpath.
if('serviceWorker' in navigator){
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('sw.js').catch(function(){});
    // sw.js posts APP_UPDATE_READY after it fetches a newer index.html from the server.
    // We never auto-reload (a reload mid-race would be hostile); the strategist taps
    // the toast when ready, or simply gets the new version on the next launch.
    navigator.serviceWorker.addEventListener('message',function(e){
      if(e.data&&e.data.type==='APP_UPDATE_READY')showPwaUpdateToast();
    });
  });
}
function showPwaUpdateToast(){
  if(document.getElementById('pwa-update-toast'))return;
  var t=document.createElement('div');
  t.id='pwa-update-toast';
  t.textContent='UPDATE READY — TAP TO RELOAD';
  t.style.cssText='position:fixed;bottom:calc(16px + env(safe-area-inset-bottom,0px));left:50%;transform:translateX(-50%);background:#DFFF00;color:#000;font-family:Orbitron,sans-serif;font-size:0.5rem;font-weight:700;letter-spacing:0.18em;padding:11px 18px;border-radius:8px;z-index:9999;cursor:pointer;box-shadow:0 4px 24px rgba(223,255,0,0.35);white-space:nowrap';
  t.onclick=function(){location.reload();};
  document.body.appendChild(t);
}
