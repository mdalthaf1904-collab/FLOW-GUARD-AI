/**
 * FlowGuard AI - Unified Project Architecture & State Management Tests
 * Tests FlowGuardProject single source of truth, data ownership, reactive pipeline, and persistence.
 */

const FlowGuard = require('../js/app');

describe('FlowGuard AI - Unified Project Store Architecture', () => {

  beforeEach(() => {
    FlowGuard.resetToDefaults();
  });

  test('FlowGuardProject is initialized with complete unified schema', () => {
    const proj = FlowGuard.getProject();

    expect(proj).toBeDefined();
    expect(proj.projectInfo).toBeDefined();
    expect(proj.projectInfo.id).toBeDefined();
    expect(proj.geometry).toBeDefined();
    expect(proj.trafficInput).toBeDefined();
    expect(proj.engineeringParameters).toBeDefined();
    expect(proj.processedTraffic).toBeDefined();
    expect(proj.analysisResults).toBeDefined();
    expect(proj.report).toBeDefined();
  });

  test('Step 1 (Geometry) ownership & reactive propagation to Step 4', () => {
    const proj = FlowGuard.getProject();

    // Step 1 mutates geometry duration to 30 mins
    proj.geometry.surveyDuration = 30;
    proj.geometry.surveyMethod = 'Manual Survey Count';
    FlowGuard.saveProject(proj);

    const updatedState = FlowGuard.getState();
    expect(updatedState.duration).toEqual(30);
    expect(updatedState.surveyMethod).toEqual('Manual Survey Count');
    expect(updatedState.project.geometry.surveyDuration).toEqual(30);
    expect(updatedState.project.geometry.surveyMethod).toEqual('Manual Survey Count');
  });

  test('Step 2 (Traffic Input) ownership & PCU reactive computation', () => {
    const proj = FlowGuard.getProject();

    // Step 2 updates vehicle counts for North approach
    proj.trafficInput.vehicleCounts.north = { car: 100, motorcycle: 100, autorickshaw: 50, bus: 10, truck: 10, bicycle: 0 };
    FlowGuard.saveProject(proj);

    const state = FlowGuard.getState();
    const northPCU = state.project.processedTraffic.approachStats.north.pcuVal;

    // Expected North PCU = 100*1.0 + 100*0.5 + 50*0.8 + 10*3.0 + 10*3.0 = 100 + 50 + 40 + 30 + 30 = 250 PCU
    expect(northPCU).toEqual(250);
  });

  test('Step 3 (Engineering Parameters) PCU factor change updates processed PCU & flow ratios', () => {
    const proj = FlowGuard.getProject();

    // Step 3 mutates Bus PCU factor from 3.0 to 4.0
    proj.engineeringParameters.pcuFactors.bus = 4.0;
    proj.trafficInput.vehicleCounts.north = { car: 100, motorcycle: 0, autorickshaw: 0, bus: 10, truck: 0, bicycle: 0 };
    FlowGuard.saveProject(proj);

    const state = FlowGuard.getState();
    const northPCU = state.project.processedTraffic.approachStats.north.pcuVal;

    // Expected North PCU = 100*1.0 + 10*4.0 = 140 PCU
    expect(northPCU).toEqual(140);
  });

  test('Project JSON Export & Import roundtrip persistence', () => {
    const proj = FlowGuard.getProject();
    proj.projectInfo.name = 'Test Intersection Refactor Project';
    proj.geometry.configType = '3NO_NORTH';
    FlowGuard.saveProject(proj);

    const jsonString = FlowGuard.exportProjectJSON();
    expect(typeof jsonString).toBe('string');
    expect(jsonString).toContain('Test Intersection Refactor Project');

    // Reset and Import
    FlowGuard.resetToDefaults();
    const importRes = FlowGuard.importProjectJSON(jsonString);

    expect(importRes.success).toBe(true);
    const restoredProj = FlowGuard.getProject();
    expect(restoredProj.projectInfo.name).toEqual('Test Intersection Refactor Project');
    expect(restoredProj.geometry.configType).toEqual('3NO_NORTH');
  });

  test('Step 4 (Traffic Summary) owns zero data and performs zero recalculations', () => {
    const proj = FlowGuard.getProject();
    FlowGuard.recomputeProjectData(proj);

    // Verify processedTraffic contains pre-computed approachStats
    expect(proj.processedTraffic.approachStats).toBeDefined();
    expect(proj.processedTraffic.approachStats.north).toBeDefined();
    expect(proj.processedTraffic.totalVehicles).toBeGreaterThan(0);
    expect(proj.processedTraffic.totalPCUDemand).toBeGreaterThan(0);
  });

});
