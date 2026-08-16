/* LUMINARY ENDURANCE MANAGER
   Stint building, the schedule table, and the driver availability grid.

   Extracted verbatim from index.html lines 805-942.
   These are CLASSIC scripts, not ES modules: top-level declarations stay in the
   shared global scope, where the delegated dispatcher in js/actions.js resolves
   them by name. No inline on*= handlers remain in the markup (Step 5).
   LOAD ORDER MATTERS - js/main.js must be last. */

// STINTS
function buildStints(){
  syncAvg();const c=S.config;const start=raceStart();
  if(!start||!c.dur)return;
  const lapMs=parseLap(c.lap);const fsLapMs=parseLap(c.fslap)||lapMs;if(!lapMs)return;
  const tank=parseFloat(c.tank)||110;const res=parseFloat(c.res)||4;
  const fpl=parseFloat(c.fpl)||3.79;const fsFpl=parseFloat(c.fsburn)||fpl;
  const pit=parsePit(c.pit)*1000;const raceEnd=start.getTime()+parseFloat(c.dur)*3600000;
  const ex={};S.stints.forEach(s=>{ex[s.num]={driver:s.driver,stintType:s.stintType,actualEnd:s.actualEnd,actualLaps:s.actualLaps,notes:s.notes,done:s.done,damage:s.damage,damageTime:s.damageTime,position:s.position};});
  const stints=[];let cur=start.getTime();let n=1;
  while(cur<raceEnd){
    const e=ex[n]||{};const isFS=e.stintType==='fs';
    const ul=isFS?fsLapMs:lapMs;const uf=isFS?fsFpl:fpl;
    const laps=Math.floor((tank-res)/uf);const durMs=laps*ul;
    let endMs=Math.min(cur+durMs,raceEnd);const isFinal=endMs>=raceEnd;
    const actLaps=isFinal?Math.max(1,Math.round((endMs-cur)/ul)):laps;
    stints.push({num:n,startMs:cur,endMs,durMs:endMs-cur,laps:actLaps,fuel:(actLaps*uf).toFixed(1),stintType:e.stintType||'std-tires',isFinal,driver:e.driver||'',actualEnd:e.actualEnd||'',actualLaps:e.actualLaps||'',notes:e.notes||'',done:e.done||false,damage:e.damage||false,damageTime:e.damageTime||'',position:e.position||''});
    if(isFinal)break;
    let ns=endMs+pit;if(e.actualEnd){const ae=parseAE(e.actualEnd,new Date(cur));if(ae)ns=ae.getTime()+pit;}
    cur=ns;n++;
  }
  S.stints=stints;persist();renderSchedule();buildAvail();updateDash();
}
function parseAE(str,ref){try{const p=str.trim().split(':');if(p.length<2)return null;const h=parseInt(p[0]);const m=parseInt(p[1]);const d=new Date(ref);d.setUTCHours(h,m,0,0);if(d<ref)d.setUTCDate(d.getUTCDate()+1);return d;}catch(e){return null;}}
function cascade(idx,aeStr){const s=S.stints[idx];const ae=parseAE(aeStr,new Date(s.startMs));if(!ae)return;const delta=ae.getTime()-s.endMs;for(let i=idx+1;i<S.stints.length;i++){S.stints[i].startMs+=delta;S.stints[i].endMs+=delta;}}

