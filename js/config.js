/* LUMINARY ENDURANCE MANAGER
   Team / Event Config page: time dropdowns, sim mode, prerequisite
   checks, and reading the config form into S.

   Extracted verbatim from index.html lines 717-804.
   These are CLASSIC scripts, not ES modules: top-level declarations stay in the
   shared global scope, where the delegated dispatcher in js/actions.js resolves
   them by name. No inline on*= handlers remain in the markup (Step 5).
   LOAD ORDER MATTERS - js/main.js must be last. */

// TIME DROPDOWNS
function buildTimeDDs(){
  ['cfg-hour-h','cfg-ighr-h'].forEach(id=>{const s=el(id);if(!s)return;const c=s.value;s.innerHTML='';for(let i=0;i<24;i++){const o=document.createElement('option');o.value=i;o.textContent=String(i).padStart(2,'0');s.appendChild(o);}if(c!=='')s.value=c;});
  const dh=el('cfg-dur-h');if(dh){const c=dh.value;dh.innerHTML='';for(let i=0;i<48;i++){const o=document.createElement('option');o.value=i;o.textContent=String(i);dh.appendChild(o);}if(c!=='')dh.value=c;}
  ['cfg-hour-m','cfg-dur-m','cfg-ighr-m'].forEach(id=>{const s=el(id);if(!s)return;const c=s.value;s.innerHTML='';for(let i=0;i<60;i++){const o=document.createElement('option');o.value=i;o.textContent=String(i).padStart(2,'0');s.appendChild(o);}if(c!=='')s.value=c;});
}
function syncHourDrop(){const h=parseInt(gv('cfg-hour-h'))||0;const m=parseInt(gv('cfg-hour-m'))||0;S.config.hour=h+(m/60);}
function syncDurDrop(){const h=parseInt(gv('cfg-dur-h'))||0;const m=parseInt(gv('cfg-dur-m'))||0;S.config.dur=h+(m/60);}
function syncIghrDrop(){const h=parseInt(gv('cfg-ighr-h'))||0;const m=parseInt(gv('cfg-ighr-m'))||0;S.config.ighr=h+(m/60);}
function raceStart(){const c=S.config;if(!c.date||c.hour===''||c.hour===null||c.hour===undefined)return null;const th=parseFloat(c.hour)||0;const h=Math.floor(th);const m=Math.round((th-h)*60);const d=new Date(c.date+'T'+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':00Z');if(isNaN(d))return null;return new Date(d.getTime()+(parseInt(c.green)||40)*60000);}
function buildHourOpts(){buildTZSelect();} // Legacy call — now builds timezone select

// SIM MODE
function applySimMode(){
  S.config.sim=gv('cfg-sim');
  const isIR=S.config.sim==='iracing';
  const irB=el('iracing-block');const fsC=el('fs-card');
  if(irB)irB.style.display=isIR?'block':'none';
  if(fsC)fsC.style.display=isIR?'block':'none';
  const irFM=el('ir-field-modal');if(irFM)irFM.style.display=isIR?'':'none';
  persist();
}

// PREREQS
function checkPrereqs(){
  const c=S.config;
  const reqs=[
    {label:'At least one driver added to roster',met:S.drivers.length>0},
    {label:'At least one driver has a lap time entered',met:S.drivers.some(d=>d.lap&&parseLap(d.lap)>0)},
    {label:'At least one driver has a fuel burn rate entered',met:S.drivers.some(d=>d.fpl&&parseFloat(d.fpl)>0)},
    {label:'Race date selected',met:!!c.date},
    {label:'Session start time set',met:c.hour!==''&&c.hour!==null&&c.hour!==undefined},
    {label:'Race duration set',met:!!(c.dur&&parseFloat(c.dur)>0)},
  ];
  const allMet=reqs.every(r=>r.met);
  const list=el('prereq-list');const block=el('prereq-block');const ready=el('prereq-ready');
  if(list)list.innerHTML=reqs.map(r=>`<div class="prereq-item ${r.met?'met':''}"><span class="prereq-icon">${r.met?'✓':'✗'}</span><span>${r.label}</span></div>`).join('');
  if(block)block.className=allMet?'card green-l':'card red-l';
  if(ready)ready.style.display=allMet?'block':'none';
  try{renderCollapseSummaries();}catch(e){}
  if(allMet&&!S.stints.length)buildStints();
  return allMet;
}

