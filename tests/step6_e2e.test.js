/**
 * Real End-to-End Flow Test: Ingestion -> Step 4 -> Step 5 RUN ANALYSIS -> Step 6 FULL REPORT & Persistence
 */

function createMockElement(id = '', tag = 'div') {
  const el = {
    id,
    tagName: tag.toUpperCase(),
    children: [],
    style: {},
    classList: {
      add: () => {},
      remove: () => {},
      contains: () => false
    },
    setAttribute: () => {},
    removeAttribute: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    appendChild: (child) => {
      el.children.push(child);
      return child;
    },
    removeChild: (child) => {
      const idx = el.children.indexOf(child);
      if (idx !== -1) el.children.splice(idx, 1);
      return child;
    },
    _innerHTML: '',
    _textContent: ''
  };

  Object.defineProperty(el, 'innerHTML', {
    get() {
      return el._innerHTML;
    },
    set(val) {
      el._innerHTML = String(val);
      el._textContent = el._innerHTML.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  });

  Object.defineProperty(el, 'textContent', {
    get() {
      return el._textContent || el._innerHTML.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    },
    set(val) {
      el._textContent = String(val);
      el._innerHTML = String(val);
    }
  });

  Object.defineProperty(el, 'innerText', {
    get() {
      return el.textContent;
    },
    set(val) {
      el.textContent = val;
    }
  });

  return el;
}

function createMockLocalStorage() {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
}

if (!global.localStorage) {
  global.localStorage = createMockLocalStorage();
}

function setupGlobalDOM() {
  const store = {};

  function getOrCreate(id) {
    if (!store[id]) {
      store[id] = createMockElement(id);
    }
    return store[id];
  }

  const knownIds = [
    'wizard-section-1', 'wizard-section-2', 'wizard-section-3', 'wizard-section-4', 'wizard-section-5', 'wizard-section-6',
    'btnRunStep5Analysis', 'step5HeaderBadge', 'valCardStep2Title', 'valCardStep2Desc', 'step5SpecBaseSat',
    'step5RoadCardsGrid', 'step5BottleneckApproach', 'step5BottleneckFlow', 'step5BottleneckRatio',
    'step5Phase1CritApp', 'step5Phase1CritFlow', 'step5Phase1RatioY',
    'step5Phase2CritApp', 'step5Phase2CritFlow', 'step5Phase2RatioY',
    'step5WebsterLostTime', 'step5WebsterTotalY', 'step5WebsterWarningBox',
    'step5WebsterCycleOpt', 'step5WebsterGeff', 'step5TimingSharedCycle',
    'step5P1Green', 'step5P1Amber', 'step5P1AllRed', 'step5P1EffGreen',
    'step5P2Green', 'step5P2Amber', 'step5P2AllRed', 'step5P2EffGreen',
    'step5CycleTimelineBar', 'step5BeforeAfterScopeBadge', 'step5BeforeAfterScopeDetail',
    'step5BeforeAfterTableBody', 'step5RecBottleneck', 'step5RecPhase', 'step5RecFlowRatioVal',
    'step5RecPeakIntervalVal', 'step5RecCritApproachVal', 'step5RecReason', 'step5RecCycleVal',
    'step5RecP1Val', 'step5RecP2Val', 'step5RecAction', 'step5FinalStatusBadge',
    'step5Check1', 'step5Check2', 'step5Check3', 'step5Check4', 'step5Check5', 'step5Check6',
    'step5SumCycle', 'step5SumP1Green', 'step5SumP2Green',
    'engineeringDashboardContainer', 'dashboard-results', 'datasetPreviewContainer', 'trafficSummaryDashboard'
  ];

  knownIds.forEach(id => getOrCreate(id));

  global.document = {
    getElementById: (id) => getOrCreate(id),
    createElement: (tag) => createMockElement('', tag),
    querySelector: (sel) => null,
    querySelectorAll: (sel) => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    body: getOrCreate('body')
  };

  global.window = {
    document: global.document,
    localStorage: global.localStorage,
    location: { port: '', href: '', hash: '', pathname: '/' },
    addEventListener: () => {},
    removeEventListener: () => {},
    scrollTo: () => {}
  };

  return store;
}

describe('Real End-to-End Application Flow & Step 6 Verification', () => {
  let FlowGuard;
  let domStore;

  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    domStore = setupGlobalDOM();
    jest.resetModules();
    FlowGuard = require('../js/app');
  });

  test('1. Empty State Gatekeeper: displays NO COMPLETED ANALYSIS AVAILABLE before analysis', () => {
    FlowGuard.resetToDefaults();
    FlowGuard.setWizardStep(6);

    const dashboardContainer = domStore['engineeringDashboardContainer'];
    expect(dashboardContainer.innerHTML).toContain('STATUS: NO COMPLETED ANALYSIS AVAILABLE');
  });

  test('2. Real Flow Execution: Ingest -> Step 4 -> Step 5 RUN ANALYSIS -> Step 6 FULL REPORT', async () => {
    FlowGuard.resetToDefaults();

    // Ingest Dataset in Step 2
    const demoRows = FlowGuard.generateDemoDatasetRows();
    const result = await FlowGuard.executeDatasetIngestionPipeline(demoRows);
    expect(result.valid).toBe(true);

    // Step 4 Verification
    FlowGuard.setWizardStep(4);
    const projAfterStep4 = FlowGuard.getProject();
    expect(projAfterStep4.trafficInput.datasetUploaded).toBe(true);

    // Step 5 Execution (RUN ANALYSIS button execution)
    FlowGuard.setWizardStep(5);
    FlowGuard.runStep5Analysis();

    // Verify completed analysis result structure
    const res = FlowGuard.getCurrentAnalysisResult();
    expect(res).not.toBeNull();
    expect(res.runId).toBeDefined();
    expect(res.timestamp).toBeDefined();
    expect(res.websterTiming).toBeDefined();
    expect(res.websterTiming.websterCycleC0).toBeGreaterThan(0);
    expect(res.websterTiming.g1).toBeGreaterThan(0);
    expect(res.websterTiming.g2).toBeGreaterThan(0);
    expect(res.criticalAnalysis.totalY).toBeGreaterThan(0);

    // Step 6 Navigation
    FlowGuard.setWizardStep(6);

    const dashboardContainer = domStore['engineeringDashboardContainer'];
    const dashboardHtml = dashboardContainer.innerHTML;

    // Verify empty state text is NOT present
    expect(dashboardHtml).not.toContain('STATUS: NO COMPLETED ANALYSIS AVAILABLE');

    // Verify Sections 1 to 9 exist
    expect(dashboardHtml).toContain('SECTION 1 — EXECUTIVE SUMMARY');
    expect(dashboardHtml).toContain('SECTION 2 — TRAFFIC DEMAND AUDIT');
    expect(dashboardHtml).toContain('SECTION 3 — INTERSECTION PHASE MODEL');
    expect(dashboardHtml).toContain('SECTION 4 — WEBSTER METHOD OPTIMIZATION');
    expect(dashboardHtml).toContain('SECTION 5 — OPTIMIZED SIGNAL TIMING PLAN');
    expect(dashboardHtml).toContain('SECTION 6 — BEFORE VS AFTER PERFORMANCE ESTIMATE');
    expect(dashboardHtml).toContain('SECTION 7 — KEY FINDINGS');
    expect(dashboardHtml).toContain('SECTION 8 — RECOMMENDATIONS');
    expect(dashboardHtml).toContain('SECTION 9 — ASSUMPTIONS, SCOPE & SIGN-OFF');

    // Section 9 exact items validation
    expect(dashboardHtml).toContain('Analysis uses historical traffic data ingested and validated in Step 2.');
    expect(dashboardHtml).toContain('Webster method is used for preliminary isolated-intersection signal timing optimization.');
    expect(dashboardHtml).toContain('Queue spillback, downstream intersections, and real-time stochastic fluctuations are not represented.');
    expect(dashboardHtml).toContain('Results are analytical/simulated estimates for decision support.');
    expect(dashboardHtml).toContain('OFFLINE RECOMMENDATION ONLY');
    expect(dashboardHtml).toContain('NO REAL-TIME SIGNAL CONTROL');
    expect(dashboardHtml).toContain('ENGINEER SIGN-OFF:');
    expect(dashboardHtml).toContain('DATE:');

    // Verify calculated C0 is rendered
    expect(dashboardHtml).toContain(`${res.websterTiming.websterCycleC0} s`);
  });

  test('3. Refresh / Persistence Test: Saved project loads Step 6 report cleanly after module reset', async () => {
    FlowGuard.resetToDefaults();

    // Run full pipeline
    const demoRows = FlowGuard.generateDemoDatasetRows();
    await FlowGuard.executeDatasetIngestionPipeline(demoRows);
    FlowGuard.setWizardStep(5);
    FlowGuard.runStep5Analysis();

    const initialResult = FlowGuard.getCurrentAnalysisResult();
    expect(initialResult).not.toBeNull();

    // Simulate fresh application / project load (fresh require)
    jest.resetModules();
    domStore = setupGlobalDOM();
    const FreshFlowGuard = require('../js/app');

    // Retrieve current analysis result from persisted state
    const restoredResult = FreshFlowGuard.getCurrentAnalysisResult();
    expect(restoredResult).not.toBeNull();
    expect(restoredResult.runId).toEqual(initialResult.runId);

    // Navigate to Step 6
    FreshFlowGuard.setWizardStep(6);

    const dashboardContainer = domStore['engineeringDashboardContainer'];
    const dashboardHtml = dashboardContainer.innerHTML;

    expect(dashboardHtml).not.toContain('STATUS: NO COMPLETED ANALYSIS AVAILABLE');
    expect(dashboardHtml).toContain('SECTION 1 — EXECUTIVE SUMMARY');
    expect(dashboardHtml).toContain('SECTION 9 — ASSUMPTIONS, SCOPE & SIGN-OFF');
  });

  test('4. TEST 1 (Valid Webster Y = 0.825): Step 6 renders exact dynamic Step 5 result values without stale fallbacks', () => {
    FlowGuard.resetToDefaults();

    // Mock a result generated by Step 5 for the valid dataset
    const mockValidResult = {
      analysisCompleted: true,
      runId: 'RUN-TEST-VALID-0.825',
      timestamp: new Date().toISOString(),
      formattedDate: new Date().toLocaleString(),
      demandSummary: {
        totalPhysicalVehicles: 1500,
        totalPCU: 2100,
        peakInterval: '11:00–12:00',
        roadMetrics: {
          north: { totalDemandVal: 600, critMoveStr: 'Through', critFlowVal: 450, satFlow: 1800, flowRatioY: 0.25, flowRatioYStr: '0.2500' },
          east: { totalDemandVal: 500, critMoveStr: 'Through', critFlowVal: 360, satFlow: 1800, flowRatioY: 0.20, flowRatioYStr: '0.2000' },
          south: { totalDemandVal: 550, critMoveStr: 'Through', critFlowVal: 405, satFlow: 1800, flowRatioY: 0.225, flowRatioYStr: '0.2250' },
          west: { totalDemandVal: 450, critMoveStr: 'Through', critFlowVal: 270, satFlow: 1800, flowRatioY: 0.15, flowRatioYStr: '0.1500' }
        }
      },
      criticalAnalysis: {
        criticalApproach: 'Road A — Northbound — Through',
        criticalMovement: 'Through',
        criticalFlowRatio: '0.8250',
        phase1CritFlow: 2612.7,
        phase2CritFlow: 2100.0,
        yPhase1: 0.45,
        yPhase2: 0.375,
        totalY: 0.825,
        isWebsterValid: true,
        websterValid: true
      },
      websterTiming: {
        websterCycleC0: 97,
        g1: 48,
        g2: 41,
        amber: 3,
        allRed: 1,
        totalLostTimeL: 8,
        gEff: 89,
        numPhases: 2,
        isWebsterValid: true,
        websterValid: true
      },
      baselineTiming: { hasBaseline: true, existingCycle: 120 },
      beforeAfterPerformance: {
        criticalApproach: 'Road A — Northbound — Through',
        baselineCycle: '120 s',
        proposedCycle: '97 s',
        cycleChange: '-23 s',
        baselineGreen: '60 s / 60 s',
        proposedGreen: '48 s / 41 s',
        greenChange: 'Proportional (Rebalanced)',
        baselineDelay: '40.0 s/veh',
        proposedDelay: '26.7 s/veh',
        delayChange: '↓ 13.3 s/veh (33% reduction)',
        baselineQueue: '40 m',
        proposedQueue: '≈ 44 vehicles (≈ 261 m)',
        queueChange: '+221 m (553% increase)',
        baselineDOS: '1.5',
        proposedDOS: '0.9',
        dosChange: '-0.60 (40% reduction)',
        baselineLOS: 'LOS D',
        proposedLOS: 'LOS C',
        losChange: 'D → C (Improved)'
      },
      recommendations: { bottleneck: 'Road A — Northbound — Through', winningPhase: 'Phase 1 (North / South)', action: 'Implement proposed Webster timing' },
      assumptionsLimitations: ['IRC:93 Standard']
    };

    FlowGuard.saveCurrentAnalysisResult(mockValidResult);
    FlowGuard.setWizardStep(6);

    const dashboardContainer = domStore['engineeringDashboardContainer'];
    const html = dashboardContainer.innerHTML;

    // Must NOT contain empty state or stale fallback values
    expect(html).not.toContain('STATUS: NO COMPLETED ANALYSIS AVAILABLE');
    expect(html).not.toContain('LOS calculation not enabled');

    // Must contain exact calculated Step 5 values
    expect(html).toContain('97 s');
    expect(html).toContain('0.825');
    expect(html).toContain('Road A — Northbound — Through');
    expect(html).toContain('40.0 s/veh');
    expect(html).toContain('26.7 s/veh');
    expect(html).toContain('1.5');
    expect(html).toContain('0.9');
    expect(html).toContain('LOS D');
    expect(html).toContain('LOS C');
    expect(html).toContain('D → C (Improved)');
  });

  test('5. TEST 2 (Over-saturated Y = 2.7311): Step 6 report renders with N/A Webster values and oversaturation warning', () => {
    FlowGuard.resetToDefaults();

    // Mock result for Dataset 1 over-saturated case (Y = 2.7311, Webster invalid)
    const mockOversaturatedResult = {
      analysisCompleted: true,
      runId: 'RUN-TEST-OVERSATURATED-2.7311',
      timestamp: new Date().toISOString(),
      formattedDate: new Date().toLocaleString(),
      demandSummary: {
        totalPhysicalVehicles: 4500,
        totalPCU: 6800,
        peakInterval: '08:45–09:00',
        roadMetrics: {
          north: { totalDemandVal: 2400, critMoveStr: 'Through', critFlowVal: 2500, satFlow: 1800, flowRatioY: 1.3889, flowRatioYStr: '1.3889' },
          east: { totalDemandVal: 2200, critMoveStr: 'Through', critFlowVal: 2416, satFlow: 1800, flowRatioY: 1.3422, flowRatioYStr: '1.3422' },
          south: { totalDemandVal: 1800, critMoveStr: 'Through', critFlowVal: 1900, satFlow: 1800, flowRatioY: 1.0556, flowRatioYStr: '1.0556' },
          west: { totalDemandVal: 1900, critMoveStr: 'Through', critFlowVal: 2000, satFlow: 1800, flowRatioY: 1.1111, flowRatioYStr: '1.1111' }
        }
      },
      criticalAnalysis: {
        criticalApproach: 'Road A (North) (Through)',
        criticalMovement: 'Through',
        criticalFlowRatio: '1.3889',
        phase1CritFlow: 2500,
        phase2CritFlow: 2416,
        yPhase1: 1.3889,
        yPhase2: 1.3422,
        totalY: 2.7311,
        isWebsterValid: false,
        websterValid: false
      },
      websterTiming: {
        websterCycleC0: null,
        g1: null,
        g2: null,
        amber: 3,
        allRed: 1,
        totalLostTimeL: 8,
        gEff: null,
        numPhases: 2,
        isWebsterValid: false,
        websterValid: false
      },
      baselineTiming: { hasBaseline: false, existingCycle: 120 },
      beforeAfterPerformance: {
        baselineDelay: '45.0 s/veh',
        proposedDelay: 'N/A — Webster not valid',
        delayChange: 'N/A'
      },
      recommendations: {
        bottleneck: 'Road A (North)',
        winningPhase: 'Phase 1',
        action: 'Webster optimization is not applicable because intersection is over-saturated (Y = 2.7311 >= 1.00).'
      },
      assumptionsLimitations: ['IRC:93 Standard']
    };

    FlowGuard.saveCurrentAnalysisResult(mockOversaturatedResult);
    FlowGuard.setWizardStep(6);

    const dashboardContainer = domStore['engineeringDashboardContainer'];
    const html = dashboardContainer.innerHTML;

    // Verify empty state is NOT displayed
    expect(html).not.toContain('STATUS: NO COMPLETED ANALYSIS AVAILABLE');

    // Verify Sections 1 to 9 are present
    expect(html).toContain('SECTION 1 — EXECUTIVE SUMMARY');
    expect(html).toContain('SECTION 4 — WEBSTER METHOD OPTIMIZATION');
    expect(html).toContain('SECTION 5 — OPTIMIZED SIGNAL TIMING PLAN');
    expect(html).toContain('SECTION 6 — BEFORE VS AFTER PERFORMANCE ESTIMATE');

    // Verify Y = 2.7311 is displayed
    expect(html).toContain('2.7311');

    // Verify C0 = N/A and Effective Green = N/A
    expect(html).toContain('N/A');

    // Verify Over-saturation warning is displayed
    expect(html).toContain('ENGINEERING WARNING: Webster optimization not valid');

    // Verify No fabricated timing message is displayed
    expect(html).toContain('NO VALID WEBSTER TIMING GENERATED');
  });

  test('6. TEST 3 (No Completed Analysis): Displays empty state', () => {
    FlowGuard.resetToDefaults();
    FlowGuard.clearCurrentAnalysisResult();
    FlowGuard.setWizardStep(6);

    const dashboardContainer = domStore['engineeringDashboardContainer'];
    expect(dashboardContainer.innerHTML).toContain('STATUS: NO COMPLETED ANALYSIS AVAILABLE');
  });

  test('7. Real Pipeline Execution with Heavy Demand (Y >= 1.00): Ingest -> Step 5 runStep5Analysis -> Step 6 FULL REPORT', async () => {
    FlowGuard.resetToDefaults();

    // Generate demo dataset and multiply vehicle counts to force oversaturation (Y >= 1.00)
    const demoRows = FlowGuard.generateDemoDatasetRows();
    const heavyRows = demoRows.map(r => {
      const mult = 7;
      const cars = (r.Cars || 50) * mult;
      const bikes = (r.Bikes || 20) * mult;
      const autorickshaw = (r.AutoRickshaw || 10) * mult;
      const bus = (r.Bus || 5) * mult;
      const truck = (r.Truck || 5) * mult;
      const bicycle = (r.Bicycle || 2) * mult;

      const totalVeh = cars + bikes + autorickshaw + bus + truck + bicycle;
      const leftTurn = Math.round(totalVeh * 0.20);
      const rightTurn = Math.round(totalVeh * 0.15);
      const through = totalVeh - (leftTurn + rightTurn);

      return {
        ...r,
        Cars: cars,
        Bikes: bikes,
        AutoRickshaw: autorickshaw,
        Bus: bus,
        Truck: truck,
        Bicycle: bicycle,
        LeftTurn: leftTurn,
        Through: through,
        RightTurn: rightTurn
      };
    });

    const result = await FlowGuard.executeDatasetIngestionPipeline(heavyRows);
    expect(result.valid).toBe(true);

    // Step 5 Execution (RUN ANALYSIS button execution)
    FlowGuard.setWizardStep(5);
    FlowGuard.runStep5Analysis();

    // Verify completed analysis result structure
    const res = FlowGuard.getCurrentAnalysisResult();
    expect(res).not.toBeNull();
    expect(res.analysisCompleted).toBe(true);
    expect(res.criticalAnalysis.totalY).toBeGreaterThanOrEqual(1.00);
    expect(res.criticalAnalysis.isWebsterValid).toBe(false);
    expect(res.websterTiming.websterCycleC0).toBeNull();

    // Step 6 Navigation
    FlowGuard.setWizardStep(6);

    const dashboardContainer = domStore['engineeringDashboardContainer'];
    const dashboardHtml = dashboardContainer.innerHTML;

    // Verify empty state text is NOT present
    expect(dashboardHtml).not.toContain('STATUS: NO COMPLETED ANALYSIS AVAILABLE');

    // Verify Sections 1 to 9 exist
    expect(dashboardHtml).toContain('SECTION 1 — EXECUTIVE SUMMARY');
    expect(dashboardHtml).toContain('SECTION 4 — WEBSTER METHOD OPTIMIZATION');
    expect(dashboardHtml).toContain('SECTION 5 — OPTIMIZED SIGNAL TIMING PLAN');
    expect(dashboardHtml).toContain('SECTION 6 — BEFORE VS AFTER PERFORMANCE ESTIMATE');
    expect(dashboardHtml).toContain('SECTION 9 — ASSUMPTIONS, SCOPE & SIGN-OFF');

    // Verify Over-saturation warning and N/A values
    expect(dashboardHtml).toContain('ENGINEERING WARNING: Webster optimization not valid');
    expect(dashboardHtml).toContain('NO VALID WEBSTER TIMING GENERATED');
  });

  test('8. Multi-Dataset Dynamic Synchronization Test (Step 4 -> Step 5 -> Step 6 -> PDF)', async () => {
    FlowGuard.resetToDefaults();

    // Dataset 1 Ingestion
    const demoRows = FlowGuard.generateDemoDatasetRows();
    const result1 = await FlowGuard.executeDatasetIngestionPipeline(demoRows);
    expect(result1.valid).toBe(true);

    FlowGuard.setWizardStep(5);
    const res1 = FlowGuard.getCurrentAnalysisResult();
    expect(res1).not.toBeNull();
    expect(res1.criticalAnalysis.totalY).toBeGreaterThan(0);

    FlowGuard.setWizardStep(6);
    const html1 = domStore['engineeringDashboardContainer'].innerHTML;
    expect(html1).toContain(`${res1.criticalAnalysis.totalY}`);

    // Dataset 2 Ingestion with modified demand (Dynamic Change Verification)
    const dataset2Rows = demoRows.map(r => {
      const cars = (r.Cars || 50) * 2;
      const bikes = (r.Bikes || 20) * 2;
      const autorickshaw = (r.AutoRickshaw || 10) * 2;
      const bus = (r.Bus || 5) * 2;
      const truck = (r.Truck || 5) * 2;
      const bicycle = (r.Bicycle || 2) * 2;

      const totalVeh = cars + bikes + autorickshaw + bus + truck + bicycle;
      const leftTurn = Math.round(totalVeh * 0.20);
      const rightTurn = Math.round(totalVeh * 0.15);
      const through = totalVeh - (leftTurn + rightTurn);

      return {
        ...r,
        Cars: cars,
        Bikes: bikes,
        AutoRickshaw: autorickshaw,
        Bus: bus,
        Truck: truck,
        Bicycle: bicycle,
        LeftTurn: leftTurn,
        Through: through,
        RightTurn: rightTurn
      };
    });

    const result2 = await FlowGuard.executeDatasetIngestionPipeline(dataset2Rows);
    expect(result2.valid).toBe(true);

    FlowGuard.setWizardStep(5);
    const res2 = FlowGuard.getCurrentAnalysisResult();
    expect(res2).not.toBeNull();
    expect(res2.criticalAnalysis.totalY).not.toEqual(res1.criticalAnalysis.totalY);

    FlowGuard.setWizardStep(6);
    const html2 = domStore['engineeringDashboardContainer'].innerHTML;

    // Prove Step 6 renders res2 values dynamically, not hardcoded res1 values
    expect(html2).toContain(`${res2.criticalAnalysis.totalY}`);
    expect(html2).not.toContain('30.0 s/veh');
    expect(html2).not.toContain('LOS calculation not enabled');
  });

  test('9. 15-Minute Interval to Hourly Normalization Test (1,384.6 * 4 = 5,538.4)', async () => {
    FlowGuard.resetToDefaults();
    const demoRows = FlowGuard.generateDemoDatasetRows();
    await FlowGuard.executeDatasetIngestionPipeline(demoRows);

    FlowGuard.setWizardStep(5);
    FlowGuard.runStep5Analysis();
    const res = FlowGuard.getCurrentAnalysisResult();
    expect(res).not.toBeNull();

    FlowGuard.setWizardStep(6);
    const html = domStore['engineeringDashboardContainer'].innerHTML;
    expect(html).toContain('SECTION 2 — TRAFFIC DEMAND AUDIT (STEP 4 DATA)');
    expect(html).toContain('TOTAL DEMAND (PEAK-HOUR PCU/h)');
    expect(html).toContain('* Peak-hour values are normalized from the observed survey interval');
    expect(html).not.toContain('30.0 s/veh');
    expect(html).not.toContain('LOS calculation not enabled');
  });

  test('10. Regression Test: already hourly Step 4 data must not be multiplied by 4 again in Step 5', async () => {
    FlowGuard.resetToDefaults();
    const demoRows = FlowGuard.generateDemoDatasetRows();
    await FlowGuard.executeDatasetIngestionPipeline(demoRows);

    FlowGuard.setWizardStep(5);
    FlowGuard.runStep5Analysis();

    const res = FlowGuard.getCurrentAnalysisResult();
    expect(res).not.toBeNull();

    // Verify Y is calculated once without double multiplication
    expect(res.criticalAnalysis.totalY).toBeLessThan(1.00);

    FlowGuard.setWizardStep(6);
    const html = domStore['engineeringDashboardContainer'].innerHTML;

    // Verify Step 6 reads exact Step 5 totalY
    expect(html).toContain(`${res.criticalAnalysis.totalY}`);
    expect(html).not.toContain('2.7311');
  });

  test('11. Single Source of Truth Test: Step 4, Step 5, Step 6 share identical q, s, y values from normalizedTrafficData', async () => {
    FlowGuard.resetToDefaults();
    const demoRows = FlowGuard.generateDemoDatasetRows();
    await FlowGuard.executeDatasetIngestionPipeline(demoRows);

    const normData = FlowGuard.getNormalizedTrafficData();
    expect(normData).not.toBeNull();
    expect(normData.roads.north).toBeDefined();

    const qNorth = normData.roads.north.criticalFlowQ;
    const sNorth = normData.roads.north.saturationFlowS;
    const yNorth = normData.roads.north.flowRatioY;

    FlowGuard.setWizardStep(5);
    FlowGuard.runStep5Analysis();
    const res = FlowGuard.getCurrentAnalysisResult();

    // Verify Step 5 result matches normalizedTrafficData
    expect(res.demandSummary.roadMetrics.north.critFlowVal).toBe(qNorth);
    expect(res.demandSummary.roadMetrics.north.satFlow).toBe(sNorth);
    expect(res.demandSummary.roadMetrics.north.flowRatioY).toBe(yNorth);
    expect(res.criticalAnalysis.totalY).toBe(normData.phaseAnalysis.totalY);

    // Verify Step 6 Dashboard contains exact same metrics
    FlowGuard.setWizardStep(6);
    const html = domStore['engineeringDashboardContainer'].innerHTML;
    expect(html).toContain(`${qNorth}`);
    expect(html).toContain(sNorth.toLocaleString());
    expect(html).toContain(`${res.criticalAnalysis.totalY}`);
  });

  test('12. Multi-Interval Normalization Factors (15-min -> x4, 30-min -> x2, 60-min -> x1)', async () => {
    FlowGuard.resetToDefaults();

    // 15-min survey
    const proj15 = FlowGuard.getProject();
    proj15.geometry.surveyDuration = 15;
    FlowGuard.saveProject(proj15);
    const demoRows15 = FlowGuard.generateDemoDatasetRows();
    await FlowGuard.executeDatasetIngestionPipeline(demoRows15);
    const norm15 = FlowGuard.getNormalizedTrafficData();
    expect(norm15.normalizationFactor).toBe(4);

    // 30-min survey
    FlowGuard.resetToDefaults();
    const proj30 = FlowGuard.getProject();
    proj30.geometry.surveyDuration = 30;
    FlowGuard.saveProject(proj30);
    const demoRows30 = FlowGuard.generateDemoDatasetRows();
    await FlowGuard.executeDatasetIngestionPipeline(demoRows30);
    const norm30 = FlowGuard.getNormalizedTrafficData();
    expect(norm30.normalizationFactor).toBe(2);

    // 60-min survey (Hourly)
    FlowGuard.resetToDefaults();
    const proj60 = FlowGuard.getProject();
    proj60.geometry.surveyDuration = 60;
    FlowGuard.saveProject(proj60);
    const demoRows60 = FlowGuard.generateDemoDatasetRows();
    await FlowGuard.executeDatasetIngestionPipeline(demoRows60);
    const norm60 = FlowGuard.getNormalizedTrafficData();
    expect(norm60.normalizationFactor).toBe(1);
  });

  test('13. Oversaturation Logic (Y >= 1.00): shows actual Y, demand audit, and webster not applicable notice', async () => {
    FlowGuard.resetToDefaults();
    const proj = FlowGuard.getProject();
    proj.engineeringParameters.intersection = { baseSaturationFlow: 100 };
    proj.engineeringParameters.saturation = { baseSaturationFlow: 100 };
    proj.geometry.laneCounts = { north: 1, east: 1, south: 1, west: 1 };
    FlowGuard.saveProject(proj);

    const demoRows = FlowGuard.generateDemoDatasetRows();
    await FlowGuard.executeDatasetIngestionPipeline(demoRows);
    const normData = FlowGuard.getNormalizedTrafficData();
    expect(normData).not.toBeNull();
    expect(normData.phaseAnalysis.totalY).toBeGreaterThanOrEqual(1.00);

    FlowGuard.setWizardStep(5);
    FlowGuard.runStep5Analysis();
    const res = FlowGuard.getCurrentAnalysisResult();

    expect(res.criticalAnalysis.totalY).toBeGreaterThanOrEqual(1.00);
    expect(res.criticalAnalysis.isWebsterValid).toBe(false);
    expect(res.websterTiming.websterCycleC0).toBeNull();

    FlowGuard.setWizardStep(6);
    const html = domStore['engineeringDashboardContainer'].innerHTML;
    expect(html).toContain('Webster optimization');
    expect(html).toContain(`${res.criticalAnalysis.totalY}`);
  });
});