// SCHEDULE
function renderSchedule(){
  const tbody=el('stint-tbody');if(!tbody)return;
  if(!S.stints.length){tbody.innerHTML='<tr><td colspan="16" style="text-align:center;padding:24px;color:var(--muted)">No stints — complete prerequisites on Team/Event Config tab.</td></tr>';return;}
  const now=Date.now();
  tbody.innerHTML=S.stints.map((s,i)=>{
    const live=!s.done&&s.startMs<=now&&s.endMs>now;const past=s.done||(s.endMs<=now&&!live);
    const drv=S.drivers.find(d=>d.name===s.driver);const dc=drv?drv.color:'var(--muted)';
    const status=s.done?'<span class="badge done">Done</span>':live?'<span class="badge live pulse">Live</span>':past?'<span class="badge done">Past</span>':'<span class="badge sched">Sched</span>';
    const lsr=drv?fmtLD(new Date(s.startMs),drv):{time:'—',ampm:''};const ler=drv?fmtLD(new Date(s.endMs),drv):{time:'—',ampm:''};
    const mkT=r=>typeof r==='string'?r:`<div style="font-size:0.92rem;font-weight:600;line-height:1.1">${r.time}</div><div style="font-size:0.62rem;color:var(--muted);margin-top:2px;min-height:0.8em;line-height:1">${r.ampm||''}</div>`;
    const tc=s.stintType==='fs'||s.stintType==='fs-tires'?'var(--gulf)':s.stintType==='std-tires'?'var(--yellow)':'var(--muted)';
    const dOpts='<option value="">— Needs Driver —</option>'+S.drivers.map(d=>{const av=getAv(s,d.name);const am=av==='open'?' ✓':av==='maybe'?' ~':av==='blocked'?' ✗':'';const ac=av==='blocked'?'color:#ff4040':av==='maybe'?'color:#f0c040':'';return`<option value="${d.name}"${s.driver===d.name?' selected':''} style="${ac}">${d.name}${am}</option>`;}).join('');
    const dd=s.driver?(flagHTML(drv)+(drv&&drv.handle?drv.handle:s.driver)):'Needs Driver';
    const sav=s.driver?getAv(s,s.driver):'open';const arc=sav==='blocked'?'avail-blocked':sav==='maybe'?'avail-maybe':'';
    const dmg=s.damage?`<button class="btn xs" style="background:var(--red-dim);border-color:var(--red);color:var(--red);white-space:nowrap" data-action="stint.damage-clear" data-i="${i}">⚠ Reported${s.damageTime?' ('+s.damageTime+')':''}</button>`:`<button class="btn xs" data-action="stint.damage-set" data-i="${i}">Damage</button>`;
    const isPR=past&&!live;const pp=S.stints.slice(0,i).filter(x=>x.position).slice(-1)[0];const cpn=parseInt(s.position);const ppn=pp?parseInt(pp.position):null;
    const pc=s.position&&ppn?(cpn<ppn?'var(--green)':cpn>ppn?'var(--red)':'var(--text)'):'var(--text)';
    return`<tr class="${s.done?'done ':''+(live?'live-row ':'')}${arc}" style="${isPR?'background:rgba(223,255,0,0.008);box-shadow:inset 2px 0 0 rgba(223,255,0,0.2)':''}">
      <td style="color:${isPR?'var(--volt)':'var(--muted)'}">${s.num}${s.isFinal?' ✦':''}</td>
      <td data-l="Status">${status}</td>
      <td data-l="Driver" style="min-width:155px"><div style="display:flex;flex-direction:column;gap:3px">
        <div style="font-family:var(--display);font-size:0.65rem;font-weight:700;color:var(--text)">${dd}</div>
        <select style="border-left:3px solid ${dc};padding-left:7px;font-size:0.72rem;background:var(--bg);color:var(--muted);border-top:none;border-right:none;border-bottom:none;border-style:solid;border-width:0 0 0 3px;outline:none;cursor:pointer" data-action="stint.assign-driver" data-i="${i}">${dOpts}</select>
      </div></td>
      <td><select style="background:var(--bg);color:${tc};border:1px solid var(--border);font-family:var(--mono);font-size:0.72rem;padding:3px 6px;cursor:pointer;min-width:100px" data-action="stint.assign-type" data-i="${i}">
        <option value="std"${s.stintType==='std'||!s.stintType?' selected':''}>Standard</option>
        <option value="fs"${s.stintType==='fs'?' selected':''}>Fuel Save</option>
        <option value="std-tires"${s.stintType==='std-tires'?' selected':''}>Std+Tires</option>
        <option value="fs-tires"${s.stintType==='fs-tires'?' selected':''}>FS+Tires</option>
      </select></td>
      <td data-l="Start" style="color:${live?'var(--volt)':'var(--text)'}">${fmtGMT(new Date(s.startMs))}</td>
      <td data-l="End">${fmtGMT(new Date(s.endMs))}</td>
      <td style="font-size:0.8rem;color:${drv?'var(--text)':'var(--muted)'}">${mkT(lsr)}</td>
      <td style="font-size:0.8rem;color:${drv?'var(--text)':'var(--muted)'}">${mkT(ler)}</td>
      <td style="font-size:0.8rem">${fmtDur(s.durMs)}</td>
      <td style="font-size:0.8rem">${s.laps}</td>
      <td style="font-size:0.8rem">${s.fuel}L</td>
      <td><input type="text" value="${s.actualEnd||''}" style="width:62px;background:var(--bg);border:1px solid var(--volt);color:var(--volt);font-size:0.78rem;padding:3px 5px;text-align:center" data-action="stint.actual-end" data-i="${i}"></td>
      <td><input type="text" value="${s.actualLaps||''}" style="width:48px;background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:0.78rem;padding:3px 5px;text-align:center" data-action="stint.actual-laps" data-i="${i}"></td>
      <td><input type="text" value="${s.position||''}" style="width:48px;background:var(--bg);border:1px solid var(--border);color:${pc};font-size:0.78rem;padding:3px 5px;text-align:center;font-weight:700" data-action="stint.position" data-i="${i}"></td>
      <td style="white-space:nowrap">${dmg}</td>
      <td data-l="Edit"><button class="btn xs" data-action="stint.note" data-i="${i}">✎</button></td>
    </tr>`;
  }).join('');
}

