
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';
import logger, { logInfo, logError, logWarn, logPerformance } from '../utils/logger.js';

// Access logger using winston
const accessLogger = logger.child({ component: 'access' });

// Request ID middleware
export function requestId(req, res, next) {
  req.requestId = uuidv4();
  res.setHeader('X-Request-ID', req.requestId);
  next();
}

// Morgan configuration for structured logging
export const morganMiddleware = morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  {
    stream: {
      write: (message) => {
        accessLogger.info(message.trim());
      }
    },
    skip: (req) => {
      // Skip logging for health checks in production
      return process.env.NODE_ENV === 'production' && req.path === '/health';
    }
  }
);

// Detailed request/response logging middleware
export function requestLogger(req, res, next) {
  const startTime = Date.now();
  
  // Log incoming request
  logInfo('Incoming request', {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    contentLength: req.get('Content-Length'),
    contentType: req.get('Content-Type'),
    timestamp: new Date().toISOString()
  });

  // Log request body for debugging (only for webhook endpoint and not in production)
  if (req.path === '/webhook' && process.env.NODE_ENV !== 'production') {
    accessLogger.debug({
      message: 'Request body',
      requestId: req.requestId,
      body: req.body
    });
  }

  // Override res.json to log responses
  const originalJson = res.json.bind(res);
  res.json = function(body) {
    const duration = Date.now() - startTime;
    
    // Log response
    accessLogger.info({
      message: 'Outgoing response',
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime: duration,
      contentLength: JSON.stringify(body).length,
      timestamp: new Date().toISOString()
    });

    // Log slow requests
    if (duration > 5000) { // More than 5 seconds
      logPerformance('Slow request', duration, {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode
      });
    }

    // Log response body for debugging (only in development)
    if (process.env.NODE_ENV !== 'production' && req.path === '/webhook') {
      accessLogger.debug({
        message: 'Response body',
        requestId: req.requestId,
        responseBody: body
      });
    }

    return originalJson.call(this, body);
  };

  next();
}

// Error logging middleware
export function errorLogger(err, req, res, next) {
  logError('Request error', err, {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    body: req.body
  });
  
  next(err);
}
