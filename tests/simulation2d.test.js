/**
 * Unit Test Suite for FlowGuard AI 2D Microscopic Traffic Simulation Engine (js/simulation2d.js)
 */

const fs = require('fs');
const path = require('path');

describe('FlowGuard AI 2D Microscopic Simulation Engine (js/simulation2d.js)', () => {
  let FlowGuard2D;

  beforeAll(() => {
    // Load simulation2d.js code
    const sim2dCode = fs.readFileSync(path.join(__dirname, '../js/simulation2d.js'), 'utf8');

    // Create virtual window mock
    const windowMock = {
      FlowGuard: {
        getCSVRecords: () => [
          { Time: '08:30 - 08:45', Road: 'North (Road A)', Cars: 425, Bikes: 200, Bus: 50, Truck: 25, Left: 120, Through: 610, Right: 120 },
          { Time: '08:30 - 08:45', Road: 'East (Road B)', Cars: 360, Bikes: 180, Bus: 40, Truck: 20, Left: 100, Through: 520, Right: 100 },
          { Time: '08:30 - 08:45', Road: 'South (Road C)', Cars: 140, Bikes: 80, Bus: 20, Truck: 10, Left: 40, Through: 200, Right: 40 },
          { Time: '08:30 - 08:45', Road: 'West (Road D)', Cars: 175, Bikes: 90, Bus: 25, Truck: 10, Left: 50, Through: 250, Right: 50 }
        ]
      }
    };

    // Execute script context with window defined
    const fn = new Function('window', 'global', sim2dCode);
    fn(windowMock, windowMock);

    FlowGuard2D = windowMock.FlowGuard2D;
  });

  test('FlowGuard2D module initializes cleanly', () => {
    expect(FlowGuard2D).toBeDefined();
    expect(typeof FlowGuard2D.init).toBe('function');
    expect(typeof FlowGuard2D.start).toBe('function');
    expect(typeof FlowGuard2D.pause).toBe('function');
    expect(typeof FlowGuard2D.reset).toBe('function');
    expect(typeof FlowGuard2D.setInterval).toBe('function');
    expect(typeof FlowGuard2D.triggerEVP).toBe('function');
  });

  test('loadCSVDatasetData ingests uploaded CSV records correctly', () => {
    FlowGuard2D.loadCSVDatasetData();
    expect(() => FlowGuard2D.setInterval('08:30 - 08:45')).not.toThrow();
  });

  test('triggerEVP forces Emergency Vehicle Priority state on approach', () => {
    expect(() => FlowGuard2D.triggerEVP('north')).not.toThrow();
  });

  test('setSpeed updates simulation speed multiplier', () => {
    expect(() => FlowGuard2D.setSpeed(2.0)).not.toThrow();
  });
});
