/* LUMINARY ENDURANCE MANAGER
   Static reference data and flag rendering.
   Driver colours, default checklists, the timezone table, the country table,
   and the emoji/CSS hybrid flag renderer.

   Extracted verbatim from index.html lines 596-701.
   These are CLASSIC scripts, not ES modules: top-level declarations stay in the
   shared global scope, where the delegated dispatcher in js/actions.js resolves
   them by name. No inline on*= handlers remain in the markup (Step 5).
   LOAD ORDER MATTERS - js/main.js must be last. */

const DC=[{n:'Brake Bias',k:'bb'},{n:'TC',k:'tc'}];
const DEFAULT_CHECKS={pre:[{id:'p1',text:'Setup file loaded and saved',done:false},{id:'p2',text:'Fuel tank full before joining grid',done:false}],swap:[{id:'s1',text:'Confirm driver settings applied for incoming driver',done:false},{id:'s2',text:'Incoming driver at rig 10 min before pit window opens',done:false}],post:[{id:'o1',text:'Log best lap and fuel burn in testing notes',done:false},{id:'o2',text:'Note setup changes made during race',done:false}]};
/* Shown in the footer so it is obvious at a glance whether a device is running
   the current build or a stale cached one. Installed phones can keep serving an
   old service worker cache long after a deploy, and "is my phone up to date?"
   is otherwise unanswerable without devtools.
   BUMP THIS TOGETHER WITH CACHE_VERSION IN sw.js ON EVERY RELEASE. */
const APP_BUILD='2026-08-16.11';
function showBuildStamp(){const e=el('build-stamp');if(e)e.textContent=APP_BUILD;}

const DRV_COLORS=['#DFFF00','#8EC7E6','#FF8A1C','#39FF14','#C060E8','#FF6030'];

// TIMEZONE DATA
const TZ_LIST=[
  {label:'— Select Timezone —',tz:''},
  {label:'ET — Eastern Time (US & Canada)',tz:'America/New_York'},
  {label:'CT — Central Time (US & Canada)',tz:'America/Chicago'},
  {label:'MT — Mountain Time (US & Canada)',tz:'America/Denver'},
  {label:'PT — Pacific Time (US & Canada)',tz:'America/Los_Angeles'},
  {label:'AKT — Alaska',tz:'America/Anchorage'},
  {label:'HT — Hawaii',tz:'Pacific/Honolulu'},
  {label:'BRT — Brazil / São Paulo',tz:'America/Sao_Paulo'},
  {label:'ART — Argentina',tz:'America/Argentina/Buenos_Aires'},
  {label:'GMT/BST — UK & Ireland',tz:'Europe/London'},
  {label:'CET/CEST — Central Europe (Germany, France, Netherlands, Italy, Spain)',tz:'Europe/Berlin'},
  {label:'EET/EEST — Eastern Europe (Finland, Greece, Romania)',tz:'Europe/Helsinki'},
  {label:'MSK — Moscow',tz:'Europe/Moscow'},
  {label:'IST — India',tz:'Asia/Kolkata'},
  {label:'GST — Gulf / UAE',tz:'Asia/Dubai'},
  {label:'SGT — Singapore / Malaysia / Philippines',tz:'Asia/Singapore'},
  {label:'JST — Japan',tz:'Asia/Tokyo'},
  {label:'KST — Korea',tz:'Asia/Seoul'},
  {label:'CST — China',tz:'Asia/Shanghai'},
  {label:'AEST/AEDT — Australia East (Sydney, Melbourne)',tz:'Australia/Sydney'},
  {label:'ACST/ACDT — Australia Central (Adelaide)',tz:'Australia/Adelaide'},
  {label:'AWST — Australia West (Perth)',tz:'Australia/Perth'},
  {label:'NZST/NZDT — New Zealand',tz:'Pacific/Auckland'},
  {label:'UTC — Coordinated Universal Time',tz:'UTC'},
];
function buildTZSelect(){const s=el('dm-tz');if(!s)return;s.innerHTML=TZ_LIST.map(t=>`<option value="${t.tz}">${t.label}</option>`).join('');}

