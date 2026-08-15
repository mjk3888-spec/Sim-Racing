/* LUMINARY ENDURANCE MANAGER
   Driver roster and modals, event archive and export, the cross-event
   driver library, settings, testing notes, stint notes and the status log.

   Extracted verbatim from index.html lines 1293-1445.
   These are CLASSIC scripts, not ES modules: top-level declarations stay in the
   shared global scope so the existing inline onclick= handlers keep working.
   LOAD ORDER MATTERS - js/main.js must be last. */

// DRIVERS
function renderDriverList(){
  const e=el('drv-list');if(!e)return;
  const isIR=S.config.sim==='iracing';
  e.innerHTML=S.drivers.map((d,i)=>`<div class="dcard" style="border-left:3px solid ${d.color}" onclick="openDrvModal(${i})"><div class="dcard-av" style="background:${d.color}22;color:${d.color};font-size:13px">${drvInitials(d.name)}</div><div style="flex:1"><div style="font-family:var(--display);font-size:0.66rem;font-weight:700;color:var(--text)">${flagHTML(d)}${d.handle||d.name}${d.handle?` <span style="font-weight:400;color:var(--gulf);font-size:0.6rem">/ ${d.name}</span>`:''}</div><div class="dcard-meta">${d.tzabbr||(d.tz?getTZAbbr(d.tz):('GMT'+(d.gmt>=0?'+':'')+d.gmt))}${isIR&&d.ir?' · <span style="color:var(--volt)">'+d.ir.toLocaleString()+' iR</span>':''}</div>${d.lap?'<div style="font-family:var(--mono);font-size:0.58rem;color:#C060E8;margin-top:3px">Max: '+d.lap+' · '+d.fpl+'L/lap</div>':''}${d.fslap?'<div style="font-family:var(--mono);font-size:0.58rem;color:var(--green);margin-top:2px">FS: '+d.fslap+' · '+d.fsburn+'L/lap</div>':''}</div></div>`).join('');
  const irB=el('iracing-block');if(irB)irB.style.display=isIR?'block':'none';
  const irs=S.drivers.filter(d=>d.ir>0);const ai=el('avg-ir');if(ai)ai.textContent=irs.length?Math.round(irs.reduce((a,d)=>a+d.ir,0)/irs.length).toLocaleString():'—';
  renderStintSummary();
}
// ARCHIVE & EXPORT
function loadArchive(){try{return JSON.parse(localStorage.getItem('lum_archive')||'[]');}catch(e){return[];}}
function saveArchive(a){try{localStorage.setItem('lum_archive',JSON.stringify(a));}catch(e){}}
function archiveEvent(){
  if(!S.config.name){alert('Name the event before archiving.');return;}
  const arch=loadArchive();
  const snap={id:Date.now(),name:S.config.name,track:S.config.track||'',car:S.config.car||'',date:S.config.date||'',savedAt:new Date().toISOString(),state:JSON.parse(JSON.stringify({config:S.config,drivers:S.drivers,stints:S.stints,avail:S.avail,goals:S.goals,checks:S.checks,tnotes:S.tnotes,schMeta:S.schMeta,raceLog:S.raceLog,settingCols:S.settingCols}))};
  arch.unshift(snap);
  try{
    const payload=JSON.stringify(arch);
    if(payload.length>3500000){alert('Archive storage is nearly full ('+(payload.length/1048576).toFixed(1)+'MB). Delete old archived events to make room.');}
    localStorage.setItem('lum_archive',payload);
  }catch(e){alert('Archive failed — browser storage is full. Delete old archived events and try again.');arch.shift();}
  renderArchive();
}
function renderArchive(){
  const e=el('archive-list');if(!e)return;
  const arch=loadArchive();
  if(!arch.length){e.innerHTML='<div style="color:var(--muted);font-size:0.62rem">No archived events yet.</div>';return;}
  e.innerHTML=arch.map(a=>{
    const d=new Date(a.savedAt);const ds=d.toLocaleDateString()+' '+d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    return`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0">
        <div style="font-family:var(--display);font-size:0.62rem;font-weight:700;color:var(--text)">${a.name}</div>
        <div style="font-family:var(--mono);font-size:0.52rem;color:var(--muted)">${[a.car,a.track].filter(Boolean).join(' · ')}${a.car||a.track?' · ':''}Saved ${ds}</div>
      </div>
      <button class="btn xs bl" onclick="restoreArchive(${a.id})">Load</button>
      <button class="btn xs rd" onclick="delArchive(${a.id})">✕</button>
    </div>`;
  }).join('');
}
function restoreArchive(id){
  const arch=loadArchive();const a=arch.find(x=>x.id===id);if(!a)return;
  if(!confirm('Load "'+a.name+'"? This replaces your current event data (archived events are kept).'))return;
  S={...S,...a.state};persist();
  renderDriverList();renderSettingsTable();renderTNotes();checkPrereqs();renderSchedule();buildAvail();updateDash();renderArchive();
  alert('Loaded: '+a.name);
}
function delArchive(id){if(!confirm('Delete this archived event permanently?'))return;saveArchive(loadArchive().filter(x=>x.id!==id));renderArchive();}
function exportScheduleCSV(){
  if(!S.stints.length){alert('No schedule to export.');return;}
  const rows=[['Stint','Driver','Type','Start (GMT)','End (GMT)','Duration','Laps','Fuel (L)']];
  S.stints.forEach(s=>{const drv=S.drivers.find(d=>d.name===s.driver);const dn=drv?(drv.handle||drv.name):(s.driver||'Unassigned');rows.push([s.num,dn,s.stintType||'std',fmtGMT(new Date(s.startMs)),fmtGMT(new Date(s.endMs)),fmtDur(s.durMs),s.laps,s.fuel]);});
  const csv=rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=(S.config.name||'event').replace(/[^a-z0-9]/gi,'_')+'_schedule.csv';a.click();URL.revokeObjectURL(url);
}
function exportScheduleText(){
  if(!S.stints.length){alert('No schedule to export.');return;}
  let txt=(S.config.name||'Event')+' — Stint Rotation\n';
  if(S.config.car||S.config.track)txt+=[S.config.car,S.config.track].filter(Boolean).join(' · ')+'\n';
  txt+='\n';
  S.stints.forEach(s=>{const drv=S.drivers.find(d=>d.name===s.driver);const dn=drv?(drv.handle||drv.name):(s.driver||'Unassigned');txt+=`#${s.num}  ${fmtGMT(new Date(s.startMs))}-${fmtGMT(new Date(s.endMs))} GMT  ${dn}\n`;});
  if(navigator.clipboard){navigator.clipboard.writeText(txt).then(()=>alert('Rotation copied to clipboard.'),()=>prompt('Copy:',txt));}
  else prompt('Copy:',txt);
}

