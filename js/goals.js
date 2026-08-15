/* LUMINARY ENDURANCE MANAGER
   Team goals and the pre-race / driver-swap / post-race checklists.

   Extracted verbatim from index.html lines 1446-1463.
   These are CLASSIC scripts, not ES modules: top-level declarations stay in the
   shared global scope, where the delegated dispatcher in js/actions.js resolves
   them by name. No inline on*= handlers remain in the markup (Step 5).
   LOAD ORDER MATTERS - js/main.js must be last. */

// GOALS
function openGoal(){sv('goal-txt','');el('goal-overlay').classList.add('on');}
function saveGoal(){const t=gv('goal-txt').trim();if(!t)return;S.goals.push({id:Date.now(),text:t,done:false,order:S.goals.length});persist();renderGoals();renderGoalsDash();el('goal-overlay').classList.remove('on');}
function renderGoals(){const e=el('goals-list');if(!e)return;if(!S.goals.length){e.innerHTML='<div style="color:var(--muted);font-size:0.68rem">No goals set.</div>';return;}e.innerHTML=S.goals.map((g,i)=>`<div class="goal-item ${g.done?'goal-done':''}" draggable="true" data-action="goal.row" data-i="${i}"><span style="color:var(--muted);cursor:grab;flex-shrink:0">☰</span><div class="chk-box ${g.done?'done':''}" data-action="goal.toggle" data-i="${i}"></div><div class="goal-text">${g.text}</div><button class="btn xs rd" data-action="goal.delete" data-i="${i}">✕</button></div>`).join('');renderGoalsDash();}
function renderGoalsDash(){const e=el('goals-dash-list');const se=el('goals-dash-status');if(!e)return;if(!S.goals.length){e.innerHTML='<div style="color:var(--muted);font-size:0.68rem">No goals set.</div>';if(se)se.textContent='';return;}const done=S.goals.filter(g=>g.done).length;if(se)se.textContent=`${done}/${S.goals.length} Complete`;e.innerHTML=S.goals.map((g,i)=>`<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)"><div class="chk-box ${g.done?'done':''}" data-action="goal.toggle" data-i="${i}" style="width:16px;height:16px"></div><div style="font-family:var(--mono);font-size:0.78rem;color:${g.done?'var(--muted)':'var(--text)'};${g.done?'text-decoration:line-through':''};">${g.text}</div></div>`).join('');}
function toggleGoal(i){S.goals[i].done=!S.goals[i].done;persist();renderGoals();}
function delGoal(i){S.goals.splice(i,1);persist();renderGoals();}
let _di=null;function goalDragStart(i){_di=i;}function goalDragOver(e,i){e.preventDefault();}function goalDrop(e,i){if(_di===null||_di===i)return;const m=S.goals.splice(_di,1)[0];S.goals.splice(i,0,m);_di=null;persist();renderGoals();}

// CHECKLISTS
function openCheck(){sv('check-txt','');el('check-overlay').classList.add('on');}
function saveCheck(){const cat=gv('check-cat');const txt=gv('check-txt').trim();if(!txt)return;S.checks[cat].push({id:Date.now(),text:txt,done:false});persist();renderChecklists();el('check-overlay').classList.remove('on');}
function renderChecklists(){renderCL('cl-pre',S.checks.pre,'pre');renderCL('cl-swap',S.checks.swap,'swap');renderCL('cl-post',S.checks.post,'post');}
function renderCL(eid,items,cat){const e=el(eid);if(!e)return;if(!items||!items.length){e.innerHTML='<div style="color:var(--muted);font-size:0.66rem">No items.</div>';return;}e.innerHTML=items.map((item,i)=>`<div class="check-item ${item.done?'checked':''}" data-action="check.toggle" data-cat="${cat}" data-i="${i}"><div class="chk-box ${item.done?'done':''}"></div><span class="check-txt">${item.text}</span><button class="btn xs rd" data-action="check.delete" data-cat="${cat}" data-i="${i}">✕</button></div>`).join('');}
function toggleCL(cat,i){S.checks[cat][i].done=!S.checks[cat][i].done;persist();renderChecklists();}
function delCheck(cat,i){S.checks[cat].splice(i,1);persist();renderChecklists();}
function resetChecks(){Object.keys(S.checks).forEach(k=>S.checks[k].forEach(c=>{c.done=false;}));persist();renderChecklists();}
