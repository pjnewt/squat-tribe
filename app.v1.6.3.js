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

const defaultState = {
  onboarded: false,
  onboardingIndex: 0,
  user: { bodyweight:'', defaultLoad:'0' },
  rotationMode:'fixed',
  pointer:0,
  sessions:[],
  redFlag:false,
  installAvailable:false,
  view:'onboarding',
  draft:null,
  homeMode:'fixed',
  motionEnabled:false,
};

function loadState(){
  try { return {...defaultState, ...JSON.parse(localStorage.getItem('squatTribeV163')||'{}')}; }
  catch { return {...defaultState}; }
}
let state = loadState();
if (state.onboarded && state.view === 'onboarding') state.view = 'home';
if (state.draft && ['sessionSetup','anchor','rest','myo','summary'].includes(state.view)) state.view = 'home';

function saveState(){ localStorage.setItem('squatTribeV163', JSON.stringify(state)); }
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
function sidePretty(side){ return side === 'left' ? 'Left leg' : 'Right leg'; }
function makeSideData(){
  return { externalLoad:0, anchorTime:0, anchorReps:0, myoTarget:0, myoSets:[], myoSetTimes:[], strikes:0, totalActiveTime:0, totalReps:0, ds:0, mls:0, myoCurrentTime:0 };
}
function currentSideData(){ return state.draft?.sides?.[state.draft.currentSide]; }
function activeSessionData(){ return state.draft?.exerciseType === 'unilateral' ? currentSideData() : state.draft; }


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
  if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
    return DeviceMotionEvent.requestPermission().then(result => {
      state.motionEnabled = result === "granted";
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
  }

  d.baseline = d.baseline * (1 - ADAPTIVE_RATE) + mag * ADAPTIVE_RATE;
  d.dynThreshold = d.baseline * peakFactor();
}
function attachMotionListener(){
  window.removeEventListener('devicemotion', onMotion);
  window.addEventListener('devicemotion', onMotion);
}
function detachMotionListener(){
  window.removeEventListener('devicemotion', onMotion);
}
function render(){
  if (state.draft && ['sessionSetup','anchor','rest','myo','summary'].includes(state.view)) state.draft.resumeView = state.view;
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
        <label>Sensor sensitivity<select id="sensorSensitivity"><option value="normal" ${(state.user.sensorSensitivity||'normal')==='normal'?'selected':''}>Normal</option><option value="high" ${(state.user.sensorSensitivity||'normal')==='high'?'selected':''}>High</option><option value="low" ${(state.user.sensorSensitivity||'normal')==='low'?'selected':''}>Low</option></select></label>
      </div>
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
    <div class="install-box help">${state.installAvailable?'<strong>Install ready.</strong> Tap Install App below or use the Chrome menu.' : '<strong>Install help.</strong> Open once, refresh once, then check the Chrome menu for “Add to Home screen” or “Install app”.'}</div>
    <div class="footer-actions">
      <button class="btn primary full" data-action="continue-pentagon">Continue Pentagon Protocol</button>
      <button class="btn secondary full" data-action="individual-home">Select Individual Exercise</button>
      ${state.installAvailable?'<button class="btn secondary full" data-action="install-app">Install App</button>':''}
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
    exerciseId: ex.id,
    exerciseName: ex.name,
    exerciseType: ex.type,
    coefficient: ex.coefficient,
    externalLoad: Number(state.user.defaultLoad||0),
    weakerLeg:'',
    anchorTime:0,
    anchorReps:0,
    myoTarget:0,
    myoSets:[],
    myoSetTimes:[],
    strikes:0,
    totalActiveTime:0,
    currentSide:'',
    sideOrder:[],
    sides: { left: makeSideData(), right: makeSideData() },
    autoEnded:false,
    sideTransition:false,
    restRemaining:0,
    restType:'anchor',
    myoState:'ready',
    myoCurrentTime:0,
    anchorRunning:false,
  };
  state.view = 'sessionSetup';
  render();
}