// DRIVER LIBRARY (persistent across events — lum_drivers key)
function loadLib(){try{return JSON.parse(localStorage.getItem('lum_drivers')||'[]');}catch(e){return[];}}
function saveLib(l){try{localStorage.setItem('lum_drivers',JSON.stringify(l));}catch(e){}}
function upsertLib(d){if(!d.name)return;const lib=loadLib();const i=lib.findIndex(x=>(x.name||'').toLowerCase()===d.name.toLowerCase());const entry={name:d.name,handle:d.handle||'',ir:d.ir||0,tz:d.tz||'',country:d.country||'',color:d.color||'',timefmt:d.timefmt||'12',maxConsec:d.maxConsec||2};if(i>=0)lib[i]=entry;else lib.push(entry);saveLib(lib);}
function buildLibSelect(){const s=el('dm-lib');if(!s)return;const lib=loadLib();s.innerHTML='<option value="">— Load Saved Driver —</option>'+lib.map((d,i)=>`<option value="${i}">${d.handle||d.name}</option>`).join('');}
function loadFromLib(){const i=parseInt(gv('dm-lib'));if(isNaN(i))return;const lib=loadLib();const d=lib[i];if(!d)return;sv('dm-name',d.name||'');sv('dm-handle',d.handle||'');sv('dm-ir',d.ir||'');sv('dm-tz',d.tz||'America/New_York');sv('dm-country',d.country||'');sv('dm-timefmt',d.timefmt||'12');sv('dm-maxconsec',d.maxConsec||2);if(d.color)el('dm-color').value=d.color;onTZChange();}
function removeFromLib(){const i=parseInt(gv('dm-lib'));if(isNaN(i)){return;}const lib=loadLib();const nm=lib[i]?(lib[i].handle||lib[i].name):'';lib.splice(i,1);saveLib(lib);buildLibSelect();}
function openDrvModal(idx){
  buildTZSelect();buildCountrySelect();buildLibSelect();S.editDrvIdx=idx!==undefined?idx:null;const d=idx!==undefined?S.drivers[idx]:null;
  el('drv-mtitle').textContent=d?'Edit Driver':'Add Driver';
  sv('dm-name',d?d.name:'');sv('dm-handle',d?d.handle:'');sv('dm-ir',d?d.ir:'');
  sv('dm-tz',d?d.tz||'America/New_York':'America/New_York');
  sv('dm-country',d?d.country||'':'');
  sv('dm-timefmt',d?d.timefmt||'12':'12');
  sv('dm-lap',d?d.lap:'');sv('dm-fpl',d?d.fpl:'');sv('dm-fslap',d?d.fslap:'');sv('dm-fsburn',d?d.fsburn:'');sv('dm-maxconsec',d?d.maxConsec||2:2);
  sv('dm-idx',idx!==undefined?idx:'');el('dm-color').value=d?d.color:DRV_COLORS[S.drivers.length%DRV_COLORS.length];
  onTZChange();
  el('drv-overlay').classList.add('on');const db=el('dm-delete-btn');if(db)db.style.display=idx!==undefined?'inline-flex':'none';
  const irFM=el('ir-field-modal');if(irFM)irFM.style.display=S.config.sim==='iracing'?'':'none';
}
function closeDrv(){el('drv-overlay').classList.remove('on');}
function saveDrv(){
  const _tz=gv('dm-tz')||'America/New_York';const _ref=getEventRefDate();const _c=COUNTRY_LIST.find(c=>c.code===gv('dm-country'))||{code:'',name:'',flag:''};const d={id:S.editDrvIdx!==null?S.drivers[S.editDrvIdx].id:Date.now(),name:gv('dm-name'),handle:gv('dm-handle'),ir:parseInt(gv('dm-ir'))||0,tz:_tz,gmt:getOffsetFromTZ(_tz,_ref),tzabbr:getTZAbbr(_tz,_ref),country:_c.code,countryName:_c.name,countryFlag:_c.flag,color:el('dm-color').value,timefmt:gv('dm-timefmt')||'12',lap:gv('dm-lap'),fpl:gv('dm-fpl'),fslap:gv('dm-fslap'),fsburn:gv('dm-fsburn'),maxConsec:parseInt(gv('dm-maxconsec'))||2,settings:S.editDrvIdx!==null?(S.drivers[S.editDrvIdx].settings||{}):{} };
  if(!d.name)return;
  if(S.editDrvIdx!==null)S.drivers[S.editDrvIdx]=d;else S.drivers.push(d);upsertLib(d);
  persist();closeDrv();renderDriverList();syncAvg();calcSummary();renderSettingsTable();refreshTNDrv();loadSchMeta();checkPrereqs();
}
function confirmDeleteDriver(){const i=S.editDrvIdx;if(i===null)return;if(confirm('Delete '+S.drivers[i].name+'?')){S.drivers.splice(i,1);persist();closeDrv();renderDriverList();renderSettingsTable();renderSchedule();updateDash();checkPrereqs();}}

