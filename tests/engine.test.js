/**
 * FlowGuard AI - Civil Engineering Engine Unit Tests
 * Jest unit tests for Webster formula, IRC:93 math, TPI calculation, and D/D/1 queuing model.
 */

const FlowGuard = require('../js/app');
const CongestionEngine = require('../js/congestion');
const SimulationEngine = require('../js/simulation');
const ValidationEngine = require('../js/validation');

describe('FlowGuard AI Civil Engineering Math Engines', () => {

  test('Dataset Road Aggregation (Road A, B, C, D) & IRC:106 PCU Calculation', () => {
    const demoRows = [
      { Approach: 'Approach A', Cars: 50, Bikes: 40, Auto: 10, Bus: 2, Truck: 1, Left: 10, Through: 50, Right: 10 },
      { Approach: 'Approach B', Cars: 40, Bikes: 30, Auto: 5, Bus: 1, Truck: 0, Left: 8, Through: 40, Right: 8 },
      { Approach: 'Approach C', Cars: 30, Bikes: 20, Auto: 5, Bus: 1, Truck: 0, Left: 5, Through: 30, Right: 5 },
      { Approach: 'Approach D', Cars: 35, Bikes: 25, Auto: 5, Bus: 1, Truck: 0, Left: 6, Through: 35, Right: 6 }
    ];

    const result = FlowGuard.parseTrafficCSV ? null : null;
    // Test processRawDatasetRows via demo ingestion
    return FlowGuard.executeDatasetIngestionPipeline(demoRows).then(res => {
      expect(res).toBeDefined();
      const agg = res.aggregated;
      expect(agg.north.pcuTotal).toBeGreaterThan(0);
      expect(agg.east.pcuTotal).toBeGreaterThan(0);
      expect(agg.south.pcuTotal).toBeGreaterThan(0);
      expect(agg.west.pcuTotal).toBeGreaterThan(0);

      // Verify Road A (north) PCU is not 0
      // Cars: 50*1.0 = 50, Bikes: 40*0.5 = 20, Auto: 10*0.8 = 8, Bus: 2*3.0 = 6, Truck: 1*3.0 = 3 -> Total = 87
      expect(agg.north.pcuTotal).toEqual(87);
    });
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
