/* Squat Tribe v1.7 */

const APP_VERSION = "1.7.0";
const STORAGE_KEY = "squat-tribe-v1-7";
const EXERCISES = [
  { name: "Back Squat", key: "back", type: "bilateral", coeff: 0.70 },
  { name: "Bulgarian Squat", key: "bulgarian", type: "unilateral", coeff: 0.85 },
  { name: "Front Squat", key: "front", type: "bilateral", coeff: 0.70 },
  { name: "Side Step Squat", key: "sidestep", type: "unilateral", coeff: 0.85 },
  { name: "Sumo Squat", key: "sumo", type: "bilateral", coeff: 0.70 }
];

const ONBOARDING = [
  {
    title: "Welcome to Squat Tribe",
    body: "A simple, smart way to build strength at home using squats. The app guides your training automatically and adapts the work to your current capacity."
  },
  {
    title: "Why squats?",
    body: "Squats build strength in your legs, hips, and core. Stronger squat patterns can improve daily movement, balance, stability, and physical confidence."
  },
  {
    title: "How a session works",
    body: "Each session starts with an Anchor Set, then a rest period, then short Myo sets. The app times each phase and tracks your exercise density."
  },
  {
    title: "Adaptive training",
    body: "Some days you are fresh, some days you are tired. Squat Tribe helps you adjust work safely and steadily instead of guessing."
  },
  {
    title: "Unilateral exercises",
    body: "For Bulgarian Squat and Side Step Squat, select your weaker leg first. The app then runs the same process for the opposite leg automatically."
  }
];

const state = {
  installPromptEvent: null,
  onboardingIndex: 0,
  currentScreen: "home",
  session: null,
  repTracker: null,
  store: loadStore()
};

const el = {};
document.addEventListener("DOMContentLoaded", init);

function init() {
  cacheEls();
  setupInstallPrompt();
  setupNav();
  registerServiceWorker();
  routeInitial();
}

function cacheEls() {
  el.root = document.getElementById("screenRoot");
  el.bottomNav = document.getElementById("bottomNav");
  el.installBtn = document.getElementById("installBtn");
  el.installBtn.addEventListener("click", onInstallClick);
}

function setupNav() {
  document.body.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-nav]");
    if (!btn) return;
    const nav = btn.dataset.nav;
    if (nav === "home") renderHome();
    if (nav === "history") renderHistory();
    if (nav === "profile") renderProfile();
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(console.warn);
  }
}

function routeInitial() {
  if (!state.store.hasCompletedOnboarding) {
    renderOnboarding();
    return;
  }
  renderHome();
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    state.installPromptEvent = e;
    refreshInstallButtons();
  });

  window.addEventListener("appinstalled", () => {
    state.installPromptEvent = null;
    refreshInstallButtons();
  });
}

function refreshInstallButtons() {
  const homeBtn = document.getElementById("installHomeBtn");
  const helpCard = document.getElementById("installHelpCard");
  if (homeBtn) {
    homeBtn.textContent = state.installPromptEvent ? "Install App" : "Install Help";
  }
  if (helpCard && state.installPromptEvent) {
    helpCard.classList.add("hidden");
  }
}

async function onInstallClick() {
  const helpCard = document.getElementById("installHelpCard");
  if (state.installPromptEvent) {
    try {
      await state.installPromptEvent.prompt();
      await state.installPromptEvent.userChoice;
    } catch (err) {
      console.warn(err);
    }
  } else if (helpCard) {
    helpCard.classList.remove("hidden");
  } else {
    alert("In Chrome, open the menu and choose 'Add to Home screen' or 'Install app'.");
  }
}

function template(id) {
  return document.getElementById(id).content.cloneNode(true);
}

function clearRoot() {
  el.root.innerHTML = "";
}

function showBottomNav() {
  el.bottomNav.classList.remove("hidden");
  setActiveNavButton(state.currentScreen);
}

function hideBottomNav() {
  el.bottomNav.classList.add("hidden");
}

