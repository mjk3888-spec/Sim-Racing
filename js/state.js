/* LUMINARY ENDURANCE MANAGER
   The application state object S, plus localStorage load/save.
   Everything the app knows about an event lives on S. Persisted under 'lum4'.

   Extracted verbatim from index.html lines 702-716.
   These are CLASSIC scripts, not ES modules: top-level declarations stay in the
   shared global scope, where the delegated dispatcher in js/actions.js resolves
   them by name. No inline on*= handlers remain in the markup (Step 5).
   LOAD ORDER MATTERS - js/main.js must be last. */

let S={config:{name:'',car:'',carClass:'',track:'',sim:'',date:'',hour:'',dur:'',green:40,ighr:'',lap:'',fpl:'',fslap:'',fsburn:'',tank:'110',pit:'1:10',res:'4'},drivers:[{id:1,name:'Driver 1',handle:'',ir:0,tz:'America/New_York',gmt:-5,tzabbr:'ET',country:'',countryName:'',countryFlag:'',color:'#DFFF00',maxConsec:2,timefmt:'12',lap:'',fpl:'',fslap:'',fsburn:'',settings:{}},{id:2,name:'Driver 2',handle:'',ir:0,tz:'America/Chicago',gmt:-6,tzabbr:'CT',country:'',countryName:'',countryFlag:'',color:'#8EC7E6',maxConsec:2,timefmt:'12',lap:'',fpl:'',fslap:'',fsburn:'',settings:{}},{id:3,name:'Driver 3',handle:'',ir:0,tz:'America/Los_Angeles',gmt:-8,tzabbr:'PT',country:'',countryName:'',countryFlag:'',color:'#FF8A1C',maxConsec:2,timefmt:'12',lap:'',fpl:'',fslap:'',fsburn:'',settings:{}}],settingCols:JSON.parse(JSON.stringify(DC)),stints:[],avail:{},goals:[],checks:JSON.parse(JSON.stringify(DEFAULT_CHECKS)),tnotes:[],schMeta:{},raceLog:[],editDrvIdx:null};

function gv(id){const e=document.getElementById(id);return e?e.value:'';}
function sv(id,v){const e=document.getElementById(id);if(e)e.value=(v===null||v===undefined)?'':v;}
function el(id){return document.getElementById(id);}
function drvInitials(n){if(!n)return'??';const p=n.trim().split(/[\s.]+/).filter(Boolean);if(p.length>=2)return(p[0][0]+(p[p.length-1][0]||'')).toUpperCase();return n.substr(0,2).toUpperCase();}
function parseLap(s){if(!s)return 0;const p=String(s).trim().split(':');if(p.length===2)return(parseInt(p[0])*60+parseFloat(p[1]))*1000;return parseFloat(s)*1000;}
function parsePit(s){if(!s)return 70;const p=String(s).trim().split(':');if(p.length===2)return parseInt(p[0])*60+parseInt(p[1]);return parseInt(s)||70;}
/* Turns bare digits typed on a phone keypad into a lap time, so the colon never
   has to be hunted for on a mobile keyboard. Applied on focusout, not on every
   keystroke, so it never fights the user mid-type.

     218      -> 2:18          1230    -> 12:30
     218.543  -> 2:18.543      1385    -> 1:38.5
     21854    -> 2:18.54       218543  -> 2:18.543

   Seconds are ALWAYS the two digits before the fraction. With a decimal typed,
   the split is unambiguous. Without one, length decides: 3 digits is m:ss,
   4 digits is mm:ss unless that gives impossible seconds (then m:ss.f), and
   5 or more digits treats the trailing 1 to 3 as the fraction, which is how a
   lap time actually gets typed on a keypad.

   Anything unparseable, or that would yield seconds above 59, is returned
   untouched rather than mangled. A silently wrong lap time corrupts every
   stint length in the schedule, so guessing is worse than doing nothing. */
function fmtLapInput(raw){
  const s=String(raw==null?'':raw).trim();
  if(!s||s.indexOf(':')>=0)return s;
  const m=s.match(/^(\d+)(?:[.,](\d{1,3}))?$/);
  if(!m)return s;
  const whole=m[1];let frac=m[2]||'';let mins,secs;
  const n=whole.length;
  if(n<3)return s;
  if(frac){mins=whole.slice(0,-2);secs=whole.slice(-2);}
  else if(n===3){mins=whole.slice(0,1);secs=whole.slice(1);}
  else if(n===4){
    if(parseInt(whole.slice(2),10)<=59){mins=whole.slice(0,2);secs=whole.slice(2);}
    else{mins=whole.slice(0,1);secs=whole.slice(1,3);frac=whole.slice(3);}
  }
  else{const fl=Math.min(3,n-3);mins=whole.slice(0,n-2-fl);secs=whole.slice(n-2-fl,n-fl);frac=whole.slice(n-fl);}
  if(!mins)mins='0';
  if(parseInt(secs,10)>59)return s;
  return parseInt(mins,10)+':'+secs+(frac?'.'+frac:'');
}
function fmtDur(ms){const t=Math.round(Math.max(0,ms)/1000);const h=Math.floor(t/3600);const m=Math.floor((t%3600)/60);const s=t%60;if(h>0)return h+'h '+String(m).padStart(2,'0')+'m';return m+':'+String(s).padStart(2,'0');}
function fmtDurHM(ms){const t=Math.max(0,Math.round(ms/60000));const h=Math.floor(t/60);const m=t%60;if(h>0)return h+'h '+(m>0?m+'m':'');return m+'m';}
function fmtGMT(d){if(!d)return'—';return d.toISOString().substr(11,5);}
function fmtLD(d,drv){if(!drv)return'—';const offset=drv.tz?getOffsetFromTZ(drv.tz,d):(drv.gmt||0);const l=new Date(d.getTime()+offset*3600000);const h=l.getUTCHours();const m=l.getUTCMinutes();if(drv.timefmt==='12'){const ap=h>=12?'PM':'AM';const h12=h%12||12;return{time:h12+':'+String(m).padStart(2,'0'),ampm:ap};}return{time:String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'),ampm:''};}
function fmtLDS(d,drv){const r=fmtLD(d,drv);if(typeof r==='string')return r;return r.time+(r.ampm?' '+r.ampm:'');}
function ordinal(n){if(!n)return'—';const s=parseInt(n);if(isNaN(s))return n;const sfx=['th','st','nd','rd'];const v=s%100;return s+(sfx[(v-20)%10]||sfx[v]||sfx[0]);}
