
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
  ['Unilateral Rule','For Bulgarian Squat and Side Step Squat, begin with your weaker leg. The app will ask you to choose it at the start of that session.']
].map(([title,body])=>({title,body}));

const app = document.getElementById('app');
let deferredInstallPrompt = null;
let anchorTimer = null;
let restTimer = null;
let myoTimer = null;
let sensorCheckTimer = null;

const defaultState = {
  onboarded: false,
  onboardingIndex: 0,
  user: { bodyweight:'', defaultLoad:'0', sensorSensitivity:'high', sensorCheckedAt:null, sensorReady:false },
  rotationMode:'fixed',
  pointer:0,
  sessions:[],
  redFlag:false,
  installAvailable:false,
  view:'onboarding',
  draft:null,
  motionEnabled:false,
  historyEdit:false,
  historySelected:[],
  installHelpOpen:false,
};

function withIds(sessions){
  return (sessions||[]).map((s,i)=>({id:s.id || `${(s.date||Date.now())}-${i}`, ...s}));
}
function loadState(){
  try {
    const raw = JSON.parse(localStorage.getItem('squatTribeV166')||'{}');
    return { ...defaultState, ...raw, sessions: normalizeSessions(raw.sessions), user:{...defaultState.user, ...(raw.user||{})} };
  } catch { return {...defaultState}; }
}
let state = loadState();
if (state.onboarded && state.view === 'onboarding') state.view = 'home';
if (state.draft && ['sessionSetup','sensorCheck','anchor','rest','myo','summary','sideTransition'].includes(state.view)) state.view = 'home';

function saveState(){ state.sessions = normalizeSessions(state.sessions); localStorage.setItem('squatTribeV166', JSON.stringify(state)); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function currentExercise(){ return EXERCISES[state.pointer] || EXERCISES[0]; }
function exerciseById(id){ return EXERCISES.find(e=>e.id===id) || null; }
function normalizeSession(session){
  const s = { ...session };
  const ex = exerciseById(s.exerciseId);
  const exerciseType = s.exerciseType || ex?.type || ((s.leftDS != null || s.rightDS != null) ? 'unilateral' : 'bilateral');
  s.exerciseType = exerciseType;
  s.leftDS = s.leftDS != null ? Number(s.leftDS) : null;
  s.rightDS = s.rightDS != null ? Number(s.rightDS) : null;
  s.externalLoad = s.externalLoad != null ? Number(s.externalLoad) : 0;
  s.totalActiveTime = s.totalActiveTime != null ? Number(s.totalActiveTime) : 0;
  s.anchorReps = s.anchorReps != null ? Number(s.anchorReps) : 0;
  if (Array.isArray(s.myoSets)) s.myoSets = s.myoSets.map(v => Number(v) || 0);
  const hasNumericDS = Number.isFinite(Number(s.ds)) && Number(s.ds) > 0;
  if (exerciseType === 'unilateral') {
    const left = s.leftDS || 0;
    const right = s.rightDS || 0;
    if (!hasNumericDS && (left > 0 || right > 0)) s.ds = left + right;
    else s.ds = Number(s.ds) || 0;
    if ((s.balanceDifference == null || !Number.isFinite(Number(s.balanceDifference))) && (left > 0 || right > 0)) {
      s.balanceDifference = Math.max(left, right) > 0 ? Math.abs(left - right) / Math.max(left, right) * 100 : 0;
    } else if (s.balanceDifference != null) {
      s.balanceDifference = Number(s.balanceDifference);
    }
  } else {
    if (!hasNumericDS && ex && s.totalActiveTime > 0) {
      const totalReps = (s.totalReps != null ? Number(s.totalReps) : (s.anchorReps + (Array.isArray(s.myoSets) ? s.myoSets.reduce((a,b)=>a+(Number(b)||0),0) : 0)));
      const bodyweight = Number(s.bodyweight ?? state?.user?.bodyweight ?? 0);
      const effectiveLoad = Number(s.externalLoad || 0) + bodyweight * Number(ex.coefficient || 0);
      const ds = (effectiveLoad * totalReps) / s.totalActiveTime;
      s.ds = Number.isFinite(ds) ? ds : 0;
    } else {
      s.ds = Number(s.ds) || 0;
    }
  }
  return s;
}
function normalizeSessions(sessions){ return withIds(sessions).map(normalizeSession); }
function displayDS(session){ return normalizeSession(session).ds || 0; }
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
function sidePretty(side){ return side === 'left' ? 'Left leg' : 'Right leg'; }
function makeSideData(){
  return { externalLoad:0, anchorTime:0, anchorReps:0, myoTarget:0, myoSets:[], myoSetTimes:[], strikes:0, totalActiveTime:0, totalReps:0, ds:0, mls:0, myoCurrentTime:0 };
}
function currentSideData(){ return state.draft?.sides?.[state.draft.currentSide]; }
function activeSessionData(){ return state.draft?.exerciseType === 'unilateral' ? currentSideData() : state.draft; }
function isMirroredSecondLeg(){ const d = state.draft; return !!(d && d.exerciseType === 'unilateral' && d.currentSide === d.sideOrder?.[1] && d.mirroredPlan); }
function currentMirroredMyoTarget(){ const d = state.draft; const data = activeSessionData(); if (!isMirroredSecondLeg()) return null; return d.mirroredPlan.myoSets?.[data.myoSets.length] ?? null; }
function maybeAutoStopAtMirroredTarget(){ const d = state.draft; const data = activeSessionData(); if (!d || !data || !isMirroredSecondLeg()) return;
  if (state.view === 'anchor' && d.anchorRunning) { const target = d.mirroredPlan.anchorReps || 0; if (target > 0 && (data.detectedReps || 0) >= target) { stopAnchorTimer(); render(); } }
  if (state.view === 'myo' && d.myoState === 'active') { const target = currentMirroredMyoTarget(); if (target != null && target > 0 && (data.detectedReps || 0) >= target) { stopMyoSet(); render(); } }
}
function makeProgressCard(){
  const d = state.draft; if (!d) return '';
  const data = activeSessionData() || {};
  const phase = state.view === 'anchor' ? 'Anchor Set' : state.view === 'rest' ? (d.restType==='anchor' ? 'Adaptive Rest' : 'Breath Timer') : state.view === 'myo' ? 'Myo Sets' : 'Session';
  const setNumber = (data.myoSets?.length || 0) + (d.myoState === 'active' || d.myoState === 'record' ? 1 : 0);
  return `<div class="card"><div class="title" style="font-size:24px">Session Progress</div>
    <div class="progress-list">
      <div class="progress-item"><span>Exercise</span><span class="metric">${d.exerciseName}</span></div>
      <div class="progress-item"><span>Side</span><span class="metric">${d.exerciseType==='unilateral' ? sidePretty(d.currentSide || d.weakerLeg || 'left') : 'Both legs'}</span></div>
      <div class="progress-item"><span>Phase</span><span class="metric">${phase}</span></div>
      <div class="progress-item"><span>Myo set number</span><span class="metric">${Math.max(1,setNumber)}</span></div>
      <div class="progress-item"><span>Target reps</span><span class="metric">${data.myoTarget || '-'}</span></div>
      <div class="progress-item"><span>Strikes</span><span class="metric">${data.strikes || 0}/2</span></div>
    </div>
  </div>`;
}
function symmetryMarkup(left,right){
  const total = Math.max(0.0001, left + right);
  const leftPct = Math.round((left/total) * 50);
  const rightPct = Math.round((right/total) * 50);
  return `<div class="symmetry-wrap"><div class="symmetry-labels"><span>Left</span><span>50/50</span><span>Right</span></div>
    <div class="symmetry-bar"><div class="symmetry-fill-left" style="width:${leftPct}%"></div><div class="symmetry-fill-right" style="width:${rightPct}%"></div><div class="symmetry-mid"></div></div></div>`;
}

const CALIBRATION_SAMPLES = 12;
const MIN_REP_GAP_MS = 800;
const TROUGH_FACTOR = 0.94;
const ADAPTIVE_RATE = 0.03;
function peakFactor(){
  const sensitivity = state.user?.sensorSensitivity || 'normal';
  if (sensitivity === 'high') return 1.19;
  if (sensitivity === 'low') return 1.30;
  return 1.24;
}
function requestMotionAccessIfNeeded(){
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    return DeviceMotionEvent.requestPermission().then(result => {
      state.motionEnabled = result === 'granted';
      return state.motionEnabled;
    }).catch(() => false);
  }
  state.motionEnabled = true;
  return Promise.resolve(true);
}
function resetMotionCycle(){
  const d = activeSessionData();
  if (!d) return;
  d.calibSamples = [];
  d.baseline = 9.8;
  d.dynThreshold = 13;
  d.inPeak = false;
  d.lastPeakTime = 0;
  d.detectedReps = 0;
}
function updateLiveRepDisplay(){
  const d = activeSessionData();
  const el = document.getElementById('live-reps');
  if (el && d) el.textContent = String(d.detectedReps || 0);
}
function onMotion(e){
  const d = activeSessionData();
  if (!d) return;
  const active = state.view === 'anchor' ? !!state.draft.anchorRunning : (state.view === 'myo' && state.draft.myoState === 'active');
  if (!active) return;
  const a = e.accelerationIncludingGravity || e.acceleration;
  if (!a) return;
  const x = a.x || 0, y = a.y || 0, z = a.z || 0;
  const mag = Math.sqrt(x*x + y*y + z*z);
  const now = Date.now();
  if (!d.calibSamples || d.calibSamples.length < CALIBRATION_SAMPLES) {
    d.calibSamples = d.calibSamples || [];
    d.calibSamples.push(mag);
    if (d.calibSamples.length >= CALIBRATION_SAMPLES) {
      d.baseline = d.calibSamples.reduce((a,b)=>a+b,0) / d.calibSamples.length;
      d.dynThreshold = d.baseline * peakFactor();
    }
    return;
  }
  if (!d.inPeak && mag > d.dynThreshold) {
    if (now - (d.lastPeakTime || 0) > MIN_REP_GAP_MS) {
      d.inPeak = true;
      d.lastPeakTime = now;
    }
  } else if (d.inPeak && mag < d.baseline * TROUGH_FACTOR) {
    d.inPeak = false;
    d.detectedReps = (d.detectedReps || 0) + 1;
    updateLiveRepDisplay();
    maybeAutoStopAtMirroredTarget();
  }
  d.baseline = d.baseline * (1 - ADAPTIVE_RATE) + mag * ADAPTIVE_RATE;
  d.dynThreshold = d.baseline * peakFactor();
}
function attachMotionListener(){ window.removeEventListener('devicemotion', onMotion); window.addEventListener('devicemotion', onMotion); }
function detachMotionListener(){ window.removeEventListener('devicemotion', onMotion); }