function assignDrv(i,n){S.stints[i].driver=n;persist();renderSchedule();updateDash();}
function saveActualEnd(i,v){const p=S.stints[i].actualEnd;S.stints[i].actualEnd=v;if(v&&v!==p)cascade(i,v);persist();updateDash();}
function saveActualLaps(i,v){const n=parseInt(v);if(!v||isNaN(n)){S.stints[i].actualLaps='';persist();return;}S.stints[i].actualLaps=n;if(!S.stints[i].actualEnd){const s=S.stints[i];const c=S.config;const isFS=s.stintType==='fs'||s.stintType==='fs-tires';const drv=S.drivers.find(d=>d.name===s.driver);const lm=isFS?(drv&&parseLap(drv.fslap)?parseLap(drv.fslap):parseLap(c.fslap)||parseLap(c.lap)):((drv&&parseLap(drv.lap)?parseLap(drv.lap):parseLap(c.lap)));if(lm){cascade(i,fmtGMT(new Date(s.startMs+n*lm)));}}persist();renderSchedule();updateDash();}
function savePosition(i,v){if(!v){S.stints[i].position='';persist();renderStatusLog();renderSchedule();return;}const n=parseInt(v);S.stints[i].position=isNaN(n)?v:ordinal(n);persist();renderStatusLog();renderSchedule();}
function toggleDamage(i,v){S.stints[i].damage=v;if(!v){S.stints[i].damageTime='';persist();renderSchedule();renderStatusLog();return;}el('dmg-idx').value=i;el('dmg-time-input').value=S.stints[i].damageTime||'';const s=S.stints[i];const drv=S.drivers.find(d=>d.name===s.driver);el('dmg-modal-subtitle').textContent='Stint #'+s.num+(drv?' — '+(drv.handle||drv.name):'');el('dmg-overlay').classList.add('on');}
function saveDamageModal(){const i=parseInt(el('dmg-idx').value);S.stints[i].damageTime=el('dmg-time-input').value.trim();persist();el('dmg-overlay').classList.remove('on');renderSchedule();renderStatusLog();}
function assignType(i,type){const s=S.stints[i];s.stintType=type;const isFS=type==='fs'||type==='fs-tires';const drv=S.drivers.find(d=>d.name===s.driver);const c=S.config;const lm=isFS?(drv&&parseLap(drv.fslap)?parseLap(drv.fslap):parseLap(c.fslap)||parseLap(c.lap)):((drv&&parseLap(drv.lap)?parseLap(drv.lap):parseLap(c.lap)));const fpl=isFS?(drv&&drv.fsburn?parseFloat(drv.fsburn):parseFloat(c.fsburn)||parseFloat(c.fpl)):(drv&&drv.fpl?parseFloat(drv.fpl):parseFloat(c.fpl)||3.79);const tank=parseFloat(c.tank)||110;const res=parseFloat(c.res)||4;if(lm&&fpl){const laps=Math.floor((tank-res)/fpl);s.laps=laps;s.fuel=(laps*fpl).toFixed(1);s.durMs=laps*lm;s.endMs=s.startMs+s.durMs;}persist();renderSchedule();updateDash();}
function getAv(stint,name){const di=S.drivers.findIndex(d=>d.name===name);if(di<0)return'open';let worst='open';const s0=Math.floor(stint.startMs/1800000);const s1=Math.floor((stint.endMs-1)/1800000);for(let sl=s0;sl<=s1;sl++){const st=S.avail[di+'_'+sl]||'open';if(st==='blocked')return'blocked';if(st==='maybe')worst='maybe';}return worst;}

