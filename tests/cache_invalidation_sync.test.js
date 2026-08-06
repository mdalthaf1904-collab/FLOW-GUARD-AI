/**
 * FlowGuard AI - Data Synchronization & Cache Invalidation Tests
 * Verifies that Traffic Summary always renders fresh processedTraffic data
 * without stale cache or hardcoded values when dataset or parameters change.
 */

const FlowGuard = require('../js/app');

describe('FlowGuard AI - Data Synchronization & Cache Invalidation', () => {

  beforeEach(() => {
    FlowGuard.resetToDefaults();
  });

  test('Changing analysis interval automatically updates processedTraffic and metadata', () => {
    const proj = FlowGuard.getProject();

    // Set Initial Dataset State
    proj.trafficInput.selectedIntervalName = '11:45 AM - 12:00 PM';
    proj.trafficInput.selectedPeakWindow = '11:45 AM - 12:00 PM';
    proj.trafficInput.vehicleCounts.north = { car: 400, motorcycle: 200, bus: 20, truck: 10 };
    FlowGuard.saveProject(proj);

    const processed1 = FlowGuard.getProject().processedTraffic;
    expect(processed1.north.totalVehicles).toEqual(630);

    // Change Analysis Interval & Data
    const proj2 = FlowGuard.getProject();
    proj2.trafficInput.selectedIntervalName = '17:00 PM - 17:15 PM';
    proj2.trafficInput.vehicleCounts.north = { car: 800, motorcycle: 300, bus: 50, truck: 30 };
    FlowGuard.saveProject(proj2);

    const processed2 = FlowGuard.getProject().processedTraffic;
    expect(processed2.north.totalVehicles).toEqual(1180);
    expect(processed2.intersection.totalVehicles).toBeGreaterThan(1180);
  });

  test('Updating PCU factors immediately invalidates cache and recalculates converted PCUs', () => {
    const proj = FlowGuard.getProject();
    proj.trafficInput.vehicleCounts.north = { car: 100, motorcycle: 100, autorickshaw: 50, bus: 10, truck: 10 };
    proj.engineeringParameters.pcuFactors = { car: 1.0, motorcycle: 0.5, autorickshaw: 0.8, bus: 3.0, truck: 3.0 };
    FlowGuard.saveProject(proj);

    const initialTotalPCU = FlowGuard.getProject().processedTraffic.north.totalPCU;

    // Increase Bus PCU factor from 3.0 to 4.5 and Bike PCU factor from 0.5 to 1.0
    const proj2 = FlowGuard.getProject();
    proj2.engineeringParameters.pcuFactors.bus = 4.5;
    proj2.engineeringParameters.pcuFactors.motorcycle = 1.0;
    FlowGuard.saveProject(proj2);

    const updatedTotalPCU = FlowGuard.getProject().processedTraffic.north.totalPCU;
    expect(updatedTotalPCU).toBeGreaterThan(initialTotalPCU);
  });

  test('Verification checklist detects stale data and forces recomputation', () => {
    const proj = FlowGuard.getProject();
    FlowGuard.saveProject(proj);

    // Deliberately tamper with processedTraffic to simulate stale cache
    proj.processedTraffic.north.totalPCU = 999999;
    
    // Call recomputeProjectData to verify cache invalidation repair
    FlowGuard.recomputeProjectData(proj);

    expect(proj.processedTraffic.north.totalPCU).not.toEqual(999999);
    expect(proj.processedTraffic.validation.valid).toBe(true);
  });

});