// SETTINGS
function renderSettingsTable(){
  const cols=S.settingCols;const hd=el('settings-head');const tb=el('settings-tbody');if(!hd||!tb)return;
  hd.innerHTML='<th>Driver</th>'+cols.map(c=>'<th>'+c.n+'</th>').join('');
  const av={};cols.forEach(c=>{av[c.k]=S.drivers.map(d=>(d.settings&&d.settings[c.k])||'');});
  tb.innerHTML=S.drivers.map((d,di)=>`<tr><td style="white-space:nowrap;color:var(--text)"><div style="display:flex;align-items:center;gap:7px"><span class="dot" style="background:${d.color}"></span>${flagHTML(d)}${d.handle||d.name}</div></td>${cols.map(c=>{const vals=av[c.k].filter(v=>v!=='');const val=(d.settings&&d.settings[c.k])||'';const diff=vals.length>1&&!vals.every(v=>v===vals[0]);return`<td class="${diff?'diff-cell':''}"><input type="text" value="${val}" style="width:90px;background:transparent;border-color:${diff?'var(--orange)':'var(--border-bright)'}" data-di="${di}" data-k="${c.k}" onblur="flushSetting(this)" onchange="flushSetting(this)"></td>`;}).join('')}</tr>`).join('');
}
function flushSetting(inp){const di=parseInt(inp.dataset.di);const k=inp.dataset.k;const v=inp.value;if(!S.drivers[di].settings)S.drivers[di].settings={};if(S.drivers[di].settings[k]!==v){S.drivers[di].settings[k]=v;persist();renderSettingsTable();}}
function addCol(){el('col-overlay').classList.add('on');}
function confirmCol(){const n=gv('col-name').trim();if(!n)return;S.settingCols.push({n,k:'c_'+Date.now()});persist();renderSettingsTable();el('col-overlay').classList.remove('on');sv('col-name','');}
function removeLastCol(){if(S.settingCols.length>0){S.settingCols.pop();persist();renderSettingsTable();}}

