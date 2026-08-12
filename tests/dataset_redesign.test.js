/**
 * FlowGuard AI - Dataset Processing Redesign Unit Tests (IRC-93 + Webster Method)
 * Tests Step 1 through Step 11 validation, interval detection, grouping, and Webster calculations.
 */

const FlowGuard = require('../js/app');

describe('Dataset Processing Redesign (IRC-93 + Webster Method)', () => {

  test('Step 1: Missing Required Column throws Dataset Validation Failed', () => {
    const invalidRows = [
      { Time: '08:00', Road: 'Road A', Cars: 50, Bikes: 10 } // Missing date, autorickshaw, leftturn, etc.
    ];

    expect(() => {
      FlowGuard.processRawDatasetRows(invalidRows);
    }).toThrow(/Dataset Validation Failed/i);
  });

  test('Step 9: Turning Movement Mismatch throws Turning Movement Mismatch Error', () => {
    const mismatchRows = [
      {
        Date: '2026-08-06', Time: '08:00', Road: 'Road A - North',
        Cars: 50, Bikes: 0, AutoRickshaw: 0, Bus: 0, Truck: 0, Bicycle: 0, // Total = 50
        LeftTurn: 10, Through: 10, RightTurn: 10, // Sum = 30 != 50
        IncomingLanes: 2, SpeedLimit: 50, PedestrianCount: 10, CrosswalkWidth: 14, Incident: 'None'
      }
    ];

    expect(() => {
      FlowGuard.processRawDatasetRows(mismatchRows);
    }).toThrow(/Turning Movement Mismatch/i);
  });

  test('Step 2 & 3 & 4 & 5: Survey Interval Detection, Interval Grouping, Peak Interval & PCU Conversion', () => {
    const multiIntervalRows = [];
    const dateStr = '2026-08-06';
    const roads = ['Road A - North', 'Road B - East', 'Road C - South', 'Road D - West'];
    const times = ['08:00', '08:15', '08:30', '08:45'];

    times.forEach((t, tIdx) => {
      roads.forEach(r => {
        const mult = (t === '08:30') ? 2 : 1; // Peak interval at 08:30
        const cars = 40 * mult;
        const bikes = 20 * mult;
        const auto = 10 * mult;
        const bus = 2 * mult;
        const truck = 1 * mult;
        const bicycle = 0;
        const totalVeh = cars + bikes + auto + bus + truck + bicycle;
        const left = Math.round(totalVeh * 0.2);
        const right = Math.round(totalVeh * 0.2);
        const through = totalVeh - (left + right);

        multiIntervalRows.push({
          Date: dateStr, Time: t, Road: r,
          Cars: cars, Bikes: bikes, AutoRickshaw: auto, Bus: bus, Truck: truck, Bicycle: bicycle,
          LeftTurn: left, Through: through, RightTurn: right,
          IncomingLanes: 2, SpeedLimit: 50, PedestrianCount: 15, CrosswalkWidth: 14, Incident: 'None'
        });
      });
    });

    const res = FlowGuard.processRawDatasetRows(multiIntervalRows);
    expect(res.valid).toBe(true);
    expect(res.surveyIntervalLabel).toEqual('15 Minutes');
    expect(res.surveyIntervalMinutes).toEqual(15);
    expect(res.intervals.length).toEqual(4);
    expect(res.peakInterval.time).toEqual('08:30');
    expect(res.selectedInterval.time).toEqual('08:30');
    expect(res.datasetStats.rowsRead).toBeGreaterThan(0);
    expect(res.datasetStats.totalVehicles).toBeGreaterThan(0);

    // Verify PCU Hourly Equivalent calculation for 15-min interval (factor = 4)
    // For Road A at 08:30 (Peak): Cars:80, Bikes:40, Auto:20, Bus:4, Truck:2 -> PCU = 80*1 + 40*0.5 + 20*0.8 + 4*3 + 2*3 = 80+20+16+12+6 = 134 PCU
    // Hourly Equivalent = 134 * 4 = 536 PCU/h
    const roadAPeak = res.peakInterval.roads.north;
    expect(roadAPeak.convertedPCU).toEqual(134);
    expect(roadAPeak.hourlyDemandPCU).toEqual(536);
  });

  test('Step 7: Webster Engine run strictly on Selected Interval demand', () => {
    const demoRows = FlowGuard.generateDemoDatasetRows();
    const result = FlowGuard.processRawDatasetRows(demoRows);

    expect(result.peakInterval).toBeDefined();
    const peakApproaches = result.peakInterval.roads;

    // Run Webster Engine on Peak Interval
    const websterRes = FlowGuard.calculateWebsterEngine(peakApproaches);

    // Webster cycle should be within realistic engineering bounds (40s to 180s)
    const cycle = websterRes.cOpt || websterRes.websterCycle;
    expect(cycle).toBeGreaterThanOrEqual(40);
    expect(cycle).toBeLessThanOrEqual(180);
  });

  test('24-Hour 15-Minute Interval Dataset Duration Calculation (96 unique intervals)', () => {
    const rawRows = [];
    const dateStr = '2026-08-06';
    const roads = ['Road A - North', 'Road B - East', 'Road C - South', 'Road D - West'];
    const movements = ['Left', 'Through', 'Right'];
    const vehicleTypes = ['Car', 'Two-Wheeler', 'Auto-Rickshaw', 'LCV', 'Bus', 'Truck', 'Bicycle'];

    // Generate 96 15-min intervals: 00:00-00:15, 00:15-00:30 ... 23:45-24:00
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        const startH = String(h).padStart(2, '0');
        const startM = String(m).padStart(2, '0');
        const endMins = (h * 60 + m + 15);
        const endH = String(Math.floor(endMins / 60)).padStart(2, '0');
        const endM = String(endMins % 60).padStart(2, '0');
        const timeIntervalStr = `${startH}:${startM}-${endH}:${endM}`;

        roads.forEach(r => {
          movements.forEach(mov => {
            vehicleTypes.forEach(v => {
              rawRows.push({
                'Survey Date': dateStr,
                'Time Interval': timeIntervalStr,
                'Road Direction': r,
                'Movement': mov,
                'Vehicle Type': v,
                'Count': 10
              });
            });
          });
        });
      }
    }

    // Total rows generated = 96 intervals * 4 roads * 3 movements * 7 vehicle types = 8064 rows
    expect(rawRows.length).toEqual(8064);

    const result = FlowGuard.processRawDatasetRows(rawRows);
    expect(result.valid).toBe(true);
    expect(result.surveyIntervalMinutes).toEqual(15);
    expect(result.surveyIntervalLabel).toEqual('15 Minutes');
    expect(result.intervals.length).toEqual(96);
    expect(result.surveyDurationFormatted).toEqual('1440 Minutes (24.0 Hours)');
    expect(result.datasetStats.rowsRead).toEqual(8064);
    expect(result.datasetStats.numDates).toEqual(1);
    expect(result.datasetStats.numIntervals).toEqual(96);
  });

  test('Multi-Day Dataset Duration Calculation (2 Days, 96 intervals each)', () => {
    const rawRows = [];
    const dates = ['2026-08-06', '2026-08-07'];

    dates.forEach(d => {
      for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 15) {
          const startH = String(h).padStart(2, '0');
          const startM = String(m).padStart(2, '0');
          const endMins = (h * 60 + m + 15);
          const endH = String(Math.floor(endMins / 60)).padStart(2, '0');
          const endM = String(endMins % 60).padStart(2, '0');
          const timeIntervalStr = `${startH}:${startM}-${endH}:${endM}`;

          rawRows.push({
            'Survey Date': d,
            'Time Interval': timeIntervalStr,
            'Road Direction': 'Road A',
            'Movement': 'Through',
            'Vehicle Type': 'Car',
            'Count': 25
          });
        }
      }
    });

    const result = FlowGuard.processRawDatasetRows(rawRows);
    expect(result.valid).toBe(true);
    expect(result.surveyIntervalMinutes).toEqual(15);
    expect(result.datasetStats.numDates).toEqual(2);
    expect(result.datasetStats.numIntervals).toEqual(192);
    expect(result.surveyDurationFormatted).toEqual('2880 Minutes (48.0 Hours)');
  });

  test('parseIntervalWindowDuration helper function handles range boundaries accurately', () => {
    expect(FlowGuard.parseIntervalWindowDuration('00:00-00:15')).toEqual(15);
    expect(FlowGuard.parseIntervalWindowDuration('00:15-00:30')).toEqual(15);
    expect(FlowGuard.parseIntervalWindowDuration('08:00-08:30')).toEqual(30);
    expect(FlowGuard.parseIntervalWindowDuration('08:00-09:00')).toEqual(60);
    expect(FlowGuard.parseIntervalWindowDuration('23:45-24:00')).toEqual(15);
    expect(FlowGuard.parseIntervalWindowDuration('23:45-00:00')).toEqual(15);
    expect(FlowGuard.parseIntervalWindowDuration('08:00')).toBeNull();
  });

});

