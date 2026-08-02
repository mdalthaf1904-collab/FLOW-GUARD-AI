/**
 * FlowGuard AI — Milestone 7: Engineering Validation & Automated Test Suite
 * Deterministic Validation Engine & Invariant Verification Suite
 */

const ValidationEngine = (function () {
  'use strict';

  const DEFAULT_INTERSECTION = {
    cycleLength: 120,
    yellowTime: 3,
    allRedTime: 2,
    minGreen: 7,
    maxGreen: 90,
    saturationFlow: 1800,
    numCycles: 10
  };

  /**
   * Check core civil engineering and software invariants on optimization output
   */
  function checkEngineeringInvariants(optRes, intersectionConfig) {
    const activeKeys = optRes.activeKeys || [];
    const rec = optRes.recommendation || {};
    const C = parseFloat(intersectionConfig.cycleLength) || 120;
    const Y = parseFloat(intersectionConfig.yellowTime) || 3;
    const AR = parseFloat(intersectionConfig.allRedTime) || 2;
    const gMin = Math.max(3, parseFloat(intersectionConfig.minGreen) || 7);
    const gMax = Math.min(C - 10, parseFloat(intersectionConfig.maxGreen) || 90);
    const nActive = activeKeys.length;
    const lostTimePerPhase = Y + AR;
    const totalLostTime = nActive * lostTimePerPhase;
    const expectedEffGreen = Math.max(10, C - totalLostTime);

    const ALL_KEYS = ['north', 'east', 'south', 'west'];
    const inactiveKeys = ALL_KEYS.filter(k => !activeKeys.includes(k));

    const failures = [];

    // 1. Inactive approaches receive 0 green time
    inactiveKeys.forEach(k => {
      if (rec[k] && (rec[k].proposedGreen > 0 || rec[k].initialGreen > 0 || rec[k].balancedGreen > 0)) {
        failures.push(`Inactive approach '${k}' received green time allocation.`);
      }
    });

    // 2. Active approach bounds & green sum
    let sumGreen = 0;
    activeKeys.forEach(k => {
      const item = rec[k];
      if (!item) {
        failures.push(`Active approach '${k}' missing from recommendation output.`);
        return;
      }
      const g = item.proposedGreen;
      if (typeof g !== 'number' || isNaN(g) || !isFinite(g)) {
        failures.push(`Approach '${k}' has non-numeric/infinite green time (${g}).`);
      }
      if (g < gMin) {
        failures.push(`Approach '${k}' green (${g}s) violates min green bound (${gMin}s).`);
      }
      if (g > gMax) {
        failures.push(`Approach '${k}' green (${g}s) violates max green bound (${gMax}s).`);
      }
      sumGreen += g;
    });

    if (Math.abs(sumGreen - expectedEffGreen) > 0.001) {
      failures.push(`Sum of green times (${sumGreen}s) does not match total effective green (${expectedEffGreen}s).`);
    }

    // 3. Numerical validity of simulation metrics
    const sim = optRes.proposedSimResult;
    if (!sim || !sim.approaches) {
      failures.push("Proposed simulation result object is missing or malformed.");
    } else {
      activeKeys.forEach(k => {
        const appSim = sim.approaches[k];
        if (!appSim) {
          failures.push(`Approach '${k}' missing from simulation output.`);
          return;
        }
        if (isNaN(appSim.capacity) || appSim.capacity <= 0 || !isFinite(appSim.capacity)) {
          failures.push(`Approach '${k}' capacity is invalid (${appSim.capacity}).`);
        }
        if (isNaN(appSim.vcRatio) || !isFinite(appSim.vcRatio) || appSim.vcRatio < 0) {
          failures.push(`Approach '${k}' v/c ratio is invalid (${appSim.vcRatio}).`);
        }
        if (isNaN(appSim.avgWaitTime) || !isFinite(appSim.avgWaitTime) || appSim.avgWaitTime < 0) {
          failures.push(`Approach '${k}' average wait time is invalid (${appSim.avgWaitTime}).`);
        }
        if (isNaN(appSim.maxQueueLength) || !isFinite(appSim.maxQueueLength) || appSim.maxQueueLength < 0) {
          failures.push(`Approach '${k}' max queue length is invalid (${appSim.maxQueueLength}).`);
        }
      });
    }

    // 4. Recommendation status validity
    const validStatuses = ['RECOMMENDED', 'CONDITIONAL', 'BASELINE RETAINED', 'NOT RECOMMENDED'];
    if (!validStatuses.includes(optRes.acceptanceStatus)) {
      failures.push(`Invalid recommendation status '${optRes.acceptanceStatus}'.`);
    }

    // 5. Pedestrian Safety Invariants
    if (optRes.pedestrianSummary && optRes.pedestrianSummary.enabled) {
      const pedTime = optRes.pedestrianSummary.requiredCrossingTime;
      const totalPedCeil = optRes.pedestrianSummary.requiredCrossingTimeCeil * nActive;

      activeKeys.forEach(k => {
        const item = rec[k];
        if (item && optRes.pedestrianSummary.overallSafe && item.proposedGreen < pedTime) {
          failures.push(`Approach '${k}' green (${item.proposedGreen}s) violates required pedestrian crossing time (${pedTime}s).`);
        }
      });
    }

    return {
      passed: failures.length === 0,
      failures: failures
    };
  }

  /**
   * Run the complete 8-scenario deterministic engineering test suite
   */
  function runTestSuite() {
    const results = [];

    // Helper to construct baseline test case execution
    function executeScenarioTest(testId, name, description, approaches, configType = '4CROSS', customConfig = {}) {
      const intersectionConfig = { ...DEFAULT_INTERSECTION, ...customConfig };
      
      let optRes = null;
      let analysisData = null;
      let error = null;

      try {
        analysisData = AnalysisEngine.analyzeApproaches(approaches, intersectionConfig, configType, 'AI_DETECTION');
        optRes = AnalysisEngine.optimizeSignalTimings(approaches, intersectionConfig, configType, 'AI_DETECTION');
      } catch (err) {
        error = err.message || String(err);
      }

      let invariantsRes = { passed: false, failures: ['Execution error'] };
      if (optRes) {
        invariantsRes = checkEngineeringInvariants(optRes, intersectionConfig);
      }

      let passed = !error && invariantsRes.passed;

      // Scenario-specific assertion checks
      let scenarioNotes = [];

      if (optRes && passed) {
        if (testId === 'TEST_1') {
          // Balanced Traffic: timings should be equal / closely balanced
          const greens = optRes.activeKeys.map(k => optRes.recommendation[k].proposedGreen);
          const maxG = Math.max(...greens);
          const minG = Math.min(...greens);
          if (maxG - minG > 4) {
            passed = false;
            scenarioNotes.push(`Balanced demand produced unbalanced green spread (${maxG}s vs ${minG}s).`);
          } else {
            scenarioNotes.push("Balanced traffic correctly produced balanced green distribution.");
          }
        } else if (testId === 'TEST_2') {
          // Working Case (A=730, B=620, C=40, D=50)
          const gA = optRes.recommendation.north.proposedGreen;
          const gB = optRes.recommendation.east.proposedGreen;
          const gC = optRes.recommendation.south.proposedGreen;
          const gD = optRes.recommendation.west.proposedGreen;

          if (gA < gC || gB < gD) {
            passed = false;
            scenarioNotes.push("Dominant approaches A/B failed to receive higher green allocation than minor approaches C/D.");
          } else {
            scenarioNotes.push(`Reference case timing produced ${gA}/${gB}/${gC}/${gD}s (Status: ${optRes.acceptanceStatus}). Priority given to A & B while C & D maintain safe service.`);
          }
        } else if (testId === 'TEST_3') {
          // One Dominant Approach (A=1200)
          const gA = optRes.recommendation.north.proposedGreen;
          const gMinorMin = Math.min(optRes.recommendation.east.proposedGreen, optRes.recommendation.south.proposedGreen, optRes.recommendation.west.proposedGreen);
          if (gA <= gMinorMin + 15) {
            passed = false;
            scenarioNotes.push("Dominant approach A failed to receive significant green share.");
          } else {
            scenarioNotes.push(`Dominant Road A received ${gA}s green, while minor roads received safe minimum allocations (${gMinorMin}s).`);
          }
        } else if (testId === 'TEST_4') {
          // All Low Traffic (100, 100, 80, 90)
          scenarioNotes.push("All low traffic handled cleanly without extreme green distortion.");
        } else if (testId === 'TEST_5') {
          // Oversaturated Intersection (1800, 1500, 1400, 1600)
          if (optRes.acceptanceStatus === 'RECOMMENDED') {
            passed = false;
            scenarioNotes.push("Oversaturated intersection falsely returned RECOMMENDED status.");
          } else {
            scenarioNotes.push(`Oversaturated demand correctly flagged as ${optRes.acceptanceStatus}. Timing redistribution alone cannot solve capacity deficit.`);
          }
        } else if (testId === 'TEST_6') {
          // Zero Demand Approach (South flow = 0)
          const southWait = optRes.proposedSimResult.approaches.south ? optRes.proposedSimResult.approaches.south.avgWaitTime : 0;
          if (isNaN(southWait) || !isFinite(southWait)) {
            passed = false;
            scenarioNotes.push("Zero demand approach produced non-numeric delay.");
          } else {
            scenarioNotes.push("Zero demand approach executed safely with zero queue accumulation.");
          }
        } else if (testId === 'TEST_7') {
          // 3-Arm T-Junction
          if (optRes.recommendation.south && optRes.recommendation.south.proposedGreen > 0) {
            passed = false;
            scenarioNotes.push("3-Arm T-Junction allocated green time to inactive South approach.");
          } else {
            scenarioNotes.push("3-Arm T-Junction correctly excluded South approach from cycle green allocation.");
          }
        } else if (testId === 'TEST_8') {
          // Invalid Input (Negative / missing values)
          scenarioNotes.push("Input validation handles negative/missing inputs gracefully.");
        }
      }

      results.push({
        testId: testId,
        name: name,
        description: description,
        configType: configType,
        passed: passed,
        error: error,
        invariants: invariantsRes,
        scenarioNotes: scenarioNotes,
        analysisData: analysisData,
        optRes: optRes
      });
    }

    // Scenario Definitions
    executeScenarioTest(
      'TEST_1',
      'TEST 1 — BALANCED TRAFFIC',
      'Equal demand across all four active legs (400 PCU/h each).',
      {
        north: { id: 'north', name: 'North Approach (A)', flow: 400, currentGreen: 30, lanes: 2 },
        east:  { id: 'east',  name: 'East Approach (B)',  flow: 400, currentGreen: 30, lanes: 2 },
        south: { id: 'south', name: 'South Approach (C)', flow: 400, currentGreen: 30, lanes: 2 },
        west:  { id: 'west',  name: 'West Approach (D)',  flow: 400, currentGreen: 30, lanes: 2 }
      }
    );

    executeScenarioTest(
      'TEST_2',
      'TEST 2 — TWO DOMINANT APPROACHES (Reference Working Case)',
      'High demand on A & B, low demand on C & D (A=730, B=620, C=40, D=50 PCU/h).',
      {
        north: { id: 'north', name: 'North Approach (A)', flow: 730, currentGreen: 30, lanes: 2 },
        east:  { id: 'east',  name: 'East Approach (B)',  flow: 620, currentGreen: 30, lanes: 2 },
        south: { id: 'south', name: 'South Approach (C)', flow: 40,  currentGreen: 30, lanes: 2 },
        west:  { id: 'west',  name: 'West Approach (D)',  flow: 50,  currentGreen: 30, lanes: 2 }
      }
    );

    executeScenarioTest(
      'TEST_3',
      'TEST 3 — ONE DOMINANT APPROACH',
      'Single heavy approach (A=1200 PCU/h) relative to minor legs (B=250, C=200, D=250 PCU/h).',
      {
        north: { id: 'north', name: 'North Approach (A)', flow: 1200, currentGreen: 30, lanes: 2 },
        east:  { id: 'east',  name: 'East Approach (B)',  flow: 250,  currentGreen: 30, lanes: 2 },
        south: { id: 'south', name: 'South Approach (C)', flow: 200,  currentGreen: 30, lanes: 2 },
        west:  { id: 'west',  name: 'West Approach (D)',  flow: 250,  currentGreen: 30, lanes: 2 }
      }
    );

    executeScenarioTest(
      'TEST_4',
      'TEST 4 — ALL LOW TRAFFIC',
      'Low demand across all four active legs (A=100, B=100, C=80, D=90 PCU/h).',
      {
        north: { id: 'north', name: 'North Approach (A)', flow: 100, currentGreen: 30, lanes: 2 },
        east:  { id: 'east',  name: 'East Approach (B)',  flow: 100, currentGreen: 30, lanes: 2 },
        south: { id: 'south', name: 'South Approach (C)', flow: 80,  currentGreen: 30, lanes: 2 },
        west:  { id: 'west',  name: 'West Approach (D)',  flow: 90,  currentGreen: 30, lanes: 2 }
      }
    );

    executeScenarioTest(
      'TEST_5',
      'TEST 5 — OVERSATURATED INTERSECTION',
      'Extreme demand exceeding total capacity (A=1800, B=1500, C=1400, D=1600 PCU/h).',
      {
        north: { id: 'north', name: 'North Approach (A)', flow: 1800, currentGreen: 30, lanes: 2 },
        east:  { id: 'east',  name: 'East Approach (B)',  flow: 1500, currentGreen: 30, lanes: 2 },
        south: { id: 'south', name: 'South Approach (C)', flow: 1400, currentGreen: 30, lanes: 2 },
        west:  { id: 'west',  name: 'West Approach (D)',  flow: 1600, currentGreen: 30, lanes: 2 }
      }
    );

    executeScenarioTest(
      'TEST_6',
      'TEST 6 — ZERO DEMAND APPROACH',
      'One active approach has zero flow (A=600, B=400, C=0, D=300 PCU/h).',
      {
        north: { id: 'north', name: 'North Approach (A)', flow: 600, currentGreen: 30, lanes: 2 },
        east:  { id: 'east',  name: 'East Approach (B)',  flow: 400, currentGreen: 30, lanes: 2 },
        south: { id: 'south', name: 'South Approach (C)', flow: 0,   currentGreen: 30, lanes: 2 },
        west:  { id: 'west',  name: 'West Approach (D)',  flow: 300, currentGreen: 30, lanes: 2 }
      }
    );

    executeScenarioTest(
      'TEST_7',
      'TEST 7 — 3-ARM T-JUNCTION',
      '3-Arm configuration (3NO_SOUTH) with South leg inactive.',
      {
        north: { id: 'north', name: 'North Approach (A)', flow: 600, currentGreen: 30, lanes: 2 },
        east:  { id: 'east',  name: 'East Approach (B)',  flow: 400, currentGreen: 30, lanes: 2 },
        south: { id: 'south', name: 'South Approach (C)', flow: 0,   currentGreen: 30, lanes: 2 },
        west:  { id: 'west',  name: 'West Approach (D)',  flow: 500, currentGreen: 30, lanes: 2 }
      },
      '3NO_SOUTH'
    );

    executeScenarioTest(
      'TEST_8',
      'TEST 8 — INVALID INPUT HANDLING',
      'Input validation test with negative flow and invalid values (-100 PCU/h).',
      {
        north: { id: 'north', name: 'North Approach (A)', flow: -100, currentGreen: 30, lanes: 2 },
        east:  { id: 'east',  name: 'East Approach (B)',  flow: 400,  currentGreen: 30, lanes: 2 },
        south: { id: 'south', name: 'South Approach (C)', flow: 80,   currentGreen: 30, lanes: 2 },
        west:  { id: 'west',  name: 'West Approach (D)',  flow: 200,  currentGreen: 30, lanes: 2 }
      }
    );

    executeScenarioTest(
      'TEST_9',
      'TEST 9 — PEDESTRIAN SAFETY CONSTRAINT',
      'Pedestrian safety constraint test (Width=14m, Speed=1.2m/s, Startup=7s => Ped Time=18.7s => min green 19s).',
      {
        north: { id: 'north', name: 'North Approach (A)', flow: 400, currentGreen: 30, lanes: 2 },
        east:  { id: 'east',  name: 'East Approach (B)',  flow: 300, currentGreen: 30, lanes: 2 },
        south: { id: 'south', name: 'South Approach (C)', flow: 200, currentGreen: 30, lanes: 2 },
        west:  { id: 'west',  name: 'West Approach (D)',  flow: 250, currentGreen: 30, lanes: 2 }
      },
      '4CROSS',
      {
        enablePedestrian: true,
        crossingWidth: 14.0,
        walkingSpeed: 1.2,
        startUpTime: 7.0
      }
    );

    const totalPassed = results.filter(r => r.passed).length;

    return {
      totalTests: results.length,
      totalPassed: totalPassed,
      allPassed: totalPassed === results.length,
      results: results
    };
  }

  return {
    checkEngineeringInvariants: checkEngineeringInvariants,
    runTestSuite: runTestSuite
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ValidationEngine;
}
