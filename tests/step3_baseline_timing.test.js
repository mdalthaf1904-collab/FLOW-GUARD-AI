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
global.window = {
  location: { port: '3000' },
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
};

const domStore = {};

const createMockElement = (id, val = '', options = {}) => {
  const el = {
    id,
    value: val,
    textContent: '',
    style: {},
    checked: !!options.checked,
    options: options.options || [],
    selectedIndex: options.selectedIndex || 0,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    setAttribute: jest.fn(),
    getAttribute: jest.fn(),
    closest: jest.fn(() => null)
  };
  domStore[id] = el;
  return el;
};

// Setup minimal DOM environment for Jest
global.document = {
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  getElementById: (id) => domStore[id] || null,
  querySelector: (selector) => {
    if (selector.includes('input[name="phaseMode"]:checked')) {
      return domStore['phaseMode_checked'] || { value: '2-phase' };
    }
    if (selector.includes('input[name="cycleConstraint"]:checked')) {
      return { value: 'auto' };
    }
    if (selector.includes('input[name="baselineMode"]:checked')) {
      return { value: 'not_available' };
    }
    return null;
  },
  querySelectorAll: (selector) => {
    if (selector.includes('.pcu-edit-input')) return [];
    if (selector.includes('input[name="cycleConstraint"]')) return [];
    if (selector.includes('input[name="phaseMode"]')) return [];
    if (selector.includes('input[name="baselineMode"]')) return [];
    return [];
  }
};

const FlowGuard = require('../js/app.js');

