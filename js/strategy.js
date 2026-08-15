/* LUMINARY ENDURANCE MANAGER
   Pit Strategy page: fuel calculator, race-pace vs fuel-save scenario
   comparator, pit stop calculator, and shared time formatting helpers.

   Extracted verbatim from index.html lines 1121-1292.
   These are CLASSIC scripts, not ES modules: top-level declarations stay in the
   shared global scope, where the delegated dispatcher in js/actions.js resolves
   them by name. No inline on*= handlers remain in the markup (Step 5).
   LOAD ORDER MATTERS - js/main.js must be last. */

// FUEL CALC
// STRATEGY COMPARATOR
function parseRemain(s){if(!s)return 0;s=String(s).trim();if(s.includes(':')){const p=s.split(':');return(parseInt(p[0])*60+parseInt(p[1]))*60000;}return parseFloat(s)*60000;}
function prefillCompare(){
  const c=S.config;
  const fastest=S.drivers.filter(d=>parseLap(d.lap)>0).sort((a,b)=>parseLap(a.lap)-parseLap(b.lap))[0];
  const src=fastest||{};
  if(src.lap||c.lap)sv('cmp-lap',src.lap||c.lap||'');
  if(src.fpl||c.fpl)sv('cmp-burn',src.fpl||c.fpl||'');
  if(src.fslap||c.fslap)sv('cmp-fslap',src.fslap||c.fslap||'');
  if(src.fsburn||c.fsburn)sv('cmp-fsburn',src.fsburn||c.fsburn||'');
  const tank=parseFloat(c.tank)||110;const reserve=parseFloat(c.res)||4;
  sv('cmp-usable',Math.max(0,tank-reserve));
  // Time remaining from live race if running, else full duration
  const start=raceStart();const now=Date.now();
  const toHMM=ms=>{const m=Math.max(0,Math.round(ms/60000));return Math.floor(m/60)+':'+String(m%60).padStart(2,'0');};
  if(start&&c.dur){const end=start.getTime()+parseFloat(c.dur)*3600000;const rem=end-now;sv('cmp-remain',rem>0?toHMM(rem):toHMM(parseFloat(c.dur)*3600000));}
  else if(c.dur)sv('cmp-remain',toHMM(parseFloat(c.dur)*3600000));
  calcCompare();
}
function calcCompare(){
  const res=el('cmp-results');if(!res)return;
  const remMs=parseRemain(gv('cmp-remain'));
  const raceLap=parseLap(gv('cmp-lap'));
  const raceBurn=parseFloat(gv('cmp-burn'))||0;
  const fsLap=parseLap(gv('cmp-fslap'))||raceLap;
  const fsBurn=parseFloat(gv('cmp-fsburn'))||raceBurn;
  const usable=parseFloat(gv('cmp-usable'))||0;
  if(!remMs||!raceLap||!raceBurn||!usable){res.innerHTML='<div style="color:var(--muted);font-family:var(--mono);font-size:0.68rem">Enter time remaining, lap time, burn, and usable fuel.</div>';return;}
  // Pit time from calibration (full fuel stop), fallback to config pit
  const fullCal=parseFloat((el('ps-full-fuel')||{}).value)||0;
  const pitMs=(fullCal||parsePit(S.config.pit))*1000;
  // Build scenarios: Race Pace push, Fuel Save
  function scenario(lapMs,burn,label){
    const lapsPerStint=Math.floor(usable/burn);
    if(lapsPerStint<1)return null;
    let laps=0,t=0,stints=0;
    while(t<remMs){
      const timeLeft=remMs-t;
      const lapsThisStint=Math.min(lapsPerStint,Math.floor(timeLeft/lapMs));
      if(lapsThisStint<1)break;
      laps+=lapsThisStint;t+=lapsThisStint*lapMs;stints++;
      if(lapsThisStint===lapsPerStint&&(remMs-t)>lapMs){t+=pitMs;}else break;
      if(stints>60)break;
    }
    const stops=Math.max(0,stints-1);
    const slackMs=remMs-t;                       // unused window time after last full lap
    const lapsExact=laps+Math.max(0,slackMs)/lapMs; // fractional progress into next lap
    const toNextLapMs=Math.max(0,lapMs-Math.max(0,slackMs)); // time short of completing one more
    return{label,lapMs,laps,lapsExact,toNextLapMs,stops,totalPit:stops*pitMs,raceTimeUsed:t,burn,lapsPerStint};
  }
  const push=scenario(raceLap,raceBurn,'Race Pace');
  const save=scenario(fsLap,fsBurn,'Fuel Save');
  if(!push||!save){res.innerHTML='<div style="color:var(--yellow);font-family:var(--mono);font-size:0.68rem">Usable fuel too low for burn rate — check inputs.</div>';return;}
  // ── Broadcast-style comparison panel ──
  const maxLaps=Math.max(push.lapsExact,save.lapsExact);
  const maxPit=Math.max(push.totalPit,save.totalPit,1);
  // Net window-time delta: who is "ahead" in equivalent race time = lapsExact * lapMs comparison
  const pushProg=push.lapsExact*push.lapMs;const saveProg=save.lapsExact*save.lapMs;
  const aheadIsPush=push.lapsExact>save.lapsExact||(push.lapsExact===save.lapsExact&&push.toNextLapMs<save.toNextLapMs);
  const lapGap=Math.abs(push.lapsExact-save.lapsExact);
  const col=(s)=>s.label==='Race Pace'?'#C060E8':'var(--green)';
  const colDim=(s)=>s.label==='Race Pace'?'rgba(192,96,232,0.15)':'rgba(57,255,20,0.12)';
  function strat(s,winner){
    const lapPct=(s.lapsExact/maxLaps*100).toFixed(1);
    const pitPct=(s.totalPit/maxPit*100).toFixed(1);
    return`<div style="flex:1;min-width:250px;background:var(--bg);border:1px solid ${winner?col(s):'var(--border)'};border-radius:10px;padding:14px;position:relative;${winner?'box-shadow:0 0 18px '+colDim(s):''}">
      ${winner?`<div style="position:absolute;top:-9px;right:12px;background:${col(s)};color:#000;font-family:var(--display);font-size:0.36rem;font-weight:800;letter-spacing:0.2em;padding:3px 9px;border-radius:4px">AHEAD</div>`:''}
      <div style="font-family:var(--display);font-size:0.5rem;font-weight:700;letter-spacing:0.2em;color:${col(s)};margin-bottom:10px">${s.label.toUpperCase()}</div>
      <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:2px">
        <span style="font-family:var(--display);font-size:1.9rem;font-weight:900;color:var(--text);line-height:1">${s.lapsExact.toFixed(1)}</span>
        <span style="font-family:var(--mono);font-size:0.56rem;color:var(--muted)">EST LAPS</span>
      </div>
      <div style="font-family:var(--mono);font-size:0.56rem;color:var(--muted);margin-bottom:3px;text-transform:none">${(s.toNextLapMs/1000).toFixed(0)}s short of lap ${s.laps+1}</div>
      <div style="font-family:var(--mono);font-size:0.56rem;color:var(--gulf);margin-bottom:8px;text-transform:none">Final-stint fuel to lap ${(s.laps%s.lapsPerStint)||s.lapsPerStint}: ${(((s.laps%s.lapsPerStint)||s.lapsPerStint)*s.burn).toFixed(1)}L used · ${Math.max(0,usable-(((s.laps%s.lapsPerStint)||s.lapsPerStint)*s.burn)).toFixed(1)}L buffer</div>
      <div style="height:8px;background:var(--surface2);border-radius:4px;overflow:hidden;margin-bottom:12px"><div style="width:${lapPct}%;height:100%;background:${col(s)};border-radius:4px"></div></div>
      <div style="display:flex;gap:16px">
        <div><div style="font-family:var(--display);font-size:1.1rem;font-weight:800;color:var(--text)">${s.stops}</div><div style="font-family:var(--mono);font-size:0.5rem;color:var(--muted)">STOPS</div></div>
        <div style="flex:1"><div style="font-family:var(--display);font-size:1.1rem;font-weight:800;color:var(--text)">${(s.totalPit/1000).toFixed(0)}s</div><div style="font-family:var(--mono);font-size:0.5rem;color:var(--muted);margin-bottom:3px">PIT TIME</div><div style="height:5px;background:var(--surface2);border-radius:3px;overflow:hidden"><div style="width:${pitPct}%;height:100%;background:${col(s)};opacity:0.55;border-radius:3px"></div></div></div>
      </div>
    </div>`;
  }
  const lapDiff=push.laps-save.laps;
  const stopDiff=save.stops<push.stops?push.stops-save.stops:0;
  let verdict='';
  if(lapGap>=0.05){
    const w=aheadIsPush?push:save;const l=aheadIsPush?save:push;
    const gapTimeS=((w.lapsExact-l.lapsExact)*l.lapMs/1000).toFixed(0);
    verdict=`<b style="color:${col(w)}">${w.label}</b> nets <b>${lapGap.toFixed(2)} laps</b> (≈${gapTimeS}s of window time) over this run.`;
  }else verdict='Dead even on laps over this window — decide on track position and tire life.';
  if(stopDiff>0)verdict+=` Fuel save makes <b style="color:var(--green)">${stopDiff} fewer stop${stopDiff!==1?'s':''}</b> — fewer chances to lose track position in the pit cycle.`;
  res.innerHTML=`
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;padding-top:8px">${strat(push,aheadIsPush)}${strat(save,!aheadIsPush)}</div>
    <div class="alert info" style="margin:0;font-size:0.66rem;text-transform:none">${verdict}</div>`;
}
function calcFuel(){
  const fuel=parseFloat(gv('fc-fuel'))||0;const burn=parseFloat(gv('fc-burn'))||0;const lapMs=parseLap(gv('fc-lap'));
  const e=el('fc-results');if(!e)return;
  if(!fuel||!burn||!lapMs){e.innerHTML='<div style="color:var(--muted);font-size:0.68rem">Enter all three values above.</div>';return;}
  const lapsExact=fuel/burn;const laps=Math.floor(lapsExact);const frac=lapsExact-laps;
  const timeMs=laps*lapMs;const fuelUsed=laps*burn;const fuelLeft=Math.max(0,fuel-fuelUsed).toFixed(2);
  const fuelForNext=((1-frac)*burn).toFixed(2);
  const burnForNext=(fuel/(laps+1)).toFixed(3);
  const pU=Math.min(100,(fuelUsed/fuel)*100);const pL=Math.max(0,100-pU);const low=parseFloat(fuelLeft)<5;
  const nextLapLine=frac>0?`<div class="alert info" style="margin-bottom:12px;font-size:0.64rem;text-transform:none"><b style="color:var(--volt)">${lapsExact.toFixed(2)} laps</b> of fuel on board — <b>${fuelForNext}L more fuel</b> OR economy of <b>${burnForNext} L/lap</b> unlocks lap ${laps+1}.</div>`:'';
  e.innerHTML=`${nextLapLine}<div class="g2" style="gap:10px;margin-bottom:12px"><div class="stat"><div class="stat-l">Laps Remaining</div><div class="stat-v green">${lapsExact.toFixed(2)}</div><div class="stat-s">${laps} full</div></div><div class="stat"><div class="stat-l">Time Remaining</div><div class="stat-v yellow">${fmtDur(timeMs)}</div></div></div><div class="g2" style="gap:10px;margin-bottom:12px"><div class="stat"><div class="stat-l">Fuel To Use</div><div class="stat-v">${fuelUsed.toFixed(1)}L</div></div><div class="stat"><div class="stat-l">Unused At End</div><div class="stat-v ${low?'red':'accent'}">${fuelLeft}L</div></div></div><div style="height:12px;background:var(--bg);border:1px solid var(--border);overflow:hidden;display:flex"><div style="width:${pU.toFixed(1)}%;background:var(--volt);display:flex;align-items:center;justify-content:center">${pU>15?'<span style="font-size:0.5rem;color:#000;font-weight:700;font-family:var(--display)">'+pU.toFixed(0)+'%</span>':''}</div><div style="flex:1;background:${low?'rgba(255,64,64,0.15)':'rgba(57,255,20,0.08)'};border-left:2px solid ${low?'var(--red)':'var(--green)'};display:flex;align-items:center;justify-content:center">${pL>8?'<span style="font-size:0.56rem;color:'+(low?'var(--red)':'var(--green)')+'">'+fuelLeft+'L left</span>':''}</div></div><div style="font-family:var(--mono);font-size:0.56rem;color:var(--muted);text-align:right;margin-top:6px">${burn}L/lap × ${laps} laps = ${fuelUsed.toFixed(1)}L</div>`;
}

