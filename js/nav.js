/* LUMINARY ENDURANCE MANAGER
   Tab navigation between the six pages.

   Extracted verbatim from index.html lines 1532-1546.
   These are CLASSIC scripts, not ES modules: top-level declarations stay in the
   shared global scope so the existing inline onclick= handlers keep working.
   LOAD ORDER MATTERS - js/main.js must be last. */

// NAV
function pg(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));
  const pEl=el('page-'+id);if(pEl)pEl.classList.add('on');
  const pages=['ops','config','schedule','avail','fuel','goals'];
  const tabs=document.querySelectorAll('.tab');const idx=pages.indexOf(id);if(tabs[idx])tabs[idx].classList.add('on');
  if(id==='ops'){try{renderDrivePie();}catch(e){}renderGoalsDash();renderStintSummary();}
  if(id==='config'){renderDriverList();renderSettingsTable();renderTNotes();checkPrereqs();renderArchive();}
  if(id==='schedule'){renderSchedule();loadSchMeta();}
  if(id==='avail'){buildAvail();refreshAvDrvSelect();}
  if(id==='fuel'){try{calcCompare();}catch(e){}}
  if(id==='goals'){renderGoals();renderChecklists();}
}
