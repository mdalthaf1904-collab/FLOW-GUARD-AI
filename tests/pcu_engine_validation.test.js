/**
 * FlowGuard AI - Centralized PCU Calculation Engine & Validation Tests
 * Verifies exact Vehicle Count x Configured PCU Factor conversion, road total PCUs,
 * hourly demands, and 6-point automatic engine validation checklist.
 */

const FlowGuard = require('../js/app');

describe('FlowGuard AI - Centralized PCU Calculation Engine & Validation', () => {

  beforeEach(() => {
    FlowGuard.resetToDefaults();
  });

  test('Vehicle-wise converted PCUs match Vehicle Count x Editable IRC:106 PCU Factors', () => {
    const proj = FlowGuard.getProject();

    // Set custom vehicle counts for North road
    proj.trafficInput.vehicleCounts.north = { car: 164, motorcycle: 286, autorickshaw: 71, bus: 13, truck: 17, bicycle: 0 };
    proj.engineeringParameters.pcuFactors = { car: 1.0, motorcycle: 0.5, autorickshaw: 0.8, bus: 3.0, truck: 3.0, bicycle: 0.4 };

    FlowGuard.saveProject(proj);

    const processed = FlowGuard.getProject().processedTraffic;
    const north = processed.north;

    expect(north).toBeDefined();
    expect(north.convertedPCU.car).toEqual(164); // 164 * 1.0 = 164
    expect(north.convertedPCU.motorcycle).toEqual(143); // 286 * 0.5 = 143
    expect(north.convertedPCU.autorickshaw).toEqual(57); // 71 * 0.8 = 56.8 -> 57
    expect(north.convertedPCU.bus).toEqual(39); // 13 * 3.0 = 39
    expect(north.convertedPCU.truck).toEqual(51); // 17 * 3.0 = 51

    // Road Total PCU sum = 164 + 143 + 57 + 39 + 51 = 454
    expect(north.totalPCU).toEqual(454);
    expect(north.hourlyDemand).toEqual(454 * 4); // surveyDuration = 15 => 1816
  });

  test('Automatic validation checklist passes for verified project data', () => {
    const proj = FlowGuard.getProject();
    FlowGuard.saveProject(proj);

    const processed = FlowGuard.getProject().processedTraffic;
    expect(processed.validation).toBeDefined();
    expect(processed.validation.valid).toBe(true);
    expect(processed.validation.errors).toHaveLength(0);
  });

  test('Tasks 1-6: Master PCU identity, movement-wise PCU, hourly demand, and y=q/S flow ratio', () => {
    const proj = FlowGuard.getProject();
    proj.trafficInput.vehicleCounts.north = { car: 100, motorcycle: 100, autorickshaw: 50, bus: 10, truck: 10, bicycle: 0 };
    proj.trafficInput.turningCounts.north = { left: 50, through: 170, right: 50, flow: 270 };
    proj.geometry.surveyDuration = 15;
    FlowGuard.saveProject(proj);

    const processed = FlowGuard.getProject().processedTraffic;
    const north = processed.north;

    // Task 1: Master Total Converted PCU Identity
    expect(processed.intersection.totalPCU).toEqual(processed.totalPCUDemand);
    expect(processed.totalPCU).toEqual(processed.totalPCUDemand);

    // Task 2: Movement-Wise PCUs stored on approachMovementPCU and movementPCU
    expect(processed.approachMovementPCU.north).toBeDefined();
    expect(processed.approachMovementPCU.north.leftPCU).toBeGreaterThan(0);
    expect(processed.approachMovementPCU.north.throughPCU).toBeGreaterThan(0);
    expect(processed.approachMovementPCU.north.rightPCU).toBeGreaterThan(0);

    // Task 3: Road Total PCU = Left PCU + Through PCU + Right PCU
    const moveSum = north.movementPCU.leftPCU + north.movementPCU.throughPCU + north.movementPCU.rightPCU;
    expect(moveSum).toEqual(north.totalPCU);

    // Task 4: Hourly Demand = Road Total PCU * (60 / surveyDuration)
    expect(north.hourlyDemand).toEqual(north.totalPCU * 4);

    // Task 5: Critical Lane Readiness y = q / S using displayed q (hourlyDemand)
    const expectedY = parseFloat((north.hourlyDemand / north.satFlow).toFixed(4));
    expect(north.flowRatioY).toEqual(expectedY);
  });

});
