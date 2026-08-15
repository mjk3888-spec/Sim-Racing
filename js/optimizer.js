/* LUMINARY ENDURANCE MANAGER
   Stint schedule optimiser.

   Extracted verbatim from index.html lines 1464-1531.
   These are CLASSIC scripts, not ES modules: top-level declarations stay in the
   shared global scope so the existing inline onclick= handlers keep working.
   LOAD ORDER MATTERS - js/main.js must be last. */

// STINT OPTIMIZER
function optimizeStints(fillGapsOnly){
  if(!S.stints.length){const r=el('opt-result');if(r){r.textContent='Build a stint schedule first.';r.style.color='var(--yellow)';}return;}
  const mode=gv('opt-mode')||'race-pace';
  const c=S.config;
  const tank=parseFloat(c.tank)||110;
  const res=parseFloat(c.res)||4;
  const pitMs=parsePit(c.pit)*1000;
  const raceDurMs=parseFloat(c.dur||24)*3600000;
  const targetMs=raceDurMs/Math.max(1,S.drivers.length);
  const result=S.stints.map(s=>({...s}));
  const assignedMs={};
  S.drivers.forEach(d=>{assignedMs[d.name]=0;});
  if(fillGapsOnly){result.forEach(s=>{if(s.driver&&assignedMs.hasOwnProperty(s.driver))assignedMs[s.driver]+=s.durMs;});}
  const warnings=[];
  result.forEach((s,i)=>{
    if(fillGapsOnly&&s.driver)return;
    s.driver='';
    const candidates=S.drivers.map(d=>{
      const av=getAv(s,d.name);
      if(av==='blocked')return null;
      let consec=0;
      for(let j=i-1;j>=0;j--){if(result[j].driver===d.name)consec++;else break;}
      const maxC=parseInt(d.maxConsec)||2;
      const consecExceeded=consec>=maxC;
      const lapMs=parseLap(d.lap)||0;
      const fpl=parseFloat(d.fpl)||3.79;
      const fsLapMs=parseLap(d.fslap)||lapMs;
      const fsBurn=parseFloat(d.fsburn)||fpl;
      let score=999999;
      if(mode==='race-pace'){
        score=lapMs||999999;
      }else if(mode==='efficiency'){
        if(lapMs){const laps=Math.max(1,Math.floor((tank-res)/fpl));score=lapMs+pitMs/laps;}
      }else if(mode==='fuel-economy'){
        const hasFS=parseLap(d.fslap)>0;
        const uL=hasFS?fsLapMs:lapMs;const uB=hasFS?fsBurn:fpl;
        if(uL){const fL=Math.max(1,Math.floor((tank-res)/uB));score=(uL+pitMs/fL)*(hasFS?1:1.03);}
      }else if(mode==='even-time'){
        const deficit=targetMs-(assignedMs[d.name]||0);
        const lapTie=lapMs?lapMs/1e9:0;
        score=-deficit+lapTie;
      }
      return{name:d.name,score,av,consecExceeded,consec};
    }).filter(Boolean);
    if(!candidates.length){warnings.push('Stint #'+s.num+': No available driver');return;}
    candidates.sort((a,b)=>{
      const ac=a.consecExceeded?2:(a.av==='maybe'?1:0);
      const bc=b.consecExceeded?2:(b.av==='maybe'?1:0);
      if(ac!==bc)return ac-bc;
      return a.score-b.score;
    });
    const pick=candidates[0];
    s.driver=pick.name;
    if(pick.consecExceeded)warnings.push('Stint #'+s.num+': '+pick.name+' exceeds back-to-back limit ('+( pick.consec+1)+' consecutive)');
    assignedMs[pick.name]=(assignedMs[pick.name]||0)+s.durMs;
  });
  S.stints=result;persist();renderSchedule();updateDash();
  const rEl=el('opt-result');
  if(rEl){
    const assigned=result.filter(s=>s.driver).length;
    let msg='✓ '+assigned+' of '+result.length+' stints assigned';
    if(warnings.length)msg+=' · ⚠ '+warnings.length+' warning'+(warnings.length>1?'s':'')+': '+warnings.join(' · ');
    rEl.textContent=msg;
    rEl.style.color=warnings.length?'var(--yellow)':'var(--green)';
  }
}
