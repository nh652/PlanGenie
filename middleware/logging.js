
import { accessLogger, logPerformance, logError } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

// Request ID middleware
export function requestIdMiddleware(req, res, next) {
  req.requestId = uuidv4();
  res.setHeader('X-Request-ID', req.requestId);
  next();
}

// Request logging middleware
export function requestLogger(req, res, next) {
  const startTime = process.hrtime.bigint();
  
  // Log incoming request
  accessLogger.info({
    message: 'Incoming request',
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    contentLength: req.get('Content-Length'),
    timestamp: new Date().toISOString()
  });

  // Log request body for webhook endpoint (excluding sensitive data)
  if (req.path === '/webhook' && req.body) {
    accessLogger.debug({
      message: 'Request body',
      requestId: req.requestId,
      queryText: req.body.queryResult?.queryText,
      parameters: req.body.queryResult?.parameters,
      intent: req.body.queryResult?.intent?.displayName
    });
  }

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(body) {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

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

// Performance monitoring middleware
export function performanceMonitor(req, res, next) {
  const startTime = process.hrtime.bigint();
  
  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000;
    
    // Log performance metrics
    logPerformance(`${req.method} ${req.route?.path || req.path}`, duration, {
      requestId: req.requestId,
      statusCode: res.statusCode,
      route: req.route?.path,
      endpoint: req.path
    });
  });
  
  next();
}
