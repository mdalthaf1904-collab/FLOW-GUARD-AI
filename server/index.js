/**
 * FlowGuard AI - Express.js Server Entrypoint
 * Enterprise Security, Performance & Logging Architecture
 */

const env = require('./config/env');
const logger = require('./utils/logger');
const express = require('express');
const cors = require('cors');
const path = require('path');

let helmet, rateLimit, morgan, compression;
try { helmet = require('helmet'); } catch (e) { helmet = null; }
try { rateLimit = require('express-rate-limit'); } catch (e) { rateLimit = null; }
try { morgan = require('morgan'); } catch (e) { morgan = null; }
try { compression = require('compression'); } catch (e) { compression = null; }

const apiRoutes = require('./routes/api');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

// Security Headers (Helmet)
if (helmet) {
  app.use(helmet({
    contentSecurityPolicy: false, // Allow inline scripts for visualization
    crossOriginEmbedderPolicy: false
  }));
}

// Rate Limiting Guardrail
if (rateLimit) {
  const limiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many requests from this IP, please try again after 15 minutes.'
    }
  });
  app.use('/api', limiter);
}

// HTTP Request Logging (Morgan)
if (morgan) {
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));
}

// Compression (Gzip / Brotli)
if (compression) {
  app.use(compression());
}

// CORS & Body Parser Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    service: 'FlowGuard AI Backend Engine',
    version: '2.0.0',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// REST API Gateway
app.use('/api', apiRoutes);

// Static Asset Serving with Caching Headers
app.use(express.static(path.join(__dirname, '..'), {
  maxAge: env.isProduction ? '1d' : 0
}));

// 404 & Global Error Handling Middleware
app.use(notFoundHandler);
app.use(errorHandler);

// Server Listener
if (process.env.NODE_ENV !== 'test') {
  app.listen(env.PORT, () => {
    logger.info(`========================================`);
    logger.info(`   FLOWGUARD AI - EXPRESS BACKEND       `);
    logger.info(`========================================`);
    logger.info(`Server running on: http://localhost:${env.PORT}`);
    logger.info(`API Gateway:       http://localhost:${env.PORT}/api`);
    logger.info(`========================================`);
  });
}

module.exports = app;