function renderSessionSetup(){
  const d = state.draft; const ex = EXERCISES.find(e=>e.id===d.exerciseId);
  const unilateralFirst = d.exerciseType==='unilateral' && !d.currentSide;
  const unilateralSecond = d.exerciseType==='unilateral' && !!d.currentSide && d.sideTransition;
  app.innerHTML = `<div class="screen">${nav('Session Setup')}
    <div class="exercise-card"><img src="${ex.image}" alt="${ex.name}"><div><div class="exercise-name">${ex.name}</div><div class="exercise-meta">${unilateralFirst?'Choose your weaker leg before you begin.': unilateralSecond?`${sidePretty(d.currentSide)} selected automatically. Confirm load, then begin the Anchor Set.`:'Ready to begin the Anchor Set.'}</div></div></div>
    <div class="card"><div class="title">Load and setup</div>
      <div class="grid" style="margin-top:14px">
        <label>External load (kg)<input id="session-load" type="number" min="0" max="300" step="0.5" value="${unilateralSecond ? d.sides[d.currentSide].externalLoad : d.externalLoad}"></label>
        ${unilateralFirst?`<label>Choose your weaker leg<select id="weaker-leg"><option value="">Select</option><option value="left">Left</option><option value="right">Right</option></select></label><div class="small">The app will run your weaker leg first, complete the full Anchor / Rest / Myo sequence, then auto-select the opposite leg.</div>`:''}
        ${unilateralSecond?`<div class="small">The weaker leg sequence has been completed. The opposite leg is now selected automatically for its own Anchor / Rest / Myo sequence.</div>`:''}
      </div>
    </div>
    <div class="footer-actions"><button class="btn primary full" data-action="confirm-setup">${d.exerciseType==='unilateral'?'Continue':'Start Anchor'}</button></div>
  </div>`;
}


function renderAnchor(){
  const d = state.draft;
  const unilateral = d.exerciseType === 'unilateral';
  const sideData = unilateral ? currentSideData() : d;
  const heading = unilateral ? `${d.exerciseName} · ${sidePretty(d.currentSide)}` : d.exerciseName;
  const note = unilateral ? `Start your Anchor Set for the ${sidePretty(d.currentSide).toLowerCase()}. Hold the phone in both hands for auto rep counting.` : 'Perform your Anchor Set and stop when you reach your honest limit with good form. Hold the phone in both hands for auto rep counting.';
  app.innerHTML = `<div class="screen">${nav('Anchor Set')}
    <div class="card center-text"><div class="title">${heading}</div><p class="subtitle">${note}</p></div>
    <div class="card center-text"><div class="small">Anchor duration</div><div class="metric big-metric">${formatTime(sideData.anchorTime)}</div>
      <div class="live-count"><div class="small">Live rep count</div><div id="live-reps" class="metric value">${sideData.detectedReps || 0}</div></div>
      <div class="sensor-note small">${state.motionEnabled ? 'Sensor armed.' : 'Sensor access will be requested when you start.'}</div>
      <div class="footer-actions" style="margin-top:14px">
        ${d.anchorRunning?'<button class="btn secondary full" data-action="anchor-stop-clock">Stop exercise</button>':'<button class="btn primary full" data-action="anchor-start-clock">Start anchor exercise</button>'}
      </div>
    </div>
    <div class="card"><div class="title" style="font-size:24px">Record reps</div>
      <label style="display:block;margin-top:12px">Anchor reps<input id="anchor-reps" type="number" min="0" step="1" value="${sideData.anchorReps || sideData.detectedReps || ''}"></label>
      <div class="small" style="margin-top:10px">You can adjust the rep total manually if needed after stopping the set.</div>
    </div>
    <div class="footer-actions"><button class="btn primary full" data-action="finish-anchor">Stop exercise and record reps</button></div>
  </div>`;
}


function renderRest(){
  const d = state.draft;
  const sideText = d.exerciseType==='unilateral' ? ` for the ${sidePretty(d.currentSide).toLowerCase()}` : '';
  const target = activeSessionData()?.myoTarget || 0;
  const subtitle = d.restType === 'anchor'
    ? `Rest for the same amount of time as the Anchor Set${sideText}. Your first Myo set target will be ${target} reps.`
    : `15 second breath timer${sideText}. Your next Myo set target is ${target} reps.`;
  app.innerHTML = `<div class="screen center">${nav(d.restType === 'anchor' ? 'Adaptive Rest' : 'Breath Timer')}
    <div class="card center-text"><div class="title">${d.restType === 'anchor' ? 'Rest' : 'Breathe'}</div><p class="subtitle">${subtitle}</p></div>
    <div class="timer-circle"><div class="center-text"><div class="small">Remaining</div><div class="metric big-metric">${formatTime(Math.max(0,d.restRemaining||0))}</div></div></div>
    <div class="card center-text"><div class="small">Myo target</div><div class="metric" style="font-size:30px">${target} reps</div></div>
    <div class="footer-actions"><button class="btn secondary full" data-action="skip-rest">Skip Rest</button></div>
  </div>`;
}


