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
    expect(northRoad.websterInputs.criticalFlow).toEqual(900); // 900 PCU/h critical flow
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

  test('8. Step 4 geometry mapping reads directly from project.geometry.approaches and persists across load/recompute', () => {
    const proj = FlowGuard.getProject();
    proj.geometry.approaches = {
      north: { designation: 'Road A', direction: 'NORTHBOUND', approachWidth: 10.5, laneWidth: 3.5, speedLimit: 40, incomingLanes: 3, laneConfig: 'L1 | T1 | R1' },
      east:  { designation: 'Road B', direction: 'EASTBOUND',  approachWidth: 14.0, laneWidth: 3.5, speedLimit: 40, incomingLanes: 4, laneConfig: 'L1 | T2 | R1' },
      south: { designation: 'Road C', direction: 'SOUTHBOUND', approachWidth: 14.0, laneWidth: 3.5, speedLimit: 40, incomingLanes: 4, laneConfig: 'L1 | T2 | R1' },
      west:  { designation: 'Road D', direction: 'WESTBOUND',  approachWidth: 14.0, laneWidth: 3.5, speedLimit: 40, incomingLanes: 4, laneConfig: 'L1 | T2 | R1' }
    };
    FlowGuard.saveProject(proj);

    FlowGuard.recomputeProjectData(proj);

    const reloaded = FlowGuard.getProject();
    const northApp = reloaded.geometry.approaches.north;

    expect(northApp.approachWidth).toBe(10.5);
    expect(northApp.laneWidth).toBe(3.5);
    expect(northApp.incomingLanes).toBe(3);
    expect(northApp.speedLimit).toBe(40);
    expect(northApp.laneConfig).toBe('L1 | T1 | R1');
  });

  test('9. Browser Refresh Architecture Test: localStorage persists ONLY persistent config (geometry & engineering parameters), while dataset resets to empty', () => {
    const proj = FlowGuard.getProject();
    // 1. Set custom geometry and engineering parameters
    proj.geometry.approaches.north.approachWidth = 10.5;
    proj.geometry.approaches.north.incomingLanes = 3;
    proj.engineeringParameters.saturation.baseSaturationFlow = 1900;

    // 2. Add an uploaded dataset to in-memory state
    proj.dataset = {
      uploaded: true,
      records: [
        { time: '08:00', road: 'Road A', key: 'north', movement: 'Through', vehicleType: 'Cars', count: 500 }
      ]
    };
    FlowGuard.saveProject(proj);

    // Verify localStorage contains persistent payload ONLY (no dataset records)
    const storedStr = localStorage.getItem('FLOWGUARD_PROJECT_V8');
    expect(storedStr).toBeDefined();
    const storedObj = JSON.parse(storedStr);
    expect(storedObj.geometry).toBeDefined();
    expect(storedObj.geometry.approaches.north.approachWidth).toBe(10.5);
    expect(storedObj.engineeringParameters.saturation.baseSaturationFlow).toBe(1900);
    expect(storedObj.dataset).toBeUndefined(); // Omitted from persistent localStorage payload

    // 3. Simulate browser page reload (F5) by clearing in-memory store and re-reading from localStorage
    const reloadedProj = FlowGuard.reloadFromStorage ? FlowGuard.reloadFromStorage() : FlowGuard.getProject();

    // Verify Step 1 Geometry and Step 3 Engineering Parameters were restored intact
    expect(reloadedProj.geometry.approaches.north.approachWidth).toBe(10.5);
    expect(reloadedProj.geometry.approaches.north.incomingLanes).toBe(3);
    expect(reloadedProj.engineeringParameters.saturation.baseSaturationFlow).toBe(1900);

    // Verify dataset reset to neutral empty state
    expect(reloadedProj.dataset.uploaded).toBe(false);
    expect(reloadedProj.dataset.records).toEqual([]);
    expect(reloadedProj.processedTraffic.totalVehicles).toBe(0);
    expect(reloadedProj.processedTraffic.totalPCUDemand).toBe(0);
  });

  test('10. Independent Road A–D Approach Widths are read directly from project.geometry.approaches[key].approachWidth', () => {
    const proj = FlowGuard.getProject();
    proj.geometry.approaches.north.approachWidth = 10.5;
    proj.geometry.approaches.east.approachWidth = 14.0;
    proj.geometry.approaches.south.approachWidth = 17.5;
    proj.geometry.approaches.west.approachWidth = 21.0;
    FlowGuard.saveProject(proj);

    const loadedProj = FlowGuard.getProject();
    expect(loadedProj.geometry.approaches.north.approachWidth).toBe(10.5);
    expect(loadedProj.geometry.approaches.east.approachWidth).toBe(14.0);
    expect(loadedProj.geometry.approaches.south.approachWidth).toBe(17.5);
    expect(loadedProj.geometry.approaches.west.approachWidth).toBe(21.0);

    // Modify Road A only
    proj.geometry.approaches.north.approachWidth = 12.0;
    FlowGuard.saveProject(proj);

    const updatedProj = FlowGuard.getProject();
    expect(updatedProj.geometry.approaches.north.approachWidth).toBe(12.0);
    expect(updatedProj.geometry.approaches.east.approachWidth).toBe(14.0);
    expect(updatedProj.geometry.approaches.south.approachWidth).toBe(17.5);
    expect(updatedProj.geometry.approaches.west.approachWidth).toBe(21.0);
  });

  test('11. Independent Road A–D Peak Hour Analysis evaluates distinct peak intervals and PHFs per road', () => {
    const proj = FlowGuard.getProject();

    // Construct synthetic records where Roads A, B, C, D peak at different intervals
    proj.dataset = {
      uploaded: true,
      records: [
        // Road A (north) peaks at 08:15–08:30 (V_peak = 500, V_total = 1770) -> PHF = 1770 / (4 * 500) = 0.89
        { timeWindow: '08:00–08:15', key: 'north', road: 'Road A', movement: 'Through', vehicleType: 'Cars', count: 400, rawPCU: 400 },
        { timeWindow: '08:15–08:30', key: 'north', road: 'Road A', movement: 'Through', vehicleType: 'Cars', count: 500, rawPCU: 500 },
        { timeWindow: '08:30–08:45', key: 'north', road: 'Road A', movement: 'Through', vehicleType: 'Cars', count: 450, rawPCU: 450 },
        { timeWindow: '08:45–09:00', key: 'north', road: 'Road A', movement: 'Through', vehicleType: 'Cars', count: 420, rawPCU: 420 },

        // Road B (east) peaks at 08:30–08:45 (V_peak = 520, V_total = 1620) -> PHF = 1620 / (4 * 520) = 0.78
        { timeWindow: '08:00–08:15', key: 'east', road: 'Road B', movement: 'Through', vehicleType: 'Cars', count: 300, rawPCU: 300 },
        { timeWindow: '08:15–08:30', key: 'east', road: 'Road B', movement: 'Through', vehicleType: 'Cars', count: 400, rawPCU: 400 },
        { timeWindow: '08:30–08:45', key: 'east', road: 'Road B', movement: 'Through', vehicleType: 'Cars', count: 520, rawPCU: 520 },
        { timeWindow: '08:45–09:00', key: 'east', road: 'Road B', movement: 'Through', vehicleType: 'Cars', count: 400, rawPCU: 400 },

        // Road C (south) peaks at 08:45–09:00 (V_peak = 560, V_total = 1850) -> PHF = 1850 / (4 * 560) = 0.83
        { timeWindow: '08:00–08:15', key: 'south', road: 'Road C', movement: 'Through', vehicleType: 'Cars', count: 450, rawPCU: 450 },
        { timeWindow: '08:15–08:30', key: 'south', road: 'Road C', movement: 'Through', vehicleType: 'Cars', count: 430, rawPCU: 430 },
        { timeWindow: '08:30–08:45', key: 'south', road: 'Road C', movement: 'Through', vehicleType: 'Cars', count: 410, rawPCU: 410 },
        { timeWindow: '08:45–09:00', key: 'south', road: 'Road C', movement: 'Through', vehicleType: 'Cars', count: 560, rawPCU: 560 },

        // Road D (west) peaks at 08:00–08:15 (V_peak = 600, V_total = 1960) -> PHF = 1960 / (4 * 600) = 0.82
        { timeWindow: '08:00–08:15', key: 'west', road: 'Road D', movement: 'Through', vehicleType: 'Cars', count: 600, rawPCU: 600 },
        { timeWindow: '08:15–08:30', key: 'west', road: 'Road D', movement: 'Through', vehicleType: 'Cars', count: 480, rawPCU: 480 },
        { timeWindow: '08:30–08:45', key: 'west', road: 'Road D', movement: 'Through', vehicleType: 'Cars', count: 450, rawPCU: 450 },
        { timeWindow: '08:45–09:00', key: 'west', road: 'Road D', movement: 'Through', vehicleType: 'Cars', count: 430, rawPCU: 430 }
      ]
    };
    FlowGuard.saveProject(proj);
    FlowGuard.recomputeProjectData(proj);

    const pt = proj.processedTraffic;

    // Verify Road A Peak Analysis
    expect(pt.north.peakHourAnalysis.peakInterval).toBe('08:15–08:30');
    expect(pt.north.peakHourAnalysis.peakHourVolume).toBe(1770);
    expect(pt.north.peakHourAnalysis.peakHourFactor).toBe(0.89);

    // Verify Road B Peak Analysis
    expect(pt.east.peakHourAnalysis.peakInterval).toBe('08:30–08:45');
    expect(pt.east.peakHourAnalysis.peakHourVolume).toBe(1620);
    expect(pt.east.peakHourAnalysis.peakHourFactor).toBe(0.78);

    // Verify Road C Peak Analysis
    expect(pt.south.peakHourAnalysis.peakInterval).toBe('08:45–09:00');
    expect(pt.south.peakHourAnalysis.peakHourVolume).toBe(1850);
    expect(pt.south.peakHourAnalysis.peakHourFactor).toBe(0.83);

    // Verify Road D Peak Analysis
    expect(pt.west.peakHourAnalysis.peakInterval).toBe('08:00–08:15');
    expect(pt.west.peakHourAnalysis.peakHourVolume).toBe(1960);
    expect(pt.west.peakHourAnalysis.peakHourFactor).toBe(0.82);
  });

  test('12. Step 4 Road Cards satisfy Total Demand = Left PCU + Through PCU + Right PCU with consistent 1-decimal rounding', () => {
    const proj = FlowGuard.getProject();
    proj.dataset = {
      uploaded: true,
      records: [
        // Road A (1450 vehicles, all Through, PCU factor -> 1118.9 PCU)
        { timeWindow: '09:30–09:45', key: 'north', road: 'Road A', movement: 'Through', vehicleType: 'Cars', count: 1450, rawPCU: 1118.9 }
      ]
    };
    FlowGuard.saveProject(proj);
    FlowGuard.recomputeProjectData(proj);

    const pt = proj.processedTraffic;
    ['north', 'east', 'south', 'west'].forEach(key => {
      const road = pt[key];
      const left = road.movementPCU.leftPCU;
      const through = road.movementPCU.throughPCU;
      const right = road.movementPCU.rightPCU;
      const total = road.movementPCU.totalPCU;

      const expectedTotal = Math.round((left + through + right) * 10) / 10;
      expect(total).toBe(expectedTotal);
    });

    // Check Road A specific values
    expect(pt.north.movementPCU.leftPCU).toBe(0);
    expect(pt.north.movementPCU.throughPCU).toBe(1118.9);
    expect(pt.north.movementPCU.rightPCU).toBe(0);
    expect(pt.north.movementPCU.totalPCU).toBe(1118.9);
  });

  test('13. Step 4 Intersection / Phase Summary dynamically aggregates 2-phase vs 4-phase metrics', () => {
    const proj = FlowGuard.getProject();
    proj.dataset = {
      uploaded: true,
      records: [
        { timeWindow: '08:00–08:15', key: 'north', road: 'Road A', movement: 'Through', vehicleType: 'Cars', count: 700, rawPCU: 700 },
        { timeWindow: '08:00–08:15', key: 'east', road: 'Road B', movement: 'Through', vehicleType: 'Cars', count: 600, rawPCU: 600 },
        { timeWindow: '08:00–08:15', key: 'south', road: 'Road C', movement: 'Through', vehicleType: 'Cars', count: 800, rawPCU: 800 },
        { timeWindow: '08:00–08:15', key: 'west', road: 'Road D', movement: 'Through', vehicleType: 'Cars', count: 500, rawPCU: 500 }
      ]
    };

    // Test 2-Phase Mode
    proj.engineeringParameters.phaseMode = '2-phase';
    proj.engineeringParameters.signal = proj.engineeringParameters.signal || {};
    proj.engineeringParameters.signal.phaseCount = 2;
    FlowGuard.saveProject(proj);
    FlowGuard.recomputeProjectData(proj);

    let normData = FlowGuard.getNormalizedTrafficData();
    expect(normData.phaseAnalysis.phaseMode).toEqual('2-phase');
    expect(normData.phaseAnalysis.numPhases).toEqual(2);

    const y2Phase1 = normData.phaseAnalysis.phase1.flowRatioY;
    const y2Phase2 = normData.phaseAnalysis.phase2.flowRatioY;
    expect(normData.phaseAnalysis.totalY).toBeCloseTo(y2Phase1 + y2Phase2, 4);

    // Switch to 4-Phase Mode
    proj.engineeringParameters.phaseMode = '4-phase';
    proj.engineeringParameters.signal.phaseCount = 4;
    FlowGuard.saveProject(proj);
    FlowGuard.recomputeProjectData(proj);

    normData = FlowGuard.getNormalizedTrafficData();
    expect(normData.phaseAnalysis.phaseMode).toEqual('4-phase');
    expect(normData.phaseAnalysis.numPhases).toEqual(4);

    const y4Phase1 = normData.phaseAnalysis.phase1.flowRatioY;
    const y4Phase2 = normData.phaseAnalysis.phase2.flowRatioY;
    const y4Phase3 = normData.phaseAnalysis.phase3.flowRatioY;
    const y4Phase4 = normData.phaseAnalysis.phase4.flowRatioY;

    const expected4Total = parseFloat((y4Phase1 + y4Phase2 + y4Phase3 + y4Phase4).toFixed(4));
    expect(normData.phaseAnalysis.totalY).toEqual(expected4Total);
    expect(normData.phaseAnalysis.totalY).toBeGreaterThan(normData.phaseAnalysis.phase1.flowRatioY);
  });

});
