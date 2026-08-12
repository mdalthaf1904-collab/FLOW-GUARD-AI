/**
 * Signal Simulation View & Engine Test Suite
 * Validates 4-Phase signal timing consumption, live state machine transitions,
 * speed multiplier controls, 2-Phase Mode guard state, and No Data guard state.
 */

const FlowGuard = require('../js/app');

describe('Signal Simulation Feature', () => {
  beforeEach(() => {
    FlowGuard.resetToDefaults();
  });

  test('1. No Data Guard State: returns false when no analysis has been executed', () => {
    const sim = FlowGuard.signalSimulation;
    expect(sim).toBeDefined();

    const initialized = sim.initTimingSteps();
    expect(initialized).toBe(false);
    expect(sim.getTimingData()).toBeNull();
  });

  test('2. 2-Phase Mode Guard State: returns false when active analysis is 2-Phase', () => {
    const proj = FlowGuard.getProject();
    proj.dataset.uploaded = true;
    proj.engineeringParameters.phaseMode = '2PHASE';

    const mockResult = {
      analysisCompleted: true,
      websterTiming: {
        phaseMode: '2PHASE',
        numPhases: 2,
        g1: 25,
        g2: 19,
        g3: null,
        g4: null,
        amber: 3,
        allRed: 2,
        appliedCycle: 54,
        isWebsterValid: true
      }
    };
    FlowGuard.saveCurrentAnalysisResult(mockResult);

    const sim = FlowGuard.signalSimulation;
    const initialized = sim.initTimingSteps();
    expect(initialized).toBe(false);
    expect(sim.getTimingData()).toBeNull();
  });

  test('3. 4-Phase Mode Active State: loads timing data and initializes 12 phase steps correctly', () => {
    const mockResult = {
      analysisCompleted: true,
      websterTiming: {
        phaseMode: '4PHASE',
        numPhases: 4,
        g1: 47,
        g2: 39,
        g3: 44,
        g4: 34,
        amber: 3,
        allRed: 2,
        appliedCycle: 180,
        isWebsterValid: true
      }
    };
    FlowGuard.saveCurrentAnalysisResult(mockResult);

    const sim = FlowGuard.signalSimulation;
    const initialized = sim.initTimingSteps();
    expect(initialized).toBe(true);

    const timingData = sim.getTimingData();
    expect(timingData).not.toBeNull();
    expect(timingData.g1).toBe(47);
    expect(timingData.g2).toBe(39);
    expect(timingData.g3).toBe(44);
    expect(timingData.g4).toBe(34);
    expect(timingData.amber).toBe(3);
    expect(timingData.allRed).toBe(2);
    expect(timingData.cycleLength).toBe(180);
  });

  test('4. Simulation Start, Pause & Reset Controls: manages execution state correctly', () => {
    const mockResult = {
      analysisCompleted: true,
      websterTiming: {
        phaseMode: '4PHASE',
        numPhases: 4,
        g1: 30, g2: 25, g3: 20, g4: 15,
        amber: 3, allRed: 2,
        appliedCycle: 110,
        isWebsterValid: true
      }
    };
    FlowGuard.saveCurrentAnalysisResult(mockResult);

    const sim = FlowGuard.signalSimulation;
    sim.reset();

    expect(sim.getIsRunning()).toBe(false);

    sim.start();
    expect(sim.getIsRunning()).toBe(true);

    sim.pause();
    expect(sim.getIsRunning()).toBe(false);

    sim.reset();
    expect(sim.getCurrentCycle()).toBe(1);
    expect(sim.getCurrentStepIndex()).toBe(0);
  });

  test('5. Simulation Speed Control: sets speed multiplier without altering engineering timing values', () => {
    const mockResult = {
      analysisCompleted: true,
      websterTiming: {
        phaseMode: '4PHASE',
        numPhases: 4,
        g1: 40, g2: 30, g3: 35, g4: 25,
        amber: 3, allRed: 2,
        appliedCycle: 150,
        isWebsterValid: true
      }
    };
    FlowGuard.saveCurrentAnalysisResult(mockResult);

    const sim = FlowGuard.signalSimulation;
    sim.initTimingSteps();

    sim.setSpeed(2);
    expect(sim.getSimSpeed()).toBe(2);

    sim.setSpeed(4);
    expect(sim.getSimSpeed()).toBe(4);

    // Verify engineering timing values remain unchanged
    const timingData = sim.getTimingData();
    expect(timingData.g1).toBe(40);
    expect(timingData.g2).toBe(30);
    expect(timingData.g3).toBe(35);
    expect(timingData.g4).toBe(25);
    expect(timingData.cycleLength).toBe(150);
  });
});
