// Mock localStorage for Node Jest environment
const storageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    clear: () => { store = {}; },
    removeItem: (key) => { delete store[key]; }
  };
})();

global.localStorage = storageMock;

const FlowGuard = require('../js/app.js');

describe('Step 4 Traffic Summary & Engineering Dashboard Unit & Integration Tests', () => {

  beforeEach(() => {
    localStorage.clear();
    const proj = FlowGuard.loadProject ? FlowGuard.loadProject() : FlowGuard.getProject();
    if (FlowGuard.saveProject) FlowGuard.saveProject(proj);
  });

  test('1. Empty dataset state renders neutral placeholders ("Awaiting Dataset Upload", zero vehicle count, zero demo values)', () => {
    const proj = FlowGuard.getProject();
    FlowGuard.recomputeProjectData(proj);

    const pt = proj.processedTraffic;
    expect(pt.totalVehicles).toEqual(0);
    expect(pt.totalPCUDemand).toEqual(0);
    expect(pt.metadata.status).toMatch(/Awaiting Dataset Upload/i);
  });

  test('2. Step 1 geometry is strictly preserved in Step 4 and never overridden by dataset', () => {
    const proj = FlowGuard.getProject();
    proj.geometry.laneCounts = { north: 4, east: 3, south: 2, west: 3 };
    proj.geometry.laneWidth = 3.5;
    proj.geometry.speedLimit = 60;
    FlowGuard.saveProject(proj);

    FlowGuard.recomputeProjectData(proj);
    const updatedProj = FlowGuard.getProject();

    expect(updatedProj.geometry.laneCounts.north).toEqual(4);
    expect(updatedProj.geometry.speedLimit).toEqual(60);
  });

  test('3. Raw Count preservation and vehicle total calculation V_total = SUM(Count)', () => {
    const proj = FlowGuard.getProject();
    proj.dataset = {
      uploaded: true,
      records: [
        { time: '08:00', road: 'Road A', key: 'north', movement: 'Left', vehicleType: 'Car', count: 100 },
        { time: '08:00', road: 'Road A', key: 'north', movement: 'Through', vehicleType: 'Motorcycle', count: 50 },
        { time: '08:00', road: 'Road B', key: 'east', movement: 'Through', vehicleType: 'Bus', count: 20 }
      ]
    };
    FlowGuard.saveProject(proj);

    FlowGuard.recomputeProjectData(proj);
    const updated = FlowGuard.getProject();

    // V_total = 100 + 50 + 20 = 170 vehicles
    expect(updated.processedTraffic.totalVehicles).toEqual(170);
  });

  test('4. PCU conversion matches SUM(Count * Step 3 PCU factor)', () => {
    const proj = FlowGuard.getProject();
    proj.engineeringParameters.pcuFactors = { Cars: 1.0, Bikes: 0.5, Bus: 3.0, car: 1.0, motorcycle: 0.5, bus: 3.0 };
    proj.dataset = {
      uploaded: true,
      records: [
        { time: '08:00', road: 'Road A', key: 'north', movement: 'Left', vehicleType: 'Cars', count: 100 },
        { time: '08:00', road: 'Road A', key: 'north', movement: 'Through', vehicleType: 'Bikes', count: 50 },
        { time: '08:00', road: 'Road B', key: 'east', movement: 'Through', vehicleType: 'Bus', count: 20 }
      ]
    };
    FlowGuard.saveProject(proj);

    FlowGuard.recomputeProjectData(proj);
    const updated = FlowGuard.getProject();

    // North PCU = 100 * 1.0 + 50 * 0.5 = 125 PCU
    // East PCU = 20 * 3.0 = 60 PCU
    // Total PCU = 185 PCU
    expect(updated.processedTraffic.approachMovementPCU.north.totalPCU).toEqual(125);
    expect(updated.processedTraffic.totalPCUDemand).toEqual(185);
  });

  test('5. Saturation flow equals S0 * n and Approach Flow Ratio y = q / s', () => {
    const proj = FlowGuard.getProject();
    proj.geometry.laneCounts = { north: 3, east: 2, south: 2, west: 2 };
    proj.geometry.surveyDuration = 60; // 60 minutes
    proj.engineeringParameters.saturation.baseSaturationFlow = 1800;
    proj.dataset = {
      uploaded: true,
      records: [
        { time: '08:00', road: 'Road A', key: 'north', movement: 'Through', vehicleType: 'Cars', count: 900 }
      ]
    };
    FlowGuard.saveProject(proj);

    FlowGuard.recomputeProjectData(proj);
    const updated = FlowGuard.getProject();

    const northRoad = updated.processedTraffic.north;
    // Saturation flow s_north = 1800 * 3 = 5400 PCU/h
    expect(northRoad.websterInputs.satFlow).toEqual(5400);

    // Critical flow q_north = 900 PCU/h (since surveyDuration = 60)
    expect(northRoad.websterInputs.criticalFlow).toEqual(300); // 900 / 3 lanes
    expect(northRoad.websterInputs.flowRatioY).toEqual(0.1667); // 900 / 5400 = 0.1667
  });

  test('6. Phase Flow Ratio aggregation Y = max(yA, yC) + max(yB, yD)', () => {
    const proj = FlowGuard.getProject();
    proj.geometry.laneCounts = { north: 2, east: 2, south: 2, west: 2 };
    proj.geometry.surveyDuration = 60; // 60 minutes
    proj.engineeringParameters.saturation.baseSaturationFlow = 1800;
    proj.dataset = {
      uploaded: true,
      records: [
        { time: '08:00', road: 'Road A', key: 'north', movement: 'Through', vehicleType: 'Cars', count: 720 }, // yA = 720 / 3600 = 0.20
        { time: '08:00', road: 'Road C', key: 'south', movement: 'Through', vehicleType: 'Cars', count: 360 }, // yC = 360 / 3600 = 0.10 -> Phase 1 = 0.20
        { time: '08:00', road: 'Road B', key: 'east', movement: 'Through', vehicleType: 'Cars', count: 540 },  // yB = 540 / 3600 = 0.15
        { time: '08:00', road: 'Road D', key: 'west', movement: 'Through', vehicleType: 'Cars', count: 900 }   // yD = 900 / 3600 = 0.25 -> Phase 2 = 0.25
      ]
    };
    FlowGuard.saveProject(proj);

    FlowGuard.recomputeProjectData(proj);
    const updated = FlowGuard.getProject();

    const yA = updated.processedTraffic.north.websterInputs.flowRatioY;
    const yB = updated.processedTraffic.east.websterInputs.flowRatioY;
    const yC = updated.processedTraffic.south.websterInputs.flowRatioY;
    const yD = updated.processedTraffic.west.websterInputs.flowRatioY;

    expect(yA).toEqual(0.2);
    expect(yB).toEqual(0.15);
    expect(yC).toEqual(0.1);
    expect(yD).toEqual(0.25);

    const yPhase1 = Math.max(yA, yC);
    const yPhase2 = Math.max(yB, yD);
    const totalY = parseFloat((yPhase1 + yPhase2).toFixed(4));

    expect(yPhase1).toEqual(0.2);
    expect(yPhase2).toEqual(0.25);
    expect(totalY).toEqual(0.45);
  });

  test('7. Step 4 contains ZERO Webster cycle length, delay, queue, or LOS calculations', () => {
    const proj = FlowGuard.getProject();
    FlowGuard.recomputeProjectData(proj);
    const pt = proj.processedTraffic;

    expect(pt.optimumCycleLength).toBeUndefined();
    expect(pt.greenSplits).toBeUndefined();
    expect(pt.averageDelay).toBeUndefined();
    expect(pt.levelOfService).toBeUndefined();
  });

});
