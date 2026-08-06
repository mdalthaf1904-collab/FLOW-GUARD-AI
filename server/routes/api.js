/**
 * FlowGuard AI - REST API Router
 * Maps API routes to backend controllers with validation middleware.
 */

const express = require('express');
const router = express.Router();

const analyticsController = require('../controllers/analyticsController');
const simulationController = require('../controllers/simulationController');
const aiController = require('../controllers/aiController');
const { validateAnalyzePayload, validateSimulatePayload } = require('../middleware/validateRequest');

// GET /api/data/synthetic - Returns mock/synthetic historical traffic data
router.get('/data/synthetic', analyticsController.getSyntheticData);

// POST /api/analyze - Accepts traffic data array or approach configuration and returns v/c & congestion metrics
router.post('/analyze', validateAnalyzePayload, analyticsController.analyzeTraffic);

// POST /api/optimize - Evaluates bottlenecks, calculates Webster's Optimum Cycle, & enforces Pedestrian Guardrail
router.post('/optimize', analyticsController.optimizeTimings);

// POST /api/simulate - Accepts timing plans and flow data, executes D/D/1 queue simulation
router.post('/simulate', validateSimulatePayload, simulationController.simulateTraffic);

// POST /api/recommend - Accepts simulation metrics and triggers Azure OpenAI rationale generation
router.post('/recommend', aiController.getRecommendation);

module.exports = router;
