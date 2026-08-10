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
});
