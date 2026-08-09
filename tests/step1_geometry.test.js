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

function createMockElement(val = '', options = {}) {
  const listeners = {};
  return {
    value: val,
    textContent: '',
    style: {},
    checked: !!options.checked,
    options: options.options || [],
    selectedIndex: options.selectedIndex || 0,
    addEventListener: (evt, fn) => { listeners[evt] = fn; },
    removeEventListener: () => {}
  };
}

describe('Step 1 Intersection Geometry Upgrade Unit Tests', () => {

  beforeEach(() => {
    localStorage.clear();
    const proj = FlowGuard.getProject();
    FlowGuard.saveProject(proj);
  });

  test('1. Initial project geometry initializes per-approach authoritative state (north, east, south, west)', () => {
    const proj = FlowGuard.getProject();
    expect(proj.geometry).toBeDefined();
    expect(proj.geometry.approaches).toBeDefined();

    const north = proj.geometry.approaches.north;
    expect(north.designation).toBe('Road A');
    expect(north.direction).toBe('NORTHBOUND');
    expect(north.approachWidth).toBe(14.0);
    expect(north.laneWidth).toBe(3.5);
    expect(north.speedLimit).toBe(40);
    expect(north.incomingLanes).toBe(4);
    expect(north.laneConfig).toBe('L1 | T2 | R1');
    expect(north.pedestrianCrosswalk).toBe(true);
    expect(north.exclusiveTransitLane).toBe(false);
    expect(north.channelizedLeftTurn).toBe(false);
  });

  test('2. Independent road edits on Road A do NOT mutate Roads B, C, D', () => {
    const proj = FlowGuard.getProject();

    // Mutate Road A (north)
    proj.geometry.approaches.north.approachWidth = 12.0;
    proj.geometry.approaches.north.laneWidth = 3.0;
    proj.geometry.approaches.north.incomingLanes = 3;
    proj.geometry.approaches.north.speedLimit = 50;
    proj.geometry.approaches.north.laneConfig = 'L1 | T1 | R1';

    // Update per-approach map objects
    proj.geometry.approachWidths.north = 12.0;
    proj.geometry.laneWidths.north = 3.0;
    proj.geometry.laneCounts.north = 3;
    proj.geometry.speedLimits.north = 50;
    proj.geometry.laneConfigs.north = 'L1 | T1 | R1';

    FlowGuard.saveProject(proj);

    const reloaded = FlowGuard.getProject();

    // Assert Road A updated
    expect(reloaded.geometry.approaches.north.approachWidth).toBe(12.0);
    expect(reloaded.geometry.approaches.north.laneWidth).toBe(3.0);
    expect(reloaded.geometry.approaches.north.incomingLanes).toBe(3);
    expect(reloaded.geometry.approaches.north.speedLimit).toBe(50);
    expect(reloaded.geometry.approaches.north.laneConfig).toBe('L1 | T1 | R1');

    // Assert Roads B, C, D remain untouched
    expect(reloaded.geometry.approaches.east.approachWidth).toBe(14.0);
    expect(reloaded.geometry.approaches.south.incomingLanes).toBe(4);
    expect(reloaded.geometry.approaches.west.speedLimit).toBe(40);
  });

  test('3. Custom lane configuration count parser handles standard and custom strings', () => {
    expect(FlowGuard.parseLaneConfigCount('L1 | T2 | R1')).toBe(4);
    expect(FlowGuard.parseLaneConfigCount('L1 | T1')).toBe(2);
    expect(FlowGuard.parseLaneConfigCount('L2 | T2')).toBe(4);
    expect(FlowGuard.parseLaneConfigCount('L1 | T3 | R1')).toBe(5);
    expect(FlowGuard.parseLaneConfigCount('Custom Config')).toBe(0);
    expect(FlowGuard.parseLaneConfigCount(null)).toBe(0);
  });

  test('4. Compatibility per-approach maps (laneCounts, laneConfigs, laneWidths, approachWidths, speedLimits) maintain keys north, east, south, west', () => {
    const proj = FlowGuard.getProject();
    const geom = proj.geometry;

    ['north', 'east', 'south', 'west'].forEach(key => {
      expect(geom.laneCounts[key]).toBeDefined();
      expect(geom.laneConfigs[key]).toBeDefined();
      expect(geom.laneWidths[key]).toBeDefined();
      expect(geom.approachWidths[key]).toBeDefined();
      expect(geom.speedLimits[key]).toBeDefined();
    });
  });

  test('5. Recomputing project data preserves Step 1 per-approach geometry without overwriting', () => {
    const proj = FlowGuard.getProject();
    proj.geometry.approaches.north.incomingLanes = 3;
    proj.geometry.laneCounts.north = 3;
    FlowGuard.saveProject(proj);

    FlowGuard.recomputeProjectData(proj);

    const reloaded = FlowGuard.getProject();
    expect(reloaded.geometry.approaches.north.incomingLanes).toBe(3);
    expect(reloaded.geometry.laneCounts.north).toBe(3);
  });

  test('6. Resetting geometry restores original defaults cleanly', () => {
    const proj = FlowGuard.getProject();
    proj.geometry.approaches.north.approachWidth = 21.0;
    FlowGuard.saveProject(proj);

    FlowGuard.resetGeometryDefaults();

    const reloaded = FlowGuard.getProject();
    expect(reloaded.geometry.approaches.north.approachWidth).toBe(14.0);
  });

  test('7. User Physical Width Test Case 1: Width 10.5, lane width 3.5, lanes 3 -> Valid (10.5 >= 10.5)', () => {
    const elements = {
      geomRoadA_WidthSelect: createMockElement('10.5'),
      geomRoadA_WidthCustom: createMockElement(''),
      geomRoadA_LaneWidth: createMockElement('3.5'),
      geomRoadA_Lanes: createMockElement('3'),
      geomRoadA_LaneConfigSelect: createMockElement('L1 | T1 | R1'),
      geomRoadA_LaneConfigCustom: createMockElement(''),
      geomMinWidthVal_A: createMockElement(''),
      geomWidthCalc_A: createMockElement(''),
      geomWidthStatusMsg_A: createMockElement(''),
      geomWidthValidationBox_A: createMockElement(''),
      geomValidationMsg_A: createMockElement('')
    };

    global.document = {
      getElementById: (id) => elements[id] || null
    };

    const res = FlowGuard.validateApproachGeometry('A');
    expect(res.minRequiredWidth).toBe(10.5);
    expect(res.approachWidth).toBe(10.5);
    expect(res.validWidth).toBe(true);
    expect(elements.geomWidthStatusMsg_A.textContent).toMatch(/satisfies/i);
  });

  test('8. User Physical Width Test Case 2: Width 8, lane width 3.5, lanes 3 -> Width Warning (8 < 10.5)', () => {
    const elements = {
      geomRoadA_WidthSelect: createMockElement('custom'),
      geomRoadA_WidthCustom: createMockElement('8'),
      geomRoadA_LaneWidth: createMockElement('3.5'),
      geomRoadA_Lanes: createMockElement('3'),
      geomRoadA_LaneConfigSelect: createMockElement('L1 | T1 | R1'),
      geomRoadA_LaneConfigCustom: createMockElement(''),
      geomMinWidthVal_A: createMockElement(''),
      geomWidthCalc_A: createMockElement(''),
      geomWidthStatusMsg_A: createMockElement(''),
      geomWidthValidationBox_A: createMockElement(''),
      geomValidationMsg_A: createMockElement('')
    };

    global.document = {
      getElementById: (id) => elements[id] || null
    };

    const res = FlowGuard.validateApproachGeometry('A');
    expect(res.minRequiredWidth).toBe(10.5);
    expect(res.approachWidth).toBe(8);
    expect(res.validWidth).toBe(false);
    expect(elements.geomWidthStatusMsg_A.textContent).toMatch(/less than minimum required width/i);
  });

  test('9. User Physical Width Test Case 3: Width 14, lane width 3.5, lanes 4 -> Valid (14 >= 14)', () => {
    const elements = {
      geomRoadA_WidthSelect: createMockElement('14'),
      geomRoadA_WidthCustom: createMockElement(''),
      geomRoadA_LaneWidth: createMockElement('3.5'),
      geomRoadA_Lanes: createMockElement('4'),
      geomRoadA_LaneConfigSelect: createMockElement('L1 | T2 | R1'),
      geomRoadA_LaneConfigCustom: createMockElement(''),
      geomMinWidthVal_A: createMockElement(''),
      geomWidthCalc_A: createMockElement(''),
      geomWidthStatusMsg_A: createMockElement(''),
      geomWidthValidationBox_A: createMockElement(''),
      geomValidationMsg_A: createMockElement('')
    };

    global.document = {
      getElementById: (id) => elements[id] || null
    };

    const res = FlowGuard.validateApproachGeometry('A');
    expect(res.minRequiredWidth).toBe(14);
    expect(res.approachWidth).toBe(14);
    expect(res.validWidth).toBe(true);
    expect(elements.geomWidthStatusMsg_A.textContent).toMatch(/satisfies/i);
  });

  test('10. User Physical Width Test Case 4: Width 14, lane width 4, lanes 4 -> Width Warning (min required = 16 m)', () => {
    const elements = {
      geomRoadA_WidthSelect: createMockElement('14'),
      geomRoadA_WidthCustom: createMockElement(''),
      geomRoadA_LaneWidth: createMockElement('4'),
      geomRoadA_Lanes: createMockElement('4'),
      geomRoadA_LaneConfigSelect: createMockElement('L1 | T2 | R1'),
      geomRoadA_LaneConfigCustom: createMockElement(''),
      geomMinWidthVal_A: createMockElement(''),
      geomWidthCalc_A: createMockElement(''),
      geomWidthStatusMsg_A: createMockElement(''),
      geomWidthValidationBox_A: createMockElement(''),
      geomValidationMsg_A: createMockElement('')
    };

    global.document = {
      getElementById: (id) => elements[id] || null
    };

    const res = FlowGuard.validateApproachGeometry('A');
    expect(res.minRequiredWidth).toBe(16);
    expect(res.approachWidth).toBe(14);
    expect(res.validWidth).toBe(false);
    expect(elements.geomMinWidthVal_A.textContent).toBe('16 m');
    expect(elements.geomWidthStatusMsg_A.textContent).toMatch(/less than minimum required width/i);
  });

});
