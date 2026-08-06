/**
 * FlowGuard AI - Movement-Based PCU Engine Tests
 * Tests movementPCU calculation, directional PCU split, sum equality, and Webster integration.
 */

const FlowGuard = require('../js/app');

describe('FlowGuard AI - Movement-Based PCU Engine', () => {

  beforeEach(() => {
    FlowGuard.resetToDefaults();
  });

  test('recomputeProjectData computes movementPCU per movement (Left, Through, Right)', () => {
    const proj = FlowGuard.getProject();

    // Configure turning counts for North approach
    proj.trafficInput.turningCounts.north = { left: 100, through: 600, right: 100, flow: 800 };
    FlowGuard.saveProject(proj);

    const processed = FlowGuard.getProject().processedTraffic;
    expect(processed.movementPCU).toBeDefined();
    expect(processed.movementPCU.north).toBeDefined();

    const northMove = processed.movementPCU.north;
    expect(northMove.leftPCU).toBeGreaterThan(0);
    expect(northMove.throughPCU).toBeGreaterThan(0);
    expect(northMove.rightPCU).toBeGreaterThan(0);

    // Sum of movement PCUs equals total approach PCU
    const sumPCU = northMove.leftPCU + northMove.throughPCU + northMove.rightPCU;
    expect(sumPCU).toEqual(northMove.totalPCU);
  });

  test('Hourly equivalent demands match movement PCU scaling', () => {
    const proj = FlowGuard.getProject();
    proj.geometry.surveyDuration = 15; // 15 mins -> multiplier = 4
    FlowGuard.saveProject(proj);

    const processed = FlowGuard.getProject().processedTraffic;
    const northMove = processed.movementPCU.north;

    expect(northMove.leftHourlyPCU).toEqual(northMove.leftPCU * 4);
    expect(northMove.throughHourlyPCU).toEqual(northMove.throughPCU * 4);
    expect(northMove.rightHourlyPCU).toEqual(northMove.rightPCU * 4);
    expect(northMove.totalHourlyPCU).toEqual(northMove.totalPCU * 4);
  });

  test('processedTraffic stores approachPCU, hourlyDemand, and criticalLaneInputs', () => {
    const proj = FlowGuard.getProject();
    FlowGuard.saveProject(proj);

    const processed = FlowGuard.getProject().processedTraffic;
    expect(processed.approachPCU).toBeDefined();
    expect(processed.hourlyDemand).toBeDefined();
    expect(processed.criticalLaneInputs).toBeDefined();
    expect(processed.approachPCU.north).toBeGreaterThan(0);
    expect(processed.hourlyDemand.north).toBeGreaterThan(0);
    expect(processed.criticalLaneInputs.north.flowRatioY).toBeDefined();
  });

  test('Webster Engine consumes movement PCU model without errors', () => {
    const state = FlowGuard.getState();
    const result = FlowGuard.calculateWebsterEngine(state.approaches);

    expect(result).toBeDefined();
    expect(result.cOpt).toBeGreaterThanOrEqual(30);
    expect(result.cOpt).toBeLessThanOrEqual(180);
  });

});