// COUNTRY DATA
const COUNTRY_LIST=[
  {code:'',name:'— Select Country —',flag:''},
  {code:'US',name:'United States',flag:'🇺🇸'},
  {code:'CA',name:'Canada',flag:'🇨🇦'},
  {code:'MX',name:'Mexico',flag:'🇲🇽'},
  {code:'BR',name:'Brazil',flag:'🇧🇷'},
  {code:'AR',name:'Argentina',flag:'🇦🇷'},
  {code:'GB',name:'United Kingdom',flag:'🇬🇧'},
  {code:'IE',name:'Ireland',flag:'🇮🇪'},
  {code:'DE',name:'Germany',flag:'🇩🇪'},
  {code:'FR',name:'France',flag:'🇫🇷'},
  {code:'IT',name:'Italy',flag:'🇮🇹'},
  {code:'ES',name:'Spain',flag:'🇪🇸'},
  {code:'PT',name:'Portugal',flag:'🇵🇹'},
  {code:'NL',name:'Netherlands',flag:'🇳🇱'},
  {code:'BE',name:'Belgium',flag:'🇧🇪'},
  {code:'CH',name:'Switzerland',flag:'🇨🇭'},
  {code:'AT',name:'Austria',flag:'🇦🇹'},
  {code:'SE',name:'Sweden',flag:'🇸🇪'},
  {code:'NO',name:'Norway',flag:'🇳🇴'},
  {code:'DK',name:'Denmark',flag:'🇩🇰'},
  {code:'FI',name:'Finland',flag:'🇫🇮'},
  {code:'PL',name:'Poland',flag:'🇵🇱'},
  {code:'CZ',name:'Czech Republic',flag:'🇨🇿'},
  {code:'RO',name:'Romania',flag:'🇷🇴'},
  {code:'GR',name:'Greece',flag:'🇬🇷'},
  {code:'RU',name:'Russia',flag:'🇷🇺'},
  {code:'ZA',name:'South Africa',flag:'🇿🇦'},
  {code:'IN',name:'India',flag:'🇮🇳'},
  {code:'SG',name:'Singapore',flag:'🇸🇬'},
  {code:'MY',name:'Malaysia',flag:'🇲🇾'},
  {code:'JP',name:'Japan',flag:'🇯🇵'},
  {code:'KR',name:'South Korea',flag:'🇰🇷'},
  {code:'CN',name:'China',flag:'🇨🇳'},
  {code:'AU',name:'Australia',flag:'🇦🇺'},
  {code:'NZ',name:'New Zealand',flag:'🇳🇿'},
];
function buildCountrySelect(){const s=el('dm-country');if(!s)return;s.innerHTML=COUNTRY_LIST.map(c=>`<option value="${c.code}">${c.flag?c.flag+' ':''}${c.name}</option>`).join('');}
// FLAG RENDERING — hybrid: emoji where supported (iOS/Android/Mac), flag-icons CSS fallback (Windows)
function emojiFlag(code){return code.toUpperCase().replace(/./g,c=>String.fromCodePoint(127397+c.charCodeAt(0)));}
let FLAG_MODE=null;
function detectFlagMode(){
  try{
    const cv=document.createElement('canvas');cv.width=20;cv.height=20;
    const ctx=cv.getContext('2d');if(!ctx){FLAG_MODE='css';return;}
    ctx.font='16px sans-serif';ctx.fillStyle='#000';ctx.fillText(emojiFlag('US'),0,16);
    const px=ctx.getImageData(0,0,20,20).data;
    let colored=false;
    for(let i=0;i<px.length;i+=4){
      const r=px[i],g=px[i+1],b=px[i+2],a=px[i+3];
      if(a>16&&(Math.abs(r-g)>16||Math.abs(g-b)>16)){colored=true;break;}
    }
    FLAG_MODE=colored?'emoji':'css';
  }catch(e){FLAG_MODE='css';}
}
function flagHTML(d,size){
  if(!d||!d.country)return'';
  if(FLAG_MODE===null)detectFlagMode();
  const sz=size||'14px';
  if(FLAG_MODE==='emoji')return`<span style="font-size:${sz};vertical-align:middle;flex-shrink:0;margin-right:3px;text-transform:none">${emojiFlag(d.country)}</span>`;
  return`<span class="fi fi-${d.country.toLowerCase()}" style="font-size:${sz};border-radius:2px;vertical-align:middle;flex-shrink:0;margin-right:3px"></span>`;
}
function flagText(d){
  if(!d||!d.country)return'';
  if(FLAG_MODE===null)detectFlagMode();
  if(FLAG_MODE==='emoji')return emojiFlag(d.country)+' ';
  return'['+d.country+'] ';
}
function getOffsetFromTZ(tz,refDate){if(!tz)return 0;try{const now=refDate||new Date();const fmt=new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});const parts={};fmt.formatToParts(now).forEach(p=>{parts[p.type]=p.value;});const lh=parseInt(parts.hour)%24;const lm=parseInt(parts.minute);const uh=now.getUTCHours();const um=now.getUTCMinutes();let diff=(lh*60+lm)-(uh*60+um);if(diff>720)diff-=1440;if(diff<-720)diff+=1440;return Math.round(diff/60*4)/4;}catch(e){return 0;}}
function getTZAbbr(tz,refDate){if(!tz)return'';try{const parts=new Intl.DateTimeFormat('en-US',{timeZone:tz,timeZoneName:'short'}).formatToParts(refDate||new Date());return(parts.find(p=>p.type==='timeZoneName')||{}).value||'';}catch(e){return'';}}
function getEventRefDate(){if(S.config&&S.config.date){const d=new Date(S.config.date+'T12:00:00Z');if(!isNaN(d))return d;}return new Date();}
function onTZChange(){const tz=gv('dm-tz');const info=el('dm-tz-info');if(!info)return;if(!tz){info.textContent='';return;}const ref=getEventRefDate();const offset=getOffsetFromTZ(tz,ref);const abbr=getTZAbbr(tz,ref);const note=S.config&&S.config.date?' · for event date':'· today';info.textContent=abbr+' · UTC'+(offset>=0?'+':'')+offset+(Number.isInteger(offset)?':00':':30')+' '+note;}
