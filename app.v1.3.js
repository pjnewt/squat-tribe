const EXERCISES = [
  { id:'back', name:'Back Squat', type:'bilateral', coefficient:0.70, image:'back.png' },
  { id:'bulgarian', name:'Bulgarian Squat', type:'unilateral', coefficient:0.85, image:'bulgarian.png' },
  { id:'front', name:'Front Squat', type:'bilateral', coefficient:0.70, image:'front.png' },
  { id:'side_step', name:'Side Step Squat', type:'unilateral', coefficient:0.85, image:'side_step.png' },
  { id:'sumo', name:'Sumo Squat', type:'bilateral', coefficient:0.70, image:'sumo.png' },
];
const ONBOARDING = [
  ['Welcome to Squat Tribe','A simple, smart way to build strength at home using squats. The app guides the session and tracks your work for you.'],
  ['Why Squats?','Squats train your legs, hips, and core together. Stronger squats can improve daily movement, balance, stability, and confidence.'],
  ['How It Works','Each session uses an Anchor Set, then matching rest, then short Myo sets. The app uses your performance today to guide the session.'],
  ['Unilateral Rule','For Bulgarian Squat and Side Step Squat, start with your weaker leg. The app will ask you to choose it at the start of that session.']
].map(([title,body])=>({title,body}));

const app = document.getElementById('app');
let deferredInstallPrompt = null;
let anchorTimer = null;
let restTimer = null;

const defaultState = {
  onboarded: false,
  onboardingIndex: 0,
  user: { bodyweight:'', defaultLoad:'0' },
  rotationMode:'fixed',
  pointer:0,
  sessions:[],
  redFlag:false,
  canInstall:false,
  installAvailable:false,
  view:'onboarding',
  draft:null,
};

function loadState(){
  try { return {...defaultState, ...JSON.parse(localStorage.getItem('squatTribeV13')||'{}')}; }
  catch { return {...defaultState}; }
}
let state = loadState();
if (state.onboarded && state.view === 'onboarding') state.view = 'home';

