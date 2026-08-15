/* LUMINARY ENDURANCE MANAGER
   Live Ops dashboard: race clocks, handoff alerts and audio, fair-share
   drive-time split, stint summary, and the drive-time pie.

   Extracted verbatim from index.html lines 943-1120.
   These are CLASSIC scripts, not ES modules: top-level declarations stay in the
   shared global scope, where the delegated dispatcher in js/actions.js resolves
   them by name. No inline on*= handlers remain in the markup (Step 5).
   LOAD ORDER MATTERS - js/main.js must be last. */

// DASHBOARD
function updateDash(){
  const c=S.config;const start=raceStart();const now=Date.now();
  const evEl=el('s-event');if(evEl)evEl.textContent=c.name||'No Event';
  const ccEl=el('s-car-class');if(ccEl)ccEl.textContent=[c.carClass,c.car].filter(Boolean).join(' · ');
  const dsCar=el('ds-car');if(dsCar)dsCar.textContent=c.car||'—';
  if(!start){
    ['s-cur-name','s-nxt-name'].forEach(id=>{const e=el(id);if(e)e.textContent='—';});
    ['s-cur-cd','s-nxt-cd','s-elapsed','s-remain','s-igtime'].forEach(id=>{const e=el(id);if(e)e.textContent='—';});
    const lp=S.stints.filter(s=>s.position).slice(-1)[0];const sp=el('s-cur-position');if(sp)sp.textContent=lp?ordinal(lp.position):'—';
    const cl=el('s-cur-localtime');if(cl)cl.textContent='';
    updateFS();renderStatusLog();renderStintSummary();return;
  }
  const raceEnd=start.getTime()+parseFloat(c.dur||24)*3600000;
  const elapsed=now-start.getTime();const remain=raceEnd-now;const live=elapsed>=0&&remain>0;
  const se=el('s-elapsed');if(se)se.textContent=live?fmtDur(elapsed):'—';
  const sr=el('s-remain');if(sr)sr.textContent=live?fmtDur(remain):'—';
  if(c.ighr!==''&&c.ighr!==null&&c.ighr!==undefined&&live){
    const igB=Math.floor(parseFloat(c.ighr)||0)*60+Math.round(((parseFloat(c.ighr)||0)-Math.floor(parseFloat(c.ighr)||0))*60);
    const igM=Math.floor(elapsed/60000);const igTotal=igB+igM;const igH=Math.floor(igTotal/60)%24;const igMm=igTotal%60;
    const si=el('s-igtime');if(si)si.textContent=String(igH).padStart(2,'0')+':'+String(igMm).padStart(2,'0');
  }else{const si=el('s-igtime');if(si)si.textContent='—';}
  const pct=live?Math.min(100,(elapsed/(parseFloat(c.dur||24)*3600000))*100):0;
  const pb=el('race-pbar');if(pb)pb.style.width=pct.toFixed(1)+'%';
  const total=S.stints.length;const done=S.stints.filter(s=>s.done).length;
  const dsDone=el('ds-done');if(dsDone)dsDone.textContent=done;
  const dsOf=el('ds-stintof');if(dsOf)dsOf.textContent='of '+total;
  const dsLaps=el('ds-laps');if(dsLaps)dsLaps.textContent=S.stints.reduce((a,s)=>a+s.laps,0)||'—';
  const lastPos=S.stints.filter(s=>s.position).slice(-1)[0];const pe=el('ds-position');if(pe)pe.textContent=lastPos?ordinal(lastPos.position):'—';
  const active=S.stints.find(s=>!s.done&&s.startMs<=now&&s.endMs>now);
  const nexts=S.stints.filter(s=>!s.done&&s.startMs>now).slice(0,4);
  updateStrip(active,nexts,now,start);
  const csb=el('cur-stint-box');
  if(active){
    const dsSt=el('ds-stint');if(dsSt)dsSt.textContent='#'+active.num;
    const drv=S.drivers.find(d=>d.name===active.driver);
    const tl=active.stintType==='fs'?'Fuel Save':active.stintType==='std-tires'?'Std+Tires':active.stintType==='fs-tires'?'FS+Tires':'Standard';
    const adrv=S.drivers.find(d=>d.name===active.driver);
    const lmA=parseLap(adrv?(active.stintType==='fs'||active.stintType==='fs-tires'?adrv.fslap:adrv.lap)||c.lap:c.lap)||parseLap(c.lap)||490000;
    const inS=now-active.startMs;const pctS=Math.min(100,inS/active.durMs*100);const lapsEst=Math.max(0,Math.floor(inS/lmA));
    const fbpl=parseFloat((active.stintType==='fs'||active.stintType==='fs-tires')?c.fsburn:c.fpl)||3.79;
    const tRem=Math.max(0,active.endMs-now);
    if(csb)csb.innerHTML=`<div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">${drv?`<span class="dot" style="background:${drv.color}"></span>`:''}<span style="font-family:var(--display);font-size:0.82rem;font-weight:700;letter-spacing:0.05em">${active.driver||'Unassigned'}</span><span class="badge live pulse">On Track</span>${active.stintType!=='std-tires'&&active.stintType!=='std'?'<span class="badge fs">'+tl+'</span>':''}${active.damage?'<span class="badge danger pulse">⚠ Damage</span>':''}</div><div style="font-family:var(--mono);font-size:0.6rem;color:var(--muted);margin-bottom:8px">Stint #${active.num} · ${active.laps} Laps · ${active.fuel}L Target · Pit Est: ${fmtGMT(new Date(active.endMs))} GMT</div><div class="pbar"><div class="pfill g" style="width:${pctS.toFixed(0)}%"></div></div><div class="g3" style="margin-top:10px"><div class="stat"><div class="stat-l">Time Remaining</div><div class="stat-v ${tRem<600000?'red':'yellow'}">${fmtDur(tRem)}</div></div><div class="stat"><div class="stat-l">Est Laps Done</div><div class="stat-v">${lapsEst}</div></div><div class="stat"><div class="stat-l">Time In Stint</div><div class="stat-v green">${fmtDur(inS)}</div></div></div>`;
  }else{const dsSt2=el('ds-stint');if(dsSt2)dsSt2.textContent='—';if(csb)csb.innerHTML='';}
  updateFS();renderStatusLog();renderStintSummary();try{renderDrivePie();}catch(e){}
}