// AVAIL
function buildAvail(){
  refreshAvDrvSelect();const wrap=el('avwrap');const start=raceStart();
  /* Every other render function in this file guards on a missing element; this
     one did not, and threw as soon as the availability grid was absent. That
     matters now the v2 shell reuses this engine with different markup, and it
     was always a latent crash for any page that did not include #avwrap. */
  if(!wrap)return;
  if(!start||!S.config.dur){wrap.innerHTML='<div style="padding:20px;color:var(--muted);font-size:0.68rem">Build schedule first.</div>';return;}
  const raceEnd=start.getTime()+parseFloat(S.config.dur)*3600000;
  const slots=[];let t=start.getTime();while(t<raceEnd){slots.push(t);t+=1800000;}
  let h='<table class="avtable"><thead><tr><th class="dh">Driver</th>';
  slots.forEach(ms=>{h+=`<th><div style="color:var(--volt);font-size:0.58rem">${fmtGMT(new Date(ms))}</div><div style="color:var(--muted-dim);font-size:0.5rem">GMT</div></th>`;});
  h+='</tr></thead><tbody>';
  S.drivers.forEach((drv,di)=>{
    h+=`<tr><td class="dc" style="border-left:3px solid ${drv.color}"><div style="display:flex;align-items:center;gap:7px"><span class="dot" style="background:${drv.color}"></span><div><div style="font-family:var(--display);font-size:0.62rem;font-weight:700">${flagHTML(drv)}${drv.handle||drv.name}</div><div style="font-size:0.56rem;color:var(--muted)">${drv.tzabbr||(drv.tz?getTZAbbr(drv.tz):('GMT'+(drv.gmt>=0?'+':'')+drv.gmt))}</div></div></div></td>`;
    slots.forEach(ms=>{const key=di+'_'+Math.floor(ms/1800000);const st=S.avail[key]||'open';const ltr=st==='open'?'A':st==='maybe'?'M':'N/A';h+=`<td><div class="avcell ${st}" data-action="avail.cycle" data-key="${key}" title="Local: ${fmtLDS(new Date(ms),drv)}">${ltr}</div></td>`;});
    h+='</tr><tr style="background:rgba(0,0,0,0.15)"><td style="padding:3px 12px;font-size:0.55rem;color:var(--muted);border-right:1px solid var(--border-bright)">Local →</td>';
    slots.forEach(ms=>{const _lr=fmtLD(new Date(ms),drv);const _lt=typeof _lr==='string'?_lr:_lr.time;const _la=typeof _lr==='object'?(_lr.ampm||''):'';h+=`<td style="text-align:center;padding:2px 4px;border-right:1px solid var(--border)"><div style="font-size:0.65rem;color:var(--muted);line-height:1.1">${_lt}</div><div style="font-size:0.5rem;color:var(--muted-dim);line-height:1.2">${_la}</div></td>`;});
    h+='</tr>';
  });
  h+='</tbody></table>';wrap.innerHTML=h;
}
function cycleAv(key){S.avail[key]=S.avail[key]==='open'?'maybe':S.avail[key]==='maybe'?'blocked':'open';persist();buildAvail();}
function refreshAvDrvSelect(){const s=el('av-drv-select');if(!s)return;s.innerHTML=S.drivers.map((d,i)=>`<option value="${i}">${d.countryFlag?d.countryFlag+' ':''}${d.handle||d.name}</option>`).join('');refreshAvTimeDrops();}
function refreshAvTimeDrops(){
  const di=parseInt(gv('av-drv-select'));const drv=isNaN(di)?null:S.drivers[di];
  const tzLbl=el('av-tz-label');
  if(tzLbl)tzLbl.textContent=drv?(drv.tzabbr||(drv.tz?getTZAbbr(drv.tz,getEventRefDate()):'')):'';
  const use12=drv&&drv.timefmt==='12';
  const fs=el('av-from'),ts=el('av-to');
  if(!fs||!ts)return;
  const opts=Array.from({length:96},(_,i)=>{
    const tot=i*15;const h=Math.floor(tot/60);const m=tot%60;
    let lbl;
    if(use12){const ap=h>=12?'PM':'AM';const h12=h%12||12;lbl=h12+':'+String(m).padStart(2,'0')+' '+ap;}
    else{lbl=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');}
    return`<option value="${tot}">${lbl}</option>`;
  }).join('');
  [fs,ts].forEach(s=>{const v=s.value;s.innerHTML=opts;if(v!=='')s.value=v;});
}
function applyWindow(state){
  const di=parseInt(gv('av-drv-select'));if(isNaN(di))return;
  const drv=S.drivers[di];
  const offset=drv?(drv.tz?getOffsetFromTZ(drv.tz,getEventRefDate()):(drv.gmt||0)):0;
  const localToUTC=m=>((m-Math.round(offset*60))+1440)%1440;
  const fromM=localToUTC(parseInt(gv('av-from'))||0);
  const toM=localToUTC(parseInt(gv('av-to'))||0);
  if(fromM===toM)return;
  const start=raceStart();if(!start)return;
  const raceEnd=start.getTime()+parseFloat(S.config.dur)*3600000;
  let t=start.getTime();
  while(t<raceEnd){
    const d=new Date(t);const slotM=d.getUTCHours()*60+d.getUTCMinutes();
    const inWin=fromM<toM?(slotM>=fromM&&slotM<toM):(slotM>=fromM||slotM<toM);
    if(inWin)S.avail[di+'_'+Math.floor(t/1800000)]=state;
    t+=1800000;
  }
  persist();buildAvail();
}
