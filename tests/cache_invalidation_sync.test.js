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
    expect(processed2.intersection.totalVehicles).toBeGreaterThanOrEqual(1180);
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

  test('Dataset ingestion pipeline persists all metadata into project state', async () => {
    const mockDemoRows = [
      { Date: '2026-08-06', Time: '11:45', Road: 'Road A - North', Cars: 120, Bikes: 40, AutoRickshaw: 15, Bus: 5, Truck: 5, Bicycle: 0, LeftTurn: 37, Through: 111, RightTurn: 37, IncomingLanes: 2, SpeedLimit: 50, PedestrianCount: 15, CrosswalkWidth: 14, Incident: 'None' },
      { Date: '2026-08-06', Time: '11:45', Road: 'Road B - East', Cars: 100, Bikes: 30, AutoRickshaw: 10, Bus: 4, Truck: 4, Bicycle: 0, LeftTurn: 30, Through: 88, RightTurn: 30, IncomingLanes: 2, SpeedLimit: 50, PedestrianCount: 15, CrosswalkWidth: 14, Incident: 'None' },
      { Date: '2026-08-06', Time: '11:45', Road: 'Road C - South', Cars: 60, Bikes: 20, AutoRickshaw: 5, Bus: 2, Truck: 2, Bicycle: 0, LeftTurn: 18, Through: 53, RightTurn: 18, IncomingLanes: 2, SpeedLimit: 50, PedestrianCount: 15, CrosswalkWidth: 14, Incident: 'None' },
      { Date: '2026-08-06', Time: '11:45', Road: 'Road D - West', Cars: 70, Bikes: 25, AutoRickshaw: 8, Bus: 3, Truck: 3, Bicycle: 0, LeftTurn: 22, Through: 65, RightTurn: 22, IncomingLanes: 2, SpeedLimit: 50, PedestrianCount: 15, CrosswalkWidth: 14, Incident: 'None' }
    ];

    await FlowGuard.executeDatasetIngestionPipeline(mockDemoRows);

    const proj = FlowGuard.getProject();
    const state = FlowGuard.getState();

    expect(proj.trafficInput.inputMode).toBe('EXCEL_UPLOAD');
    expect(proj.trafficInput.excelUploaded).toBe(true);
    expect(proj.trafficInput.surveyMethod).toBe('Historical Dataset Upload');
    expect(state.surveyMethod).toBe('Historical Dataset Upload');
    expect(proj.trafficInput.datasetStats).toBeDefined();
    expect(proj.trafficInput.datasetStats.rowsRead).toBe(4);
    expect(state.selectedPeakWindow).toBeDefined();
    expect(state.selectedIntervalName).toBeDefined();
  });

});