function render(){
  if (state.draft && ['sessionSetup','sensorCheck','anchor','rest','myo','summary','sideTransition'].includes(state.view)) state.draft.resumeView = state.view;
  saveState();
  if (state.view==='onboarding') return renderOnboarding();
  if (state.view==='settings') return renderSettings();
  if (state.view==='home') return renderHome();
  if (state.view==='select') return renderSelect();
  if (state.view==='sessionSetup') return renderSessionSetup();
  if (state.view==='sensorCheck') return renderSensorCheck();
  if (state.view==='anchor') return renderAnchor();
  if (state.view==='rest') return renderRest();
  if (state.view==='myo') return renderMyo();
  if (state.view==='sideTransition') return renderSideTransition();
  if (state.view==='summary') return renderSummary();
  if (state.view==='history') return renderHistory();
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
        <label>Sensor sensitivity<select id="sensorSensitivity"><option value="normal" ${(state.user.sensorSensitivity||'high')==='normal'?'selected':''}>Normal</option><option value="high" ${(state.user.sensorSensitivity||'high')==='high'?'selected':''}>High</option><option value="low" ${(state.user.sensorSensitivity||'high')==='low'?'selected':''}>Low</option></select></label>
      </div>
    </div>
    <div class="card"><div class="title" style="font-size:24px">Sensor calibration</div><p class="subtitle">Run a quick check on this phone so the app knows the motion sensor is available. Your sensitivity choice is saved for this device.</p>
      <div class="status-row"><div class="status-chip">Sensitivity: ${(state.user.sensorSensitivity||'high').toUpperCase()}</div><div class="status-chip">${state.user.sensorReady ? 'Sensor ready' : 'Sensor not checked yet'}</div></div>
      <div class="footer-actions" style="margin-top:14px"><button class="btn secondary full" data-action="run-sensor-check-from-settings">Run sensor check</button></div>
    </div>
    <div class="footer-actions"><button class="btn primary full" data-action="save-settings">Save and Continue</button></div>
  </div>`;
}
function renderHome(){
  const ex = currentExercise();
  const avg = last7DayAverage(ex.id).toFixed(1);
  const last = (lastExerciseSession(ex.id)?.ds || 0).toFixed(1);
  const hasDraft = !!state.draft;
  app.innerHTML = `<div class="screen">
    <div class="topnav"><div class="tag">Squat Tribe</div><button class="btn secondary" data-action="open-settings">Profile</button></div>
    ${state.redFlag?'<div class="notice red"><strong>Recovery Mission</strong><div class="small" style="margin-top:8px">Recent Density Scores have been low for three consecutive sessions. Use today for mobility, isometric holds, or light technique work.</div></div>':''}
    <div class="card"><div class="title">Pentagon Protocol</div><p class="subtitle">Current programmed exercise: <strong>${ex.name}</strong></p><div class="pent-wrap">${pentagonSVG()}</div></div>
    <div class="exercise-card"><img src="${ex.image}" alt="${ex.name}"><div><div class="exercise-name">${ex.name}</div><div class="exercise-meta">${ex.type==='unilateral'?'Unilateral · choose your weaker leg first':'Bilateral'}</div></div></div>
    <div class="grid two"><div class="kpi"><div class="label">7-day average</div><div class="value">${avg}</div></div><div class="kpi"><div class="label">Last DS</div><div class="value">${last}</div></div></div>
    ${hasDraft?`<div class="card"><div class="title" style="font-size:24px">Resume previous session?</div><p class="subtitle">You have an in-progress ${state.draft.exerciseName} session.</p><div class="resume-actions"><button class="btn primary full" data-action="resume-session">Resume session</button><button class="btn secondary full" data-action="discard-session">Discard session</button></div></div>`:''}
    <div class="install-box help"><strong>${state.installAvailable ? 'Install ready' : 'Install help'}</strong>
      ${state.installHelpOpen || !state.installAvailable ? `<ol class="install-help-list"><li>Open this page once in Chrome.</li><li>Refresh once.</li><li>Tap Install App below, or open the Chrome menu and choose Add to Home screen or Install app.</li></ol>` : '<div style="margin-top:8px">Tap Install App below.</div>'}
    </div>
    <div class="footer-actions">
      <button class="btn primary full" data-action="continue-pentagon">Continue Pentagon Protocol</button>
      <button class="btn secondary full" data-action="individual-home">Select Individual Exercise</button>
      <button class="btn secondary full" data-action="install-app">Install App</button>
      <button class="btn secondary full" data-action="view-history">History</button>
    </div>
  </div>`;
}
function renderSelect(){
  app.innerHTML = `<div class="screen">${nav('Choose Exercise')}
    ${EXERCISES.map(ex=>`<button class="exercise-card" data-action="pick-exercise" data-id="${ex.id}"><img src="${ex.image}" alt="${ex.name}"><div><div class="exercise-name">${ex.name}</div><div class="exercise-meta">${ex.type==='unilateral'?'Unilateral':'Bilateral'}</div></div></button>`).join('')}
  </div>`;
}
function openSession(id){
  const ex = id ? EXERCISES.find(e=>e.id===id) : currentExercise();
  state.draft = {
    exerciseId: ex.id, exerciseName: ex.name, exerciseType: ex.type, coefficient: ex.coefficient,
    externalLoad: Number(state.user.defaultLoad||0), weakerLeg:'',
    anchorTime:0, anchorReps:0, myoTarget:0, myoSets:[], myoSetTimes:[], strikes:0,
    totalActiveTime:0, currentSide:'', sideOrder:[], sides: { left: makeSideData(), right: makeSideData() },
    autoEnded:false, sideTransition:false, restRemaining:0, restType:'anchor', myoState:'ready', myoCurrentTime:0, anchorRunning:false,
    sideTransitionSummary:null, mirroredPlan:null,
  };
  state.view = 'sessionSetup';
  render();
}
function renderSessionSetup(){
  const d = state.draft; const ex = EXERCISES.find(e=>e.id===d.exerciseId);
  const unilateralFirst = d.exerciseType==='unilateral' && !d.currentSide;
  const unilateralSecond = d.exerciseType==='unilateral' && !!d.currentSide && d.sideTransition;
  app.innerHTML = `<div class="screen">${nav('Session Setup')}
    <div class="exercise-card"><img src="${ex.image}" alt="${ex.name}"><div><div class="exercise-name">${ex.name}</div><div class="exercise-meta">${unilateralFirst?'Choose your weaker leg before you begin.': unilateralSecond?`${sidePretty(d.currentSide)} selected automatically. The app will mirror the weaker leg set and rep structure for this side.`:'Ready to begin the Anchor Set.'}</div></div></div>
    <div class="card"><div class="title">Load and setup</div>
      <div class="grid" style="margin-top:14px">
        <label>External load (kg)<input id="session-load" type="number" min="0" max="300" step="0.5" value="${unilateralSecond ? d.sides[d.currentSide].externalLoad : d.externalLoad}" ${unilateralSecond?'readonly':''}></label>
        ${unilateralFirst?`<label>Choose your weaker leg<select id="weaker-leg"><option value="">Select</option><option value="left">Left</option><option value="right">Right</option></select></label><div class="small">The app will run your weaker leg first, complete the full Anchor / Rest / Myo sequence, then auto-select the opposite leg.</div>`:''}
        ${unilateralSecond?`<div class="small">Matched target for ${sidePretty(d.currentSide).toLowerCase()}: Anchor ${d.mirroredPlan?.anchorReps || 0} reps, then Myo sets ${((d.mirroredPlan?.myoSets)||[]).join(' / ')} reps. Only completion time can vary.</div>`:''}
      </div>
    </div>
    <div class="card"><div class="title" style="font-size:24px">Sensor check</div><p class="subtitle">Run a quick sensor check before the set if you want to confirm this phone is counting reps correctly.</p><div class="status-row"><div class="status-chip">Sensitivity: ${(state.user.sensorSensitivity||'high').toUpperCase()}</div><div class="status-chip">${state.user.sensorReady ? 'Sensor ready' : 'Not checked this session'}</div></div><div class="footer-actions" style="margin-top:14px"><button class="btn secondary full" data-action="go-sensor-check">Sensor check</button></div></div>
    <div class="footer-actions"><button class="btn primary full" data-action="confirm-setup">${d.exerciseType==='unilateral'?'Continue':'Start Anchor'}</button></div>
  </div>`;
}
function renderSensorCheck(){
  const d = state.draft;
  const title = d ? d.exerciseName : 'Sensor check';
  app.innerHTML = `<div class="screen">${nav('Sensor Check')}
    <div class="card"><div class="title">Calibrate your sensor</div><p class="subtitle">Hold the phone still in both hands for a moment, then make one or two gentle squat motions. This check helps confirm the phone is seeing motion input correctly.</p>
      <div class="sensor-live"><div><div class="small">Status</div><div class="metric">${state.user.sensorReady ? 'Ready' : 'Waiting'}</div></div><div class="sensor-dot"></div></div>
      <div class="small" style="margin-top:12px">Sensitivity saved for this device: ${(state.user.sensorSensitivity||'high').toUpperCase()}</div>
      <div class="footer-actions" style="margin-top:14px"><button class="btn primary full" data-action="run-sensor-check">Run sensor check</button><button class="btn secondary full" data-action="finish-sensor-check">Back to setup</button></div>
    </div>
  </div>`;
}
function renderAnchor(){
  const d = state.draft; const unilateral = d.exerciseType === 'unilateral'; const sideData = unilateral ? currentSideData() : d;
  const heading = unilateral ? `${d.exerciseName} · ${sidePretty(d.currentSide)}` : d.exerciseName;
  const mirrored = isMirroredSecondLeg();
  const anchorTarget = mirrored ? (d.mirroredPlan?.anchorReps || 0) : null;
  const note = unilateral ? (mirrored ? `Complete ${anchorTarget} Anchor reps for the ${sidePretty(d.currentSide).toLowerCase()}. The app will match the weaker leg rep target and auto-stop when you reach it.` : `Start your Anchor Set for the ${sidePretty(d.currentSide).toLowerCase()}. Hold the phone in both hands for auto rep counting.`) : 'Perform your Anchor Set and stop when you reach your honest limit with good form. Hold the phone in both hands for auto rep counting.';
  app.innerHTML = `<div class="screen">${nav('Anchor Set')}
    <div class="card center-text"><div class="title">${heading}</div><p class="subtitle">${note}</p></div>
    ${makeProgressCard()}
    <div class="card center-text"><div class="small">Anchor duration</div><div class="metric big-metric">${formatTime(sideData.anchorTime)}</div>
      <div class="live-count"><div class="small">Live rep count</div><div id="live-reps" class="metric value">${sideData.detectedReps || 0}</div></div>
      <div class="sensor-note small">${state.motionEnabled ? 'Sensor armed.' : 'Sensor access will be requested when you start.'}</div>
      <div class="footer-actions" style="margin-top:14px">${d.anchorRunning?'<button class="btn secondary full" data-action="anchor-stop-clock">Stop exercise</button>':'<button class="btn primary full" data-action="anchor-start-clock">Start anchor exercise</button>'}</div>
    </div>
    <div class="card"><div class="title" style="font-size:24px">Record reps</div>
      <label style="display:block;margin-top:12px">Anchor reps<input id="anchor-reps" type="number" min="0" step="1" value="${mirrored ? anchorTarget : (sideData.anchorReps || sideData.detectedReps || '')}" ${mirrored?'readonly':''}></label>
      ${mirrored ? `<div class="small" style="margin-top:10px">Anchor reps are locked to match the weaker leg. Only completion time can differ for this side.</div>` : `<div class="adjust-row"><button class="btn secondary mini-btn" data-action="anchor-minus">−</button><div class="small center-text">Use these buttons to correct the rep total if needed.</div><button class="btn secondary mini-btn" data-action="anchor-plus">+</button></div>`}
    </div>
    <div class="footer-actions"><button class="btn primary full" data-action="finish-anchor">Stop exercise and record reps</button></div>
  </div>`;
}
function renderRest(){
  const d = state.draft; const sideText = d.exerciseType==='unilateral' ? ` for the ${sidePretty(d.currentSide).toLowerCase()}` : ''; const target = activeSessionData()?.myoTarget || 0;
  const subtitle = d.restType === 'anchor' ? `Rest for the same amount of time as the Anchor Set${sideText}. Your first Myo set target will be ${target} reps.` : `15 second breath timer${sideText}. Your next Myo set target is ${target} reps.`;
  app.innerHTML = `<div class="screen center">${nav(d.restType === 'anchor' ? 'Adaptive Rest' : 'Breath Timer')}
    ${makeProgressCard()}
    <div class="card center-text"><div class="title">${d.restType === 'anchor' ? 'Rest' : 'Breathe'}</div><p class="subtitle">${subtitle}</p></div>
    <div class="timer-circle"><div class="center-text"><div class="small">Remaining</div><div class="metric big-metric">${formatTime(Math.max(0,d.restRemaining||0))}</div></div></div>
    <div class="card center-text"><div class="small">Myo target</div><div class="metric" style="font-size:30px">${target} reps</div></div>
    <div class="footer-actions"><button class="btn secondary full" data-action="skip-rest">Skip Rest</button></div>
  </div>`;
}
function renderMyo(){
  const d = state.draft; const unilateral = d.exerciseType === 'unilateral'; const data = activeSessionData();
  const mirrored = isMirroredSecondLeg(); const mirroredTarget = currentMirroredMyoTarget();
  const displayTarget = mirrored && mirroredTarget != null ? mirroredTarget : data.myoTarget;
  const color = data.strikes >= 1 ? 'var(--red)' : 'var(--gold)'; const scope = unilateral ? sidePretty(d.currentSide) : 'Current session';
  const title = unilateral ? `${d.exerciseName} · ${sidePretty(d.currentSide)} Myo` : 'Myo Sets'; const phase = d.myoState || 'ready';
  let phaseCard = ''; let actions = '';
  if (phase === 'ready') {
    phaseCard = `<div class="card center-text"><div class="title" style="font-size:26px">Ready for the next Myo set</div><p class="subtitle">${mirrored ? `This side must match the weaker leg with ${displayTarget} reps for this set.` : `Target ${displayTarget} reps. Tap start when you are ready to begin.`}</p></div>`;
    actions = `<button class="btn primary full" data-action="start-myo-set">${data.myoSets.length===0?'Start 1st Myo Set':'Start Next Myo Set'}</button>${mirrored?'':`<button class="btn secondary full" data-action="done-session">${unilateral?'Finish this leg':'I’m Done'}</button>`}`;
  } else if (phase === 'active') {
    phaseCard = `<div class="card center-text"><div class="title" style="font-size:26px">Myo set in progress</div><div class="small" style="margin-top:10px">Set timer</div><div class="metric big-metric">${formatTime(data.myoCurrentTime)}</div><div class="live-count"><div class="small">Live rep count</div><div id="live-reps" class="metric value">${data.detectedReps || 0}</div></div><div class="small sensor-note">${mirrored ? `Auto counting is active. The set will stop when you reach ${displayTarget} reps.` : 'Auto counting is active while you hold the phone in both hands.'}</div></div>`;
    actions = `<button class="btn primary full" data-action="stop-myo-set">Stop Myo Set</button>${mirrored?'':`<button class="btn secondary full" data-action="done-session">${unilateral?'Finish this leg':'I’m Done'}</button>`}`;
  } else {
    phaseCard = `<div class="card"><div class="title" style="font-size:26px">Record Myo reps</div><p class="subtitle">${mirrored ? 'The rep target is locked to match the weaker leg. Record the set time and continue.' : 'The set has been timed. Record the reps you completed for this Myo set.'}</p><label style="display:block;margin-top:12px">Completed reps<input id="myo-reps" type="number" min="0" step="1" value="${mirrored ? displayTarget : (data.lastDetectedReps || data.detectedReps || '')}" ${mirrored?'readonly':''}></label><div class="small" style="margin-top:10px">Set duration: ${formatTime(data.myoCurrentTime)}</div>${mirrored ? '' : `<div class="adjust-row"><button class="btn secondary mini-btn" data-action="myo-minus">−</button><div class="small center-text">Use these buttons to correct the rep total if needed.</div><button class="btn secondary mini-btn" data-action="myo-plus">+</button></div>`}</div>`;
    actions = `<button class="btn primary full" data-action="log-myo">Record reps</button>${mirrored?'':`<button class="btn secondary full" data-action="done-session">${unilateral?'Finish this leg':'I’m Done'}</button>`}`;
  }
  app.innerHTML = `<div class="screen">${nav('Myo Sets')}
    <div class="card"><div class="title">${title}</div><p class="subtitle">${unilateral ? `Complete the Myo sets for the ${sidePretty(d.currentSide).toLowerCase()}. When this side is finished, the app will move to the opposite leg automatically.` : 'After each Myo set the app times a 15 second breath period, then prompts the next set until you finish.'}</p></div>
    ${makeProgressCard()}
    <div class="card"><div class="row between"><div><div class="small">Target reps</div><div class="metric" style="font-size:22px">${displayTarget}</div></div><div class="tag">15s breath timer between sets</div></div>
      <div class="row between" style="margin-top:14px"><div><div class="small">Strike status</div><div class="metric" style="font-size:22px">${data.strikes}/2</div></div><div class="small">${scope}</div></div>
      <div style="height:12px;border-radius:999px;background:#1d1d1d;margin-top:14px;overflow:hidden"><div style="width:${data.strikes===0?40:85}%;height:100%;background:${color}"></div></div>
      <div class="small" style="margin-top:10px">Completed Myo sets: ${data.myoSets.length}</div>
    </div>
    ${phaseCard}
    <div class="footer-actions">${actions}</div>
  </div>`;
}
function renderSideTransition(){
  const d = state.draft; const s = d.sideTransitionSummary || {}; const nextSide = d.currentSide;
  app.innerHTML = `<div class="screen">${nav('Leg Transition')}
    <div class="card transition-card"><div class="title">${sidePretty(s.completedSide || 'left')} complete</div><p class="subtitle">The weaker side sequence is finished. Review the first-leg density score, then continue to the opposite leg.</p>
      <div class="grid two" style="margin-top:14px"><div class="kpi"><div class="label">First-leg DS</div><div class="value">${(s.ds||0).toFixed(1)}</div></div><div class="kpi"><div class="label">Total reps</div><div class="value">${s.totalReps || 0}</div></div></div>
      <div class="small" style="margin-top:12px">The app will now run the full Anchor / Rest / Myo sequence for the ${sidePretty(nextSide).toLowerCase()}, matching the weaker leg exactly: Anchor ${s.anchorReps || 0} reps, then Myo sets ${((s.myoSets)||[]).join(' / ')} reps. Only completion time can differ.</div>
    </div>
    <div class="footer-actions"><button class="btn primary full" data-action="continue-opposite-leg">Continue to ${sidePretty(nextSide)}</button></div>
  </div>`;
}
function formatTime(s){ const m=Math.floor(s/60); const ss=String(Math.max(0,s%60)).padStart(2,'0'); return `${m}:${ss}`; }
function startAnchorTicker(){
  clearInterval(anchorTimer);
  const data = activeSessionData(); resetMotionCycle(); if (data) data.anchorReps = 0;
  attachMotionListener();
  anchorTimer = setInterval(()=>{ if (state.view !== 'anchor') return; if (state.draft.exerciseType === 'unilateral') currentSideData().anchorTime += 1; else state.draft.anchorTime += 1; render(); },1000);
}
function stopAnchorTimer(){ clearInterval(anchorTimer); detachMotionListener(); const data = activeSessionData(); if (data) data.anchorReps = data.detectedReps || data.anchorReps || 0; if (state.draft) state.draft.anchorRunning = false; }
function startMyoTicker(){ clearInterval(myoTimer); const data = activeSessionData(); data.myoCurrentTime = 0; data.lastDetectedReps = 0; resetMotionCycle(); attachMotionListener(); myoTimer = setInterval(()=>{ if (state.view !== 'myo' || state.draft.myoState !== 'active') return; activeSessionData().myoCurrentTime += 1; render(); },1000); }
function stopMyoTicker(){ clearInterval(myoTimer); const data = activeSessionData(); if (data) data.lastDetectedReps = data.detectedReps || 0; detachMotionListener(); }
function adjustInput(id, delta){ const el = document.getElementById(id); if (!el) return; el.value = Math.max(0, Number(el.value || 0) + delta); }
function finishAnchor(){
  stopAnchorTimer(); const data = activeSessionData();
  const mirrored = isMirroredSecondLeg();
  const targetAnchor = mirrored ? (state.draft.mirroredPlan?.anchorReps || 0) : 0;
  const enteredReps = Number(document.getElementById('anchor-reps')?.value || data.detectedReps || 0);
  if (mirrored && (data.detectedReps || enteredReps) < targetAnchor) return alert(`Complete ${targetAnchor} Anchor reps for this side before continuing.`);
  data.anchorReps = mirrored ? targetAnchor : enteredReps;
  if (!data.anchorReps) return alert('Please record your Anchor reps.');
  if (!data.anchorTime) data.anchorTime = 30;
  data.totalActiveTime = data.anchorTime;
  data.myoTarget = mirrored ? ((state.draft.mirroredPlan?.myoSets?.[0]) || Math.max(3, Math.round(data.anchorReps * 0.25))) : Math.max(3, Math.round(data.anchorReps * 0.25));
  state.draft.myoState = 'ready'; startRest(data.anchorTime, 'anchor');
}
function startUnilateralFirstLeg(){ const d = state.draft; d.sideOrder = d.weakerLeg === 'left' ? ['left','right'] : ['right','left']; d.currentSide = d.sideOrder[0]; d.sideTransition = false; d.sides[d.currentSide].externalLoad = d.externalLoad; state.view = 'anchor'; render(); }
function startSecondLegSetup(){ const d = state.draft; d.currentSide = d.sideOrder[1]; d.sideTransition = true; d.myoState = 'ready'; d.sides[d.currentSide].externalLoad = d.sides[d.sideOrder[0]].externalLoad; state.view = 'sessionSetup'; render(); }
function computeSingleSideMetrics(d, side){
  const sd = d.sides[side]; const effectiveLoad = Number(sd.externalLoad) + Number(state.user.bodyweight || 0) * d.coefficient;
  sd.totalReps = sd.anchorReps + sd.myoSets.reduce((a,b)=>a+b,0);
  sd.mls = effectiveLoad * sd.totalReps; sd.ds = sd.totalActiveTime > 0 ? sd.mls / sd.totalActiveTime : 0; sd.effectiveLoad = effectiveLoad; return sd;
}
function completeCurrentSide(autoEnded){
  const d = state.draft; const completedSide = d.currentSide; const sideData = computeSingleSideMetrics(d, completedSide); sideData.autoEnded = autoEnded;
  if (d.currentSide === d.sideOrder[0]) {
    d.mirroredPlan = { anchorReps: sideData.anchorReps, myoSets: [...sideData.myoSets], externalLoad: sideData.externalLoad };
    d.sideTransitionSummary = { completedSide, ds: sideData.ds, totalReps: sideData.totalReps, anchorReps: sideData.anchorReps, myoSets: [...sideData.myoSets] };
    d.currentSide = d.sideOrder[1]; d.sideTransition = true; d.myoState = 'ready';
    try { navigator.vibrate?.([80,40,80]); } catch {}
    state.view = 'sideTransition';
    return render();
  }
  return prepareSummary(autoEnded);
}
function startRest(seconds, type='breath'){
  clearInterval(restTimer); stopMyoTicker(); state.draft.restRemaining = seconds; state.draft.restType = type; state.view = 'rest';
  restTimer = setInterval(()=>{ state.draft.restRemaining -= 1; if (state.draft.restRemaining <= 0) { clearInterval(restTimer); try { navigator.vibrate?.([90,40,90]); } catch {} state.draft.myoState = 'ready'; state.view = 'myo'; } render(); },1000);
  render();
}
function startMyoSet(){ const data = activeSessionData(); const mt = currentMirroredMyoTarget(); if (mt != null) data.myoTarget = mt; state.draft.myoState = 'active'; startMyoTicker(); render(); }
function stopMyoSet(){ stopMyoTicker(); const data = activeSessionData(); if (!data.myoCurrentTime) data.myoCurrentTime = 10; state.draft.myoState = 'record'; render(); }
function logMyoSet(){
  const d = state.draft; const data = activeSessionData();
  const mirrored = isMirroredSecondLeg();
  const target = mirrored ? currentMirroredMyoTarget() : null;
  const reps = mirrored ? Number(target || 0) : Number(document.getElementById('myo-reps')?.value || data.lastDetectedReps || data.detectedReps || 0);
  if (mirrored && (data.lastDetectedReps || data.detectedReps || 0) < reps) return alert(`Complete ${reps} reps for this Myo set before continuing.`);
  data.myoSets.push(reps); data.myoSetTimes.push(Math.max(1, data.myoCurrentTime || 0)); data.totalActiveTime += Math.max(1, data.myoCurrentTime || 0); data.myoCurrentTime = 0;
  if (mirrored) {
    data.myoTarget = currentMirroredMyoTarget() || data.myoTarget;
    if (data.myoSets.length >= (d.mirroredPlan?.myoSets?.length || 0)) return completeCurrentSide(false);
    d.myoState = 'ready';
    return startRest(15, 'breath');
  }
  if (reps < data.myoTarget) data.strikes += 1; else data.strikes = 0;
  if (data.strikes >= 2) return d.exerciseType === 'unilateral' ? completeCurrentSide(true) : prepareSummary(true);
  d.myoState = 'ready'; return startRest(15, 'breath');
}
function effectiveLoadForSide(d, side){ return Number(d.sides[side].externalLoad) + Number(state.user.bodyweight || 0) * d.coefficient; }
function effectiveLoadForDraft(d){ return Number(d.externalLoad) + Number(state.user.bodyweight || 0) * d.coefficient; }
function prepareSummary(autoEnded){ clearInterval(restTimer); stopAnchorTimer(); stopMyoTicker(); state.draft.autoEnded = autoEnded; state.view = 'summary'; render(); }
function unilateralMetrics(d){
  ['left','right'].forEach(side => { const sd = d.sides[side]; const effectiveLoad = effectiveLoadForSide(d, side); sd.totalReps = sd.anchorReps + sd.myoSets.reduce((a,b)=>a+b,0); sd.mls = effectiveLoad * sd.totalReps; sd.ds = sd.totalActiveTime > 0 ? sd.mls / sd.totalActiveTime : 0; sd.effectiveLoad = effectiveLoad; });
  d.leftDS = d.sides.left.ds; d.rightDS = d.sides.right.ds; d.leftTotalReps = d.sides.left.totalReps; d.rightTotalReps = d.sides.right.totalReps;
  d.totalReps = d.leftTotalReps + d.rightTotalReps; d.totalActiveTime = d.sides.left.totalActiveTime + d.sides.right.totalActiveTime; d.totalMLS = d.sides.left.mls + d.sides.right.mls;
  d.ds = d.totalActiveTime > 0 ? d.totalMLS / d.totalActiveTime : 0; d.mls = d.totalMLS; d.balanceDifference = Math.max(d.leftDS, d.rightDS) > 0 ? Math.abs(d.leftDS - d.rightDS) / Math.max(d.leftDS, d.rightDS) * 100 : 0; d.leadingSide = d.leftDS === d.rightDS ? 'Even' : (d.leftDS > d.rightDS ? 'Left' : 'Right');
}
function renderSummary(){
  const d = state.draft;
  if (d.exerciseType === 'unilateral') { unilateralMetrics(d); app.innerHTML = `<div class="screen">${nav('Summary')}
      <div class="card"><div class="title">Unilateral session complete</div><p class="subtitle">Both legs have completed their own Anchor / Rest / Myo sequence. Total Density Score is shown for the full exercise and for each leg.</p></div>
      <div class="grid two"><div class="kpi"><div class="label">Total DS</div><div class="value">${d.ds.toFixed(1)}</div></div><div class="kpi"><div class="label">Difference</div><div class="value">${d.balanceDifference.toFixed(1)}%</div></div><div class="kpi"><div class="label">Left DS</div><div class="value">${d.leftDS.toFixed(1)}</div></div><div class="kpi"><div class="label">Right DS</div><div class="value">${d.rightDS.toFixed(1)}</div></div></div>
      <div class="card"><div class="title" style="font-size:22px">Left / right comparison</div>${symmetryMarkup(d.leftDS, d.rightDS)}
        <div class="row between" style="margin-top:14px"><span>Left total reps / active time</span><span class="metric">${d.leftTotalReps} / ${formatTime(d.sides.left.totalActiveTime)}</span></div>
        <div class="row between" style="margin-top:10px"><span>Right total reps / active time</span><span class="metric">${d.rightTotalReps} / ${formatTime(d.sides.right.totalActiveTime)}</span></div>
        <div class="row between" style="margin-top:10px"><span>Higher density side</span><span class="metric">${d.leadingSide}</span></div>
      </div>
      <div class="footer-actions"><button class="btn primary full" data-action="log-session">Log Session</button></div>
    </div>`; return; }
  const effectiveLoad = effectiveLoadForDraft(d); const totalReps = d.anchorReps + d.myoSets.reduce((a,b)=>a+b,0); const mls = effectiveLoad * totalReps; const ds = d.totalActiveTime > 0 ? mls / d.totalActiveTime : 0;
  d.effectiveLoad = effectiveLoad; d.totalReps = totalReps; d.mls = mls; d.ds = ds;
  app.innerHTML = `<div class="screen">${nav('Summary')}
    <div class="card"><div class="title">Session complete</div><p class="subtitle">${d.autoEnded?'The session ended because two Myo sets fell below target.':'You ended the session.'}</p></div>
    <div class="grid two"><div class="kpi"><div class="label">Anchor reps</div><div class="value">${d.anchorReps}</div></div><div class="kpi"><div class="label">Myo total</div><div class="value">${d.myoSets.reduce((a,b)=>a+b,0)}</div></div><div class="kpi"><div class="label">MLS</div><div class="value">${mls.toFixed(1)}</div></div><div class="kpi"><div class="label">DS</div><div class="value">${ds.toFixed(1)}</div></div></div>
    <div class="card"><div class="row between"><span>Active time</span><span class="metric">${formatTime(d.totalActiveTime)}</span></div><div class="row between" style="margin-top:10px"><span>Myo sets completed</span><span class="metric">${d.myoSets.length}</span></div></div>
    <div class="footer-actions"><button class="btn primary full" data-action="log-session">Log Session</button></div>
  </div>`;
}
function logSession(){
  const d = state.draft; if (d.exerciseType === 'unilateral') unilateralMetrics(d);
  const persistedTotalDS = Number.isFinite(Number(d.totalDS)) && Number(d.totalDS) > 0 ? Number(d.totalDS) : Number(d.ds || 0);
  state.sessions.push(normalizeSession({ id:`${Date.now()}-${Math.random().toString(36).slice(2,7)}`, date:new Date().toISOString(), exerciseId:d.exerciseId, exerciseName:d.exerciseName, exerciseType:d.exerciseType, ds:persistedTotalDS, totalDS:persistedTotalDS, mls:d.mls, anchorReps:d.anchorReps, myoSets:d.myoSets, externalLoad:d.externalLoad, bodyweight:Number(state.user.bodyweight || 0), totalActiveTime:d.totalActiveTime, totalReps:d.totalReps, leftDS:d.leftDS ?? null, rightDS:d.rightDS ?? null, balanceDifference:d.balanceDifference ?? null, leftTotalReps:d.leftTotalReps ?? null, rightTotalReps:d.rightTotalReps ?? null }));
  updateRedFlag(d.exerciseId); if (state.rotationMode === 'fixed') state.pointer = (state.pointer + 1) % EXERCISES.length; state.draft = null; try { navigator.vibrate?.(200); } catch {} state.view = 'home'; render();
}
function updateRedFlag(id){ const related = state.sessions.filter(s=>s.exerciseId===id).map(normalizeSession).slice(-7); if (related.length < 3) { state.redFlag = false; return; } const last3 = related.slice(-3); const avg = related.reduce((a,b)=>a+b.ds,0) / related.length; state.redFlag = last3.every(s=>s.ds < avg * 0.8); }
function renderHistory(){
  const rows = [...state.sessions].reverse().map(raw => {
    const s = normalizeSession(raw);
    const unilateral = s.exerciseType === 'unilateral' || (s.leftDS != null || s.rightDS != null);
    const dsValue = Number(s.ds) || 0;
    const comparison = unilateral ? `
      <div class="small">Left DS ${Number(s.leftDS||0).toFixed(1)} · Right DS ${Number(s.rightDS||0).toFixed(1)}</div>
      <div class="small">Side diff ${Number(s.balanceDifference||0).toFixed(1)}%</div>
      ${symmetryMarkup(Number(s.leftDS||0), Number(s.rightDS||0))}` : '';
    return `<div class="history-row ${state.historyEdit?'checkbox-row':''}">${state.historyEdit?`<input type="checkbox" data-session-id="${s.id}" ${state.historySelected.includes(s.id)?'checked':''}>`:''}<div style="flex:1"><div>${s.exerciseName}</div><div class="small">${new Date(s.date).toLocaleString()}</div>${comparison}</div><div class="metric">DS ${dsValue.toFixed(1)}</div></div>`;
  }).join('') || '<div class="small">No sessions logged yet.</div>';
  app.innerHTML = `<div class="screen">${nav('History')}
    <div class="card history-toolbar"><div class="title">History</div><p class="subtitle">Review your previous sessions. You can clear the full history or delete selected entries.</p>
      <div class="history-actions"><button class="btn secondary full" data-action="toggle-history-edit">${state.historyEdit?'Done selecting':'Select entries'}</button><button class="btn secondary full" data-action="clear-history">Clear all history</button></div>
      ${state.historyEdit?'<button class="btn warn full" data-action="delete-selected">Delete selected</button>':''}
    </div>
    <div class="card">${rows}</div>
  </div>`;
}
function triggerInstall(){
  if (deferredInstallPrompt) return deferredInstallPrompt.prompt();
  state.installHelpOpen = true; render();
}
function runSensorCheck(callback){
  requestMotionAccessIfNeeded().then(ok=>{
    if (!ok) { alert('Motion access was not granted.'); return; }
    clearTimeout(sensorCheckTimer);
    state.user.sensorReady = false; render();
    sensorCheckTimer = setTimeout(()=>{ state.user.sensorReady = true; state.user.sensorCheckedAt = new Date().toISOString(); saveState(); if (callback) callback(); render(); }, 1800);
  });
}

app.addEventListener('change', (e)=>{
  const cb = e.target.closest('input[type="checkbox"][data-session-id]');
  if (!cb) return;
  const id = cb.dataset.sessionId;
  if (cb.checked) { if (!state.historySelected.includes(id)) state.historySelected.push(id); }
  else { state.historySelected = state.historySelected.filter(x=>x!==id); }
  saveState();
});
app.addEventListener('click', (e)=>{
  const target = e.target.closest('[data-action]');
  if (!target) return; const action = target.dataset.action;
  if (action === 'skip-onboarding') { state.onboarded = true; state.view = 'settings'; return render(); }
  if (action === 'onboard-next') { if (state.onboardingIndex < ONBOARDING.length-1) state.onboardingIndex += 1; else { state.onboarded = true; state.view = 'settings'; } return render(); }
  if (action === 'onboard-prev') { state.onboardingIndex = Math.max(0, state.onboardingIndex-1); return render(); }
  if (action === 'save-settings') { state.user.bodyweight = document.getElementById('bodyweight').value; state.user.defaultLoad = document.getElementById('defaultLoad').value || '0'; state.user.sensorSensitivity = document.getElementById('sensorSensitivity').value; state.rotationMode = document.getElementById('rotationMode').value; state.onboarded = true; state.view = 'home'; return render(); }
  if (action === 'open-settings') { state.view='settings'; return render(); }
  if (action === 'back') { if (['settings','select','history'].includes(state.view)) state.view='home'; else if (state.view==='sensorCheck') state.view='sessionSetup'; else if (state.view==='sideTransition') state.view='home'; else if (['sessionSetup','anchor','rest','myo','summary'].includes(state.view)) { clearInterval(restTimer); stopAnchorTimer(); stopMyoTicker(); state.view='home'; } return render(); }
  if (action === 'continue-pentagon') { state.rotationMode='fixed'; return openSession(); }
  if (action === 'individual-home') { state.rotationMode='individual'; state.view='select'; return render(); }
  if (action === 'resume-session') { state.view = state.draft?.resumeView || 'sessionSetup'; return render(); }
  if (action === 'discard-session') { state.draft = null; state.view='home'; return render(); }
  if (action === 'pick-exercise') { state.pointer = EXERCISES.findIndex(x=>x.id===target.dataset.id); return openSession(target.dataset.id); }
  if (action === 'confirm-setup') {
    const load = Number(document.getElementById('session-load').value || 0);
    if (state.draft.exerciseType === 'unilateral') {
      if (!state.draft.currentSide) { state.draft.externalLoad = load; state.draft.weakerLeg = document.getElementById('weaker-leg').value; if (!state.draft.weakerLeg) return alert('Please choose your weaker leg.'); return startUnilateralFirstLeg(); }
      state.draft.sides[state.draft.currentSide].externalLoad = load; state.draft.sideTransition = false; state.view = 'anchor'; return render();
    }
    state.draft.externalLoad = load; state.view='anchor'; return render();
  }
  if (action === 'go-sensor-check') { state.view='sensorCheck'; return render(); }
  if (action === 'run-sensor-check' || action === 'run-sensor-check-from-settings') { return runSensorCheck(); }
  if (action === 'finish-sensor-check') { state.view='sessionSetup'; return render(); }
  if (action === 'anchor-start-clock') { requestMotionAccessIfNeeded().then(()=>{ state.draft.anchorRunning = true; startAnchorTicker(); render(); }); return; }
  if (action === 'anchor-stop-clock') { stopAnchorTimer(); return render(); }
  if (action === 'anchor-plus') { adjustInput('anchor-reps',1); return; }
  if (action === 'anchor-minus') { adjustInput('anchor-reps',-1); return; }
  if (action === 'finish-anchor') return finishAnchor();
  if (action === 'skip-rest') { clearInterval(restTimer); state.draft.myoState='ready'; state.view='myo'; return render(); }
  if (action === 'start-myo-set') { requestMotionAccessIfNeeded().then(()=>startMyoSet()); return; }
  if (action === 'stop-myo-set') return stopMyoSet();
  if (action === 'myo-plus') { adjustInput('myo-reps',1); return; }
  if (action === 'myo-minus') { adjustInput('myo-reps',-1); return; }
  if (action === 'log-myo') return logMyoSet();
  if (action === 'done-session') { if (state.draft.exerciseType === 'unilateral') return completeCurrentSide(false); return prepareSummary(false); }
  if (action === 'continue-opposite-leg') { return startSecondLegSetup(); }
  if (action === 'log-session') return logSession();
  if (action === 'view-history') { state.view='history'; return render(); }
  if (action === 'toggle-history-edit') { state.historyEdit = !state.historyEdit; if (!state.historyEdit) state.historySelected = []; return render(); }
  if (action === 'clear-history') { if (confirm('Clear all session history?')) { state.sessions = []; state.historySelected = []; state.historyEdit = false; state.redFlag = false; } return render(); }
  if (action === 'delete-selected') { if (!state.historySelected.length) return alert('Select one or more entries first.'); if (confirm('Delete selected history entries?')) { state.sessions = state.sessions.filter(s=>!state.historySelected.includes(s.id)); state.historySelected = []; state.historyEdit = false; } return render(); }
  if (action === 'install-app') return triggerInstall();
});

window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredInstallPrompt = e; state.installAvailable = true; render(); });
window.addEventListener('appinstalled', ()=>{ deferredInstallPrompt = null; state.installAvailable = false; render(); });
if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) state.installAvailable = false;
if ('serviceWorker' in navigator) window.addEventListener('load', async ()=>{ try { await navigator.serviceWorker.register('./sw.js', { updateViaCache:'none' }); } catch {} });
render();