function setActiveNavButton(screen) {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.nav === screen);
  });
}

function renderOnboarding() {
  state.currentScreen = "onboarding";
  hideBottomNav();
  clearRoot();
  const frag = template("tpl-onboarding");
  const step = ONBOARDING[state.onboardingIndex];
  frag.getElementById("obTitle").textContent = step.title;
  frag.getElementById("obBody").textContent = step.body;
  const nextBtn = frag.getElementById("obNext");
  const skipBtn = frag.getElementById("obSkip");

  nextBtn.textContent = state.onboardingIndex === ONBOARDING.length - 1 ? "Start" : "Next";

  nextBtn.addEventListener("click", () => {
    if (state.onboardingIndex < ONBOARDING.length - 1) {
      state.onboardingIndex += 1;
      renderOnboarding();
    } else {
      state.store.hasCompletedOnboarding = true;
      saveStore();
      renderHome();
    }
  });

  skipBtn.addEventListener("click", () => {
    state.store.hasCompletedOnboarding = true;
    saveStore();
    renderHome();
  });

  el.root.appendChild(frag);
}

function renderHome() {
  state.currentScreen = "home";
  showBottomNav();
  clearRoot();
  const frag = template("tpl-home");
  const avg = getRollingAverageDs();
  frag.getElementById("homeAvgDs").textContent = avg.toFixed(1);

  const currentExercise = getCurrentExercise();
  frag.getElementById("todayExerciseName").textContent = currentExercise.name;
  frag.getElementById("modeLabel").textContent = state.store.mode === "fixed" ? "Fixed Pentagon" : "Individual";

  const recoveryCard = frag.getElementById("recoveryCard");
  if (shouldTriggerRecovery()) {
    recoveryCard.classList.remove("hidden");
  }

  renderPentagonVertices(frag.getElementById("pentagonVertices"));

  frag.getElementById("startSessionBtn").addEventListener("click", () => renderSetup());
  frag.getElementById("toggleModeBtn").addEventListener("click", () => {
    state.store.mode = state.store.mode === "fixed" ? "individual" : "fixed";
    saveStore();
    renderHome();
  });

  frag.getElementById("installHomeBtn").addEventListener("click", onInstallClick);
  if (!state.installPromptEvent) {
    frag.getElementById("installHelpCard").classList.remove("hidden");
  }

  el.root.appendChild(frag);
  refreshInstallButtons();
}

function renderPentagonVertices(container) {
  const positions = [
    { x: 150, y: 25, lx: 150, ly: 12 },
    { x: 270, y: 110, lx: 285, ly: 110 },
    { x: 225, y: 250, lx: 238, ly: 270 },
    { x: 75, y: 250, lx: 58, ly: 270 },
    { x: 30, y: 110, lx: 15, ly: 110 }
  ];
  const completed = state.store.completedVertices || [];
  const currentIndex = state.store.currentIndex || 0;

  positions.forEach((pos, index) => {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(pos.x));
    circle.setAttribute("cy", String(pos.y));
    circle.setAttribute("r", "16");
    circle.setAttribute("class", "vertex-circle");
    if (completed.includes(index)) circle.setAttribute("class", "vertex-circle vertex-complete");
    if (index === currentIndex) circle.setAttribute("class", "vertex-circle vertex-current");
    container.appendChild(circle);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(pos.lx));
    label.setAttribute("y", String(pos.ly));
    label.setAttribute("class", "vertex-label");
    label.textContent = String(index + 1);
    container.appendChild(label);
  });
}

function renderProfile() {
  state.currentScreen = "profile";
  showBottomNav();
  clearRoot();
  const frag = template("tpl-profile");
  frag.getElementById("profileBodyweight").value = String(state.store.profile.bodyweight || 70);
  frag.getElementById("profileMode").value = state.store.mode;
  frag.getElementById("profileSensitivity").value = state.store.profile.sensitivity || "normal";

  frag.getElementById("saveProfileBtn").addEventListener("click", () => {
    state.store.profile.bodyweight = parseFloat(frag.getElementById("profileBodyweight").value || "70");
    state.store.mode = frag.getElementById("profileMode").value;
    state.store.profile.sensitivity = frag.getElementById("profileSensitivity").value;
    saveStore();
    renderHome();
  });

  el.root.appendChild(frag);
}

