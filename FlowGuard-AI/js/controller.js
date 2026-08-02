/**
 * FlowGuard AI — Milestone 6
 * Prototype Signal Controller + Simulated Emergency Vehicle Priority
 *
 * PROTOTYPE SIMULATION PARAMETERS (not IRC/HCM mandated values):
 *   YELLOW_TIME      = 3 seconds
 *   ALL_RED_TIME     = 2 seconds
 *   EVP_GREEN_HOLD   = 15 seconds
 *
 * Safety Rule: No two conflicting approaches may ever show GREEN simultaneously.
 * Any violation forces ALL RED and logs "SAFETY INTERLOCK — ALL RED".
 *
 * exportSignalState() returns a plain JS object ready for future ESP32 integration.
 * No hardware communication is implemented in Milestone 6.
 */

const Controller = (function () {
  'use strict';

  /* =====================================================================
     PROTOTYPE CONSTANTS & ADAPTIVE RECOVERY PARAMETERS
  ===================================================================== */
  const YELLOW_TIME        = 3;   // seconds — PROTOTYPE SIMULATION PARAMETER
  const ALL_RED_TIME       = 2;   // seconds — PROTOTYPE SIMULATION PARAMETER
  const EVP_GREEN_HOLD     = 15;  // seconds — PROTOTYPE SIMULATION PARAMETER
  const TICK_MS            = 100; // state-machine tick interval (ms)
  const MAX_LOG_ENTRIES    = 20;

  // Milestone 6.3: Prototype Adaptive Post-EVP Recovery Parameters (Not IRC/HCM mandated)
  const MAX_RECOVERY_WAIT  = 120; // seconds — PROTOTYPE STARVATION THRESHOLD
  const RECOVERY_WEIGHTS   = { queue: 0.50, waiting: 0.30, pressure: 0.20 }; // Weights for Queue, Waiting, Pressure

  /* =====================================================================
     PHASE STATES
  ===================================================================== */
  const PHASE = {
    GREEN     : 'GREEN',
    YELLOW    : 'YELLOW',
    ALL_RED   : 'ALL_RED',
    EVP_GREEN : 'EVP_GREEN',
    IDLE      : 'IDLE'
  };

  /* =====================================================================
     CANONICAL SIGNAL STATE  (single source of truth)
  ===================================================================== */
  const signalState = {
    running         : false,
    paused          : false,
    mode            : 'NORMAL',    // 'NORMAL' | 'RECOVERY'
    phase           : PHASE.IDLE,
    activeKeys      : ['north', 'east', 'south', 'west'],
    inactiveKeys    : [],
    phaseQueue      : [],          // ordered list of approach keys to serve
    currentIndex    : 0,           // index into phaseQueue
    currentApproach : null,        // approach key currently GREEN
    phaseRemaining  : 0,           // countdown in seconds (may be fractional)
    greenTimes      : {},          // { north: 30, east: 30, south: 30, west: 30 }
    timingSource    : 'BASELINE',  // 'BASELINE' | 'CANDIDATE'
    candidateStatus : null,        // null | 'RECOMMENDED' | 'CONDITIONAL' | 'NOT_RECOMMENDED'
    evp             : {
      active      : false,
      approach    : null,
      vehicleType : null,
      phase       : null,   // 'TRANSITION_YELLOW' | 'TRANSITION_ALL_RED' | 'EVP_GREEN' | 'EVP_YELLOW' | 'EVP_ALL_RED'
      phaseTimer  : 0
    },
    recovery        : {
      active             : false,
      pendingSet         : [],     // list of approach keys waiting for recovery service
      lastEVPApproach    : null,   // key of approach that received EVP
      interruptedApproach: null,   // { key, plannedGreen, greenServed, greenRemaining }
      currentSelection   : null,   // { key, score, queueScore, waitingScore, pressureScore, reason }
      lastServedApproach : null    // key of approach served during recovery
    },
    waitingTrackers : { north: 0, east: 0, south: 0, west: 0 }, // waiting seconds since last green
    lamps           : {},          // { north: 'red'|'yellow'|'green'|'off', ... }
    eventLog        : [],
    safetyInterlockTriggered: false
  };

  /* =====================================================================
     TIMER / INTERVAL
  ===================================================================== */
  let _tickInterval  = null;
  let _lastTickTime  = null;
  let _demoTimeout   = null;

  /* =====================================================================
     APPROACH METADATA (from FlowGuard.APPROACHES)
  ===================================================================== */
  const APPROACH_LABELS = {
    north : 'Road A (North)',
    east  : 'Road B (East)',
    south : 'Road C (South)',
    west  : 'Road D (West)'
  };

  /* =====================================================================
     UTILITIES
  ===================================================================== */
  function _ts() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  }

  function _log(message, level) {
    // level: 'info' | 'warn' | 'error' | 'evp' | 'safety'
    const entry = { time: _ts(), message, level: level || 'info' };
    signalState.eventLog.unshift(entry);
    if (signalState.eventLog.length > MAX_LOG_ENTRIES) {
      signalState.eventLog.pop();
    }
    _renderLog();
    console.log(`[FlowGuard Controller ${entry.time}] [${entry.level.toUpperCase()}] ${message}`);
  }

  /* =====================================================================
     SAFETY INTERLOCK
  ===================================================================== */
  function _safetyInterlock(reason) {
    // Force ALL lamps to RED immediately
    signalState.activeKeys.forEach(k => { signalState.lamps[k] = 'red'; });
    signalState.phase = PHASE.ALL_RED;
    signalState.phaseRemaining = ALL_RED_TIME;
    signalState.safetyInterlockTriggered = true;
    signalState.evp.active = false;
    _log(`SAFETY INTERLOCK — ALL RED${reason ? ': ' + reason : ''}`, 'safety');
    _renderAll();
  }

  /**
   * Verify no two active approaches have GREEN simultaneously.
   * Call before every render.
   */
  function _checkSafetyInvariant() {
    const greenApproaches = signalState.activeKeys.filter(k => signalState.lamps[k] === 'green');
    if (greenApproaches.length > 1) {
      _safetyInterlock(`Conflicting GREEN detected on: ${greenApproaches.join(', ')}`);
      return false;
    }
    return true;
  }

  /* =====================================================================
     LAMP HELPERS
  ===================================================================== */
  function _setAllLamps(color) {
    signalState.activeKeys.forEach(k => { signalState.lamps[k] = color; });
    signalState.inactiveKeys.forEach(k => { signalState.lamps[k] = 'off'; });
  }

  function _setGreen(approachKey) {
    // ALL others RED first, then one approach GREEN
    _setAllLamps('red');
    if (signalState.activeKeys.includes(approachKey)) {
      signalState.lamps[approachKey] = 'green';
    }
    // Safety check after assignment
    _checkSafetyInvariant();
  }

  function _setYellow(approachKey) {
    _setAllLamps('red');
    if (signalState.activeKeys.includes(approachKey)) {
      signalState.lamps[approachKey] = 'yellow';
    }
  }

  function _setAllRed() {
    _setAllLamps('red');
  }

  /* =====================================================================
     GREEN-TIME RESOLUTION
  ===================================================================== */
  function _resolveGreenTimes() {
    const state = FlowGuard.getState();
    const activeKeys = signalState.activeKeys;

    // Use candidate timing only if status allows
    // Note: validationResult.status uses spaces: 'RECOMMENDED', 'CONDITIONAL', 'NOT RECOMMENDED'
    if (signalState.timingSource === 'CANDIDATE' && state.proposedTiming) {
      const status = signalState.candidateStatus;
      if (status === 'RECOMMENDED' || status === 'CONDITIONAL') {
        const times = {};
        activeKeys.forEach(k => {
          const rec = state.proposedTiming[k];
          // proposedTiming[k] is an object {proposedGreen, currentGreen, ...}
          times[k] = rec ? (parseFloat(rec.proposedGreen) || parseFloat(rec) || 30) : 30;
        });
        _log(`Timing source: CANDIDATE (${status})`, 'info');
        return times;
      } else {
        // NOT RECOMMENDED — revert to baseline
        _log('Candidate plan is NOT RECOMMENDED — using Baseline timing.', 'warn');
        signalState.timingSource = 'BASELINE';
      }
    }

    // Baseline — use currentGreen from stored approach data
    const times = {};
    activeKeys.forEach(k => {
      const app = state.approaches[k];
      times[k] = app ? (parseFloat(app.currentGreen) || 30) : 30;
    });
    return times;
  }

  /* =====================================================================
     PHASE QUEUE — build round-robin sequence from active approaches
  ===================================================================== */
  function _buildPhaseQueue() {
    // Ordered: north → east → south → west, skip inactive
    const ORDER = ['north', 'east', 'south', 'west'];
    signalState.phaseQueue = ORDER.filter(k => signalState.activeKeys.includes(k));
    signalState.currentIndex = 0;
  }

  /* =====================================================================
     NORMAL PHASE ADVANCEMENT
  ===================================================================== */
  function _nextNormalPhase() {
    if (signalState.phaseQueue.length === 0) {
      _log('Phase queue empty — cannot advance.', 'warn');
      return;
    }

    const key = signalState.phaseQueue[signalState.currentIndex % signalState.phaseQueue.length];
    signalState.currentApproach = key;
    signalState.phase = PHASE.GREEN;
    signalState.phaseRemaining = signalState.greenTimes[key] || 30;
    _setGreen(key);
    _log(`${APPROACH_LABELS[key]} — GREEN (${signalState.phaseRemaining}s)`, 'info');
  }

  /* =====================================================================
     STATE MACHINE TICK
  ===================================================================== */
  function _tick() {
    if (!signalState.running || signalState.paused) return;

    const now = performance.now();
    const elapsed = _lastTickTime ? (now - _lastTickTime) / 1000 : TICK_MS / 1000;
    _lastTickTime = now;

    // Track waiting time since last service for non-green active approaches
    signalState.activeKeys.forEach(k => {
      if (k !== signalState.currentApproach || (signalState.phase !== PHASE.GREEN && signalState.phase !== PHASE.EVP_GREEN)) {
        signalState.waitingTrackers[k] = (signalState.waitingTrackers[k] || 0) + elapsed;
      }
    });

    // ---- EVP sub-state machine ----------------------------------------
    if (signalState.evp.active) {
      _tickEvp(elapsed);
      _renderAll();
      return;
    }

    // ---- Normal / Recovery state machine ------------------------------
    signalState.phaseRemaining -= elapsed;

    if (signalState.phaseRemaining > 0) {
      // Still in current phase
      _renderAll();
      return;
    }

    // Phase expired — advance
    switch (signalState.phase) {
      case PHASE.GREEN: {
        // GREEN expired → YELLOW
        const currentKey = signalState.currentApproach;
        signalState.phase = PHASE.YELLOW;
        signalState.phaseRemaining = YELLOW_TIME;
        _setYellow(currentKey);
        _log(`${APPROACH_LABELS[currentKey]} — YELLOW (${YELLOW_TIME}s)`, 'info');
        break;
      }
      case PHASE.YELLOW: {
        // YELLOW expired → ALL RED
        signalState.phase = PHASE.ALL_RED;
        signalState.phaseRemaining = ALL_RED_TIME;
        _setAllRed();
        _log(`ALL RED (${ALL_RED_TIME}s clearance)`, 'info');
        break;
      }
      case PHASE.ALL_RED: {
        // ALL RED expired → advance to next phase (RECOVERY or NORMAL)
        if (signalState.mode === 'RECOVERY') {
          _selectNextRecoveryApproach();
        } else {
          signalState.currentIndex = (signalState.currentIndex + 1) % signalState.phaseQueue.length;
          _nextNormalPhase();
        }
        break;
      }
      default:
        break;
    }

    _renderAll();
  }

  /* =====================================================================
     EVP SUB-STATE MACHINE
  ===================================================================== */
  function _tickEvp(elapsed) {
    const evp = signalState.evp;
    evp.phaseTimer -= elapsed;

    if (evp.phaseTimer > 0) return; // Still in current EVP sub-phase

    switch (evp.phase) {

      case 'TRANSITION_YELLOW': {
        // Current approach yellow expired → ALL RED before EVP green
        evp.phase = 'TRANSITION_ALL_RED';
        evp.phaseTimer = ALL_RED_TIME;
        _setAllRed();
        signalState.phase = PHASE.ALL_RED;
        _log(`ALL RED — clearing before EVP (${ALL_RED_TIME}s)`, 'evp');
        break;
      }

      case 'TRANSITION_ALL_RED': {
        // ALL RED expired → EVP approach gets GREEN
        evp.phase = 'EVP_GREEN';
        evp.phaseTimer = EVP_GREEN_HOLD;
        signalState.phase = PHASE.EVP_GREEN;
        _setGreen(evp.approach);
        signalState.waitingTrackers[evp.approach] = 0; // Reset waiting tracker for EVP approach
        _log(`${APPROACH_LABELS[evp.approach]} — EMERGENCY GREEN (${EVP_GREEN_HOLD}s hold) [${evp.vehicleType}]`, 'evp');
        break;
      }

      case 'EVP_GREEN': {
        // EVP green hold expired → begin safe EVP termination (YELLOW)
        _terminateEvpAuto();
        break;
      }

      case 'EVP_YELLOW': {
        // EVP yellow expired → ALL RED
        evp.phase = 'EVP_ALL_RED';
        evp.phaseTimer = ALL_RED_TIME;
        _setAllRed();
        signalState.phase = PHASE.ALL_RED;
        _log(`ALL RED — EVP clearance (${ALL_RED_TIME}s)`, 'evp');
        break;
      }

      case 'EVP_ALL_RED': {
        // EVP clearance done → enter Adaptive Post-EVP Recovery
        _endEvp();
        break;
      }

      default:
        _endEvp();
        break;
    }
  }

  /* =====================================================================
     EVP HELPERS & POST-EVP ADAPTIVE RECOVERY ENGINE
  ===================================================================== */

  /**
   * Safely end the EVP and initiate Adaptive Post-Emergency Recovery.
   */
  function _endEvp() {
    const evpApp = signalState.evp.approach;
    signalState.evp.active     = false;
    signalState.evp.phase      = null;
    signalState.evp.phaseTimer = 0;

    _startPostEvpRecovery(evpApp);
  }

  /**
   * Extract engineering data (Queue, Traffic Pressure, Waiting time) from FlowGuard state
   */
  function _getRecoveryMetrics() {
    const state = FlowGuard.getState();
    const activeKeys = signalState.activeKeys;
    const queues = {};
    const pressures = {};
    const waiting = {};

    const optRes = state.optResults;
    const simRes = optRes ? (optRes.proposedSimResult || optRes.currentSimResult) : null;
    const approachesData = state.approaches || {};

    activeKeys.forEach(k => {
      // 1. Engineering Queue (from D/D/1 simulation result)
      if (simRes && simRes.approaches && simRes.approaches[k]) {
        queues[k] = simRes.approaches[k].maxQueueLength !== undefined ? simRes.approaches[k].maxQueueLength : (simRes.approaches[k].avgQueueLength || 0);
      } else {
        const f = approachesData[k] ? parseFloat(approachesData[k].flow) || 0 : 0;
        queues[k] = f / 100;
      }

      // 2. Traffic Pressure (v/c ratio from engineering simulation or analysis)
      if (simRes && simRes.approaches && simRes.approaches[k]) {
        pressures[k] = simRes.approaches[k].vcRatio || 0;
      } else if (approachesData[k] && approachesData[k].vcRatio !== undefined) {
        pressures[k] = parseFloat(approachesData[k].vcRatio) || 0;
      } else {
        const f = approachesData[k] ? parseFloat(approachesData[k].flow) || 0 : 0;
        const c = (parseInt(approachesData[k] ? approachesData[k].lanes : 2, 10) || 2) * 1800 * 0.25;
        pressures[k] = c > 0 ? f / c : 0;
      }

      // 3. Waiting seconds since last service
      waiting[k] = signalState.waitingTrackers[k] || 0;
    });

    return { queues, pressures, waiting };
  }

  /**
   * Normalize a mapping of values to [0.0, 1.0] across specified keys
   */
  function _normalizeMap(valMap, keys) {
    const normMap = {};
    if (!keys || keys.length === 0) return normMap;
    let min = Infinity, max = -Infinity;
    keys.forEach(k => {
      const v = valMap[k] !== undefined ? valMap[k] : 0;
      if (v < min) min = v;
      if (v > max) max = v;
    });
    const range = max - min;
    keys.forEach(k => {
      if (range > 0.0001) {
        normMap[k] = (valMap[k] - min) / range;
      } else {
        normMap[k] = max > 0 ? 0.5 : 0.0;
      }
    });
    return normMap;
  }

  /**
   * Calculate PriorityScore = 0.50 * QueueScore + 0.30 * WaitingScore + 0.20 * PressureScore
   */
  function _computeRecoveryPriorityScores(eligibleKeys) {
    const { queues, pressures, waiting } = _getRecoveryMetrics();

    const normQ = _normalizeMap(queues, eligibleKeys);
    const normW = _normalizeMap(waiting, eligibleKeys);
    const normP = _normalizeMap(pressures, eligibleKeys);

    const scores = {};
    eligibleKeys.forEach(k => {
      const qScore = normQ[k] || 0;
      const wScore = normW[k] || 0;
      const pScore = normP[k] || 0;

      let score = RECOVERY_WEIGHTS.queue * qScore +
                  RECOVERY_WEIGHTS.waiting * wScore +
                  RECOVERY_WEIGHTS.pressure * pScore;

      const waitSec = waiting[k] || 0;
      const isStarved = waitSec > MAX_RECOVERY_WAIT;

      scores[k] = {
        key: k,
        totalScore: Math.round(score * 100) / 100,
        queueScore: Math.round(qScore * 100) / 100,
        waitingScore: Math.round(wScore * 100) / 100,
        pressureScore: Math.round(pScore * 100) / 100,
        rawQueue: queues[k] || 0,
        rawWaiting: Math.round(waitSec),
        rawPressure: Math.round((pressures[k] || 0) * 100) / 100,
        isStarved: isStarved
      };
    });

    return scores;
  }

  /**
   * Initiate POST-EVP RECOVERY mode when an emergency clears.
   */
  function _startPostEvpRecovery(evpApp) {
    signalState.mode = 'RECOVERY';
    signalState.recovery.active = true;
    signalState.recovery.lastEVPApproach = evpApp;

    // Candidates for recovery: all active approaches except the approach that just received EVP green
    let pending = signalState.activeKeys.filter(k => k !== evpApp);
    if (pending.length === 0) pending = [...signalState.activeKeys];

    signalState.recovery.pendingSet = pending;

    _log(`EVP cleared — entering adaptive recovery`, 'evp');
    _log(`Recovery candidates: ${pending.map(k => APPROACH_LABELS[k] || k).join(', ')}`, 'info');

    _selectNextRecoveryApproach();
  }

  /**
   * Intelligently select the next approach to receive GREEN during post-EVP recovery.
   */
  function _selectNextRecoveryApproach() {
    const pending = signalState.recovery.pendingSet;

    if (!pending || pending.length === 0) {
      _endRecoveryMode();
      return;
    }

    const scores = _computeRecoveryPriorityScores(pending);

    // Starvation protection check
    const starvedKeys = pending.filter(k => scores[k] && scores[k].isStarved);
    let chosenKey = null;
    let chosenReason = '';

    if (starvedKeys.length > 0) {
      starvedKeys.sort((a, b) => (scores[b].rawWaiting - scores[a].rawWaiting));
      chosenKey = starvedKeys[0];
      chosenReason = `Starvation Protection Override (Waited ${scores[chosenKey].rawWaiting}s > ${MAX_RECOVERY_WAIT}s)`;
    } else {
      const sorted = [...pending].sort((a, b) => (scores[b].totalScore - scores[a].totalScore));
      chosenKey = sorted[0];
      chosenReason = `Highest recovery priority score (${scores[chosenKey].totalScore})`;
    }

    signalState.recovery.pendingSet = pending.filter(k => k !== chosenKey);
    signalState.recovery.lastServedApproach = chosenKey;
    signalState.recovery.currentSelection = {
      key: chosenKey,
      score: scores[chosenKey].totalScore,
      queueScore: scores[chosenKey].queueScore,
      waitingScore: scores[chosenKey].waitingScore,
      pressureScore: scores[chosenKey].pressureScore,
      reason: chosenReason,
      rawQueue: scores[chosenKey].rawQueue,
      rawWaiting: scores[chosenKey].rawWaiting,
      rawPressure: scores[chosenKey].rawPressure
    };

    _log(`${APPROACH_LABELS[chosenKey]} selected — ${chosenReason}`, 'info');

    signalState.currentApproach = chosenKey;
    signalState.phase = PHASE.GREEN;
    signalState.phaseRemaining = signalState.greenTimes[chosenKey] || 30;
    signalState.waitingTrackers[chosenKey] = 0; // Reset waiting tracker for chosen approach
    _setGreen(chosenKey);
    _log(`${APPROACH_LABELS[chosenKey]} — RECOVERY GREEN (${signalState.phaseRemaining}s)`, 'info');
  }

  /**
   * Exit POST-EVP RECOVERY mode and return to NORMAL round-robin signal cycling.
   */
  function _endRecoveryMode() {
    const lastServed = signalState.recovery.lastServedApproach || signalState.currentApproach;
    signalState.mode = 'NORMAL';
    signalState.recovery.active = false;
    signalState.recovery.pendingSet = [];
    signalState.recovery.currentSelection = null;

    _log(`Recovery complete — returning to NORMAL mode.`, 'info');

    const queue = signalState.phaseQueue;
    if (lastServed && queue.length > 0) {
      const idx = queue.indexOf(lastServed);
      if (idx !== -1) {
        signalState.currentIndex = (idx + 1) % queue.length;
      }
    }

    _nextNormalPhase();
  }

  /**
   * Begin automatic EVP termination sequence: EVP GREEN → YELLOW → ALL RED → normal.
   */
  function _terminateEvpAuto() {
    const evp = signalState.evp;
    evp.phase = 'EVP_YELLOW';
    evp.phaseTimer = YELLOW_TIME;
    _setYellow(evp.approach);
    signalState.phase = PHASE.YELLOW;
    _log(`${APPROACH_LABELS[evp.approach]} — EVP YELLOW (${YELLOW_TIME}s) — returning to normal`, 'evp');
  }

  /* =====================================================================
     PUBLIC API — CONTROL
  ===================================================================== */

  /**
   * Initialise the controller for the current FlowGuard state.
   * Reads geometry and timing from localStorage (FlowGuard.getState()).
   */
  function init() {
    const state = FlowGuard.getState();
    const config = state.configType || '4CROSS';
    signalState.activeKeys   = FlowGuard.getActiveApproachKeys(config);
    signalState.inactiveKeys = ['north','east','south','west'].filter(
      k => !signalState.activeKeys.includes(k)
    );

    // Resolve candidate status from stored optResults
    // validationResult.status uses space-separated values: 'RECOMMENDED', 'CONDITIONAL', 'NOT RECOMMENDED'
    if (state.optResults && state.optResults.validationResult) {
      signalState.candidateStatus = state.optResults.validationResult.status || null;
    } else if (state.optResults && state.optResults.acceptanceStatus) {
      signalState.candidateStatus = state.optResults.acceptanceStatus || null;
    } else {
      signalState.candidateStatus = null;
    }

    // Reset EVP
    signalState.evp = { active: false, approach: null, vehicleType: null, phase: null, phaseTimer: 0 };

    // Initialise lamps
    signalState.activeKeys.forEach(k => { signalState.lamps[k] = 'red'; });
    signalState.inactiveKeys.forEach(k => { signalState.lamps[k] = 'off'; });

    // Build phase queue and resolve timing
    _buildPhaseQueue();
    signalState.greenTimes = _resolveGreenTimes();

    // Reset Recovery mode state & waiting trackers
    signalState.mode = 'NORMAL';
    signalState.recovery = {
      active             : false,
      pendingSet         : [],
      lastEVPApproach    : null,
      interruptedApproach: null,
      currentSelection   : null,
      lastServedApproach : null
    };
    signalState.waitingTrackers = { north: 0, east: 0, south: 0, west: 0 };

    signalState.running = false;
    signalState.paused  = false;
    signalState.phase   = PHASE.IDLE;
    signalState.currentApproach = null;
    signalState.phaseRemaining  = 0;
    signalState.currentIndex    = 0;
    signalState.safetyInterlockTriggered = false;

    _log(`Controller initialised — ${FlowGuard.getConfigLabel(config)}, source: ${signalState.timingSource}`, 'info');
    _renderAll();
    _updateConfigDisplay();
  }

  function start() {
    if (signalState.running) return;
    if (signalState.phaseQueue.length === 0) { _log('No active approaches — cannot start.', 'warn'); return; }

    signalState.running = true;
    signalState.paused  = false;
    signalState.safetyInterlockTriggered = false;
    _lastTickTime = performance.now();
    _nextNormalPhase();
    _tickInterval = setInterval(_tick, TICK_MS);
    _log('Controller STARTED.', 'info');
    _renderAll();
    _updateButtons();
  }

  function pause() {
    if (!signalState.running || signalState.paused) return;
    signalState.paused = true;
    _log('Controller PAUSED.', 'info');
    _updateButtons();
    _renderAll();
  }

  function resume() {
    if (!signalState.running || !signalState.paused) return;
    signalState.paused = false;
    _lastTickTime = performance.now(); // reset tick reference to avoid time jump
    _log('Controller RESUMED.', 'info');
    _updateButtons();
    _renderAll();
  }

  function stop() {
    signalState.running = false;
    signalState.paused  = false;
    if (_tickInterval) { clearInterval(_tickInterval); _tickInterval = null; }
    if (_demoTimeout)  { clearTimeout(_demoTimeout);   _demoTimeout  = null; }
    signalState.phase   = PHASE.IDLE;
    signalState.evp.active = false;
    _setAllRed();
    _log('Controller STOPPED.', 'info');
    _renderAll();
    _updateButtons();
  }

  function reset() {
    stop();
    signalState.eventLog = [];
    signalState.safetyInterlockTriggered = false;
    signalState.timingSource = 'BASELINE';
    signalState.candidateStatus = null;
    init();
    _log('Controller RESET.', 'info');
    _renderAll();
    _updateButtons();
  }

  /* =====================================================================
     TIMING SOURCE SELECTION
  ===================================================================== */
  function selectTiming(source) {
    // source: 'BASELINE' | 'CANDIDATE'
    const state = FlowGuard.getState();

    if (source === 'CANDIDATE') {
      const status = signalState.candidateStatus;
      if (!status) {
        _log('No candidate timing available. Run Analysis first.', 'warn');
        return;
      }
      // Status values: 'RECOMMENDED', 'CONDITIONAL', 'NOT RECOMMENDED'
      if (status === 'NOT RECOMMENDED') {
        _log('Candidate plan is NOT RECOMMENDED — keeping Baseline timing.', 'warn');
        _showTimingWarning('NOT RECOMMENDED — Baseline retained. Reason: Candidate plan does not satisfy safety/fairness criteria.', 'error');
        return;
      }
      if (status === 'CONDITIONAL') {
        _showTimingWarning('WARNING: Candidate plan is CONDITIONAL. Manual override — proceed with caution.', 'warn');
      }
    }

    signalState.timingSource = source;
    signalState.greenTimes = _resolveGreenTimes();
    _log(`Timing source set to: ${source}`, 'info');

    // If running, the new times will take effect on the next phase transition
    _renderAll();
    _updateTimingButtons();
  }

  /* =====================================================================
     EMERGENCY VEHICLE PRIORITY
  ===================================================================== */
  function requestEVP(approachKey, vehicleType) {
    if (!signalState.running) {
      _log('EVP requested but controller is not running.', 'warn');
      return;
    }
    if (signalState.inactiveKeys.includes(approachKey)) {
      _log(`EVP BLOCKED — ${APPROACH_LABELS[approachKey]} is INACTIVE.`, 'warn');
      return;
    }
    if (!signalState.activeKeys.includes(approachKey)) {
      _log(`EVP BLOCKED — unknown approach: ${approachKey}.`, 'warn');
      return;
    }
    if (signalState.paused) {
      _log('EVP requested while paused — resuming then activating EVP.', 'warn');
      resume();
    }

    const evp = signalState.evp;
    evp.vehicleType = vehicleType || 'Emergency Vehicle';
    evp.approach    = approachKey;
    evp.active      = true;

    _log(`⚡ EVP REQUEST — ${evp.vehicleType} at ${APPROACH_LABELS[approachKey]}`, 'evp');

    // If the requested approach already has GREEN → begin safe termination then re-grant EVP green
    if (signalState.currentApproach === approachKey && signalState.phase === PHASE.GREEN) {
      _log(`${APPROACH_LABELS[approachKey]} already GREEN — extending with EVP hold.`, 'evp');
      // Transition to EVP_GREEN directly (no conflicting approach)
      evp.phase = 'EVP_GREEN';
      evp.phaseTimer = EVP_GREEN_HOLD;
      signalState.phase = PHASE.EVP_GREEN;
      signalState.phaseRemaining = EVP_GREEN_HOLD;
      _setGreen(approachKey);
      _log(`${APPROACH_LABELS[approachKey]} — EMERGENCY GREEN EXTENDED (${EVP_GREEN_HOLD}s)`, 'evp');
    } else {
      // Need to safely clear the current approach first
      const currentKey = signalState.currentApproach;

      if (signalState.phase === PHASE.GREEN && currentKey) {
        // Record interrupted approach details for recovery diagnostics
        const planned = signalState.greenTimes[currentKey] || 30;
        const rem = Math.max(0, signalState.phaseRemaining);
        const served = Math.max(0, planned - rem);
        signalState.recovery.interruptedApproach = {
          key: currentKey,
          plannedGreen: planned,
          greenServed: Math.round(served * 10) / 10,
          greenRemaining: Math.round(rem * 10) / 10
        };
        _log(`Interrupted phase recorded: ${APPROACH_LABELS[currentKey]} (${Math.round(served)}s served / ${Math.round(rem)}s remaining)`, 'evp');

        // Current approach is green → transition to yellow first
        evp.phase = 'TRANSITION_YELLOW';
        evp.phaseTimer = YELLOW_TIME;
        _setYellow(currentKey);
        signalState.phase = PHASE.YELLOW;
        _log(`${APPROACH_LABELS[currentKey]} — YELLOW (${YELLOW_TIME}s) — clearing for EVP`, 'evp');
      } else if (signalState.phase === PHASE.YELLOW && currentKey) {
        // Already in yellow → skip to ALL RED
        evp.phase = 'TRANSITION_ALL_RED';
        evp.phaseTimer = ALL_RED_TIME;
        _setAllRed();
        signalState.phase = PHASE.ALL_RED;
        _log(`ALL RED (${ALL_RED_TIME}s) — accelerated clearing for EVP`, 'evp');
      } else {
        // Already ALL RED or IDLE → go straight to EVP GREEN
        evp.phase = 'EVP_GREEN';
        evp.phaseTimer = EVP_GREEN_HOLD;
        signalState.phase = PHASE.EVP_GREEN;
        _setGreen(approachKey);
        _log(`${APPROACH_LABELS[approachKey]} — EMERGENCY GREEN (${EVP_GREEN_HOLD}s) [${evp.vehicleType}]`, 'evp');
      }
    }

    _renderAll();
  }

  /**
   * Manually terminate the active EVP (engineer override).
   */
  function terminateEVP() {
    if (!signalState.evp.active) { _log('No active EVP to terminate.', 'warn'); return; }
    _log('EVP manually terminated by operator.', 'evp');
    _terminateEvpAuto(); // safe YELLOW → ALL RED → normal
    _renderAll();
  }

  /* =====================================================================
     EMERGENCY DEMO
  ===================================================================== */
  function runDemo() {
    if (signalState.running) { stop(); }
    signalState.eventLog = [];
    init();
    _log('=== RUN EMERGENCY DEMO ===', 'info');

    // Slight delay before auto-start so UI refreshes
    setTimeout(() => {
      start();
      // After Road A gets GREEN (first phase), request EVP on Road C
      // Road A GREEN duration from green times
      const roadAGreen = signalState.greenTimes['north'] || 30;
      // Wait 1 second into Road A GREEN then trigger EVP for Road C
      const evpDelay = Math.min(1000, roadAGreen * 900); // 1s into green

      _demoTimeout = setTimeout(() => {
        _log('--- Demo: Requesting EVP for Road C (South) ---', 'evp');
        requestEVP('south', 'Ambulance');
      }, evpDelay);
    }, 100);
  }

  /* =====================================================================
     EXPORT STATE
  ===================================================================== */
  /**
   * Returns a plain JS object representing the current signal state.
   * Designed as the future ESP32 data source (no hardware comm in M6).
   */
  function exportSignalState() {
    return {
      timestamp    : new Date().toISOString(),
      phase        : signalState.phase,
      lamps        : Object.assign({}, signalState.lamps),
      activeKeys   : signalState.activeKeys.slice(),
      inactiveKeys : signalState.inactiveKeys.slice(),
      evpActive    : signalState.evp.active,
      evpApproach  : signalState.evp.approach,
      timingSource : signalState.timingSource,
      paused       : signalState.paused,
      running      : signalState.running
    };
  }

  /* =====================================================================
     RENDER HELPERS
  ===================================================================== */

  function _updateConfigDisplay() {
    const state = FlowGuard.getState();
    const cfg = state.configType || '4CROSS';
    const el = document.getElementById('ctrl-config-label');
    if (el) el.textContent = FlowGuard.getConfigLabel(cfg);

    const activeEl = document.getElementById('ctrl-active-apps');
    if (activeEl) activeEl.textContent = signalState.activeKeys.map(k => APPROACH_LABELS[k]).join(', ');

    const inactiveEl = document.getElementById('ctrl-inactive-apps');
    if (inactiveEl) inactiveEl.textContent = signalState.inactiveKeys.length
      ? signalState.inactiveKeys.map(k => APPROACH_LABELS[k]).join(', ')
      : 'None';

    // Candidate status display
    const candStatusEl = document.getElementById('ctrl-candidate-status');
    if (candStatusEl) {
      const s = signalState.candidateStatus;
      if (!s) {
        candStatusEl.textContent = 'No analysis run yet';
        candStatusEl.className = 'ctrl-status-dim';
      } else {
        const LABELS = { 'RECOMMENDED': '✅ RECOMMENDED', 'CONDITIONAL': '⚠️ CONDITIONAL', 'NOT RECOMMENDED': '❌ NOT RECOMMENDED' };
        const label = LABELS[s] || s;
        candStatusEl.textContent = label;
        candStatusEl.className = s === 'RECOMMENDED' ? 'ctrl-status-ok'
                               : s === 'CONDITIONAL' ? 'ctrl-status-warn'
                               : 'ctrl-status-err';
      }
    }
  }

  function _renderAll() {
    _renderLamps();
    _renderStatus();
    _renderCountdown();
    _renderEvpStatus();
    _renderRecoveryStatus();
    _updateButtons();
    _renderLog();
  }

  function _renderRecoveryStatus() {
    const badge = document.getElementById('ctrl-recovery-mode-badge');
    if (badge) {
      if (signalState.mode === 'RECOVERY') {
        badge.textContent = 'MODE: ADAPTIVE RECOVERY';
        badge.style.background = 'rgba(16,185,129,0.2)';
        badge.style.color = '#10b981';
      } else {
        badge.textContent = 'MODE: NORMAL';
        badge.style.background = 'rgba(148,163,184,0.15)';
        badge.style.color = '#94a3b8';
      }
    }

    const selEl = document.getElementById('ctrl-rec-selected');
    const reasonEl = document.getElementById('ctrl-rec-reason');
    const scoreBox = document.getElementById('ctrl-rec-scores-box');

    const sel = signalState.recovery.currentSelection;
    if (signalState.mode === 'RECOVERY' && sel) {
      if (selEl) selEl.textContent = APPROACH_LABELS[sel.key] || sel.key;
      if (reasonEl) reasonEl.textContent = sel.reason;
      if (scoreBox) scoreBox.style.display = 'block';

      const qEl = document.getElementById('ctrl-score-q');
      const wEl = document.getElementById('ctrl-score-w');
      const pEl = document.getElementById('ctrl-score-p');
      const tEl = document.getElementById('ctrl-score-total');

      if (qEl) qEl.textContent = sel.queueScore.toFixed(2);
      if (wEl) wEl.textContent = sel.waitingScore.toFixed(2);
      if (pEl) pEl.textContent = sel.pressureScore.toFixed(2);
      if (tEl) tEl.textContent = sel.score.toFixed(2);
    } else {
      if (selEl) selEl.textContent = '—';
      if (reasonEl) reasonEl.textContent = 'Standard cycle active';
      if (scoreBox) scoreBox.style.display = 'none';
    }
  }

  function _renderLamps() {
    const ALL_APPROACHES = ['north', 'east', 'south', 'west'];
    ALL_APPROACHES.forEach(approach => {
      const lampColor = signalState.lamps[approach] || 'off';
      const isInactive = signalState.inactiveKeys.includes(approach);

      ['red', 'yellow', 'green'].forEach(color => {
        const el = document.getElementById(`lamp-${approach}-${color}`);
        if (!el) return;
        el.className = 'lamp';

        if (isInactive) {
          // Inactive approach — all lamps dim
          el.classList.add(`lamp-${color}`, 'lamp-dim');
        } else if (lampColor === color) {
          // Active color
          el.classList.add(`lamp-${color}`, 'lamp-glow');
        } else {
          // Inactive color — show very dim
          el.classList.add(`lamp-${color}`, 'lamp-dim');
        }
      });

      // Inactive label
      const inactiveLabel = document.getElementById(`inactive-label-${approach}`);
      if (inactiveLabel) {
        inactiveLabel.style.display = isInactive ? 'block' : 'none';
      }
    });
  }

  function _renderStatus() {
    const phaseEl = document.getElementById('ctrl-phase-display');
    if (phaseEl) {
      let phaseText;
      let phaseClass;
      if (!signalState.running) {
        phaseText  = signalState.phase === PHASE.IDLE ? 'IDLE' : 'STOPPED';
        phaseClass = 'ctrl-phase-idle';
      } else if (signalState.paused) {
        phaseText  = 'PAUSED';
        phaseClass = 'ctrl-phase-idle';
      } else if (signalState.evp.active) {
        phaseText  = `EVP — ${signalState.evp.phase || ''}`;
        phaseClass = 'ctrl-phase-evp';
      } else if (signalState.phase === PHASE.GREEN || signalState.phase === PHASE.EVP_GREEN) {
        phaseText  = 'GREEN';
        phaseClass = 'ctrl-phase-green';
      } else if (signalState.phase === PHASE.YELLOW) {
        phaseText  = 'YELLOW';
        phaseClass = 'ctrl-phase-yellow';
      } else if (signalState.phase === PHASE.ALL_RED) {
        phaseText  = 'ALL RED';
        phaseClass = 'ctrl-phase-allred';
      } else {
        phaseText  = signalState.phase;
        phaseClass = 'ctrl-phase-idle';
      }
      phaseEl.textContent = phaseText;
      phaseEl.className = `ctrl-phase-badge ${phaseClass}`;
    }

    const approachEl = document.getElementById('ctrl-current-approach');
    if (approachEl) {
      if (signalState.currentApproach) {
        approachEl.textContent = APPROACH_LABELS[signalState.currentApproach] || signalState.currentApproach;
      } else {
        approachEl.textContent = '—';
      }
    }

    const evpApEl = document.getElementById('ctrl-evp-approach');
    if (evpApEl) {
      evpApEl.textContent = signalState.evp.active && signalState.evp.approach
        ? `${APPROACH_LABELS[signalState.evp.approach]} [${signalState.evp.vehicleType}]`
        : '—';
    }
  }

  function _renderCountdown() {
    const cdEl = document.getElementById('ctrl-countdown');
    if (!cdEl) return;
    const remaining = signalState.evp.active
      ? signalState.evp.phaseTimer
      : signalState.phaseRemaining;
    cdEl.textContent = signalState.running && !signalState.paused
      ? `${Math.max(0, remaining).toFixed(1)}s`
      : signalState.paused ? 'PAUSED' : '—';
  }

  function _renderEvpStatus() {
    const evpPanel = document.getElementById('ctrl-evp-panel');
    if (evpPanel) {
      evpPanel.style.display = signalState.evp.active ? 'block' : 'none';
    }
    const evpPhaseEl = document.getElementById('ctrl-evp-phase');
    if (evpPhaseEl) {
      evpPhaseEl.textContent = signalState.evp.phase || '—';
    }
  }

  function _renderLog() {
    const logEl = document.getElementById('ctrl-event-log');
    if (!logEl) return;
    logEl.innerHTML = signalState.eventLog.map(e => {
      const cls = {
        info: 'log-info', warn: 'log-warn', error: 'log-error',
        evp: 'log-evp', safety: 'log-safety'
      }[e.level] || 'log-info';
      return `<div class="log-entry ${cls}"><span class="log-time">${e.time}</span><span>${e.message}</span></div>`;
    }).join('');
  }

  function _updateButtons() {
    const set = (id, text, disabled, active) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (text !== null) el.textContent = text;
      el.disabled = disabled;
      if (active !== undefined) {
        el.classList.toggle('btn-active', active);
      }
    };

    const running = signalState.running;
    const paused  = signalState.paused;

    set('ctrl-btn-start',   'Start',                 running && !paused);
    set('ctrl-btn-pause',   paused ? 'Resume' : 'Pause', !running);
    set('ctrl-btn-stop',    'Stop',                  !running);
    set('ctrl-btn-reset',   'Reset',                 false);
    set('ctrl-btn-terminate-evp', 'Terminate EVP',   !signalState.evp.active);
    set('ctrl-btn-demo',    null, running); // null = keep existing text (preserves emoji)
  }

  function _updateTimingButtons() {
    const baseBtn = document.getElementById('ctrl-timing-baseline');
    const candBtn = document.getElementById('ctrl-timing-candidate');
    if (baseBtn) baseBtn.classList.toggle('btn-active', signalState.timingSource === 'BASELINE');
    if (candBtn) candBtn.classList.toggle('btn-active', signalState.timingSource === 'CANDIDATE');
  }

  function _showTimingWarning(msg, level) {
    const el = document.getElementById('ctrl-timing-warning');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    el.className = `ctrl-timing-warning ${level === 'error' ? 'ctrl-warn-error' : 'ctrl-warn-warn'}`;
    setTimeout(() => { el.style.display = 'none'; }, 6000);
  }

  /* =====================================================================
     PUBLIC API
  ===================================================================== */
  return {
    init,
    start,
    pause,
    resume,
    stop,
    reset,
    selectTiming,
    requestEVP,
    terminateEVP,
    runDemo,
    exportSignalState,
    getState: () => signalState,
    APPROACH_LABELS
  };
})();
if (typeof window !== 'undefined') { window.Controller = Controller; }
if (typeof module !== 'undefined' && module.exports) { module.exports = Controller; }