// HANDOFF ALERTS
// ── iOS PWA limitation (accepted, do not work around) ─────────────────────────
// When the installed app is backgrounded or the phone is locked, iOS throttles or
// fully suspends JS timers and silences WebAudio, so these tones and the flashing
// panel will NOT fire in the background. Reliable background push on iOS requires
// server infrastructure outside this app's free static-hosting scope. The operating
// assumption is that the strategist keeps the app FOREGROUNDED during a stint for
// alerts to work. setInterval(updateDash) re-runs on return to foreground, so the
// visual state catches up immediately when the app is reopened.
let _handoffState={};  // {stintNum: {warned15:bool, warned5:bool}}
let _audioCtx=null;
// Browsers suspend WebAudio until a user gesture — unlock on first interaction
function _unlockAudio(){try{if(!_audioCtx)_audioCtx=new(window.AudioContext||window.webkitAudioContext)();if(_audioCtx.state==='suspended')_audioCtx.resume();}catch(e){}document.removeEventListener('click',_unlockAudio);document.removeEventListener('touchstart',_unlockAudio);}
document.addEventListener('click',_unlockAudio);document.addEventListener('touchstart',_unlockAudio);
function playHandoffTone(urgent){
  try{
    if(!_audioCtx)_audioCtx=new(window.AudioContext||window.webkitAudioContext)();
    const ctx=_audioCtx;const beeps=urgent?3:2;
    for(let i=0;i<beeps;i++){
      const o=ctx.createOscillator();const g=ctx.createGain();
      o.connect(g);g.connect(ctx.destination);
      o.frequency.value=urgent?880:660;o.type='sine';
      const t=ctx.currentTime+i*0.28;
      g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.18,t+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001,t+0.22);
      o.start(t);o.stop(t+0.24);
    }
  }catch(e){}
}
function handoffAlertCheck(ms,stintNum){
  const panel=document.querySelector('.s-panel.nxt');if(!panel)return;
  const min=ms/60000;
  if(!_handoffState[stintNum])_handoffState[stintNum]={warned15:false,warned5:false};
  const st=_handoffState[stintNum];
  panel.classList.remove('handoff-soon','handoff-imminent');
  if(min>0&&min<=5){
    panel.classList.add('handoff-imminent');
    if(!st.warned5){st.warned5=true;playHandoffTone(true);}
  }else if(min>0&&min<=15){
    panel.classList.add('handoff-soon');
    if(!st.warned15){st.warned15=true;playHandoffTone(false);}
  }
}
function clearHandoffAlert(){const panel=document.querySelector('.s-panel.nxt');if(panel)panel.classList.remove('handoff-soon','handoff-imminent');}
function updateStrip(active,nexts,now,start){
  const sN=['Single','Double','Triple','Quadruple','Quintuple','Sextuple','Septuple','Octuple'];
  const cn=el('s-cur-name');const cd=el('s-cur-dot');const cs=el('s-cur-sub');const cc=el('s-cur-cd');
  const nn=el('s-nxt-name');const nd=el('s-nxt-dot');const ns=el('s-nxt-sub');const nc=el('s-nxt-cd');
  const cpe=el('s-cur-position');const cle=el('s-cur-localtime');const nle=el('s-nxt-localtime');
  const lp=S.stints.filter(s=>s.position).slice(-1)[0];
  const schedEl=el('sched-status-alert');
  if(schedEl){if(!S.stints.length){schedEl.innerHTML='<div class="alert danger" style="padding:8px 12px;font-size:0.68rem">⚠ No Stint Schedule — Complete Prerequisites On Team/Event Config.</div>';}else{const ua=S.stints.filter(s=>!s.done&&!s.driver).length;if(ua>0){schedEl.innerHTML=`<div class="alert danger" style="padding:8px 12px;font-size:0.68rem">⚠ ${ua} Stint${ua>1?'s':''} Unassigned — Go To Stint Schedule.</div>`;}else{schedEl.innerHTML='<div class="alert ok" style="padding:8px 12px;font-size:0.68rem">✓ Stint Schedule Complete — All Stints Assigned.</div>';}}}
  if(cpe)cpe.textContent=lp?ordinal(lp.position):'—';
  if(active){
    const drv=S.drivers.find(d=>d.name===active.driver);
    if(cd)cd.style.background=drv?drv.color:'var(--muted)';
    if(cn)cn.textContent=active.driver?(flagText(drv)+(drv&&drv.handle?drv.handle:active.driver)):'Unassigned';
    if(cle&&drv){cle.textContent=fmtLDS(new Date(now),drv)+' '+(drv.tzabbr||(drv.gmt>=0?'GMT+'+drv.gmt:'GMT'+drv.gmt));}else if(cle)cle.textContent='';
    const si=S.stints.findIndex(s=>s.num===active.num);
    let rs=si;for(let i=si-1;i>=0;i--){if(S.stints[i].driver===active.driver)rs=i;else break;}
    let re=si;for(let i=si+1;i<S.stints.length;i++){if(S.stints[i].driver===active.driver)re=i;else break;}
    const tir=re-rs+1;const pir=si-rs+1;
    if(cs)cs.textContent=(sN[tir-1]||tir+'-Stint')+' · Stint #'+active.num+' ('+ordinal(pir)+' of '+tir+')';
    const pm=S.stints.filter(s=>s.num<active.num&&s.driver===active.driver).reduce((a,s)=>a+s.durMs,0);
    if(cc)cc.textContent=fmtDurHM(pm+(now-active.startMs));
    if(nle)nle.textContent='';
  }else{
    if(cd)cd.style.background='var(--muted)';if(cle)cle.textContent='';
    if(start&&now<start.getTime()){if(cn)cn.textContent='Race Starts In';if(cs)cs.textContent='Countdown To Green';if(cc)cc.textContent=fmtDurHM(start.getTime()-now);}
    else{if(cn)cn.textContent='—';if(cs)cs.textContent='No Active Stint';if(cc)cc.textContent='—';}
    if(nle)nle.textContent='';
  }
  const cd2=active?active.driver:'';const nd2=S.stints.find(s=>!s.done&&s.startMs>now&&s.driver!==cd2)||nexts[0];
  if(nd2){
    const ndrv=S.drivers.find(d=>d.name===nd2.driver);
    if(nd)nd.style.background=ndrv?ndrv.color:'var(--muted)';
    if(nn)nn.textContent=nd2.driver?(flagText(ndrv)+(ndrv&&ndrv.handle?ndrv.handle:nd2.driver)):'Needs Driver';
    const ni=S.stints.findIndex(s=>s.num===nd2.num);let nc2=1;for(let k=ni+1;k<S.stints.length;k++){if(S.stints[k].driver===nd2.driver)nc2++;else break;}
    if(ns)ns.textContent='Stint #'+nd2.num+' · '+(sN[nc2-1]||nc2+'-Stint')+' Stint';
    if(nle&&ndrv){nle.textContent=fmtLDS(new Date(nd2.startMs),ndrv)+' '+(ndrv.tzabbr||(ndrv.gmt>=0?'GMT+'+ndrv.gmt:'GMT'+ndrv.gmt));}else if(nle)nle.textContent='';
    const msToHandoff=nd2.startMs-now;
    if(nc)nc.textContent=fmtDurHM(msToHandoff);
    handoffAlertCheck(msToHandoff,nd2.num);
  }else{if(nd)nd.style.background='var(--muted)';if(nn)nn.textContent='—';if(ns)ns.textContent='No Upcoming';if(nc)nc.textContent='—';if(nle)nle.textContent='';clearHandoffAlert();}
}

