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
  try{const r=localStorage.getItem('lum4');if(r){const p=JSON.parse(r);S={...S,...p};if(!S.drivers||!S.drivers.length)resetDrivers();if(!S.checks)S.checks=JSON.parse(JSON.stringify(DEFAULT_CHECKS));if(!S.settingCols)S.settingCols=JSON.parse(JSON.stringify(DC));if(!S.goals)S.goals=[];if(!S.tnotes)S.tnotes=[];if(!S.schMeta)S.schMeta={};if(!S.raceLog)S.raceLog=[];if(!S.team)S.team={name:'',logo:''};if(!S.config.sim)S.config.sim='';}}catch(e){}
  ensureEntries();
  buildHourOpts();buildTimeDDs();
  populateConfig();buildCatalogLists();showBuildStamp();
  try{renderTeamIdentity();}catch(e){}
  try{applyCollapse();renderCollapseSummaries();}catch(e){}
  renderDriverList();renderSettingsTable();
  renderChecklists();renderGoals();renderGoalsDash();renderTNotes();
  buildAvail();renderSchedule();loadSchMeta();updateDash();checkPrereqs();
}
function resetDrivers(){S.drivers=[{id:1,name:'Driver 1',handle:'',ir:0,tz:'America/New_York',gmt:-5,tzabbr:'ET',country:'',countryName:'',countryFlag:'',color:'#DFFF00',maxConsec:2,timefmt:'12',lap:'',fpl:'',fslap:'',fsburn:'',settings:{}},{id:2,name:'Driver 2',handle:'',ir:0,tz:'America/Chicago',gmt:-6,tzabbr:'CT',country:'',countryName:'',countryFlag:'',color:'#8EC7E6',maxConsec:2,timefmt:'12',lap:'',fpl:'',fslap:'',fsburn:'',settings:{}},{id:3,name:'Driver 3',handle:'',ir:0,tz:'America/Los_Angeles',gmt:-8,tzabbr:'PT',country:'',countryName:'',countryFlag:'',color:'#FF8A1C',maxConsec:2,timefmt:'12',lap:'',fpl:'',fslap:'',fsburn:'',settings:{}}];}

initDelegation();loadState();liveInit();
/* Always land on the Dashboard for the current car. Michael's call: mid-race
   the clocks and countdowns are what he opens the app for, and being dropped
   on Config because that is where he left it costs a tap when it matters. */
pg('ops');
/* Hold the branded splash, then fade it out. Safari decides how long the native
   iOS startup image shows and that cannot be configured; this overlay can.

   The fade is started from inside a double requestAnimationFrame rather than
   directly from the timer. The timer can fire while the main thread is still
   busy finishing boot work, and a transition started on a blocked thread drops
   its first frames and looks like a stutter. Waiting for two clean frames means
   the transition begins only once the browser is actually painting smoothly.

   Timing is mirrored in the #boot-splash rules in styles/components.css. */
/* rAF does NOT fire in a backgrounded or non-painting tab, so relying on it
   alone can leave the splash stuck at full opacity forever, which reads as a
   permanently broken app. The double rAF keeps the fade smooth when the browser
   is painting; the plain timeout guarantees it lifts when it is not. */
var _splashLifted=false;
function _liftSplash(){
  if(_splashLifted)return;
  _splashLifted=true;
  var b=el('boot-splash');
  if(!b)return;
  b.classList.add('gone');
  setTimeout(function(){if(b.parentNode)b.parentNode.removeChild(b);},850);
}
setTimeout(function(){
  requestAnimationFrame(function(){requestAnimationFrame(_liftSplash);});
  setTimeout(_liftSplash,400);
},1500);
setInterval(updateDash,5000);
