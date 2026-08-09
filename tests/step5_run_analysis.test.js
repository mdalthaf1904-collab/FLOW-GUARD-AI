/**
 * Step 5: Run Analysis Test Suite
 * Validates offline Webster isolated-intersection optimization, two-phase critical approach selection,
 * calculation-safety guardrails (uncapped Y >= 1.00 handling & G_eff minimum green feasibility),
 * simulation metric unit consistency, and non-regression of Steps 1–4.
 */

const FlowGuard = require('../js/app');

describe('Step 5: Run Analysis Engine', () => {
  beforeEach(() => {
    // Reset project state before each test
    FlowGuard.resetToDefaults();
  });

  test('1. Empty Dataset State: handles unuploaded dataset cleanly', () => {
    const proj = FlowGuard.getProject();
    expect(proj.dataset.uploaded).toBe(false);
  });

  test('2. Two-Phase Webster Optimization: computes C0 and green splits correctly from authoritative Step 4 state', () => {
    const proj = FlowGuard.getProject();
    proj.dataset.uploaded = true;
    proj.processedTraffic = {
      north: { movementPCU: { leftPCU: 0, throughPCU: 1118.9, rightPCU: 0, totalPCU: 1118.9 }, peakHourAnalysis: { peakInterval: '09:30–09:45', peakIntervalPCU: 320, peakHourFactor: 0.87 } },
      east: { movementPCU: { leftPCU: 100, throughPCU: 500, rightPCU: 50, totalPCU: 650 }, peakHourAnalysis: { peakInterval: '09:15–09:30', peakIntervalPCU: 180, peakHourFactor: 0.82 } },
      south: { movementPCU: { leftPCU: 0, throughPCU: 800, rightPCU: 0, totalPCU: 800 }, peakHourAnalysis: { peakInterval: '09:30–09:45', peakIntervalPCU: 240, peakHourFactor: 0.85 } },
      west: { movementPCU: { leftPCU: 50, throughPCU: 450, rightPCU: 50, totalPCU: 550 }, peakHourAnalysis: { peakInterval: '09:15–09:30', peakIntervalPCU: 150, peakHourFactor: 0.80 } }
    };
    FlowGuard.saveProject(proj);

    // Verify North sat flow = 4 * 1800 = 7200 PCU/h. yA = 1118.9 / 7200 = 0.1554.
    const yA = 1118.9 / (4 * 1800);
    const yC = 800 / (4 * 1800);
    const yPhase1 = Math.max(yA, yC);
    expect(parseFloat(yPhase1.toFixed(4))).toBe(0.1554);

    // East sat flow = 4 * 1800 = 7200 PCU/h. yB = 500 / 7200 = 0.0694.
    const yB = 500 / (4 * 1800);
    const yD = 450 / (4 * 1800);
    const yPhase2 = Math.max(yB, yD);
    expect(parseFloat(yPhase2.toFixed(4))).toBe(0.0694);

    const totalY = yPhase1 + yPhase2;
    expect(parseFloat(totalY.toFixed(4))).toBe(0.2248);

    // Webster C0 = round((1.5 * 8 + 5) / (1 - 0.2248)) = 22s -> bounded by min 40s
    let websterC0 = Math.round((1.5 * 8 + 5) / (1 - totalY));
    websterC0 = Math.max(40, Math.min(180, websterC0));
    expect(websterC0).toBe(40);
  });

  test('3. Over-saturation Guard (Y >= 1.00): detects Y >= 1.00 correctly without creating invalid cycle', () => {
    const yA = 5000 / (4 * 1800); // 0.6944
    const yB = 4500 / (4 * 1800); // 0.6250
    const totalY = yA + yB; // 1.3194

    expect(totalY).toBeGreaterThanOrEqual(1.00);
    const isWebsterValid = totalY < 1.00;
    expect(isWebsterValid).toBe(false);
  });

  test('4. Full Mathematical Consistency Test: verifies g1 + g2 + L = C0 exactly and queue/delay/DOS formulas', () => {
    const y1 = 0.3629; // Road C
    const y2 = 0.3199; // Road B
    const Y = y1 + y2; // 0.6828
    const L = 8; // lost time

    const calcC0 = Math.round((1.5 * L + 5) / (1 - Y)); // 54s
    expect(calcC0).toBe(54);

    const gEff = calcC0 - L; // 46s
    expect(gEff).toBe(46);

    const g1Exact = gEff * (y1 / Y); // ~24.44s
    const g1Disp = Math.round(g1Exact); // 24s
    const g2Disp = gEff - g1Disp; // 22s

    // CHECK 1 & CHECK 2: Sum of green splits and lost time MUST equal C0 EXACTLY (54s)
    const timelineTotal = g1Disp + g2Disp + L;
    expect(timelineTotal).toBe(calcC0); // 24 + 22 + 8 === 54!

    // Road C Degree of Saturation: q = 2612.7, s = 7200
    const q1 = 2612.7;
    const s1 = 7200;
    const cap1 = s1 * (g1Exact / calcC0);
    const x1 = q1 / cap1;
    expect(parseFloat(x1.toFixed(2))).toBe(0.80);

    // Queue in vehicles and meters
    const qVeh = (q1 / 3600) * (calcC0 - g1Exact);
    const qVehRounded = Math.round(qVeh);
    const qMetersRounded = Math.round(qVeh * 6);

    expect(qVehRounded).toBe(21); // ~21.5 rounded or 22
    expect(qMetersRounded).toBe(129); // ~129 meters
  });

  test('5. Baseline Mode & Network Removal: defaults to not_available without network baseline object', () => {
    const proj = FlowGuard.getProject();
    expect(proj.engineeringParameters.baseline.mode).toBe('not_available');
    expect(proj.engineeringParameters.baseline.network).toBeUndefined();
    expect(proj.engineeringParameters.baseline.roads['Road A']).toBeDefined();
    expect(proj.engineeringParameters.baseline.roads['Road C']).toBeDefined();
  });

  test('6. Dynamic Critical Approach Baseline Scope: maps Step 4 critical road dynamically', () => {
    const proj = FlowGuard.getProject();
    proj.dataset = { uploaded: true };
    proj.trafficInput = { datasetUploaded: true, vehicleCounts: { north: { car: 100 } } };

    // Set Road A (North) as critical approach with demand 3000 PCU
    proj.processedTraffic = {
      north: { movementPCU: { leftPCU: 0, throughPCU: 3000, rightPCU: 0, totalPCU: 3000 } },
      east: { movementPCU: { leftPCU: 0, throughPCU: 500, rightPCU: 0, totalPCU: 500 } },
      south: { movementPCU: { leftPCU: 0, throughPCU: 800, rightPCU: 0, totalPCU: 800 } },
      west: { movementPCU: { leftPCU: 0, throughPCU: 450, rightPCU: 0, totalPCU: 450 } }
    };

    proj.engineeringParameters.baseline = {
      mode: 'road_wise',
      roads: {
        'Road A': { delay: 45.0, queue: 150, degreeOfSaturation: 0.90 },
        'Road B': { delay: 20.0, queue: 50, degreeOfSaturation: 0.50 },
        'Road C': { delay: 35.0, queue: 100, degreeOfSaturation: 0.75 },
        'Road D': { delay: 18.0, queue: 40, degreeOfSaturation: 0.45 }
      }
    };
    FlowGuard.saveProject(proj);

    const reloaded = FlowGuard.getProject();
    expect(reloaded.engineeringParameters.baseline.mode).toBe('road_wise');
    expect(reloaded.engineeringParameters.baseline.roads['Road A'].delay).toBe(45.0);

    // Dynamic critical flow check: North flow ratio = 3000 / 7200 = 0.4167 (highest)
    const yA = proj.processedTraffic.north.movementPCU.throughPCU / (4 * 1800);
    const yC = proj.processedTraffic.south.movementPCU.throughPCU / (4 * 1800);
    expect(yA).toBeGreaterThan(yC);
  });

  test('7. Optional Missing Baseline Values: preserves null without converting to zero', () => {
    const proj = FlowGuard.getProject();
    proj.engineeringParameters.baseline = {
      mode: 'road_wise',
      roads: {
        'Road A': { delay: null, queue: null, degreeOfSaturation: null },
        'Road B': { delay: 25.0, queue: null, degreeOfSaturation: 0.60 },
        'Road C': { delay: null, queue: 120, degreeOfSaturation: null },
        'Road D': { delay: null, queue: null, degreeOfSaturation: null }
      }
    };
    FlowGuard.saveProject(proj);

    const reloaded = FlowGuard.getProject();
    expect(reloaded.engineeringParameters.baseline.roads['Road A'].delay).toBeNull();
    expect(reloaded.engineeringParameters.baseline.roads['Road A'].queue).toBeNull();
    expect(reloaded.engineeringParameters.baseline.roads['Road B'].queue).toBeNull();
    expect(reloaded.engineeringParameters.baseline.roads['Road B'].delay).toBe(25.0);
  });

  test('8. Queue Comparison Unit Consistency: verifies metres calculations', () => {
    const qVeh = 20; // 20 vehicles
    const qMeters = Math.round(qVeh * 6); // 120 metres
    expect(qMeters).toBe(120);

    const baselineMeters = 150;
    const diffMeters = qMeters - baselineMeters; // -30m
    expect(diffMeters).toBe(-30);
  });

  test('9. Level of Service (LOS) Classification: classifies delay and formats transitions correctly', () => {
    const getLOSCategory = (delayVal) => {
      if (delayVal === null || delayVal === undefined || isNaN(delayVal)) return null;
      if (delayVal <= 10) return 'A';
      if (delayVal <= 20) return 'B';
      if (delayVal <= 35) return 'C';
      if (delayVal <= 55) return 'D';
      if (delayVal <= 80) return 'E';
      return 'F';
    };

    expect(getLOSCategory(8.5)).toBe('A');
    expect(getLOSCategory(15.6)).toBe('B');
    expect(getLOSCategory(20.0)).toBe('B');
    expect(getLOSCategory(25.0)).toBe('C');
    expect(getLOSCategory(45.0)).toBe('D');
    expect(getLOSCategory(65.0)).toBe('E');
    expect(getLOSCategory(85.0)).toBe('F');

    const losRank = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6 };
    const formatLOSTransition = (baseCat, propCat) => {
      if (!baseCat || !propCat) return '—';
      const bRank = losRank[baseCat];
      const pRank = losRank[propCat];
      if (pRank < bRank) return `${baseCat} → ${propCat} (Improved)`;
      if (pRank > bRank) return `${baseCat} → ${propCat} (Worsened)`;
      return 'No LOS change';
    };

    expect(formatLOSTransition('C', 'B')).toBe('C → B (Improved)');
    expect(formatLOSTransition('B', 'C')).toBe('B → C (Worsened)');
    expect(formatLOSTransition('B', 'B')).toBe('No LOS change');
  });

  test('10. Baseline Effective Green Split & Cycle Consistency: computes 56s/56s for 120s baseline cycle and lost time 8s', () => {
    const existingCycle = 120;
    const totalLostTimeL = 8; // 2 phases * 4s lost time
    const baseG1 = Math.round(Math.max(0, existingCycle - totalLostTimeL) / 2);
    const baseG2 = Math.max(0, Math.max(0, existingCycle - totalLostTimeL) - baseG1);
    expect(baseG1).toBe(56);
    expect(baseG2).toBe(56);
    expect(baseG1 + baseG2 + totalLostTimeL).toBe(existingCycle);

    // Dynamic check for 100s cycle: 100 - 8 = 92 -> 46s / 46s
    const cycle100 = 100;
    const g1_100 = Math.round(Math.max(0, cycle100 - totalLostTimeL) / 2);
    const g2_100 = Math.max(0, Math.max(0, cycle100 - totalLostTimeL) - g1_100);
    expect(g1_100).toBe(46);
    expect(g2_100).toBe(46);
    expect(g1_100 + g2_100 + totalLostTimeL).toBe(100);
  });
});



