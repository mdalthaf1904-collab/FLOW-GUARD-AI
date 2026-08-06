/**
 * FlowGuard AI - Structured Application Logger
 * Uses Winston for development, production, and error logging with console fallbacks.
 */

let winston;
try {
  winston = require('winston');
} catch (e) {
  winston = null;
}

const env = require('../config/env');

const logger = winston ? winston.createLogger({
  level: env.isProduction ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'flow-guard-ai' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, stack }) => {
          return `[FlowGuard ${timestamp}] [${level}]: ${stack || message}`;
        })
      )
    })
  ]
}) : {
  info: (msg) => console.log(`[FlowGuard INFO]: ${msg}`),
  warn: (msg) => console.warn(`[FlowGuard WARN]: ${msg}`),
  error: (msg, err) => console.error(`[FlowGuard ERROR]: ${msg}`, err || ''),
  debug: (msg) => console.log(`[FlowGuard DEBUG]: ${msg}`)
};

module.exports = logger;
