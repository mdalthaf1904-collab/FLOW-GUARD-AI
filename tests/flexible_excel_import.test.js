/**
 * FlowGuard AI - Flexible Excel Import Engine Unit Tests
 * Tests synonym column mapping, missing column detection, and detailed turning movement mismatch reporting.
 */

const FlowGuard = require('../js/app');

describe('Flexible Excel Import Engine', () => {

  test('Accepts common variations of column names (Cars Count, Two Wheeler, Auto Rickshaw, Heavy Vehicle, Left Turn, etc.)', () => {
    const rawRowsWithSynonyms = [
      {
        'Date': '2026-08-06',
        'Time of Day': '08:00',
        'Road Name': 'Road A - North',
        'Cars Count': 100,
        'Two Wheeler': 50,
        'Auto Rickshaw': 20,
        'LCV Count': 5,
        'Bus Count': 5,
        'Heavy Vehicle': 10,
        'Cycle Count': 10, // Total Vehicles = 200
        'Left Turn': 40,
        'Through Movement': 120,
        'Right Turn': 40, // Turning Sum = 200
        'Incoming Lanes': 2,
        'Speed Limit': 50,
        'Pedestrian Count': 15,
        'Crosswalk Width': 14,
        'Incident': 'None'
      }
    ];

    const result = FlowGuard.processRawDatasetRows(rawRowsWithSynonyms);
    expect(result.valid).toBe(true);
    expect(result.records.length).toBeGreaterThan(0);
  });

  test('Displays exact missing required column names when validation fails', () => {
    const missingColRows = [
      {
        'Date': '2026-08-06',
        'Time': '08:00',
        'Road': 'Road A',
        'Cars': 50,
        'Bikes': 10
        // Missing AutoRickshaw, Bus, Truck, Bicycle, LeftTurn, Through, RightTurn, etc.
      }
    ];

    expect(() => {
      FlowGuard.processRawDatasetRows(missingColRows);
    }).toThrow(/Dataset Validation Failed: Missing required column\(s\): Movement/i);
  });

  test('Displays Row Number, Road, Time, Expected Total, Turning Total, and Difference on turning mismatch', () => {
    const mismatchRows = [
      {
        'Date': '2026-08-06',
        'Time': '08:30',
        'Road': 'Road B - East',
        'Cars': 100, 'Bikes': 50, 'AutoRickshaw': 20, 'LCV': 0, 'Bus': 10, 'Truck': 10, 'Bicycle': 10, // Total = 200
        'LeftTurn': 30, 'Through': 100, 'RightTurn': 30, // Turning Total = 160 (Mismatch diff = 40)
        'IncomingLanes': 2, 'SpeedLimit': 50, 'PedestrianCount': 10, 'CrosswalkWidth': 14, 'Incident': 'None'
      }
    ];

    try {
      FlowGuard.processRawDatasetRows(mismatchRows);
      throw new Error('Should have thrown turning mismatch error');
    } catch (err) {
      expect(err.message).toMatch(/Turning Movement Mismatch: Row 1/i);
      expect(err.message).toMatch(/Road: Road B - East/i);
      expect(err.message).toMatch(/Time: 08:30/i);
      expect(err.message).toMatch(/Expected Total: 200/i);
      expect(err.message).toMatch(/Turning Total: 160/i);
      expect(err.message).toMatch(/Difference: 40/i);
    }
  });

});