// TESTING NOTES
function refreshTNDrv(){const s=el('tn-drv');if(!s)return;s.innerHTML=S.drivers.map(d=>'<option value="'+d.name+'">'+d.name+'</option>').join('');}
function openTNote(){refreshTNDrv();['tn-lap','tn-air','tn-trk','tn-fuel'].forEach(id=>sv(id,''));el('tnote-overlay').classList.add('on');}
function saveTNote(){S.tnotes.push({id:Date.now(),driver:gv('tn-drv'),lap:gv('tn-lap'),air:gv('tn-air'),trk:gv('tn-trk'),unit:gv('tn-unit'),fuel:gv('tn-fuel'),lapNotes:[]});persist();el('tnote-overlay').classList.remove('on');renderTNotes();}
function renderTNotes(){
  const e=el('tnotes-list');if(!e)return;
  if(!S.tnotes.length){e.innerHTML='<div style="color:var(--muted);font-size:0.68rem">No testing notes yet.</div>';return;}
  e.innerHTML=S.tnotes.map((n,ni)=>{const drv=S.drivers.find(d=>d.name===n.driver);const dc=drv?drv.color:'var(--muted)';return`<div class="tnote"><div class="tnote-head"><div><div class="tnote-drv"><span class="dot" style="background:${dc}"></span>${n.driver}${n.lap?` <span style="color:var(--green);font-size:0.7rem">${n.lap}</span>`:''}</div>${n.air?'<div class="tnote-meta">Air: '+n.air+'°'+n.unit+' · Track: '+n.trk+'°'+n.unit+(n.fuel?' · '+n.fuel:'')+'</div>':''}</div><div class="brow"><button class="btn xs" onclick="addLapNote(${ni})">+ Note</button><button class="btn xs rd" onclick="delTNote(${ni})">Delete</button></div></div>${(n.lapNotes||[]).map((ln,li)=>'<div class="lap-note"><div class="lap-note-txt">'+ln+'</div><button class="btn xs rd" onclick="delLapNote('+ni+','+li+')">✕</button></div>').join('')}</div>`;}).join('');
}
function addLapNote(ni){const t=prompt('Enter note:');if(!t)return;S.tnotes[ni].lapNotes=S.tnotes[ni].lapNotes||[];S.tnotes[ni].lapNotes.push(t);persist();renderTNotes();}
function delLapNote(ni,li){S.tnotes[ni].lapNotes.splice(li,1);persist();renderTNotes();}
function delTNote(ni){if(confirm('Delete?')){S.tnotes.splice(ni,1);persist();renderTNotes();}}

// STINT NOTES
function saveSchMeta(){if(!S.schMeta)S.schMeta={};S.schMeta.qualiDriver=gv('sch-quali-driver');S.schMeta.qualiNotes=gv('sch-quali-notes');persist();renderStatusLog();}
function saveSchMetaPos(){const raw=gv('sch-quali-pos');const n=parseInt(raw);const pos=raw?(!isNaN(n)?ordinal(n):raw):'';if(!S.schMeta)S.schMeta={};S.schMeta.qualiPos=pos;sv('sch-quali-pos',pos);persist();renderStatusLog();}
function loadSchMeta(){const m=S.schMeta||{};const s=el('sch-quali-driver');if(s){s.innerHTML='<option value="">— Select Driver —</option>'+S.drivers.map(d=>`<option value="${d.name}"${m.qualiDriver===d.name?' selected':''}>${d.handle||d.name}</option>`).join('');}sv('sch-quali-pos',m.qualiPos||'');sv('sch-quali-notes',m.qualiNotes||'');}
function openNote(idx){const s=S.stints[idx];el('note-num').textContent=s.num;sv('note-end',s.actualEnd);sv('note-laps',s.actualLaps);sv('note-txt',s.notes);el('note-idx').value=idx;el('note-overlay').classList.add('on');}
function closeNote(){el('note-overlay').classList.remove('on');}
function saveNote(){const idx=parseInt(gv('note-idx'));const ae=gv('note-end');const prev=S.stints[idx].actualEnd;S.stints[idx].actualEnd=ae;S.stints[idx].actualLaps=gv('note-laps');S.stints[idx].notes=gv('note-txt');if(ae&&ae!==prev)cascade(idx,ae);persist();closeNote();renderSchedule();updateDash();}
function markDone(){const idx=parseInt(gv('note-idx'));const ae=gv('note-end');S.stints[idx].actualEnd=ae;S.stints[idx].actualLaps=gv('note-laps');S.stints[idx].notes=gv('note-txt');S.stints[idx].done=true;if(ae)cascade(idx,ae);persist();closeNote();renderSchedule();updateDash();}

