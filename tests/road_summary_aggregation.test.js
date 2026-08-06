/**
 * FlowGuard AI - Road Summary PCU Aggregation Tests
 * Verifies that Road Total PCU = SUM(per-row PCU) across ALL rows for each road,
 * and that Traffic Summary reads from processedTraffic.roadSummary (never recalculates).
 */

const FlowGuard = require('../js/app');

describe('FlowGuard AI - Road Summary PCU Aggregation', () => {

  beforeEach(() => {
    FlowGuard.resetToDefaults();
  });

  /**
   * Constructs a minimal dataset row where vehicles sum exactly equals turning counts.
   * Uses standard IRC:106 default PCU factors.
   *
   * Row PCU = (cars × 1.0) + (bikes × 0.5) + (auto × 0.8) + (bus × 3.0) + (truck × 3.0) + (bicycle × 0.4)
   */
  function makeRow(road, time, cars, bikes, auto, bus, truck, bicycle) {
    const total = cars + bikes + auto + bus + truck + bicycle;
    // Distribute turning movements proportionally (sum must equal total)
    const left = Math.floor(total * 0.3);
    const right = Math.floor(total * 0.2);
    const through = total - left - right;
    return {
      Date: '2026-08-06',
      Time: time,
      Road: road,
      Cars: cars,
      Bikes: bikes,
      AutoRickshaw: auto,
      Bus: bus,
      Truck: truck,
      Bicycle: bicycle,
      LeftTurn: left,
      Through: through,
      RightTurn: right,
      IncomingLanes: 2,
      SpeedLimit: 50,
      PedestrianCount: 20,
      CrosswalkWidth: 14,
      Incident: 'None'
    };
  }

  test('Road Summary: SUM of per-row PCUs is stored in processedTraffic.roadSummary', async () => {
    // 4 rows × 4 roads = 16 rows total
    // Each row: cars=50, bikes=30, auto=10, bus=5, truck=3, bicycle=0
    // Per-row PCU = (50×1.0) + (30×0.5) + (10×0.8) + (5×3.0) + (3×3.0) + (0×0.4)
    //            = 50 + 15 + 8 + 15 + 9 + 0 = 97 PCU
    // 4 rows per road → Road Total PCU = 97 × 4 = 388

    const rows = [];
    const times = ['08:00', '08:15', '08:30', '08:45'];
    const roads = [
      'Road A - North',
      'Road B - East',
      'Road C - South',
      'Road D - West'
    ];
    times.forEach(t => {
      roads.forEach(r => {
        rows.push(makeRow(r, t, 50, 30, 10, 5, 3, 0));
      });
    });

    await FlowGuard.executeDatasetIngestionPipeline(rows);

    const proj = FlowGuard.getProject();
    expect(proj.trafficInput.roadSummary).toBeDefined();
    expect(proj.processedTraffic.roadSummary).toBeDefined();

    // Each road should have exactly 388 PCU (97 per row × 4 rows)
    const expectedPCUPerRoad = 97 * 4;

    ['north', 'east', 'south', 'west'].forEach(k => {
      const rs = proj.processedTraffic.roadSummary[k];
      expect(rs).toBeDefined();
      expect(rs.totalPCU).toBeCloseTo(expectedPCUPerRoad, 0);
      console.log(`Road ${k.toUpperCase()} Total PCU: ${rs.totalPCU} (expected: ${expectedPCUPerRoad})`);
    });
  });

  test('Traffic Summary reads roadSummary.totalPCU — approachStats.pcuVal equals roadSummary value', async () => {
    // Road A: 2 rows with known PCU
    // Row 1: cars=100, bikes=40, auto=15, bus=5, truck=5, bicycle=0
    //   PCU = 100 + 20 + 12 + 15 + 15 = 162
    // Row 2: cars=80, bikes=30, auto=10, bus=4, truck=3, bicycle=0
    //   PCU = 80 + 15 + 8 + 12 + 9 = 124
    // Road A Total PCU = 162 + 124 = 286

    const rows = [
      makeRow('Road A - North', '08:00', 100, 40, 15, 5, 5, 0),   // PCU = 162
      makeRow('Road A - North', '08:15', 80, 30, 10, 4, 3, 0),    // PCU = 124
      makeRow('Road B - East',  '08:00', 70, 25, 8, 3, 3, 0),
      makeRow('Road B - East',  '08:15', 60, 20, 6, 2, 2, 0),
      makeRow('Road C - South', '08:00', 50, 15, 5, 2, 2, 0),
      makeRow('Road C - South', '08:15', 40, 12, 4, 1, 1, 0),
      makeRow('Road D - West',  '08:00', 45, 18, 6, 2, 2, 0),
      makeRow('Road D - West',  '08:15', 35, 14, 5, 1, 1, 0)
    ];

    await FlowGuard.executeDatasetIngestionPipeline(rows);

    const proj = FlowGuard.getProject();

    // Verify Road A
    const roadArs = proj.processedTraffic.roadSummary.north;
    expect(roadArs.totalPCU).toBeCloseTo(286, 0);

    // Verify approachStats reads the same value (via recomputeProjectData using roadSummary)
    const northStats = proj.processedTraffic.approachStats.north;
    expect(northStats.pcuVal).toBeCloseTo(286, 0);

    console.log('Road A roadSummary.totalPCU:', roadArs.totalPCU);
    console.log('Road A approachStats.pcuVal:', northStats.pcuVal);
  });

  test('processRawDatasetRows correctly computes per-row PCU with configured factors', () => {
    // 2 rows for Road A only
    // Row 1: cars=10, bikes=10, auto=0, bus=0, truck=0, bicycle=0
    //   Default factors: car=1.0, bike=0.5
    //   PCU = 10 + 5 = 15
    // Row 2: cars=20, bikes=20
    //   PCU = 20 + 10 = 30
    // Total Road A PCU = 15 + 30 = 45

    const rows = [
      makeRow('Road A - North', '08:00', 10, 10, 0, 0, 0, 0),
      makeRow('Road A - North', '08:15', 20, 20, 0, 0, 0, 0),
      makeRow('Road B - East',  '08:00', 10, 10, 0, 0, 0, 0),
      makeRow('Road B - East',  '08:15', 20, 20, 0, 0, 0, 0),
      makeRow('Road C - South', '08:00', 10, 10, 0, 0, 0, 0),
      makeRow('Road C - South', '08:15', 20, 20, 0, 0, 0, 0),
      makeRow('Road D - West',  '08:00', 10, 10, 0, 0, 0, 0),
      makeRow('Road D - West',  '08:15', 20, 20, 0, 0, 0, 0)
    ];

    const defaultPcuFactors = { car: 1.0, motorcycle: 0.5, autorickshaw: 0.8, bus: 3.0, truck: 3.0, bicycle: 0.4 };
    const result = FlowGuard.processRawDatasetRows(rows, defaultPcuFactors);

    expect(result.roadSummary).toBeDefined();

    // Row 1 PCU = 10×1.0 + 10×0.5 = 15, Row 2 PCU = 20×1.0 + 20×0.5 = 30
    // Total Road A PCU = 45
    expect(result.roadSummary.north.totalPCU).toBeCloseTo(45, 1);
    console.log('Road A roadSummary.totalPCU:', result.roadSummary.north.totalPCU, '(expected: 45)');

    // Verify with custom factors: motorcycle PCU factor changed to 1.0
    const customFactors = { car: 1.0, motorcycle: 1.0, autorickshaw: 0.8, bus: 3.0, truck: 3.0, bicycle: 0.4 };
    const result2 = FlowGuard.processRawDatasetRows(rows, customFactors);
    // Row 1 PCU = 10×1.0 + 10×1.0 = 20, Row 2 = 20 + 20 = 40, Total = 60
    expect(result2.roadSummary.north.totalPCU).toBeCloseTo(60, 1);
    console.log('Road A (custom factors) roadSummary.totalPCU:', result2.roadSummary.north.totalPCU, '(expected: 60)');
  });

});