function saveState(){ localStorage.setItem('squatTribeV13', JSON.stringify(state)); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function currentExercise(){ return EXERCISES[state.pointer] || EXERCISES[0]; }
function nav(title){ return `<div class="topnav"><button class="btn secondary" data-action="back">Back</button><div class="tag">${title}</div></div>`; }
function lastExerciseSession(id){ return [...state.sessions].reverse().find(s=>s.exerciseId===id); }
function last7DayAverage(id){
  const cutoff = Date.now() - 7*24*60*60*1000;
  const vals = state.sessions.filter(s=>s.exerciseId===id && new Date(s.date).getTime() >= cutoff).map(s=>s.ds);
  return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
}
function pentagonSVG(){
  const pts = [[150,20],[270,105],[225,245],[75,245],[30,105]];
  const exDoneToday = state.sessions.filter(s=>s.date.slice(0,10)===todayStr()).map(s=>s.exerciseId);
  return `<svg viewBox="0 0 300 280" width="100%" style="max-width:320px">
    <polygon points="${pts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#3A3A3C" stroke-width="2"/>
    ${pts.map((p,i)=>{
      const ex = EXERCISES[i];
      const active = i===state.pointer;
      const done = exDoneToday.includes(ex.id);
      const color = done || active ? '#FFD700' : '#3A3A3C';
      const fill = active ? 'rgba(255,215,0,.16)' : 'rgba(58,58,60,.12)';
      return `<g><circle cx="${p[0]}" cy="${p[1]}" r="18" fill="${fill}" stroke="${color}" stroke-width="2"></circle>
        <text x="${p[0]}" y="${p[1]+5}" font-size="10" text-anchor="middle" fill="${color}" font-family="Inter, sans-serif">${i+1}</text></g>`;
    }).join('')}
    <text x="150" y="126" text-anchor="middle" fill="#F5F5F7" font-size="16" font-family="Inter, sans-serif">7-Day Avg</text>
    <text x="150" y="154" text-anchor="middle" fill="#FFD700" font-size="28" font-weight="700" font-family="Roboto Mono, monospace">${last7DayAverage(currentExercise().id).toFixed(1)}</text>
  </svg>`;
}

function render(){
  saveState();
  const v = state.view;
  if (v==='onboarding') return renderOnboarding();
  if (v==='settings') return renderSettings();
  if (v==='home') return renderHome();
  if (v==='select') return renderSelect();
  if (v==='sessionSetup') return renderSessionSetup();
  if (v==='anchor') return renderAnchor();
  if (v==='rest') return renderRest();
  if (v==='myo') return renderMyo();
  if (v==='summary') return renderSummary();
  if (v==='history') return renderHistory();
}

function renderOnboarding(){
  const step = ONBOARDING[state.onboardingIndex];
  app.innerHTML = `<div class="screen center">
    <div class="card"><div class="title">${step.title}</div><p class="subtitle" style="margin-top:16px">${step.body}</p></div>
    <div class="onboard-dots">${ONBOARDING.map((_,i)=>`<div class="dot ${i===state.onboardingIndex?'on':''}"></div>`).join('')}</div>
    <div class="install-box help"><strong>Install note:</strong> after you upload this build, open the page once, refresh once, then use the Chrome menu or the Install button on the home screen.</div>
    <div class="footer-actions">
      <button class="btn secondary full" data-action="skip-onboarding">Skip intro</button>
      ${state.onboardingIndex>0?'<button class="btn secondary full" data-action="onboard-prev">Previous</button>':''}
      <button class="btn primary full" data-action="onboard-next">${state.onboardingIndex===ONBOARDING.length-1?'Continue to Setup':'Next'}</button>
    </div>
  </div>`;
}

function renderSettings(){
  app.innerHTML = `<div class="screen">${nav('Profile Setup')}
    <div class="card"><div class="title">Your profile</div><p class="subtitle">These values are used for Mechanical Load Score and Density Score.</p>
      <div class="grid" style="margin-top:14px">
        <label>Bodyweight (kg)<input id="bodyweight" type="number" min="20" max="300" step="0.1" value="${state.user.bodyweight||''}"></label>
        <label>Default external load (kg)<input id="defaultLoad" type="number" min="0" max="300" step="0.5" value="${state.user.defaultLoad||'0'}"></label>
        <label>Rotation mode<select id="rotationMode"><option value="fixed" ${state.rotationMode==='fixed'?'selected':''}>Fixed Pentagon rotation</option><option value="individual" ${state.rotationMode==='individual'?'selected':''}>Individual exercise choice</option></select></label>
      </div>
    </div>
    <div class="footer-actions"><button class="btn primary full" data-action="save-settings">Save and Continue</button></div>
  </div>`;
}

function renderHome(){
  const ex = currentExercise();
  const avg = last7DayAverage(ex.id).toFixed(1);
  const last = (lastExerciseSession(ex.id)?.ds || 0).toFixed(1);
  app.innerHTML = `<div class="screen">
    <div class="topnav"><div class="tag">Squat Tribe</div><button class="btn secondary" data-action="open-settings">Profile</button></div>
    ${state.redFlag?'<div class="notice red"><strong>Recovery Mission</strong><div class="small" style="margin-top:8px">Recent Density Scores have been low for three consecutive sessions. Use today for mobility, isometric holds, or light technique work.</div></div>':''}
    <div class="card"><div class="title">Pentagon Protocol</div><p class="subtitle">Current exercise: <strong>${ex.name}</strong></p><div class="pent-wrap">${pentagonSVG()}</div></div>
    <div class="exercise-card"><img src="${ex.image}" alt="${ex.name}"><div><div class="exercise-name">${ex.name}</div><div class="exercise-meta">${ex.type==='unilateral'?'Unilateral · choose your weaker leg first':'Bilateral'} · coefficient ${ex.coefficient.toFixed(2)}</div></div></div>
    <div class="grid two"><div class="kpi"><div class="label">7-day average</div><div class="value">${avg}</div></div><div class="kpi"><div class="label">Last DS</div><div class="value">${last}</div></div></div>
    <div class="install-box help">${state.installAvailable?'<strong>Install ready.</strong> Tap Install App below or use the Chrome menu.' : '<strong>Install help.</strong> Open once, refresh once, then check the Chrome menu for “Add to Home screen” or “Install app”.'}</div>
    <div class="footer-actions">
      <button class="btn primary full" data-action="start-session">Start Session</button>
      ${state.installAvailable?'<button class="btn secondary full" data-action="install-app">Install App</button>':''}
      ${state.rotationMode==='individual'?'<button class="btn secondary full" data-action="choose-exercise">Choose Exercise</button>':''}
      <button class="btn secondary full" data-action="view-history">History</button>
    </div>
  </div>`;
}

function renderSelect(){
  app.innerHTML = `<div class="screen">${nav('Choose Exercise')}
    ${EXERCISES.map(ex=>`<button class="exercise-card" data-action="pick-exercise" data-id="${ex.id}"><img src="${ex.image}" alt="${ex.name}"><div><div class="exercise-name">${ex.name}</div><div class="exercise-meta">${ex.type==='unilateral'?'Unilateral':'Bilateral'} · coefficient ${ex.coefficient.toFixed(2)}</div></div></button>`).join('')}
  </div>`;
}

function openSession(id){
  const ex = id ? EXERCISES.find(e=>e.id===id) : currentExercise();
  state.draft = {
    exerciseId: ex.id, exerciseName: ex.name, exerciseType: ex.type, coefficient: ex.coefficient,
    externalLoad: Number(state.user.defaultLoad||0), weakerLeg:'', anchorTime:0, anchorReps:0,
    leftReps:0, rightReps:0, myoTarget:0, myoSets:[], strikes:0, totalActiveTime:0
  };
  state.view = 'sessionSetup';
  render();
}

function renderSessionSetup(){
  const d = state.draft; const ex = EXERCISES.find(e=>e.id===d.exerciseId);
  app.innerHTML = `<div class="screen">${nav('Session Setup')}
    <div class="exercise-card"><img src="${ex.image}" alt="${ex.name}"><div><div class="exercise-name">${ex.name}</div><div class="exercise-meta">${d.exerciseType==='unilateral'?'Choose the weaker leg before you begin.':'Ready to begin the Anchor Set.'}</div></div></div>
    <div class="card"><div class="title">Load and setup</div>
      <div class="grid" style="margin-top:14px">
        <label>External load (kg)<input id="session-load" type="number" min="0" max="300" step="0.5" value="${d.externalLoad}"></label>
        ${d.exerciseType==='unilateral'?`<label>Choose your weaker leg<select id="weaker-leg"><option value="">Select</option><option value="left">Left</option><option value="right">Right</option></select></label><div class="small">The app will not assume left or right. Choose the side that currently feels weaker.</div>`:''}
      </div>
    </div>
    <div class="footer-actions"><button class="btn primary full" data-action="confirm-setup">Start Anchor</button></div>
  </div>`;
}

function renderAnchor(){
  const d = state.draft;
  app.innerHTML = `<div class="screen">${nav('Anchor Set')}
    <div class="card center-text"><div class="title">${d.exerciseName}</div><p class="subtitle">Perform your Anchor Set and stop when you reach your honest limit with good form.</p></div>
    <div class="card center-text"><div class="small">Anchor duration</div><div class="metric big-metric">${formatTime(d.anchorTime)}</div>
      <div class="footer-actions" style="margin-top:14px">
        ${d.anchorRunning?'<button class="btn secondary full" data-action="anchor-stop-clock">Stop clock</button>':'<button class="btn primary full" data-action="anchor-start-clock">Start clock</button>'}
      </div>
    </div>
    <div class="card"><div class="title" style="font-size:24px">Record reps</div>
      ${d.exerciseType==='unilateral'?`<div class="grid two" style="margin-top:12px"><label>Weaker leg reps<input id="weaker-reps" type="number" min="0" step="1" value="${d.weakerLeg==='left'?d.leftReps:d.rightReps || ''}"></label><label>Other leg reps<input id="other-reps" type="number" min="0" step="1" value="${d.weakerLeg==='left'?d.rightReps:d.leftReps || ''}"></label></div>`:`<label style="display:block;margin-top:12px">Anchor reps<input id="anchor-reps" type="number" min="0" step="1" value="${d.anchorReps || ''}"></label>`}
    </div>
    <div class="footer-actions"><button class="btn primary full" data-action="finish-anchor">Finish Anchor</button></div>
  </div>`;
}
function formatTime(s){ const m=Math.floor(s/60); const ss=String(s%60).padStart(2,'0'); return `${m}:${ss}`; }
function startAnchorTicker(){
  clearInterval(anchorTimer);
  anchorTimer = setInterval(()=>{ state.draft.anchorTime += 1; render(); },1000);
}
function finishAnchor(){
  clearInterval(anchorTimer); state.draft.anchorRunning = false;
  const d = state.draft;
  if (d.exerciseType==='unilateral') {
    const weak = Number(document.getElementById('weaker-reps')?.value || 0);
    const other = Number(document.getElementById('other-reps')?.value || 0);
    if (!weak || !other) return alert('Please record both sides.');
    if (d.weakerLeg === 'left') { d.leftReps = weak; d.rightReps = other; } else { d.rightReps = weak; d.leftReps = other; }
    d.anchorReps = Math.min(d.leftReps, d.rightReps);
  } else {
    d.anchorReps = Number(document.getElementById('anchor-reps')?.value || 0);
    if (!d.anchorReps) return alert('Please record your Anchor reps.');
  }
  if (!d.anchorTime) d.anchorTime = 30;
  d.totalActiveTime = d.anchorTime;
  d.myoTarget = Math.max(3, Math.round(d.anchorReps * 0.25));
  startRest(d.anchorTime);
}
function startRest(seconds){
  state.draft.restRemaining = seconds;
  state.view = 'rest';
  clearInterval(restTimer);
  restTimer = setInterval(()=>{
    state.draft.restRemaining -= 1;
    if (state.draft.restRemaining <= 0) {
      clearInterval(restTimer);
      try { navigator.vibrate?.([90,40,90]); } catch {}
      state.view = 'myo';
    }
    render();
  },1000);
  render();
}
function renderRest(){
  const d = state.draft;
  app.innerHTML = `<div class="screen center">${nav('Adaptive Rest')}
    <div class="card center-text"><div class="title">Rest</div><p class="subtitle">Rest for the same amount of time as your Anchor Set.</p></div>
    <div class="timer-circle"><div class="center-text"><div class="small">Remaining</div><div class="metric big-metric">${formatTime(Math.max(0,d.restRemaining||0))}</div></div></div>
    <div class="footer-actions"><button class="btn secondary full" data-action="skip-rest">Skip Rest</button></div>
  </div>`;
}
function renderMyo(){
  const d = state.draft;
  const color = d.strikes >= 1 ? 'var(--red)' : 'var(--gold)';
  app.innerHTML = `<div class="screen">${nav('Myo Sets')}
    <div class="card"><div class="title">Target reps: <span class="metric">${d.myoTarget}</span></div><p class="subtitle">Complete one short set, then record the reps. If two sets in a row fall below target, the session ends.</p></div>
    <div class="card"><div class="row between"><div><div class="small">Strike status</div><div class="metric" style="font-size:22px">${d.strikes}/2</div></div><div class="tag">15s breath timer between sets</div></div><div style="height:12px;border-radius:999px;background:#1d1d1d;margin-top:14px;overflow:hidden"><div style="width:${d.strikes===0?40:85}%;height:100%;background:${color}"></div></div></div>
    <div class="card"><label>${d.exerciseType==='unilateral'?'Completed reps per side':'Completed reps'}<input id="myo-reps" type="number" min="0" step="1"></label></div>
    <div class="footer-actions"><button class="btn primary full" data-action="log-myo">Set Complete</button><button class="btn secondary full" data-action="done-session">I’m Done</button></div>
  </div>`;
}
function logMyoSet(){
  const reps = Number(document.getElementById('myo-reps')?.value || 0);
  if (!reps && reps !== 0) return;
  const d = state.draft;
  d.myoSets.push(reps);
  d.totalActiveTime += Math.max(10, reps * 2);
  if (reps < d.myoTarget) d.strikes += 1; else d.strikes = 0;
  if (d.strikes >= 2) return prepareSummary(true);
  startRest(15);
}
function prepareSummary(autoEnded){
  clearInterval(restTimer); clearInterval(anchorTimer);
  state.draft.autoEnded = autoEnded;
  state.view = 'summary';
  render();
}
function renderSummary(){
  const d = state.draft;
  const effectiveLoad = Number(d.externalLoad) + Number(state.user.bodyweight || 0) * d.coefficient;
  const totalReps = d.anchorReps + d.myoSets.reduce((a,b)=>a+b,0);
  const mls = effectiveLoad * totalReps;
  const ds = d.totalActiveTime > 0 ? mls / d.totalActiveTime : 0;
  d.effectiveLoad = effectiveLoad; d.totalReps = totalReps; d.mls = mls; d.ds = ds;
  app.innerHTML = `<div class="screen">${nav('Summary')}
    <div class="card"><div class="title">Session complete</div><p class="subtitle">${d.autoEnded?'The session ended because two Myo sets fell below target.':'You ended the session.'}</p></div>
    <div class="grid two"><div class="kpi"><div class="label">Anchor reps</div><div class="value">${d.anchorReps}</div></div><div class="kpi"><div class="label">Myo total</div><div class="value">${d.myoSets.reduce((a,b)=>a+b,0)}</div></div><div class="kpi"><div class="label">MLS</div><div class="value">${mls.toFixed(1)}</div></div><div class="kpi"><div class="label">DS</div><div class="value">${ds.toFixed(1)}</div></div></div>
    ${d.exerciseType==='unilateral'?`<div class="card"><div class="title" style="font-size:22px">Side balance</div><div class="row between" style="margin-top:10px"><span>Left reps</span><span class="metric">${d.leftReps}</span></div><div class="row between" style="margin-top:10px"><span>Right reps</span><span class="metric">${d.rightReps}</span></div></div>`:''}
    <div class="footer-actions"><button class="btn primary full" data-action="log-session">Log Session</button></div>
  </div>`;
}
function logSession(){
  const d = state.draft;
  state.sessions.push({
    date:new Date().toISOString(), exerciseId:d.exerciseId, exerciseName:d.exerciseName, ds:d.ds, mls:d.mls,
    anchorReps:d.anchorReps, myoSets:d.myoSets, externalLoad:d.externalLoad, totalActiveTime:d.totalActiveTime
  });
  updateRedFlag(d.exerciseId);
  if (state.rotationMode === 'fixed') state.pointer = (state.pointer + 1) % EXERCISES.length;
  state.draft = null;
  try { navigator.vibrate?.(200); } catch {}
  state.view = 'home';
  render();
}
function updateRedFlag(id){
  const related = state.sessions.filter(s=>s.exerciseId===id).slice(-7);
  if (related.length < 3) { state.redFlag = false; return; }
  const last3 = related.slice(-3);
  const avg = related.reduce((a,b)=>a+b.ds,0) / related.length;
  state.redFlag = last3.every(s=>s.ds < avg * 0.8);
}
function renderHistory(){
  const rows = [...state.sessions].reverse().map(s=>`<div class="history-row"><div><div>${s.exerciseName}</div><div class="small">${new Date(s.date).toLocaleString()}</div></div><div class="metric">DS ${s.ds.toFixed(1)}</div></div>`).join('') || '<div class="small">No sessions logged yet.</div>';
  app.innerHTML = `<div class="screen">${nav('History')}<div class="card">${rows}</div></div>`;
}

function triggerInstall(){ if (deferredInstallPrompt) deferredInstallPrompt.prompt(); }

app.addEventListener('click', (e)=>{
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'skip-onboarding') { state.onboarded = true; state.view = 'settings'; return render(); }
  if (action === 'onboard-next') { if (state.onboardingIndex < ONBOARDING.length-1) state.onboardingIndex += 1; else { state.onboarded = true; state.view = 'settings'; } return render(); }
  if (action === 'onboard-prev') { state.onboardingIndex = Math.max(0, state.onboardingIndex-1); return render(); }
  if (action === 'save-settings') {
    state.user.bodyweight = document.getElementById('bodyweight').value;
    state.user.defaultLoad = document.getElementById('defaultLoad').value || '0';
    state.rotationMode = document.getElementById('rotationMode').value;
    state.onboarded = true; state.view = 'home'; return render();
  }
  if (action === 'open-settings') { state.view='settings'; return render(); }
  if (action === 'back') {
    if (['settings','select','history'].includes(state.view)) state.view='home';
    else if (['sessionSetup','anchor','rest','myo','summary'].includes(state.view)) state.view='home';
    return render();
  }
  if (action === 'start-session') return openSession();
  if (action === 'choose-exercise') { state.view='select'; return render(); }
  if (action === 'pick-exercise') { state.pointer = EXERCISES.findIndex(x=>x.id===target.dataset.id); return openSession(target.dataset.id); }
  if (action === 'confirm-setup') {
    state.draft.externalLoad = Number(document.getElementById('session-load').value || 0);
    if (state.draft.exerciseType === 'unilateral') {
      state.draft.weakerLeg = document.getElementById('weaker-leg').value;
      if (!state.draft.weakerLeg) return alert('Please choose your weaker leg.');
    }
    state.view='anchor'; return render();
  }
  if (action === 'anchor-start-clock') { state.draft.anchorRunning = true; startAnchorTicker(); return render(); }
  if (action === 'anchor-stop-clock') { state.draft.anchorRunning = false; clearInterval(anchorTimer); return render(); }
  if (action === 'finish-anchor') return finishAnchor();
  if (action === 'skip-rest') { clearInterval(restTimer); state.view='myo'; return render(); }
  if (action === 'log-myo') return logMyoSet();
  if (action === 'done-session') return prepareSummary(false);
  if (action === 'log-session') return logSession();
  if (action === 'view-history') { state.view='history'; return render(); }
  if (action === 'install-app') return triggerInstall();
});

window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredInstallPrompt = e;
  state.installAvailable = true;
  render();
});
window.addEventListener('appinstalled', ()=>{
  deferredInstallPrompt = null;
  state.installAvailable = false;
  render();
});
if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
  state.installAvailable = false;
}
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async ()=>{
    try {
      await navigator.serviceWorker.register('./sw.js', { updateViaCache:'none' });
    } catch {}
  });
}
render();
