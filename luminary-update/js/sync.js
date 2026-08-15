/* LUMINARY ENDURANCE MANAGER
   Live sync with teammates. Broadcast model: one strategist writes, the
   rest poll and render. See sync/google-apps-script.gs for the backend.

   Extracted verbatim from index.html lines 1547-1581.
   These are CLASSIC scripts, not ES modules: top-level declarations stay in the
   shared global scope so the existing inline onclick= handlers keep working.
   LOAD ORDER MATTERS - js/main.js must be last. */

// SYNC — TEAMMATE SHARING (broadcast model)
// ── Sharing model: ONE strategist owns and edits the schedule; teammates open the
//    same hosted URL and consume live state as read-mostly viewers. This is a
//    broadcast, not multi-writer collaboration. Last write wins by design.
// ── Transport boundary: everything below this line up to persist() is the sync
//    transport layer. Its surface is exactly four operations:
//      setSyncUrl(url)  — connect/disconnect a sync endpoint (persisted in lum4_sync)
//      startSync()/stopSync() — begin/end the 15s poll loop
//      pushState()      — POST {action:'write', ts, state:JSON.stringify(S)}
//      pullState()      — GET  ?action=read&ts=<lastSeen> → {ts, state}
//    A future multi-writer backend can be added as a separate phase by swapping the
//    fetch targets inside pushState/pullState for a new endpoint that honors the same
//    contract (ts-guarded read, whole-state write). Nothing outside this block knows
//    or cares that Google Apps Script is the current backend. Do NOT add conflict
//    resolution, presence, or per-field merging here — that belongs to that future
//    backend phase, not this client.
let SYNC_URL='';let _sInt=null;let _lsTs=0;let _sEnabled=false;
function saveSyncUrl(){setSyncUrl(el('sync-url-input').value.trim());}
function disconnectSync(){setSyncUrl('');}
function setSyncUrl(url){SYNC_URL=url;localStorage.setItem('lum4_sync',SYNC_URL);const inp=el('sync-url-input');if(inp)inp.value=SYNC_URL;const d=el('sync-url-disp');if(d){d.style.display=SYNC_URL?'block':'none';if(SYNC_URL)d.textContent='Connected: '+SYNC_URL;}if(SYNC_URL)startSync();else stopSync();}
function loadSyncUrl(){const s=localStorage.getItem('lum4_sync');if(s){SYNC_URL=s;const inp=el('sync-url-input');if(inp)inp.value=SYNC_URL;const d=el('sync-url-disp');if(d){d.style.display='block';d.textContent='Connected: '+SYNC_URL;}startSync();}}
function startSync(){_sEnabled=true;setSyncStatus('connecting','Connecting...');pushState();if(_sInt)clearInterval(_sInt);_sInt=setInterval(pullState,15000);setTimeout(pullState,2000);}
function stopSync(){_sEnabled=false;if(_sInt)clearInterval(_sInt);setSyncStatus('off','Offline');}
function setSyncStatus(state,msg){
  const colors={off:'var(--muted)',connecting:'var(--yellow)',ok:'var(--green)',error:'var(--red)'};
  ['sync-dot','sync-dot2'].forEach(id=>{const d=el(id);if(!d)return;d.style.background=colors[state]||'var(--muted)';d.className='s-sync-dot'+(state==='ok'?' live':'');});
  ['sync-status','sync-status2'].forEach(id=>{const s=el(id);if(s)s.textContent=msg;});
  if(state==='ok'){const t=el('sync-time');if(t){const d=new Date();t.textContent=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0');}}
}
async function pushState(){if(!SYNC_URL||!_sEnabled)return;try{const r=await fetch(SYNC_URL,{method:'POST',body:JSON.stringify({action:'write',ts:Date.now(),state:JSON.stringify(S)})});if(r.ok)setSyncStatus('ok','Synced');else setSyncStatus('error','Push Failed');}catch(e){setSyncStatus('error','Push Error');}}
async function pullState(){if(!SYNC_URL||!_sEnabled)return;try{const r=await fetch(SYNC_URL+'?action=read&ts='+_lsTs);if(!r.ok){setSyncStatus('error','Pull Failed');return;}const data=await r.json();if(data&&data.ts&&data.ts>_lsTs&&data.state){_lsTs=data.ts;const remote=JSON.parse(data.state);S.stints=remote.stints||S.stints;S.config=remote.config||S.config;S.schMeta=remote.schMeta||S.schMeta;S.goals=remote.goals||S.goals;S.checks=remote.checks||S.checks;S.avail=remote.avail||S.avail;if(remote.drivers&&remote.drivers.length){remote.drivers.forEach(rd=>{const li=S.drivers.findIndex(d=>d.id===rd.id);if(li>=0)S.drivers[li]=rd;else S.drivers.push(rd);});}populateConfig();renderDriverList();renderSchedule();buildAvail();renderGoalsDash();renderGoals();renderChecklists();updateDash();setSyncStatus('ok','Synced');}else setSyncStatus('ok','Live');}catch(e){setSyncStatus('error','Pull Error');}}
const _lp=()=>{try{localStorage.setItem('lum4',JSON.stringify(S));}catch(e){}};
function persist(){_lp();if(_sEnabled&&SYNC_URL)pushState();}
function openSyncSetup(){pg('config');}