function renderHistory() {
  state.currentScreen = "history";
  showBottomNav();
  clearRoot();
  const frag = template("tpl-history");
  const list = frag.getElementById("historyList");
  const sessions = [...state.store.sessions].reverse();

  if (!sessions.length) {
    list.innerHTML = "<p>No sessions logged yet.</p>";
  } else {
    sessions.forEach((session) => {
      const div = document.createElement("div");
      div.className = "history-item";
      div.innerHTML = `
        <div><strong>${escapeHtml(session.exerciseName)}</strong></div>
        <div class="muted-label">${new Date(session.loggedAt).toLocaleString()}</div>
        <div>DS: ${session.ds.toFixed(1)}</div>
      `;
      list.appendChild(div);
    });
  }

  el.root.appendChild(frag);
}

function renderSetup() {
  state.currentScreen = "setup";
  hideBottomNav();
  clearRoot();
  const frag = template("tpl-setup");

  const chooserWrap = frag.getElementById("individualChooser");
  const chooser = frag.getElementById("exerciseChooser");
  const currentExercise = getCurrentExercise();

  if (state.store.mode === "individual") {
    chooserWrap.classList.remove("hidden");
    EXERCISES.forEach((exercise, index) => {
      const opt = document.createElement("option");
      opt.value = String(index);
      opt.textContent = exercise.name;
      chooser.appendChild(opt);
    });
    chooser.value = String(state.store.currentIndex || 0);
  }

  frag.getElementById("setupExerciseTitle").textContent = currentExercise.name;
  const imageWrap = frag.getElementById("exerciseImageWrap");
  imageWrap.innerHTML = getExerciseSvg(currentExercise.key);

  if (currentExercise.type === "unilateral") {
    frag.getElementById("unilateralPromptWrap").classList.remove("hidden");
  }

  frag.getElementById("beginExerciseBtn").addEventListener("click", () => {
    let exerciseIndex = state.store.currentIndex;
    if (state.store.mode === "individual") {
      exerciseIndex = parseInt(chooser.value, 10);
    }
    const exercise = EXERCISES[exerciseIndex];
    const externalLoad = parseFloat(frag.getElementById("externalLoadInput").value || "0");
    const weakerLeg = exercise.type === "unilateral"
      ? frag.getElementById("weakerLegInput").value
      : null;

    startSession({
      exerciseIndex,
      externalLoad,
      weakerLeg
    });
  });

  el.root.appendChild(frag);
}

function startSession({ exerciseIndex, externalLoad, weakerLeg }) {
  const exercise = EXERCISES[exerciseIndex];
  const firstLeg = exercise.type === "unilateral" ? weakerLeg : "both";
  state.session = {
    exercise,
    exerciseIndex,
    externalLoad,
    bodyweight: state.store.profile.bodyweight,
    mode: state.store.mode,
    currentLeg: firstLeg,
    weakerLeg,
    legOrder: exercise.type === "unilateral"
      ? [weakerLeg, weakerLeg === "left" ? "right" : "left"]
      : ["both"],
    legResults: {},
    anchor: null,
    myoTarget: 0,
    currentMyoIndex: 0,
    strikes: 0,
    myoSets: [],
    activeTimer: null,
    activeSeconds: 0,
    activeReps: 0,
    phase: "anchor"
  };
  renderActiveSet("Anchor Set", "Start Anchor", "One high-rep set to your limit.");
}