// STATUS LOG
function quickLog(type){
  const labels={'pit-in':'Pit In','pit-out':'Pit Out','contact':'Contact / Damage'};
  const now=Date.now();
  const active=S.stints.find(s=>!s.done&&s.startMs<=now&&s.endMs>now);
  const drv=active?(()=>{const d=S.drivers.find(x=>x.name===active.driver);return d?(d.handle||d.name):active.driver;})():'';
  S.raceLog.push({id:now,type,label:labels[type]||type,driver:drv,ts:now});
  persist();renderStatusLog();
}
function delLogEntry(id){S.raceLog=S.raceLog.filter(e=>e.id!==id);persist();renderStatusLog();}
function renderStatusLog(){
  const e=el('race-status-log');if(!e)return;
  const m=S.schMeta||{};const events=[];
  if(m.qualiPos||m.qualiDriver||m.qualiNotes){events.push({type:'start',text:['Race Start',(m.qualiPos?m.qualiPos+' Starting Position':''),(m.qualiDriver||''),(m.qualiNotes||'')].filter(Boolean).join(' · '),ts:-1});}
  let i=0;const st=S.stints;let lep='';
  while(i<st.length){const s=st[i];if(!s.driver){i++;continue;}let re=i;while(re+1<st.length&&st[re+1].driver===s.driver)re++;let j=i;
    while(j<=re){let se=j;while(se<re&&!st[se].damage)se++;const sub=st.slice(j,se+1);const first=sub[0];const last=sub[sub.length-1];const drv=S.drivers.find(d=>d.name===first.driver);const dc=drv?drv.color:'var(--green)';const nums=sub.length===1?`#${first.num}`:`#${first.num}–#${last.num}`;const names=['Single','Double','Triple','Quadruple','Quintuple','Sextuple','Septuple','Octuple'];const sl=(names[sub.length-1]||sub.length+'-Stint')+' Stint';const positions=sub.filter(x=>x.position).map(x=>x.position);const ep=positions.length?positions[positions.length-1]:'';const hdp=sub.some(x=>x.done)||positions.length>0;if(hdp){let txt=`${sl} (${nums}) — ${first.driver}`;if(lep&&ep&&lep!==ep)txt=`${lep} → ${ep} — ${txt}`;else if(ep)txt=`${ep} — End of ${txt}`;events.push({type:'position',text:txt,color:dc,ts:first.startMs});if(ep)lep=ep;}if(last.damage){events.push({type:'damage',text:`Damage — Stint #${last.num} · ${last.driver}${last.damageTime?' — Repair: '+last.damageTime:''}`,ts:last.startMs+1});}j=se+1;}i=re+1;}
  st.forEach(s=>{if(s.notes&&s.done)events.push({type:'note',text:`Stint #${s.num} Note: ${s.notes}`,ts:s.endMs});});
  (S.raceLog||[]).forEach(l=>{events.push({type:l.type==='contact'?'damage':'manual',text:fmtGMT(new Date(l.ts))+' GMT — '+l.label+(l.driver?' · '+l.driver:''),ts:l.ts,logId:l.id});});
  events.sort((a,b)=>a.ts-b.ts);
  if(!events.length){e.innerHTML='<div style="color:var(--muted);font-size:0.68rem">No events logged yet.</div>';return;}
  e.innerHTML=events.map(ev=>{const icon=ev.type==='damage'?'⚠':ev.type==='start'?'◉':ev.type==='manual'?'▸':'◈';const col=ev.type==='damage'?'var(--red)':ev.type==='start'?'var(--volt)':ev.type==='manual'?'var(--gulf)':ev.color||'var(--green)';const del=ev.logId?`<button class="btn xs" style="margin-left:auto;flex-shrink:0" onclick="delLogEntry(${ev.logId})">✕</button>`:'';return`<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);align-items:flex-start"><span style="color:${col};flex-shrink:0;font-size:0.9rem">${icon}</span><div style="font-family:var(--mono);font-size:0.7rem;color:${col};line-height:1.5;flex:1">${ev.text}</div>${del}</div>`;}).join('');
}