describe('Step 3 Engineering Parameters — Baseline Signal Timing (2-Phase & 4-Phase)', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.keys(domStore).forEach(k => delete domStore[k]);
    FlowGuard.resetToDefaults();

    // Set up standard mock elements for Step 3 Section C
    createMockElement('engMinGreen', '7');
    createMockElement('engMaxGreen', '90');
    createMockElement('engAmberTime', '3.0');
    createMockElement('engAllRedTime', '2.0');
    createMockElement('engStartupLost', '2.0');
    createMockElement('engClearanceLost', '2.0');
    createMockElement('engExistingCycle', '120');
    createMockElement('engBaseSatFlow', '1800');
    createMockElement('engWalkSpeed', '1.2');
    createMockElement('engMinWalkTime', '7');

    // 2-Phase containers & inputs
    createMockElement('baseline2PhaseGreensContainer');
    createMockElement('engBaselineP1Green', '60');
    createMockElement('engBaselineP2Green', '50');

    // 4-Phase containers & inputs
    createMockElement('baseline4PhaseGreensContainer');
    createMockElement('engBaselineP1Green4', '25');
    createMockElement('engBaselineP2Green4', '30');
    createMockElement('engBaselineP3Green', '35');
    createMockElement('engBaselineP4Green', '10');

    // Validation box & summary card mocks
    createMockElement('baselineTimingValidationBox');
    createMockElement('baselineTimingValMsg');
    createMockElement('summaryValidationStatusBadge');
    createMockElement('summaryBaselineVal');
    createMockElement('summaryBaselineP1GreenVal');
    createMockElement('summaryBaselineP2GreenVal');
    createMockElement('summaryBaselineGreenSplitVal');
    createMockElement('summaryBaselineTimingStatusVal');

    domStore['phaseMode_checked'] = { value: '2-phase' };
  });

  test('1. 2-Phase Mode: Section C shows 2-phase container and hides 4-phase container', () => {
    domStore['phaseMode_checked'] = { value: '2-phase' };

    FlowGuard.updateEngineeringCalculations();

    const base2 = domStore['baseline2PhaseGreensContainer'];
    const base4 = domStore['baseline4PhaseGreensContainer'];

    expect(base2.style.display).toBe('contents');
    expect(base4.style.display).toBe('none');
  });

  test('2. 4-Phase Mode: Section C shows 4-phase container and hides 2-phase container', () => {
    domStore['phaseMode_checked'] = { value: '4-phase' };

    FlowGuard.updateEngineeringCalculations();

    const base2 = domStore['baseline2PhaseGreensContainer'];
    const base4 = domStore['baseline4PhaseGreensContainer'];

    expect(base2.style.display).toBe('none');
    expect(base4.style.display).toBe('grid');
  });

  test('3. 2-Phase Baseline Timing: calculates total cycle consistency correctly (60s + 50s + 2x3s + 2x2s = 120s)', () => {
    domStore['phaseMode_checked'] = { value: '2-phase' };
    domStore['engBaselineP1Green'].value = '60';
    domStore['engBaselineP2Green'].value = '50';
    domStore['engExistingCycle'].value = '120';
    domStore['engAmberTime'].value = '3.0';
    domStore['engAllRedTime'].value = '2.0';

    FlowGuard.updateEngineeringCalculations();

    const valMsg = domStore['baselineTimingValMsg'];
    expect(valMsg.textContent).toContain('✓ Baseline timing is internally consistent');
    expect(valMsg.textContent).toContain('Total: 120s = 60s + 50s + 2×3s + 2×2s');

    const state = FlowGuard.getProject();
    expect(state.engineeringParameters.baseline.phase1Green).toBe(60);
    expect(state.engineeringParameters.baseline.phase2Green).toBe(50);
    expect(state.engineeringParameters.baseline.phase3Green).toBeNull();
    expect(state.engineeringParameters.baseline.phase4Green).toBeNull();
    expect(state.engineeringParameters.baseline.isValid).toBe(true);
  });

  test('4. 4-Phase Baseline Timing: maps Road A/B/C/D greens and validates cycle consistency (25s + 30s + 35s + 10s + 4x3s + 4x2s = 120s)', () => {
    domStore['phaseMode_checked'] = { value: '4-phase' };
    domStore['engBaselineP1Green4'].value = '25';
    domStore['engBaselineP2Green4'].value = '30';
    domStore['engBaselineP3Green'].value = '35';
    domStore['engBaselineP4Green'].value = '10';
    domStore['engExistingCycle'].value = '120';
    domStore['engAmberTime'].value = '3.0';
    domStore['engAllRedTime'].value = '2.0';

    FlowGuard.updateEngineeringCalculations();

    const valMsg = domStore['baselineTimingValMsg'];
    expect(valMsg.textContent).toContain('✓ Baseline timing is internally consistent');
    expect(valMsg.textContent).toContain('Total: 120s = 25s + 30s + 35s + 10s + 4×3s + 4×2s');

    const state = FlowGuard.getProject();
    expect(state.engineeringParameters.phaseMode).toBe('4-phase');
    expect(state.engineeringParameters.baseline.phase1Green).toBe(25);
    expect(state.engineeringParameters.baseline.phase2Green).toBe(30);
    expect(state.engineeringParameters.baseline.phase3Green).toBe(35);
    expect(state.engineeringParameters.baseline.phase4Green).toBe(10);
    expect(state.engineeringParameters.baseline.isValid).toBe(true);
  });

  test('5. 4-Phase Partial Baseline Inputs: displays warning requiring all 4 phase green values', () => {
    domStore['phaseMode_checked'] = { value: '4-phase' };
    domStore['engBaselineP1Green4'].value = '25';
    domStore['engBaselineP2Green4'].value = '30';
    domStore['engBaselineP3Green'].value = '';
    domStore['engBaselineP4Green'].value = '';

    FlowGuard.updateEngineeringCalculations();

    const valMsg = domStore['baselineTimingValMsg'];
    expect(valMsg.textContent).toContain('⚠ Please enter all 4 existing phase green times (Road A, B, C, D).');

    const state = FlowGuard.getProject();
    expect(state.engineeringParameters.baseline.phase1Green).toBe(25);
    expect(state.engineeringParameters.baseline.phase2Green).toBe(30);
    expect(state.engineeringParameters.baseline.phase3Green).toBeNull();
    expect(state.engineeringParameters.baseline.phase4Green).toBeNull();
    expect(state.engineeringParameters.baseline.isValid).toBe(false);
  });

  test('6. Dynamic Mode Switch: switching between 2-phase and 4-phase updates UI immediately without state corruption', () => {
    // 2-Phase execution
    domStore['phaseMode_checked'] = { value: '2-phase' };
    FlowGuard.updateEngineeringCalculations();
    expect(domStore['baseline2PhaseGreensContainer'].style.display).toBe('contents');
    expect(domStore['baseline4PhaseGreensContainer'].style.display).toBe('none');

    // Switch to 4-Phase
    domStore['phaseMode_checked'] = { value: '4-phase' };
    FlowGuard.updateEngineeringCalculations();
    expect(domStore['baseline2PhaseGreensContainer'].style.display).toBe('none');
    expect(domStore['baseline4PhaseGreensContainer'].style.display).toBe('grid');

    // Switch back to 2-Phase
    domStore['phaseMode_checked'] = { value: '2-phase' };
    FlowGuard.updateEngineeringCalculations();
    expect(domStore['baseline2PhaseGreensContainer'].style.display).toBe('contents');
    expect(domStore['baseline4PhaseGreensContainer'].style.display).toBe('none');
  });

  test('7. Empty baseline green fields remain null rather than fake values', () => {
    domStore['phaseMode_checked'] = { value: '4-phase' };
    domStore['engBaselineP1Green4'].value = '';
    domStore['engBaselineP2Green4'].value = '';
    domStore['engBaselineP3Green'].value = '';
    domStore['engBaselineP4Green'].value = '';

    FlowGuard.updateEngineeringCalculations();

    const state = FlowGuard.getProject();
    expect(state.engineeringParameters.baseline.phase1Green).toBeNull();
    expect(state.engineeringParameters.baseline.phase2Green).toBeNull();
    expect(state.engineeringParameters.baseline.phase3Green).toBeNull();
    expect(state.engineeringParameters.baseline.phase4Green).toBeNull();
  });
});