// CONFIG
function reanchorStints(){
  // When the race date/time/green changes pre-race, shift existing stints so #1 starts at the new green.
  if(!S.stints.length)return;
  const rs=raceStart();if(!rs)return;
  const now=Date.now();
  const anyDoneOrLive=S.stints.some(s=>s.done||(s.startMs<=now&&s.endMs>now));
  if(anyDoneOrLive)return; // never disturb a live or completed race
  const delta=rs.getTime()-S.stints[0].startMs;
  if(Math.abs(delta)<1000)return;
  S.stints.forEach(s=>{s.startMs+=delta;s.endMs+=delta;});
}
function sc(){
  const c=S.config;
  c.name=gv('cfg-name');c.car=gv('cfg-car');c.carClass=gv('cfg-class');c.track=gv('cfg-track');
  c.sim=gv('cfg-sim');c.date=gv('cfg-date');c.green=gv('cfg-green')||40;
  c.tank=gv('cfg-tank');c.pit=gv('cfg-pit');c.res=gv('cfg-res');
  reanchorStints();
  persist();calcSummary();
}
function populateConfig(){
  const c=S.config;
  sv('cfg-name',c.name);sv('cfg-car',c.car);sv('cfg-class',c.carClass||'');sv('cfg-track',c.track);
  if(c.sim)sv('cfg-sim',c.sim);
  sv('cfg-date',c.date);sv('cfg-green',c.green||40);
  sv('cfg-tank',c.tank);sv('cfg-pit',c.pit);sv('cfg-res',c.res);
  if(c.hour!==''&&c.hour!==null&&c.hour!==undefined){const hh=Math.floor(parseFloat(c.hour)||0);const hm=Math.round(((parseFloat(c.hour)||0)-hh)*60);sv('cfg-hour-h',hh);sv('cfg-hour-m',hm);}
  if(c.dur){const dh=Math.floor(parseFloat(c.dur)||0);const dm=Math.round(((parseFloat(c.dur)||0)-dh)*60);sv('cfg-dur-h',dh);sv('cfg-dur-m',dm);}
  if(c.ighr!==''&&c.ighr!==null&&c.ighr!==undefined){const ih=Math.floor(parseFloat(c.ighr)||0);const im=Math.round(((parseFloat(c.ighr)||0)-ih)*60);sv('cfg-ighr-h',ih);sv('cfg-ighr-m',im);}
  syncAvg();calcSummary();applySimMode();checkPrereqs();
}
function syncAvg(){
  const std=S.drivers.filter(d=>d.lap&&parseLap(d.lap)>0);
  const fs=S.drivers.filter(d=>d.fslap&&parseLap(d.fslap)>0);
  if(std.length){const ms=std.reduce((a,d)=>a+parseLap(d.lap),0)/std.length;const fpl=std.reduce((a,d)=>a+parseFloat(d.fpl||0),0)/std.length;sv('cfg-lap',Math.floor(ms/60000)+':'+(((ms%60000)/1000).toFixed(1)).padStart(4,'0'));sv('cfg-fpl',fpl.toFixed(2));S.config.lap=gv('cfg-lap');S.config.fpl=gv('cfg-fpl');}
  if(fs.length){const ms=fs.reduce((a,d)=>a+parseLap(d.fslap),0)/fs.length;const fb=fs.reduce((a,d)=>a+parseFloat(d.fsburn||0),0)/fs.length;sv('cfg-fslap',Math.floor(ms/60000)+':'+(((ms%60000)/1000).toFixed(1)).padStart(4,'0'));sv('cfg-fsburn',fb.toFixed(2));S.config.fslap=gv('cfg-fslap');S.config.fsburn=gv('cfg-fsburn');}
}
function calcSummary(){
  const c=S.config;const lapMs=parseLap(c.lap);const tank=parseFloat(c.tank)||110;const res=parseFloat(c.res)||4;const fpl=parseFloat(c.fpl)||3.79;
  const e=el('cfg-calc');if(!e)return;
  if(!lapMs){e.innerHTML='<div style="color:var(--muted);font-size:0.68rem">Add driver pace data to calculate.</div>';return;}
  const laps=Math.floor((tank-res)/fpl);const dur=laps*lapMs;
  e.innerHTML=`<div class="g3"><div class="stat"><div class="stat-l">Std Laps/Stint</div><div class="stat-v accent">${laps}</div></div><div class="stat"><div class="stat-l">Std Duration</div><div class="stat-v">${fmtDur(dur)}</div></div><div class="stat"><div class="stat-l">Fuel Load</div><div class="stat-v">${(laps*fpl).toFixed(1)}L</div></div></div>`;
}