function renderMyo(){
  const d = state.draft;
  const unilateral = d.exerciseType === 'unilateral';
  const data = activeSessionData();
  const color = data.strikes >= 1 ? 'var(--red)' : 'var(--gold)';
  const scope = unilateral ? sidePretty(d.currentSide) : 'Current session';
  const title = unilateral ? `${d.exerciseName} · ${sidePretty(d.currentSide)} Myo` : 'Myo Sets';
  const phase = d.myoState || 'ready';

  let phaseCard = '';
  let actions = '';
  if (phase === 'ready') {
    phaseCard = `<div class="card center-text"><div class="title" style="font-size:26px">Ready for the next Myo set</div><p class="subtitle">Target ${data.myoTarget} reps. Tap start when you are ready to begin.</p></div>`;
    actions = `<button class="btn primary full" data-action="start-myo-set">${data.myoSets.length===0?'Start 1st Myo Set':'Start Next Myo Set'}</button><button class="btn secondary full" data-action="done-session">${unilateral?'Finish this leg':'I’m Done'}</button>`;
  } else if (phase === 'active') {
    phaseCard = `<div class="card center-text"><div class="title" style="font-size:26px">Myo set in progress</div><div class="small" style="margin-top:10px">Set timer</div><div class="metric big-metric">${formatTime(data.myoCurrentTime)}</div><div class="live-count"><div class="small">Live rep count</div><div id="live-reps" class="metric value">${data.detectedReps || 0}</div></div><div class="small sensor-note">Auto counting is active while you hold the phone in both hands.</div></div>`;
    actions = `<button class="btn primary full" data-action="stop-myo-set">Stop Myo Set</button><button class="btn secondary full" data-action="done-session">${unilateral?'Finish this leg':'I’m Done'}</button>`;
  } else {
    phaseCard = `<div class="card"><div class="title" style="font-size:26px">Record Myo reps</div><p class="subtitle">The set has been timed. Record the reps you completed for this Myo set.</p><label style="display:block;margin-top:12px">Completed reps<input id="myo-reps" type="number" min="0" step="1" value="${data.lastDetectedReps || data.detectedReps || ''}"></label><div class="small" style="margin-top:10px">Set duration: ${formatTime(data.myoCurrentTime)}</div></div>`;
    actions = `<button class="btn primary full" data-action="log-myo">Record reps</button><button class="btn secondary full" data-action="done-session">${unilateral?'Finish this leg':'I’m Done'}</button>`;
  }

  app.innerHTML = `<div class="screen">${nav('Myo Sets')}
    <div class="card"><div class="title">${title}</div><p class="subtitle">${unilateral ? `Complete the Myo sets for the ${sidePretty(d.currentSide).toLowerCase()}. When this side is finished, the app will move to the opposite leg automatically.` : 'After each Myo set the app times a 15 second breath period, then prompts the next set until you finish.'}</p></div>
    <div class="card"><div class="row between"><div><div class="small">Target reps</div><div class="metric" style="font-size:22px">${data.myoTarget}</div></div><div class="tag">15s breath timer between sets</div></div>
      <div class="row between" style="margin-top:14px"><div><div class="small">Strike status</div><div class="metric" style="font-size:22px">${data.strikes}/2</div></div><div class="small">${scope}</div></div>
      <div style="height:12px;border-radius:999px;background:#1d1d1d;margin-top:14px;overflow:hidden"><div style="width:${data.strikes===0?40:85}%;height:100%;background:${color}"></div></div>
      <div class="small" style="margin-top:10px">Completed Myo sets: ${data.myoSets.length}</div>
    </div>
    ${phaseCard}
    <div class="footer-actions">${actions}</div>
  </div>`;
}