// PIT STOP CALCULATOR
function calcPit(){
  const fullFuel=parseFloat(document.getElementById('ps-full-fuel')&&document.getElementById('ps-full-fuel').value)||0;
  const halfFuel=parseFloat(document.getElementById('ps-half-fuel')&&document.getElementById('ps-half-fuel').value)||0;
  const t2tire=parseFloat(document.getElementById('ps-2tire')&&document.getElementById('ps-2tire').value)||0;
  const t4tire=parseFloat(document.getElementById('ps-4tire')&&document.getElementById('ps-4tire').value)||0;
  const fuelAdd=parseFloat(document.getElementById('ps-fuel-add')&&document.getElementById('ps-fuel-add').value)||0;
  const tankSize=parseFloat(document.getElementById('ps-tank-size')&&document.getElementById('ps-tank-size').value)||110;
  const tires=parseInt(document.getElementById('ps-tires')&&document.getElementById('ps-tires').value)||0;
  const res=document.getElementById('ps-results');
  if(!res)return;

  // Need at least full fuel calibration
  if(!fullFuel){res.innerHTML='<div style="color:var(--muted);font-family:var(--mono);font-size:0.68rem">Enter calibration data and stop details above.</div>';return;}

  // Interpolate fuel time
  // If half fuel not set, use linear from 0 to full
  let fuelTime;
  const ratio=Math.min(1,fuelAdd/tankSize);
  if(halfFuel>0){
    // Two-point interpolation: 0L=0s, halfTank=halfFuel, fullTank=fullFuel
    const halfRatio=0.5;
    if(ratio<=halfRatio){
      fuelTime=(ratio/halfRatio)*halfFuel;
    }else{
      fuelTime=halfFuel+((ratio-halfRatio)/(1-halfRatio))*(fullFuel-halfFuel);
    }
  }else{
    // Linear from 0 to full
    fuelTime=ratio*fullFuel;
  }
  fuelTime=Math.max(0,fuelTime);

  // Tire time
  let tireTime=0;let tireLabel='No Tires';
  if(tires===2){tireTime=t2tire;tireLabel='2 Tires';}
  else if(tires===4){tireTime=t4tire;tireLabel='4 Tires';}

  // Total — fuel and tires overlap somewhat; dominant operation sets floor
  // In iRacing, pit crew does both simultaneously; the longer one dominates
  const dominantTime=Math.max(fuelTime,tireTime);
  const parallelBonus=Math.min(fuelTime,tireTime)*0.15; // 15% of shorter adds for setup overhead
  const totalTime=dominantTime+parallelBonus;
  const totalMs=totalTime*1000;

  // Format helpers
  const fmt1=(n)=>n.toFixed(1);
  const fmtTime=(s)=>{if(s<60)return s.toFixed(1)+'s';const m=Math.floor(s/60);const sec=s%60;return m+':'+sec.toFixed(1).padStart(4,'0');};

  res.innerHTML=`
    <div class="g3" style="gap:10px;margin-bottom:12px">
      <div class="stat"><div class="stat-l">Fuel Time</div><div class="stat-v blue">${fmt1(fuelTime)}s</div><div class="stat-s">${fmt1(fuelAdd)}L added</div></div>
      <div class="stat"><div class="stat-l">Tire Time</div><div class="stat-v ${tires>0?'yellow':'accent'}">${tires>0?fmt1(tireTime)+'s':'—'}</div><div class="stat-s">${tireLabel}</div></div>
      <div class="stat"><div class="stat-l">Est. Total</div><div class="stat-v accent">${fmt1(totalTime)}s</div><div class="stat-s">${fmtTime(totalTime)}</div></div>
    </div>
    <div style="height:3px;background:var(--border-bright);overflow:hidden;margin-bottom:10px">
      <div style="height:100%;background:var(--volt);width:${Math.min(100,ratio*100).toFixed(0)}%;transition:width .4s"></div>
    </div>
    <div style="font-family:var(--mono);font-size:0.6rem;color:var(--muted);line-height:1.7;text-transform:none">
      <div>Fuel fill: <span style="color:var(--gulf)">${fmt1(fuelTime)}s</span> &nbsp;·&nbsp; Tires: <span style="color:var(--yellow)">${tires>0?fmt1(tireTime)+'s':'none'}</span> &nbsp;·&nbsp; Dominant: <span style="color:var(--volt)">${fmt1(dominantTime)}s</span></div>
      <div style="margin-top:3px">Operations run in parallel — longer task dominates with minor overlap penalty.</div>
    </div>`;
}
