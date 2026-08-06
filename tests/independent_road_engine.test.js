/**
 * FlowGuard AI - Independent Road-Level Movement PCU Engine Tests
 * Verifies that every road (North, East, South, West) is calculated independently
 * before intersection totals are aggregated.
 */

const FlowGuard = require('../js/app');

describe('FlowGuard AI - Independent Road PCU Calculation Model', () => {

  beforeEach(() => {
    FlowGuard.resetToDefaults();
  });

  test('Calculates North, East, South, West roads independently in processedTraffic', () => {
    const proj = FlowGuard.getProject();

    proj.trafficInput.vehicleCounts = {
      north: { car: 500, motorcycle: 200, autorickshaw: 50, bus: 20, truck: 10 },
      east:  { car: 400, motorcycle: 150, autorickshaw: 40, bus: 15, truck: 5 },
      south: { car: 200, motorcycle: 100, autorickshaw: 20, bus: 5,  truck: 2 },
      west:  { car: 300, motorcycle: 120, autorickshaw: 30, bus: 10, truck: 3 }
    };
    proj.trafficInput.turningCounts = {
      north: { left: 100, through: 600, right: 80, flow: 780 },
      east:  { left: 80,  through: 450, right: 80, flow: 610 },
      south: { left: 50,  through: 230, right: 47, flow: 327 },
      west:  { left: 60,  through: 340, right: 63, flow: 463 }
    };

    FlowGuard.saveProject(proj);

    const processed = FlowGuard.getProject().processedTraffic;

    expect(processed.north).toBeDefined();
    expect(processed.east).toBeDefined();
    expect(processed.south).toBeDefined();
    expect(processed.west).toBeDefined();

    // Verify North road properties
    expect(processed.north.totalVehicles).toEqual(780);
    expect(processed.north.totalPCU).toBeGreaterThan(0);
    expect(processed.north.hourlyDemand).toEqual(processed.north.totalPCU * 4); // surveyDuration = 15m => mult = 4

    // Verify movement PCUs sum to road total PCU
    const northM = processed.north.movementPCU;
    expect(northM.leftPCU + northM.throughPCU + northM.rightPCU).toEqual(processed.north.totalPCU);

    // Verify East road properties independently
    expect(processed.east.totalVehicles).toEqual(610);
    expect(processed.east.totalPCU).toBeGreaterThan(0);
    const eastM = processed.east.movementPCU;
    expect(eastM.leftPCU + eastM.throughPCU + eastM.rightPCU).toEqual(processed.east.totalPCU);
  });

  test('Intersection totals equal the sum of independent road calculations', () => {
    const proj = FlowGuard.getProject();
    FlowGuard.saveProject(proj);

    const processed = FlowGuard.getProject().processedTraffic;
    expect(processed.intersection).toBeDefined();

    const sumRoadVehicles = processed.north.totalVehicles + processed.east.totalVehicles + processed.south.totalVehicles + processed.west.totalVehicles;
    const sumRoadPCU = processed.north.totalPCU + processed.east.totalPCU + processed.south.totalPCU + processed.west.totalPCU;
    const sumRoadHourlyDemand = processed.north.hourlyDemand + processed.east.hourlyDemand + processed.south.hourlyDemand + processed.west.hourlyDemand;

    expect(processed.intersection.totalVehicles).toEqual(sumRoadVehicles);
    expect(processed.intersection.totalPCU).toEqual(sumRoadPCU);
    expect(processed.intersection.totalHourlyDemand).toEqual(sumRoadHourlyDemand);
  });

});