function formatTime(s){ const m=Math.floor(s/60); const ss=String(Math.max(0,s%60)).padStart(2,'0'); return `${m}:${ss}`; }
function startAnchorTicker(){
  clearInterval(anchorTimer);
  const data = activeSessionData();
  resetMotionCycle();
  if (data) data.anchorReps = 0;
  attachMotionListener();
  anchorTimer = setInterval(()=>{
    if (state.view !== 'anchor') return;
    if (state.draft.exerciseType === 'unilateral') currentSideData().anchorTime += 1;
    else state.draft.anchorTime += 1;
    render();
  },1000);
}
function stopAnchorTimer(){ 
  clearInterval(anchorTimer); 
  detachMotionListener();
  const data = activeSessionData();
  if (data) {
    data.anchorReps = data.detectedReps || data.anchorReps || 0;
  }
  if (state.draft) state.draft.anchorRunning = false; 
}
function startMyoTicker(){
  clearInterval(myoTimer);
  const data = activeSessionData();
  data.myoCurrentTime = 0;
  data.lastDetectedReps = 0;
  resetMotionCycle();
  attachMotionListener();
  myoTimer = setInterval(()=>{
    if (state.view !== 'myo' || state.draft.myoState !== 'active') return;
    activeSessionData().myoCurrentTime += 1;
    render();
  },1000);
}
function stopMyoTicker(){ 
  clearInterval(myoTimer); 
  const data = activeSessionData();
  if (data) data.lastDetectedReps = data.detectedReps || 0;
  detachMotionListener();
}

function finishAnchor(){
  stopAnchorTimer();
  const d = state.draft;
  const data = activeSessionData();
  data.anchorReps = Number(document.getElementById('anchor-reps')?.value || data.detectedReps || 0);
  if (!data.anchorReps) return alert('Please record your Anchor reps.');
  if (!data.anchorTime) data.anchorTime = 30;
  data.totalActiveTime = data.anchorTime;
  data.myoTarget = Math.max(3, Math.round(data.anchorReps * 0.25));
  d.myoState = 'ready';
  startRest(data.anchorTime, 'anchor');
}

function startUnilateralFirstLeg(){
  const d = state.draft;
  d.sideOrder = d.weakerLeg === 'left' ? ['left','right'] : ['right','left'];
  d.currentSide = d.sideOrder[0];
  d.sideTransition = false;
  d.sides[d.currentSide].externalLoad = d.externalLoad;
  state.view = 'anchor';
  render();
}

function beginSecondLegSetup(){
  const d = state.draft;
  d.currentSide = d.sideOrder[1];
  d.sideTransition = true;
  d.myoState = 'ready';
  state.view = 'sessionSetup';
  render();
}

function completeCurrentSide(autoEnded){
  const d = state.draft;
  const sideData = currentSideData();
  sideData.autoEnded = autoEnded;
  if (d.currentSide === d.sideOrder[0]) {
    try { navigator.vibrate?.([80,40,80]); } catch {}
    return beginSecondLegSetup();
  }
  return prepareSummary(autoEnded);
}

function startRest(seconds, type='breath'){
  clearInterval(restTimer);
  stopMyoTicker();
  state.draft.restRemaining = seconds;
  state.draft.restType = type;
  state.view = 'rest';
  restTimer = setInterval(()=>{
    state.draft.restRemaining -= 1;
    if (state.draft.restRemaining <= 0) {
      clearInterval(restTimer);
      try { navigator.vibrate?.([90,40,90]); } catch {}
      state.draft.myoState = 'ready';
      state.view = 'myo';
    }
    render();
  },1000);
  render();
}

function startMyoSet(){
  state.draft.myoState = 'active';
  startMyoTicker();
  render();
}

function stopMyoSet(){
  stopMyoTicker();
  const data = activeSessionData();
  if (!data.myoCurrentTime) data.myoCurrentTime = 10;
  state.draft.myoState = 'record';
  render();
}

function logMyoSet(){
  const reps = Number(document.getElementById('myo-reps')?.value || data.lastDetectedReps || data.detectedReps || 0);
  const d = state.draft;
  const data = activeSessionData();
  data.myoSets.push(reps);
  data.myoSetTimes.push(Math.max(1, data.myoCurrentTime || 0));
  data.totalActiveTime += Math.max(1, data.myoCurrentTime || 0);
  data.myoCurrentTime = 0;
  if (reps < data.myoTarget) data.strikes += 1; else data.strikes = 0;
  if (data.strikes >= 2) return d.exerciseType === 'unilateral' ? completeCurrentSide(true) : prepareSummary(true);
  d.myoState = 'ready';
  return startRest(15, 'breath');
}

function effectiveLoadForSide(d, side){ return Number(d.sides[side].externalLoad) + Number(state.user.bodyweight || 0) * d.coefficient; }
function effectiveLoadForDraft(d){ return Number(d.externalLoad) + Number(state.user.bodyweight || 0) * d.coefficient; }

function prepareSummary(autoEnded){
  clearInterval(restTimer);
  stopAnchorTimer();
  stopMyoTicker();
  state.draft.autoEnded = autoEnded;
  state.view = 'summary';
  render();
}

