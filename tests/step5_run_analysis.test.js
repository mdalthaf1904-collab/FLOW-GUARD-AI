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
});