function renderActiveSet(phaseLabel, buttonLabel, subText) {
  clearRoot();
  const frag = template("tpl-active-set");
  const session = state.session;
  const title = session.exercise.type === "unilateral"
    ? `${session.exercise.name} — ${capitalize(session.currentLeg)} leg`
    : session.exercise.name;

  frag.getElementById("phaseLabel").textContent = phaseLabel;
  frag.getElementById("activeExerciseName").textContent = title;
  frag.getElementById("activeSubLabel").textContent = subText;
  frag.getElementById("activeImageWrap").innerHTML = getExerciseSvg(session.exercise.key);
  frag.getElementById("startSetBtn").textContent = buttonLabel;

  const timerEl = frag.getElementById("setTimer");
  const repsEl = frag.getElementById("repCounter");
  const startBtn = frag.getElementById("startSetBtn");
  const stopBtn = frag.getElementById("stopSetBtn");
  const plusBtn = frag.getElementById("plusRepBtn");
  const minusBtn = frag.getElementById("minusRepBtn");

  startBtn.addEventListener("click", async () => {
    startBtn.disabled = true;
    stopBtn.disabled = false;
    session.activeSeconds = 0;
    session.activeReps = 0;
    repsEl.textContent = "0";
    timerEl.textContent = "00:00";

    session.activeTimer = setInterval(() => {
      session.activeSeconds += 1;
      timerEl.textContent = formatTime(session.activeSeconds);
    }, 1000);

    state.repTracker = createRepTracker((count) => {
      session.activeReps = count;
      repsEl.textContent = String(count);
    });

    const permissionOk = await state.repTracker.start(state.store.profile.sensitivity || "normal");
    if (!permissionOk) {
      alert("Motion permission was not granted. The rep counter will stay manual for this set.");
    }
  });

  stopBtn.addEventListener("click", () => {
    stopCurrentSet(timerEl, repsEl);
  });

  plusBtn.addEventListener("click", () => {
    state.session.activeReps += 1;
    repsEl.textContent = String(state.session.activeReps);
  });

  minusBtn.addEventListener("click", () => {
    state.session.activeReps = Math.max(0, state.session.activeReps - 1);
    repsEl.textContent = String(state.session.activeReps);
  });

  el.root.appendChild(frag);
}

function stopCurrentSet() {
  const session = state.session;
  if (!session) return;

  if (session.activeTimer) clearInterval(session.activeTimer);
  session.activeTimer = null;

  if (state.repTracker) {
    state.repTracker.stop();
    state.repTracker = null;
  }

  const seconds = session.activeSeconds;
  const reps = session.activeReps;

  if (session.phase === "anchor") {
    session.anchor = { seconds, reps };
    session.myoTarget = Math.max(3, Math.round(reps * 0.25));
    session.strikes = 0;
    session.currentMyoIndex = 0;
    session.myoSets = [];
    renderRest(seconds, `Anchor rest complete in ${seconds}s`, true);
    return;
  }

  if (session.phase === "myo-active") {
    session.currentMyoIndex += 1;
    session.myoSets.push({ seconds, reps });

    if (reps < session.myoTarget) {
      session.strikes += 1;
    } else {
      session.strikes = 0;
    }

    if (session.strikes >= 2) {
      finishLegSequence();
      return;
    }

    renderRest(15, "Breath timer", false);
  }
}

function renderRest(seconds, subText, showMyoTarget) {
  clearRoot();
  const frag = template("tpl-rest");
  const session = state.session;
  const title = session.exercise.type === "unilateral"
    ? `${session.exercise.name} — ${capitalize(session.currentLeg)} leg`
    : session.exercise.name;

  frag.getElementById("restPhaseLabel").textContent = session.phase === "anchor" ? "Adaptive Rest" : "Breath Timer";
  frag.getElementById("restExerciseName").textContent = title;
  frag.getElementById("restSubText").textContent = subText;

  if (showMyoTarget) {
    const banner = frag.getElementById("myoTargetBanner");
    banner.classList.remove("hidden");
    banner.textContent = `Myo target: ${session.myoTarget} reps`;
  }

  const countdownEl = frag.getElementById("restCountdown");
  let remaining = seconds;
  countdownEl.textContent = String(remaining);

  const tick = setInterval(() => {
    remaining -= 1;
    countdownEl.textContent = String(Math.max(0, remaining));
    if (remaining <= 0) {
      clearInterval(tick);
      vibrate([100, 50, 100]);
      renderMyoReady();
    }
  }, 1000);

  frag.getElementById("endRestEarlyBtn").addEventListener("click", () => {
    clearInterval(tick);
    renderMyoReady();
  });

  el.root.appendChild(frag);
}

