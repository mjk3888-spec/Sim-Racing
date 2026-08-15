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
function fmtDur(ms){const t=Math.round(Math.max(0,ms)/1000);const h=Math.floor(t/3600);const m=Math.floor((t%3600)/60);const s=t%60;if(h>0)return h+'h '+String(m).padStart(2,'0')+'m';return m+':'+String(s).padStart(2,'0');}
function fmtDurHM(ms){const t=Math.max(0,Math.round(ms/60000));const h=Math.floor(t/60);const m=t%60;if(h>0)return h+'h '+(m>0?m+'m':'');return m+'m';}
function fmtGMT(d){if(!d)return'—';return d.toISOString().substr(11,5);}
function fmtLD(d,drv){if(!drv)return'—';const offset=drv.tz?getOffsetFromTZ(drv.tz,d):(drv.gmt||0);const l=new Date(d.getTime()+offset*3600000);const h=l.getUTCHours();const m=l.getUTCMinutes();if(drv.timefmt==='12'){const ap=h>=12?'PM':'AM';const h12=h%12||12;return{time:h12+':'+String(m).padStart(2,'0'),ampm:ap};}return{time:String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'),ampm:''};}
function fmtLDS(d,drv){const r=fmtLD(d,drv);if(typeof r==='string')return r;return r.time+(r.ampm?' '+r.ampm:'');}
function ordinal(n){if(!n)return'—';const s=parseInt(n);if(isNaN(s))return n;const sfx=['th','st','nd','rd'];const v=s%100;return s+(sfx[(v-20)%10]||sfx[v]||sfx[0]);}
