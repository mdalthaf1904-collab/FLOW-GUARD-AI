/**
 * FlowGuard AI - Gemini AI Assistant Tests
 * Verifies Gemini context extraction, API key management, prompt building,
 * and error handling for uploaded CSV datasets.
 */

const FlowGuard = require('../js/app');
const FlowGuardGemini = require('../js/gemini_assistant');

describe('FlowGuard AI - Gemini AI Assistant', () => {

  beforeEach(() => {
    FlowGuard.resetToDefaults();
    // Ensure window global available for tests
    global.window = global.window || {};
    global.window.FlowGuard = FlowGuard;
    global.window.FlowGuardGemini = FlowGuardGemini;
    FlowGuardGemini.saveApiKey('test_gemini_api_key_123');
  });

  test('Gemini API key can be saved and retrieved', () => {
    FlowGuardGemini.saveApiKey('AIzaSyTestKey999');
    expect(FlowGuardGemini.getApiKey()).toEqual('AIzaSyTestKey999');

    FlowGuardGemini.saveApiKey('');
    expect(FlowGuardGemini.getApiKey()).toEqual('');
  });

  test('buildDatasetContext reports no dataset when project has no uploaded dataset', () => {
    const context = FlowGuardGemini.buildDatasetContext();
    expect(context.hasDataset).toBe(false);
    expect(context.text).toContain('NO CSV DATASET UPLOADED YET');
  });

  test('buildDatasetContext extracts structured context when dataset is loaded', () => {
    const proj = FlowGuard.getProject();

    proj.dataset = {
      uploaded: true,
      records: [
        { timeWindow: '08:00-08:15', road: 'north', movement: 'Through', vehicleType: 'Car', count: 50 },
        { timeWindow: '08:00-08:15', road: 'south', movement: 'Left', vehicleType: 'Truck', count: 10 }
      ],
      parsedRecords: 2,
      surveyDate: '2026-08-12',
      surveyDuration: '1 Hour',
      totalVehicles: 60,
      totalPCU: 80,
      peakInterval: '08:00–08:15'
    };

    proj.trafficInput.datasetUploaded = true;
    FlowGuard.saveProject(proj);

    const context = FlowGuardGemini.buildDatasetContext();
    expect(context.hasDataset).toBe(true);
    expect(context.text).toContain('UPLOADED CSV TRAFFIC DATASET CONTEXT');
    expect(context.text).toContain('Total Network Physical Vehicles Recorded:');
    expect(context.text).toContain('Road A (Northbound)');
    expect(context.text).toContain('Road C (Southbound)');
  });

  test('askGemini throws MISSING_API_KEY if no API key is provided', async () => {
    FlowGuardGemini.saveApiKey('');
    await expect(FlowGuardGemini.askGemini('What is the peak traffic?')).rejects.toThrow('MISSING_API_KEY');
  });

  test('askGemini formats API call payload correctly with dataset context', async () => {
    FlowGuardGemini.saveApiKey('valid_mock_key');

    // Mock fetch for Gemini API call
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          candidates: [
            {
              content: {
                parts: [
                  { text: 'Based on your uploaded CSV dataset, Road C (Southbound) has the highest volume of 445 vehicles.' }
                ]
              }
            }
          ]
        })
      })
    );

    const response = await FlowGuardGemini.askGemini('Which road has the highest traffic volume?');

    expect(global.fetch).toHaveBeenCalled();
    const fetchUrl = global.fetch.mock.calls[0][0];
    expect(fetchUrl).toContain('gemini-2.5-flash');
    expect(fetchUrl).toContain('key=valid_mock_key');
    expect(response).toContain('Road C (Southbound)');
  });

});