// FAIR SHARE
function updateFS(){
  const e=el('fs-content');const card=el('fs-card');if(!e||!card)return;
  if(S.config.sim&&S.config.sim!=='iracing'){e.innerHTML='<div style="color:var(--muted);font-size:0.68rem">Fair share tracking is iRacing-specific.</div>';return;}
  const start=raceStart();
  if(!start||!S.config.dur||!S.drivers.length){e.innerHTML='<div style="color:var(--muted);font-size:0.68rem">Configure event to calculate.</div>';card.className='card';return;}
  const rdMs=parseFloat(S.config.dur)*3600000;const n=S.drivers.length;const fairMs=rdMs/n/4;
  let anyRisk=false;let html=`<div style="font-family:var(--mono);font-size:0.58rem;color:var(--muted);margin-bottom:10px">Min per driver: <span style="color:var(--text)">${fmtDur(fairMs)}</span> (${fmtDur(rdMs)} ÷ ${n} ÷ 4)</div>`;
  const rl=[];
  S.drivers.forEach(drv=>{
    const dm=S.stints.filter(s=>s.driver===drv.name&&s.done).reduce((a,s)=>a+s.durMs,0);
    const sm=S.stints.filter(s=>s.driver===drv.name&&!s.done).reduce((a,s)=>a+s.durMs,0);
    const tm=dm+sm;const pct=Math.min(100,(tm/fairMs)*100);
    const met=dm>=fairMs;const schd=!met&&tm>=fairMs;const risk=!met&&!schd;
    if(risk){anyRisk=true;rl.push(`${drv.name} needs ${fmtDur(fairMs-tm)} more`);}
    const col=met?'var(--green)':schd?'var(--yellow)':'var(--red)';const st=met?'✓ Met':schd?'~ Sched':'✗ At Risk';
    html+=`<div class="fs-row"><div class="fs-name"><span class="dot" style="background:${drv.color}"></span>${flagHTML(drv)}${drv.handle||drv.name}</div><div style="flex:1;position:relative"><div class="fs-bg"><div class="fs-fill" style="width:${pct.toFixed(0)}%;background:${col}"></div></div><span style="position:absolute;right:0;top:-1px;font-size:0.58rem;color:${col}">${pct.toFixed(0)}%</span></div><div class="fs-pct" style="color:${col}">${st}</div></div>`;
  });
  if(anyRisk){card.className='card red-l';e.innerHTML='<div class="alert danger" style="margin-bottom:10px">⚠ Fair Share At Risk:<br>'+rl.join('<br>')+'</div>'+html;}
  else{card.className='card green-l';e.innerHTML=html;}
}

