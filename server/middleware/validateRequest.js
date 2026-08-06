/**
 * FlowGuard AI - Request Validation Middleware
 */

function validateAnalyzePayload(req, res, next) {
  const { approaches, data } = req.body || {};
  
  if (!approaches && !data && (!req.body || Object.keys(req.body).length === 0)) {
    return res.status(400).json({
      success: false,
      message: 'Validation Error: Traffic data payload (approaches or data) is required.'
    });
  }
  
  next();
}

function validateSimulatePayload(req, res, next) {
  const { approaches, greenAllocation } = req.body || {};
  
  if (!approaches || !greenAllocation) {
    return res.status(400).json({
      success: false,
      message: 'Validation Error: Both "approaches" and "greenAllocation" map objects are required for D/D/1 simulation.'
    });
  }

  next();
}

module.exports = {
  validateAnalyzePayload,
  validateSimulatePayload
};
