/**
 * FlowGuard AI - Centralized Express Error Handling Middleware
 */

const logger = require('../utils/logger');
const env = require('../config/env');

function errorHandler(err, req, res, next) {
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  
  logger.error(`HTTP ${statusCode} - ${err.message}`, err);

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    error: env.isDevelopment ? { stack: err.stack } : undefined
  });
}

function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    message: `Endpoint Not Found: ${req.method} ${req.originalUrl}`
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