function renderMyoReady() {
  clearRoot();
  const frag = template("tpl-myo-ready");
  const session = state.session;
  const title = session.exercise.type === "unilateral"
    ? `${session.exercise.name} — ${capitalize(session.currentLeg)} leg`
    : session.exercise.name;

  frag.getElementById("myoExerciseName").textContent = title;
  frag.getElementById("myoTargetText").textContent = `Target ${session.myoTarget} reps`;
  frag.getElementById("myoInstructions").textContent =
    session.currentMyoIndex === 0
      ? "Start your 1st Myo set."
      : `Start Myo set ${session.currentMyoIndex + 1}.`;

  const fatigueBar = frag.getElementById("fatigueBar");
  fatigueBar.style.width = `${Math.min(100, session.strikes * 50)}%`;

  frag.getElementById("startMyoBtn").addEventListener("click", () => {
    session.phase = "myo-active";
    renderActiveSet("Myo Set", "Start Myo Set", `Target ${session.myoTarget} reps.`);
  });

  frag.getElementById("finishSessionBtn").addEventListener("click", () => {
    finishLegSequence();
  });

  el.root.appendChild(frag);
}

function finishLegSequence() {
  const session = state.session;
  const result = computeLegDensity(
    session.exercise,
    session.bodyweight,
    session.externalLoad,
    session.anchor,
    session.myoSets
  );

  session.legResults[session.currentLeg] = result;

  const currentLegIndex = session.legOrder.indexOf(session.currentLeg);
  const hasNextLeg = currentLegIndex < session.legOrder.length - 1;

  if (hasNextLeg) {
    session.currentLeg = session.legOrder[currentLegIndex + 1];
    session.phase = "anchor";
    session.anchor = null;
    session.myoSets = [];
    session.strikes = 0;
    session.currentMyoIndex = 0;
    renderSecondLegLoadPrompt();
    return;
  }

  renderSummary();
}

function renderSecondLegLoadPrompt() {
  clearRoot();
  const session = state.session;
  const frag = template("tpl-setup");
  frag.getElementById("setupExerciseTitle").textContent =
    `${session.exercise.name} — ${capitalize(session.currentLeg)} leg`;
  frag.getElementById("exerciseImageWrap").innerHTML = getExerciseSvg(session.exercise.key);

  frag.getElementById("unilateralPromptWrap").classList.add("hidden");
  frag.getElementById("individualChooser").classList.add("hidden");

  frag.getElementById("beginExerciseBtn").textContent = "Begin Opposite Leg";
  frag.getElementById("externalLoadInput").value = String(session.externalLoad);

  frag.getElementById("beginExerciseBtn").addEventListener("click", () => {
    session.externalLoad = parseFloat(frag.getElementById("externalLoadInput").value || "0");
    session.phase = "anchor";
    renderActiveSet("Anchor Set", "Start Anchor", "Run the same pattern for the opposite leg.");
  });

  el.root.appendChild(frag);
}

function renderSummary() {
  clearRoot();
  const frag = template("tpl-summary");
  const session = state.session;
  const title = session.exercise.name;
  frag.getElementById("summaryTitle").textContent = title;

  const summaryBody = frag.getElementById("summaryBody");
  const both = session.exercise.type === "unilateral"
    ? summarizeUnilateral(session)
    : summarizeBilateral(session);

  summaryBody.innerHTML = both;

  frag.getElementById("logSessionBtn").addEventListener("click", () => {
    logCurrentSession();
    vibrate(200);
    renderHome();
  });

  el.root.appendChild(frag);
}

