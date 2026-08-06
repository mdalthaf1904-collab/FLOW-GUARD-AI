/**
 * FlowGuard AI - Civil Engineering Engine Unit Tests
 * Jest unit tests for Webster formula, IRC:93 math, TPI calculation, and D/D/1 queuing model.
 */

const FlowGuard = require('../js/app');
const CongestionEngine = require('../js/congestion');
const SimulationEngine = require('../js/simulation');
const ValidationEngine = require('../js/validation');

describe('FlowGuard AI Civil Engineering Math Engines', () => {

  test('IRC:106 PCU Conversion Math', () => {
    const vehObj = { car: 100, bike: 200, auto: 50, bus: 10, hcv: 5, bicycle: 20 };
    const pcu = FlowGuard.calculateApproachPCU(vehObj);
    // (100*1.0) + (200*0.5) + (50*0.8) + (10*3.0) + (5*3.0) + (20*0.4) = 100 + 100 + 40 + 30 + 15 + 8 = 293
    expect(pcu).toEqual(293);
  });

  test('Webster Optimum Cycle Formula C = (1.5L + 5) / (1 - Y)', () => {
    const approaches = {
      north: { flow: 600, lanes: 2 },
      east:  { flow: 400, lanes: 2 }
    };
    const res = FlowGuard.calculateWebsterEngine(approaches);
    expect(res.cOpt).toBeGreaterThanOrEqual(30);
    expect(res.cOpt).toBeLessThanOrEqual(180);
  });

  test('Traffic Pressure Index (TPI) Normalization', () => {
    const tpiLow = CongestionEngine.calculateTrafficPressureIndex(200, 10, 15, 0.4);
    expect(tpiLow.category).toBeDefined();

    const tpiHigh = CongestionEngine.calculateTrafficPressureIndex(2200, 150, 120, 1.4);
    expect(tpiHigh.score).toBeGreaterThan(50);
  });

  test('IRC:93 Guidelines Validation Engine', () => {
    const activeKeys = ['north', 'east', 'south', 'west'];
    const proposedGreens = { north: 30, east: 30, south: 25, west: 25 };
    const config = { minGreen: 7, maxGreen: 90, yellowTime: 3, allRedTime: 2 };
    
    const val = CongestionEngine.validateIRC93Guidelines(activeKeys, proposedGreens, config);
    expect(val.overallPassed).toBe(true);
    expect(val.statusLabel).toEqual('ENGINEERING VALIDATED');
  });

  test('Deterministic Validation Engine Test Suite (9 Scenarios)', () => {
    global.FlowGuard = FlowGuard;
    global.CongestionEngine = CongestionEngine;
    global.SimulationEngine = SimulationEngine;
    global.AnalysisEngine = require('../js/analysis');

    const testSuiteRes = ValidationEngine.runTestSuite();
    expect(testSuiteRes.totalPassed).toEqual(9);
    expect(testSuiteRes.allPassed).toBe(true);
  });
});