function unilateralMetrics(d){
  ['left','right'].forEach(side => {
    const sd = d.sides[side];
    const effectiveLoad = effectiveLoadForSide(d, side);
    sd.totalReps = sd.anchorReps + sd.myoSets.reduce((a,b)=>a+b,0);
    sd.mls = effectiveLoad * sd.totalReps;
    sd.ds = sd.totalActiveTime > 0 ? sd.mls / sd.totalActiveTime : 0;
    sd.effectiveLoad = effectiveLoad;
  });
  d.leftDS = d.sides.left.ds;
  d.rightDS = d.sides.right.ds;
  d.leftTotalReps = d.sides.left.totalReps;
  d.rightTotalReps = d.sides.right.totalReps;
  d.totalReps = d.leftTotalReps + d.rightTotalReps;
  d.totalActiveTime = d.sides.left.totalActiveTime + d.sides.right.totalActiveTime;
  d.totalMLS = d.sides.left.mls + d.sides.right.mls;
  d.ds = d.totalActiveTime > 0 ? d.totalMLS / d.totalActiveTime : 0;
  d.mls = d.totalMLS;
  d.balanceDifference = Math.max(d.leftDS, d.rightDS) > 0 ? Math.abs(d.leftDS - d.rightDS) / Math.max(d.leftDS, d.rightDS) * 100 : 0;
  d.leadingSide = d.leftDS === d.rightDS ? 'Even' : (d.leftDS > d.rightDS ? 'Left' : 'Right');
}

function renderSummary(){
  const d = state.draft;
  if (d.exerciseType === 'unilateral') {
    unilateralMetrics(d);
    app.innerHTML = `<div class="screen">${nav('Summary')}
      <div class="card"><div class="title">Unilateral session complete</div><p class="subtitle">Both legs have completed their own Anchor / Rest / Myo sequence. Total Density Score is shown for the full exercise and for each leg.</p></div>
      <div class="grid two"><div class="kpi"><div class="label">Total DS</div><div class="value">${d.ds.toFixed(1)}</div></div><div class="kpi"><div class="label">Difference</div><div class="value">${d.balanceDifference.toFixed(1)}%</div></div><div class="kpi"><div class="label">Left DS</div><div class="value">${d.leftDS.toFixed(1)}</div></div><div class="kpi"><div class="label">Right DS</div><div class="value">${d.rightDS.toFixed(1)}</div></div></div>
      <div class="card">
        <div class="title" style="font-size:22px">Left / right comparison</div>
        <div class="row between" style="margin-top:14px"><span>Left total reps / active time</span><span class="metric">${d.leftTotalReps} / ${formatTime(d.sides.left.totalActiveTime)}</span></div>
        <div class="row between" style="margin-top:10px"><span>Right total reps / active time</span><span class="metric">${d.rightTotalReps} / ${formatTime(d.sides.right.totalActiveTime)}</span></div>
        <div class="row between" style="margin-top:10px"><span>Higher density side</span><span class="metric">${d.leadingSide}</span></div>
        <div class="small" style="margin-top:12px">Percentage difference compares the left and right leg Density Scores. The Total Density Score reflects both legs together.</div>
      </div>
      <div class="footer-actions"><button class="btn primary full" data-action="log-session">Log Session</button></div>
    </div>`;
    return;
  }

  const effectiveLoad = effectiveLoadForDraft(d);
  const totalReps = d.anchorReps + d.myoSets.reduce((a,b)=>a+b,0);
  const mls = effectiveLoad * totalReps;
  const ds = d.totalActiveTime > 0 ? mls / d.totalActiveTime : 0;
  d.effectiveLoad = effectiveLoad; d.totalReps = totalReps; d.mls = mls; d.ds = ds;
  app.innerHTML = `<div class="screen">${nav('Summary')}
    <div class="card"><div class="title">Session complete</div><p class="subtitle">${d.autoEnded?'The session ended because two Myo sets fell below target.':'You ended the session.'}</p></div>
    <div class="grid two"><div class="kpi"><div class="label">Anchor reps</div><div class="value">${d.anchorReps}</div></div><div class="kpi"><div class="label">Myo total</div><div class="value">${d.myoSets.reduce((a,b)=>a+b,0)}</div></div><div class="kpi"><div class="label">MLS</div><div class="value">${mls.toFixed(1)}</div></div><div class="kpi"><div class="label">DS</div><div class="value">${ds.toFixed(1)}</div></div></div>
    <div class="card"><div class="row between"><span>Active time</span><span class="metric">${formatTime(d.totalActiveTime)}</span></div><div class="row between" style="margin-top:10px"><span>Myo sets completed</span><span class="metric">${d.myoSets.length}</span></div></div>
    <div class="footer-actions"><button class="btn primary full" data-action="log-session">Log Session</button></div>
  </div>`;
}