function summarizeBilateral(session) {
  const ds = computeLegDensity(
    session.exercise,
    session.bodyweight,
    session.externalLoad,
    session.anchor,
    session.myoSets
  );
  session.finalSummary = { ds: ds.ds, exerciseName: session.exercise.name };
  return `
    <p>Total reps: <strong>${ds.totalReps}</strong></p>
    <p>Active time: <strong>${ds.totalSeconds}s</strong></p>
    <p>Density Score: <strong>${ds.ds.toFixed(1)}</strong></p>
  `;
}

function summarizeUnilateral(session) {
  const left = session.legResults.left;
  const right = session.legResults.right;
  const totalDs = left.ds + right.ds;
  const diffPct = percentDifference(left.ds, right.ds);
  session.finalSummary = { ds: totalDs, exerciseName: session.exercise.name };
  return `
    <p>Left DS: <strong>${left.ds.toFixed(1)}</strong></p>
    <p>Right DS: <strong>${right.ds.toFixed(1)}</strong></p>
    <p>Total DS: <strong>${totalDs.toFixed(1)}</strong></p>
    <p>Percentage difference: <strong>${diffPct.toFixed(1)}%</strong></p>
  `;
}

function logCurrentSession() {
  const session = state.session;
  if (!session || !session.finalSummary) return;

  state.store.sessions.push({
    exerciseName: session.exercise.name,
    exerciseKey: session.exercise.key,
    ds: session.finalSummary.ds,
    loggedAt: Date.now()
  });

  if (state.store.mode === "fixed") {
    const currentIndex = state.store.currentIndex || 0;
    if (!state.store.completedVertices.includes(currentIndex)) {
      state.store.completedVertices.push(currentIndex);
    }
    state.store.currentIndex = (currentIndex + 1) % EXERCISES.length;
  }

  saveStore();
  state.session = null;
}

function computeLegDensity(exercise, bodyweight, externalLoad, anchor, myoSets) {
  const totalReps = anchor.reps + myoSets.reduce((sum, set) => sum + set.reps, 0);
  const totalSeconds = anchor.seconds + myoSets.reduce((sum, set) => sum + set.seconds, 0);
  const effectiveLoad = externalLoad + (bodyweight * exercise.coeff);
  const mls = effectiveLoad * totalReps;
  const ds = totalSeconds > 0 ? mls / totalSeconds : 0;
  return { totalReps, totalSeconds, effectiveLoad, mls, ds };
}

function percentDifference(a, b) {
  const avg = (a + b) / 2;
  if (avg === 0) return 0;
  return Math.abs(a - b) / avg * 100;
}

function shouldTriggerRecovery() {
  const sessions = state.store.sessions;
  if (sessions.length < 3) return false;
  const recent = sessions.slice(-3);
  const avg = getRollingAverageDs(7, sessions.slice(0, -3));
  if (avg <= 0) return false;
  return recent.every((s) => s.ds < avg * 0.8);
}

function getRollingAverageDs(days = 7, pool = null) {
  const sessions = pool || state.store.sessions;
  const now = Date.now();
  const start = now - days * 24 * 60 * 60 * 1000;
  const relevant = sessions.filter((s) => s.loggedAt >= start);
  if (!relevant.length) return 0;
  return relevant.reduce((sum, s) => sum + s.ds, 0) / relevant.length;
}

function getCurrentExercise() {
  return EXERCISES[state.store.currentIndex || 0];
}

function loadStore() {
  const defaults = {
    hasCompletedOnboarding: false,
    currentIndex: 0,
    mode: "fixed",
    completedVertices: [],
    sessions: [],
    profile: {
      bodyweight: 70,
      sensitivity: "normal"
    }
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    return {
      ...defaults,
      ...JSON.parse(raw),
      profile: {
        ...defaults.profile,
        ...(JSON.parse(raw).profile || {})
      }
    };
  } catch {
    return defaults;
  }
}

function saveStore() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.store));
}

function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function vibrate(pattern) {
  if ("vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch]
  ));
}

