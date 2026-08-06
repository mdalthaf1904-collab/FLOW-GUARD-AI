/**
 * FlowGuard AI - API Integration Tests
 * Automated Supertest suite for backend REST endpoints.
 */

const request = require('supertest');
const app = require('../server/index');

describe('FlowGuard AI API Endpoints', () => {
  
  test('GET /health - Should return UP status', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('UP');
    expect(res.body.service).toContain('FlowGuard');
  });

  test('GET /api/data/synthetic - Should return synthetic traffic records', async () => {
    const res = await request(app).get('/api/data/synthetic?numIntersections=2&numDays=1');
    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('POST /api/analyze - Should evaluate volume-to-capacity metrics', async () => {
    const payload = {
      approaches: {
        north: { id: 'north', name: 'Road A', flow: 850, lanes: 2 },
        east:  { id: 'east',  name: 'Road B', flow: 700, lanes: 2 },
        south: { id: 'south', name: 'Road C', flow: 350, lanes: 2 },
        west:  { id: 'west',  name: 'Road D', flow: 450, lanes: 2 }
      }
    };

    const res = await request(app)
      .post('/api/analyze')
      .send(payload);

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.approaches.north.vcRatio).toBeGreaterThan(0);
  });

  test('POST /api/optimize - Should return Webster optimum cycle length', async () => {
    const payload = {
      approaches: {
        north: { flow: 800, lanes: 2 },
        east:  { flow: 600, lanes: 2 }
      }
    };

    const res = await request(app)
      .post('/api/optimize')
      .send(payload);

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.optimization.cycleLengthC).toBeGreaterThan(0);
  });

  test('POST /api/simulate - Should run D/D/1 queue simulation', async () => {
    const payload = {
      approaches: {
        north: { flow: 600, lanes: 2 },
        east:  { flow: 400, lanes: 2 }
      },
      greenAllocation: { north: 35, east: 25 },
      config: { cycleLength: 120 }
    };

    const res = await request(app)
      .post('/api/simulate')
      .send(payload);

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.simulation.overallAvgWaitTime).toBeGreaterThanOrEqual(0);
  });

  test('GET /api/nonexistent - Should return 404', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.statusCode).toEqual(404);
    expect(res.body.success).toBe(false);
  });
});
