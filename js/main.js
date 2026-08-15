/* LUMINARY ENDURANCE MANAGER
   Boot sequence. MUST load last: this is the only file with top-level
   executable code, and it calls functions declared in every file above.

   Extracted verbatim from index.html lines 1582-1593.
   These are CLASSIC scripts, not ES modules: top-level declarations stay in the
   shared global scope, where the delegated dispatcher in js/actions.js resolves
   them by name. No inline on*= handlers remain in the markup (Step 5).
   LOAD ORDER MATTERS - js/main.js must be last. */

// INIT
function loadState(){
  try{const r=localStorage.getItem('lum4');if(r){const p=JSON.parse(r);S={...S,...p};if(!S.drivers||!S.drivers.length)resetDrivers();if(!S.checks)S.checks=JSON.parse(JSON.stringify(DEFAULT_CHECKS));if(!S.settingCols)S.settingCols=JSON.parse(JSON.stringify(DC));if(!S.goals)S.goals=[];if(!S.tnotes)S.tnotes=[];if(!S.schMeta)S.schMeta={};if(!S.raceLog)S.raceLog=[];if(!S.config.sim)S.config.sim='';}}catch(e){}
  buildHourOpts();buildTimeDDs();
  populateConfig();buildCatalogLists();showBuildStamp();
  renderDriverList();renderSettingsTable();
  renderChecklists();renderGoals();renderGoalsDash();renderTNotes();
  buildAvail();renderSchedule();loadSchMeta();updateDash();checkPrereqs();
}
function resetDrivers(){S.drivers=[{id:1,name:'Driver 1',handle:'',ir:0,tz:'America/New_York',gmt:-5,tzabbr:'ET',country:'',countryName:'',countryFlag:'',color:'#DFFF00',maxConsec:2,timefmt:'12',lap:'',fpl:'',fslap:'',fsburn:'',settings:{}},{id:2,name:'Driver 2',handle:'',ir:0,tz:'America/Chicago',gmt:-6,tzabbr:'CT',country:'',countryName:'',countryFlag:'',color:'#8EC7E6',maxConsec:2,timefmt:'12',lap:'',fpl:'',fslap:'',fsburn:'',settings:{}},{id:3,name:'Driver 3',handle:'',ir:0,tz:'America/Los_Angeles',gmt:-8,tzabbr:'PT',country:'',countryName:'',countryFlag:'',color:'#FF8A1C',maxConsec:2,timefmt:'12',lap:'',fpl:'',fslap:'',fsburn:'',settings:{}}];}

initDelegation();loadSyncUrl();loadState();
setInterval(updateDash,5000);