/* Motion rep tracker */

function createRepTracker(onRepCount) {
  let repCount = 0;
  let lastState = "idle";
  let lastRepAt = 0;
  let smooth = 0;
  let running = false;
  let thresholdDown = -5.5;
  let thresholdUp = 5.5;
  let minRepMs = 800;
  let motionHandler = null;

  async function start(sensitivity = "normal") {
    adjustSensitivity(sensitivity);

    if (
      typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function"
    ) {
      try {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== "granted") return false;
      } catch {
        return false;
      }
    }

    motionHandler = (event) => {
      if (!running) return;
      const a = event.accelerationIncludingGravity || event.acceleration;
      if (!a) return;

      const axis = typeof a.y === "number" ? a.y : 0;
      smooth = smooth * 0.75 + axis * 0.25;

      const now = Date.now();

      if ((lastState === "idle" || lastState === "up") && smooth < thresholdDown) {
        lastState = "down";
      } else if (lastState === "down" && smooth > thresholdUp) {
        if (now - lastRepAt > minRepMs) {
          repCount += 1;
          lastRepAt = now;
          onRepCount(repCount);
        }
        lastState = "up";
      }
    };

    running = true;
    window.addEventListener("devicemotion", motionHandler);
    return true;
  }

  function adjustSensitivity(sensitivity) {
    if (sensitivity === "high") {
      thresholdDown = -4.5;
      thresholdUp = 4.5;
      minRepMs = 700;
    } else if (sensitivity === "low") {
      thresholdDown = -6.5;
      thresholdUp = 6.5;
      minRepMs = 900;
    }
  }

  function stop() {
    running = false;
    if (motionHandler) {
      window.removeEventListener("devicemotion", motionHandler);
    }
  }

  return { start, stop };
}

/* Embedded exercise SVGs */

function getExerciseSvg(key) {
  const common = `
    <svg class="exercise-svg" viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${key}">
      <g fill="none" stroke="#FFD700" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
  `;
  const close = `</g></svg>`;

  const drawings = {
    back: `
      <circle cx="110" cy="34" r="14" />
      <rect x="83" y="55" width="54" height="48" rx="10" />
      <path d="M90 103 L78 146 L96 146 L110 112 L124 146 L142 146 L130 103" />
      <path d="M88 66 C95 58, 125 58, 132 66" />
    `,
    bulgarian: `
      <circle cx="90" cy="32" r="14" />
      <path d="M90 46 L92 92 L118 122" />
      <path d="M92 92 L70 130 L48 154" />
      <path d="M118 122 L144 112 L176 112" />
      <path d="M176 112 L176 124" />
      <path d="M47 154 L70 154" />
      <path d="M98 62 L72 84" />
      <path d="M94 62 L120 84" />
    `,
    front: `
      <circle cx="110" cy="32" r="14" />
      <path d="M110 46 L110 94" />
      <path d="M110 60 L84 78" />
      <path d="M110 60 L136 78" />
      <path d="M88 78 L132 78" />
      <path d="M110 94 L82 138 L96 170" />
      <path d="M110 94 L138 138 L124 170" />
    `,
    sidestep: `
      <circle cx="108" cy="32" r="14" />
      <path d="M108 46 L108 92" />
      <path d="M108 62 L82 80" />
      <path d="M108 62 L134 80" />
      <path d="M108 92 L78 126 L54 154" />
      <path d="M108 92 L138 118 L170 122" />
      <path d="M52 154 L78 154" />
      <path d="M170 122 L188 122" />
    `,
    sumo: `
      <circle cx="110" cy="32" r="14" />
      <path d="M110 46 L110 92" />
      <path d="M110 60 L84 82" />
      <path d="M110 60 L136 82" />
      <path d="M110 92 L74 142 L58 170" />
      <path d="M110 92 L146 142 L162 170" />
      <path d="M50 170 L68 170" />
      <path d="M152 170 L170 170" />
    `
  };

  return common + (drawings[key] || drawings.front) + close;
}