function logSession(){
  const d = state.draft;
  if (d.exerciseType === 'unilateral') unilateralMetrics(d);
  state.sessions.push({
    date:new Date().toISOString(),
    exerciseId:d.exerciseId,
    exerciseName:d.exerciseName,
    ds:d.ds,
    mls:d.mls,
    anchorReps:d.anchorReps,
    myoSets:d.myoSets,
    externalLoad:d.externalLoad,
    totalActiveTime:d.totalActiveTime,
    leftDS:d.leftDS || null,
    rightDS:d.rightDS || null,
    balanceDifference:d.balanceDifference || null,
    leftTotalReps:d.leftTotalReps || null,
    rightTotalReps:d.rightTotalReps || null,
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
  const rows = [...state.sessions].reverse().map(s=>`<div class="history-row"><div><div>${s.exerciseName}</div><div class="small">${new Date(s.date).toLocaleString()}</div>${s.balanceDifference!=null?`<div class="small">Side diff ${s.balanceDifference.toFixed(1)}%</div>`:''}</div><div class="metric">DS ${s.ds.toFixed(1)}</div></div>`).join('') || '<div class="small">No sessions logged yet.</div>';
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
    state.user.sensorSensitivity = document.getElementById('sensorSensitivity').value;
    state.rotationMode = document.getElementById('rotationMode').value;
    state.onboarded = true; state.view = 'home'; return render();
  }
  if (action === 'open-settings') { state.view='settings'; return render(); }
  if (action === 'back') {
    if (['settings','select','history'].includes(state.view)) state.view='home';
    else if (['sessionSetup','anchor','rest','myo','summary'].includes(state.view)) { clearInterval(restTimer); stopAnchorTimer(); stopMyoTicker(); state.view='home'; }
    return render();
  }
  if (action === 'continue-pentagon') { state.rotationMode='fixed'; return openSession(); }
  if (action === 'individual-home') { state.rotationMode='individual'; state.view='select'; return render(); }
  if (action === 'resume-session') { state.view = state.draft?.resumeView || 'sessionSetup'; return render(); }
  if (action === 'discard-session') { state.draft = null; state.view='home'; return render(); }
  if (action === 'start-session') return openSession();
  if (action === 'choose-exercise') { state.view='select'; return render(); }
  if (action === 'pick-exercise') { state.pointer = EXERCISES.findIndex(x=>x.id===target.dataset.id); return openSession(target.dataset.id); }
  if (action === 'confirm-setup') {
    const load = Number(document.getElementById('session-load').value || 0);
    if (state.draft.exerciseType === 'unilateral') {
      if (!state.draft.currentSide) {
        state.draft.externalLoad = load;
        state.draft.weakerLeg = document.getElementById('weaker-leg').value;
        if (!state.draft.weakerLeg) return alert('Please choose your weaker leg.');
        return startUnilateralFirstLeg();
      }
      state.draft.sides[state.draft.currentSide].externalLoad = load;
      state.draft.sideTransition = false;
      state.view = 'anchor';
      return render();
    }
    state.draft.externalLoad = load;
    state.view='anchor'; return render();
  }
  if (action === 'anchor-start-clock') { 
    requestMotionAccessIfNeeded().then(()=>{ state.draft.anchorRunning = true; startAnchorTicker(); render(); });
    return;
  }
  if (action === 'anchor-stop-clock') { stopAnchorTimer(); return render(); }
  if (action === 'finish-anchor') return finishAnchor();
  if (action === 'skip-rest') { clearInterval(restTimer); state.draft.myoState='ready'; state.view='myo'; return render(); }
  if (action === 'start-myo-set') { requestMotionAccessIfNeeded().then(()=>startMyoSet()); return; }
  if (action === 'stop-myo-set') return stopMyoSet();
  if (action === 'log-myo') return logMyoSet();
  if (action === 'done-session') {
    if (state.draft.exerciseType === 'unilateral') return completeCurrentSide(false);
    return prepareSummary(false);
  }
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
    try { await navigator.serviceWorker.register('./sw.js', { updateViaCache:'none' }); } catch {}
  });
}
render();