// STINT SUMMARY
function renderStintSummary(){
  const e=el('drv-stints');if(!e)return;
  if(!S.stints.length){e.innerHTML='<div style="color:var(--muted);font-size:0.68rem">No stints built yet.</div>';return;}
  e.innerHTML=S.drivers.map(d=>{const ds=S.stints.filter(s=>s.driver===d.name);const tm=ds.reduce((a,s)=>a+s.durMs,0);const dn=ds.filter(s=>s.done).length;return`<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)"><span class="dot" style="background:${d.color}"></span><span style="font-family:var(--display);font-size:0.65rem;font-weight:700;color:var(--text);flex:1">${flagHTML(d)}${d.handle||d.name}</span><span style="font-family:var(--mono);font-size:0.64rem;color:var(--muted)">${ds.length} Stints</span><span style="font-family:var(--display);font-size:0.64rem;font-weight:700;color:var(--volt);margin-left:8px">${fmtDur(tm)}</span></div>`;}).join('');
}

// PIE
function renderDrivePie(){
  const canvas=el('drive-pie');const legend=el('drive-pie-legend');if(!canvas||!legend)return;
  const ctx=canvas.getContext('2d');const W=canvas.width;const H=canvas.height;ctx.clearRect(0,0,W,H);
  const dt={};S.drivers.forEach(d=>{dt[d.name]=0;});
  let total=0;S.stints.forEach(s=>{total+=s.durMs;if(s.driver&&dt[s.driver]!==undefined)dt[s.driver]+=s.durMs;});
  if(total===0){ctx.fillStyle='#181818';ctx.beginPath();ctx.arc(W/2,H/2,W/2-8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#666';ctx.font='11px Share Tech Mono';ctx.textAlign='center';ctx.fillText('No stints',W/2,H/2-6);ctx.fillText('assigned',W/2,H/2+10);legend.innerHTML='<div style="color:var(--muted);font-size:0.68rem">Assign drivers to see split.</div>';return;}
  const cx=W/2;const cy=H/2;const r=W/2-8;let sa=-Math.PI/2;const sl=[];
  S.drivers.forEach(d=>{const ms=dt[d.name]||0;if(ms>0){const sw=(ms/total)*Math.PI*2;sl.push({name:d.name,handle:d.handle,color:d.color,ms,pct:(ms/total*100),start:sa,sweep:sw});sa+=sw;}});
  const ua=S.stints.reduce((a,s)=>a+(s.driver?0:s.durMs),0);
  if(ua>0){const sw=(ua/total)*Math.PI*2;sl.push({name:'Unassigned',handle:'',color:'#282828',ms:ua,pct:ua/total*100,start:sa,sweep:sw});}
  sl.forEach(s=>{ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,s.start,s.start+s.sweep);ctx.closePath();ctx.fillStyle=s.color;ctx.fill();ctx.strokeStyle='#050505';ctx.lineWidth=2;ctx.stroke();if(s.pct>8){const mid=s.start+s.sweep/2;const lx=cx+Math.cos(mid)*r*0.62;const ly=cy+Math.sin(mid)*r*0.62;ctx.fillStyle='#000';ctx.font='bold 10px Share Tech Mono';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(s.pct.toFixed(0)+'%',lx,ly);}});
  ctx.beginPath();ctx.arc(cx,cy,r*0.42,0,Math.PI*2);ctx.fillStyle='#050505';ctx.fill();
  legend.innerHTML=sl.map(s=>`<div style="display:flex;align-items:center;gap:7px;margin-bottom:6px"><span style="width:10px;height:10px;border-radius:50%;background:${s.color};flex-shrink:0;display:inline-block"></span><div style="flex:1"><div style="font-family:var(--display);font-size:0.62rem;font-weight:700;color:var(--text)">${s.handle||s.name}</div><div style="font-family:var(--mono);font-size:0.58rem;color:var(--muted)">${fmtDur(s.ms)} · ${s.pct.toFixed(1)}%</div></div></div>`).join('');
}
